// Validation and derived fields for Production Projects.
//
// Progress intentionally belongs here rather than on the stored record. A
// milestone can be completed, reopened, edited, or deleted independently, so
// persisting a percentage would create a second source of truth.

const PROJECT_STATUSES = ['planned', 'in_progress', 'on_hold', 'completed', 'cancelled'];
const TERMINAL_STATUSES = new Set(['completed', 'cancelled']);

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

const fail = (message) => { throw new ValidationError(message); };
const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function string(value, field, { required = false, max = 500 } = {}) {
  if (value === undefined || value === null) {
    if (required) fail(`${field} is required`);
    return '';
  }
  if (typeof value !== 'string') fail(`${field} must be a string`);
  const result = value.trim();
  if (required && !result) fail(`${field} is required`);
  if (result.length > max) fail(`${field} is too long (max ${max})`);
  return result;
}

function date(value, field, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) fail(`${field} is required`);
    return null;
  }
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    fail(`${field} must be a date as YYYY-MM-DD`);
  }
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    fail(`${field} is not a real date`);
  }
  return value;
}

function timestamp(value, field, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) fail(`${field} is required`);
    return null;
  }
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    fail(`${field} must be a valid date and time`);
  }
  return new Date(value).toISOString();
}

function status(value, fallback) {
  const normalized = String(value ?? fallback ?? '').trim().toLowerCase();
  if (!PROJECT_STATUSES.includes(normalized)) {
    fail(`status must be one of: ${PROJECT_STATUSES.join(', ')}`);
  }
  return normalized;
}

function validateProductionProject(body, existing = null) {
  if (!isPlainObject(body)) fail('Body must be an object');
  const base = existing || {};
  return {
    name:     string(body.name ?? base.name, 'name', { required: true, max: 200 }),
    deadline: date(body.deadline ?? base.deadline, 'deadline'),
    status:   status(body.status ?? base.status, 'planned'),
  };
}

function validateMilestone(body, existing = null, now = new Date().toISOString()) {
  if (!isPlainObject(body)) fail('Body must be an object');
  const base = existing || {};
  let completed;
  if (body.completed === undefined) completed = base.completed ?? false;
  else if (typeof body.completed === 'boolean') completed = body.completed;
  else fail('completed must be true or false');

  return {
    title:       string(body.title ?? base.title, 'title', { required: true, max: 500 }),
    completed,
    // Completion time is server-owned. Reopening clears it; completing after a
    // reopen receives a new time, while editing a completed title preserves it.
    completedAt: completed ? (base.completed && base.completedAt ? base.completedAt : now) : null,
    createdAt:   base.createdAt || now,
  };
}

function validateCommunicationLogEntry(body, existing = null, author = {}, now = new Date().toISOString()) {
  if (!isPlainObject(body)) fail('Body must be an object');
  const base = existing || {};
  return {
    occurredAt:        timestamp(body.occurredAt ?? base.occurredAt, 'occurredAt', { required: true }),
    note:              string(body.note ?? base.note, 'note', { required: true, max: 5000 }),
    // An edit must not rewrite history by claiming a different author.
    authorId:          base.authorId ?? author.id ?? null,
    authorNameSnapshot: base.authorNameSnapshot ?? author.name ?? null,
    createdAt:         base.createdAt || now,
  };
}

function todayString(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function deriveProductionProject(project, { today = todayString() } = {}) {
  const milestones = Array.isArray(project.milestones) ? project.milestones : [];
  const completedMilestoneCount = milestones.filter((m) => m.completed === true).length;
  const milestoneTotal = milestones.length;
  const progressPercent = milestoneTotal === 0
    ? null
    : Math.round((completedMilestoneCount / milestoneTotal) * 100);
  const statusValue = PROJECT_STATUSES.includes(project.status) ? project.status : 'planned';
  const isOverdue = Boolean(
    project.deadline && project.deadline < today && !TERMINAL_STATUSES.has(statusValue)
  );
  const communicationLog = [...(Array.isArray(project.communicationLog) ? project.communicationLog : [])]
    .sort((a, b) => String(b.occurredAt || '').localeCompare(String(a.occurredAt || '')));

  return {
    ...project,
    milestones,
    teamMemberIds: Array.isArray(project.teamMemberIds) ? project.teamMemberIds : [],
    communicationLog,
    milestoneTotal,
    completedMilestoneCount,
    progressPercent,
    isOverdue,
  };
}

module.exports = {
  PROJECT_STATUSES,
  ValidationError,
  validateProductionProject,
  validateMilestone,
  validateCommunicationLogEntry,
  deriveProductionProject,
};
