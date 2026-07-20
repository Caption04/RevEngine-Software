const test = require('node:test');
const assert = require('node:assert/strict');

const { buildDispatchBoard, nextDispatchStart } = require('../src/services/dispatch.service');

function worker(id, branchId, name) {
  return { id, branchId, active: true, roleId: null, user: { name }, role: null };
}

test('next dispatch start uses the next half hour inside working hours', () => {
  const result = nextDispatchStart(new Date(2026, 6, 20, 9, 10), { workingDayStart: '08:00', workingDayEnd: '17:00' });
  assert.equal(result.getHours(), 9);
  assert.equal(result.getMinutes(), 30);
});

test('next dispatch start moves after-hours work to the next working morning', () => {
  const result = nextDispatchStart(new Date(2026, 6, 20, 18, 10), { workingDayStart: '08:00', workingDayEnd: '17:00' });
  assert.equal(result.getDate(), 21);
  assert.equal(result.getHours(), 8);
  assert.equal(result.getMinutes(), 0);
});

test('dispatch suggestions favour an available worker in the same branch with service experience', () => {
  const now = new Date(2026, 6, 20, 9, 0);
  const board = buildDispatchBoard({
    now,
    settings: { workingDayStart: '08:00', workingDayEnd: '17:00', defaultJobDurationMinutes: 60 },
    jobs: [{ id: 'job-1', title: 'Repair unit', branchId: 'branch-a', serviceId: 'service-a', status: 'NEW', createdAt: now }],
    workers: [worker('worker-a', 'branch-a', 'Amina'), worker('worker-b', 'branch-b', 'Ben')],
    workerAvailability: [
      { workerId: 'worker-a', dayOfWeek: now.getDay(), startTime: '08:00', endTime: '17:00', active: true },
      { workerId: 'worker-b', dayOfWeek: now.getDay(), startTime: '08:00', endTime: '17:00', active: true }
    ],
    serviceExperience: [{ workerId: 'worker-a', serviceId: 'service-a', _count: { _all: 4 } }]
  });

  assert.equal(board.counts.queue, 1);
  assert.equal(board.queue[0].recommendations[0].workerId, 'worker-a');
  assert.ok(board.queue[0].recommendations[0].reasons.includes('Same branch'));
});

test('approved time off creates a warning and lowers worker availability', () => {
  const now = new Date(2026, 6, 20, 9, 0);
  const board = buildDispatchBoard({
    now,
    settings: { workingDayStart: '08:00', workingDayEnd: '17:00', defaultJobDurationMinutes: 60 },
    jobs: [{ id: 'job-1', title: 'Inspection', status: 'NEW', createdAt: now }],
    workers: [worker('worker-a', null, 'Amina')],
    timeOff: [{ workerId: 'worker-a', status: 'APPROVED', startsAt: new Date(2026, 6, 20, 8, 0), endsAt: new Date(2026, 6, 20, 17, 0) }]
  });

  const recommendation = board.queue[0].recommendations[0];
  assert.equal(recommendation.available, false);
  assert.ok(recommendation.warnings.includes('Worker is on approved time off'));
});

test('dispatch board surfaces late and SLA-risk jobs', () => {
  const now = new Date(2026, 6, 20, 12, 0);
  const board = buildDispatchBoard({
    now,
    jobs: [{ id: 'job-risk', title: 'Late job', status: 'SCHEDULED', slaStatus: 'AT_RISK', scheduledStart: new Date(2026, 6, 20, 9, 0), scheduledEnd: new Date(2026, 6, 20, 10, 0), workerId: 'worker-a' }],
    workers: [worker('worker-a', null, 'Amina')]
  });

  assert.equal(board.counts.atRisk, 1);
  assert.ok(board.riskJobs[0].riskReasons.includes('SLA at risk'));
  assert.ok(board.riskJobs[0].riskReasons.includes('Past planned finish time'));
});
