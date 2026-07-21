const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { prisma } = require('./db');
const { AppError } = require('./errors');
const { groupMembershipForCompany } = require('./services/organization.service');

const COOKIE_NAME = process.env.COOKIE_NAME || 'revengine_token';
const DEV_JWT_SECRET = 'dev-only-change-me';
const JWT_SECRET = process.env.JWT_SECRET || DEV_JWT_SECRET;

if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || JWT_SECRET === DEV_JWT_SECRET)) {
  throw new Error('JWT_SECRET must be set to a strong non-default value in production');
}

const DEFAULT_SESSION_HOURS = 8;
const SESSION_IDLE_TIMEOUT_MINUTES = Math.max(5, Math.min(Number(process.env.AUTH_SESSION_IDLE_TIMEOUT_MINUTES || 120), 120));
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 1000 * 60 * 60 * DEFAULT_SESSION_HOURS
};

const SAFE_USER_SELECT = {
  id: true,
  companyId: true,
  email: true,
  name: true,
  role: true,
  jobTitle: true,
  roleTemplateId: true,
  defaultScopeType: true,
  createdAt: true,
  updatedAt: true,
  twoFactorEnabled: true,
  mustResetPassword: true,
  fullBusinessAccess: true,
  disabledAt: true,
  lockedUntil: true,
  passwordChangedAt: true
};

const SAFE_AUTH_USER_SELECT = {
  ...SAFE_USER_SELECT,
  company: { select: { id: true, groupId: true, name: true, market: true, verticalKey: true, teamSizeBand: true, onboardingState: true, group: { select: { id: true, name: true } } } },
  roleTemplate: { select: { id: true, key: true, name: true, description: true, defaultScopeType: true } },
  worker: { select: { id: true, companyId: true, roleId: true, title: true, phone: true, active: true, role: { select: { id: true, name: true } } } }
};

const SAFE_LOGIN_USER_SELECT = {
  ...SAFE_AUTH_USER_SELECT,
  passwordHash: true,
  twoFactorSecretHash: true,
  twoFactorRecoveryCodes: true,
  failedLoginCount: true
};

const SAFE_WORKER_INCLUDE = {
  user: { select: SAFE_USER_SELECT }
};

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    companyId: user.companyId,
    primaryCompanyId: user.primaryCompanyId || user.companyId,
    email: user.email,
    name: user.name,
    role: user.role,
    systemRole: user.role,
    groupRole: user.groupRole || null,
    jobTitle: user.jobTitle || null,
    roleTemplate: user.roleTemplate || null,
    defaultScopeType: user.defaultScopeType || null,
    company: user.company ? { id: user.company.id, groupId: user.company.groupId || null, name: user.company.name, market: user.company.market || null, verticalKey: user.company.verticalKey || 'generic', teamSizeBand: user.company.teamSizeBand || null, onboardingState: user.company.onboardingState || 'COMPLETED', group: user.company.group || null } : undefined,
    worker: user.worker ? { id: user.worker.id, roleId: user.worker.roleId, title: user.worker.title, phone: user.worker.phone, active: user.worker.active, role: user.worker.role } : undefined
  };
}

async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

async function verifyPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

function signToken(user, options = {}) {
  const sessionHours = Number(options.expiresInHours || DEFAULT_SESSION_HOURS);
  const payload = { sub: user.id, companyId: user.companyId, role: user.role };
  const sessionId = options.sessionId || user.currentSessionId;
  if (sessionId) payload.sid = sessionId;
  return jwt.sign(payload, JWT_SECRET, { expiresIn: `${sessionHours}h`, jwtid: crypto.randomUUID() });
}

function setAuthCookie(res, user, options = {}) {
  const sessionHours = Number(options.expiresInHours || DEFAULT_SESSION_HOURS);
  res.cookie(COOKIE_NAME, signToken(user, options), { ...COOKIE_OPTIONS, maxAge: 1000 * 60 * 60 * sessionHours });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, { sameSite: COOKIE_OPTIONS.sameSite, secure: COOKIE_OPTIONS.secure });
}

async function requireAuth(req, res, next) {
  try {
    const header = req.get('authorization') || '';
    const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
    const token = req.cookies[COOKIE_NAME] || bearer;
    if (!token) throw new AppError(401, 'Authentication required');

    const payload = jwt.verify(token, JWT_SECRET);
    const baseUser = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: SAFE_AUTH_USER_SELECT
    });
    if (!baseUser || baseUser.disabledAt) throw new AppError(401, 'Authentication required');
    if (baseUser.passwordChangedAt && payload.iat && (payload.iat * 1000) < (new Date(baseUser.passwordChangedAt).getTime() - 1000)) {
      throw new AppError(401, 'Authentication required');
    }
    let activeCompanyId = payload.companyId || baseUser.companyId;
    if (payload.sid && prisma.userSession) {
      const session = await prisma.userSession.findFirst({ where: { id: payload.sid, userId: baseUser.id } });
      if (!session || session.revokedAt || new Date(session.expiresAt).getTime() <= Date.now()) throw new AppError(401, 'Authentication required');
      activeCompanyId = session.companyId || activeCompanyId;
      const lastSeenAt = session.lastSeenAt || session.createdAt;
      if (lastSeenAt && Date.now() - new Date(lastSeenAt).getTime() > SESSION_IDLE_TIMEOUT_MINUTES * 60 * 1000) {
        try {
          await prisma.userSession.update({ where: { id: session.id }, data: { revokedAt: new Date(), revokedById: baseUser.id } });
        } catch (error) {
          // Authentication still fails even if a mock cannot persist revocation.
        }
        throw new AppError(401, 'Session expired due to inactivity');
      }
      req.authSessionId = session.id;
      try {
        await prisma.userSession.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
      } catch (error) {
        // Non-critical for auth; keep request moving if a mock does not support lastSeen updates.
      }
    }
    const activeCompany = activeCompanyId === baseUser.companyId
      ? baseUser.company
      : await prisma.company.findUnique({
        where: { id: activeCompanyId },
        select: { id: true, groupId: true, name: true, market: true, verticalKey: true, teamSizeBand: true, onboardingState: true, group: { select: { id: true, name: true } } }
      });
    if (!activeCompany) throw new AppError(401, 'Workspace access is no longer available');

    const groupMembership = await groupMembershipForCompany(baseUser.id, activeCompany.id);
    if (activeCompany.id !== baseUser.companyId && !groupMembership) throw new AppError(403, 'You do not have access to this workspace');

    const groupRole = groupMembership && groupMembership.role;
    const user = {
      ...baseUser,
      primaryCompanyId: baseUser.companyId,
      companyId: activeCompany.id,
      company: activeCompany,
      groupRole: groupRole || null,
      role: groupRole === 'OWNER' ? 'OWNER' : groupRole === 'MANAGER' ? 'ADMIN' : baseUser.role,
      defaultScopeType: groupRole ? 'COMPANY' : baseUser.defaultScopeType,
      fullBusinessAccess: groupRole ? true : baseUser.fullBusinessAccess,
      worker: groupRole ? null : baseUser.worker && baseUser.worker.companyId === activeCompany.id ? baseUser.worker : null
    };
    req.user = user;
    req.companyId = activeCompany.id;
    next();
  } catch (error) {
    next(error.status ? error : new AppError(401, 'Authentication required'));
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(new AppError(401, 'Authentication required'));
    if (!roles.includes(req.user.role)) return next(new AppError(403, 'Insufficient permissions'));
    return next();
  };
}

function redactAuditMetadata(metadata = {}) {
  const secretPattern = /(secret|token|password|apiKey|key|authorization|cookie)/i;
  const clean = (value) => {
    if (value == null) return value;
    if (Array.isArray(value)) return value.map(clean);
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, secretPattern.test(key) ? '[redacted]' : clean(val)]));
    }
    return value;
  };
  return clean(metadata);
}

async function audit(req, action, entity, entityId, metadata) {
  const companyId = req.companyId || (req.user && req.user.companyId);
  if (!companyId) return;
  await prisma.auditLog.create({
    data: {
      companyId,
      userId: req.user && req.user.id,
      action,
      entity,
      entityId,
      metadata: redactAuditMetadata({ ...(metadata || {}), ip: req.ip, userAgent: req.get && req.get('user-agent') })
    }
  });
}

module.exports = {
  COOKIE_NAME,
  SAFE_AUTH_USER_SELECT,
  SAFE_LOGIN_USER_SELECT,
  SAFE_USER_SELECT,
  SAFE_WORKER_INCLUDE,
  clearAuthCookie,
  hashPassword,
  publicUser,
  requireAuth,
  requireRole,
  setAuthCookie,
  signToken,
  verifyPassword,
  audit
};
