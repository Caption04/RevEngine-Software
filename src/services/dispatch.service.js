function minutesFromTime(value) {
  const [hours, minutes] = String(value || '00:00').split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function addMinutes(value, minutes) {
  return new Date(new Date(value).getTime() + Number(minutes || 0) * 60000);
}

function rangesOverlap(startA, endA, startB, endB) {
  return new Date(startA) < new Date(endB) && new Date(startB) < new Date(endA);
}

function nextDispatchStart(nowValue, settings = {}) {
  const now = new Date(nowValue || Date.now());
  const startMinutes = minutesFromTime(settings.workingDayStart || '08:00');
  const endMinutes = minutesFromTime(settings.workingDayEnd || '17:00');
  const rounded = new Date(now);
  rounded.setSeconds(0, 0);
  rounded.setMinutes(Math.ceil(rounded.getMinutes() / 30) * 30);

  const currentMinutes = rounded.getHours() * 60 + rounded.getMinutes();
  if (currentMinutes < startMinutes) {
    rounded.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);
    return rounded;
  }
  if (currentMinutes >= endMinutes) {
    rounded.setDate(rounded.getDate() + 1);
    rounded.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);
  }
  return rounded;
}

function workerName(worker) {
  return worker && worker.user && (worker.user.name || worker.user.email) || worker && worker.title || 'Worker';
}

function keyFor(workerId, serviceId) {
  return `${workerId || ''}:${serviceId || ''}`;
}

function buildExperienceMap(rows = []) {
  const result = new Map();
  for (const row of rows) {
    const count = Number(row.count || row._count && (row._count._all || row._count.id) || 0);
    result.set(keyFor(row.workerId, row.serviceId), count);
  }
  return result;
}

function buildLatestLocationMap(rows = []) {
  const result = new Map();
  for (const row of rows) {
    const existing = result.get(row.workerId);
    if (!existing || new Date(row.recordedAt) > new Date(existing.recordedAt)) result.set(row.workerId, row);
  }
  return result;
}

function availabilityForWorker(worker, workerAvailability, roleAvailability) {
  const direct = (workerAvailability || []).filter((slot) => slot.workerId === worker.id && slot.active !== false);
  if (direct.length) return direct;
  if (!worker.roleId) return [];
  return (roleAvailability || []).filter((slot) => slot.roleId === worker.roleId && slot.active !== false);
}

function workerIsAvailable(worker, start, end, input) {
  const warnings = [];
  const slots = availabilityForWorker(worker, input.workerAvailability, input.roleAvailability)
    .filter((slot) => Number(slot.dayOfWeek) === start.getDay());
  const startMinute = start.getHours() * 60 + start.getMinutes();
  const endMinute = end.getHours() * 60 + end.getMinutes();

  if (slots.length && !slots.some((slot) => startMinute >= minutesFromTime(slot.startTime) && endMinute <= minutesFromTime(slot.endTime))) {
    warnings.push('Outside working availability');
  }

  const timeOff = (input.timeOff || []).some((item) => item.workerId === worker.id
    && item.status === 'APPROVED'
    && rangesOverlap(start, end, item.startsAt, item.endsAt));
  if (timeOff) warnings.push('Worker is on approved time off');

  const scheduleClash = (input.scheduleItems || []).some((item) => item.workerId === worker.id
    && !['CANCELLED', 'COMPLETED', 'RESCHEDULED'].includes(String(item.status || '').toUpperCase())
    && rangesOverlap(start, end, addMinutes(item.startsAt, -Number(item.travelBufferMinutes || 0)), addMinutes(item.endsAt || item.startsAt, Number(item.travelBufferMinutes || 0))));
  if (scheduleClash) warnings.push('Already booked at this time');

  return { available: warnings.length === 0, warnings };
}

function activeWorkload(workerId, scheduleItems, now) {
  return (scheduleItems || []).filter((item) => item.workerId === workerId
    && !['CANCELLED', 'COMPLETED', 'RESCHEDULED'].includes(String(item.status || '').toUpperCase())
    && new Date(item.endsAt || item.startsAt) >= now).length;
}

function recommendationFor(job, worker, input, experience, locations, suggestedStart, now) {
  const start = job.scheduledStart ? new Date(job.scheduledStart) : new Date(suggestedStart);
  const duration = Number(job.durationMinutes || input.settings.defaultJobDurationMinutes || 60);
  const end = job.scheduledEnd ? new Date(job.scheduledEnd) : addMinutes(start, duration);
  const availability = workerIsAvailable(worker, start, end, input);
  const workload = activeWorkload(worker.id, input.scheduleItems, now);
  const experienceCount = job.serviceId ? Number(experience.get(keyFor(worker.id, job.serviceId)) || 0) : 0;
  const reasons = [];
  let score = 45;

  if (job.branchId && worker.branchId && job.branchId === worker.branchId) {
    score += 20;
    reasons.push('Same branch');
  } else if (!job.branchId || !worker.branchId) {
    score += 5;
  } else {
    score -= 10;
  }

  if (experienceCount > 0) {
    score += Math.min(15, experienceCount * 3);
    reasons.push(`${experienceCount} similar completed ${experienceCount === 1 ? 'job' : 'jobs'}`);
  }

  if (availability.available) {
    score += 25;
    reasons.push('Free at the suggested time');
  } else {
    score -= availability.warnings.length * 20;
  }

  score -= Math.min(15, workload * 3);
  if (workload === 0) reasons.push('No upcoming jobs');
  else reasons.push(`${workload} upcoming ${workload === 1 ? 'job' : 'jobs'}`);

  const location = locations.get(worker.id);
  if (location) reasons.push('Recent location available');

  return {
    workerId: worker.id,
    workerName: workerName(worker),
    role: worker.role && worker.role.name || worker.title || null,
    branchId: worker.branchId || null,
    score: Math.max(0, Math.min(100, Math.round(score))),
    available: availability.available,
    warnings: availability.warnings,
    reasons,
    workload,
    suggestedStart: start.toISOString(),
    suggestedEnd: end.toISOString(),
    lastLocationAt: location && new Date(location.recordedAt).toISOString() || null
  };
}

function riskForJob(job, now) {
  const reasons = [];
  const sla = String(job.slaStatus || '').toUpperCase();
  if (sla === 'AT_RISK') reasons.push('SLA at risk');
  if (sla === 'BREACHED') reasons.push('SLA breached');
  if (job.scheduledEnd && new Date(job.scheduledEnd) < now && !['COMPLETED', 'CANCELLED'].includes(String(job.status || '').toUpperCase())) reasons.push('Past planned finish time');
  if (job.scheduledStart && new Date(job.scheduledStart) < now && ['NEW', 'SCHEDULED', 'DISPATCHED'].includes(String(job.status || '').toUpperCase())) reasons.push('Has not started on time');
  return reasons;
}

function buildDispatchBoard(input = {}) {
  const now = new Date(input.now || Date.now());
  const settings = input.settings || {};
  const suggestedStart = nextDispatchStart(now, settings);
  const experience = buildExperienceMap(input.serviceExperience);
  const locations = buildLatestLocationMap(input.latestLocations);
  const workers = (input.workers || []).filter((worker) => worker.active !== false);
  const openJobs = (input.jobs || []).filter((job) => !['COMPLETED', 'CANCELLED'].includes(String(job.status || '').toUpperCase()));
  const queue = openJobs
    .filter((job) => !job.workerId || !job.scheduledStart)
    .map((job) => ({
      ...job,
      dispatchState: !job.workerId && !job.scheduledStart ? 'UNASSIGNED_AND_UNSCHEDULED' : !job.workerId ? 'UNASSIGNED' : 'UNSCHEDULED',
      recommendations: workers
        .map((worker) => recommendationFor(job, worker, { ...input, settings }, experience, locations, suggestedStart, now))
        .sort((a, b) => b.score - a.score || Number(b.available) - Number(a.available) || a.workload - b.workload || a.workerName.localeCompare(b.workerName))
        .slice(0, 5)
    }))
    .sort((a, b) => {
      const aRisk = riskForJob(a, now).length;
      const bRisk = riskForJob(b, now).length;
      return bRisk - aRisk || new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
    });

  const riskJobs = openJobs
    .map((job) => ({ ...job, riskReasons: riskForJob(job, now) }))
    .filter((job) => job.riskReasons.length)
    .sort((a, b) => b.riskReasons.length - a.riskReasons.length)
    .slice(0, 20);

  const workerSummary = workers.map((worker) => ({
    id: worker.id,
    name: workerName(worker),
    role: worker.role && worker.role.name || worker.title || null,
    branchId: worker.branchId || null,
    workload: activeWorkload(worker.id, input.scheduleItems, now),
    lastLocationAt: locations.get(worker.id) && new Date(locations.get(worker.id).recordedAt).toISOString() || null
  })).sort((a, b) => a.workload - b.workload || a.name.localeCompare(b.name));

  return {
    generatedAt: now.toISOString(),
    suggestedStart: suggestedStart.toISOString(),
    counts: {
      queue: queue.length,
      unassigned: queue.filter((job) => !job.workerId).length,
      unscheduled: queue.filter((job) => !job.scheduledStart).length,
      atRisk: riskJobs.length
    },
    queue,
    riskJobs,
    workers: workerSummary
  };
}

module.exports = {
  buildDispatchBoard,
  nextDispatchStart
};
