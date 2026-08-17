// Validation and derived fields for Production Projects.
//
// Progress intentionally belongs here rather than on the stored record. A
// milestone can be completed, reopened, edited, or deleted independently, so
// persisting a percentage would create a second source of truth.

const PROJECT_STATUSES = ['planned', 'in_progress', 'on_hold', 'completed', 'cancelled'];
const TERMINAL_STATUSES = new Set(['completed', 'cancelled']);
const FOLLOW_UP_STATUSES = ['open', 'done', 'cancelled'];

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

const fail = (message) => { throw new ValidationError(message); };
const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const valueFrom = (body, base, field) => (
  Object.prototype.hasOwnProperty.call(body, field) ? body[field] : base[field]
);

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

function optionalString(value, field, { max = 500 } = {}) {
  const normalized = string(value, field, { max });
  return normalized || null;
}

function validateProductionProject(body, existing = null) {
  if (!isPlainObject(body)) fail('Body must be an object');
  const base = existing || {};
  const startDate = date(valueFrom(body, base, 'startDate'), 'startDate');
  const deadline = date(valueFrom(body, base, 'deadline'), 'deadline');
  if (startDate && deadline && startDate > deadline) {
    fail('startDate must be on or before deadline');
  }
  return {
    name:     string(body.name ?? base.name, 'name', { required: true, max: 200 }),
    category: optionalString(valueFrom(body, base, 'category'), 'category', { max: 200 }),
    startDate,
    deadline,
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
    dueDate:     date(valueFrom(body, base, 'dueDate'), 'dueDate'),
    completed,
    // Completion time is server-owned. Reopening clears it; completing after a
    // reopen receives a new time, while editing a completed title preserves it.
    completedAt: completed ? (base.completed && base.completedAt ? base.completedAt : now) : null,
    createdAt:   base.createdAt || now,
  };
}

function validateCommunicationContact(value, existing = null, { teamMembers = [] } = {}) {
  if (value === undefined) return existing || null;
  if (value === null) return null;
  if (!isPlainObject(value)) fail('contact must be an object or null');

  const hasTeamMember = Object.prototype.hasOwnProperty.call(value, 'teamMemberId')
    && value.teamMemberId !== null && value.teamMemberId !== '';
  const hasExternalName = Object.prototype.hasOwnProperty.call(value, 'externalName')
    && value.externalName !== null && value.externalName !== '';
  if (hasTeamMember && hasExternalName) {
    fail('contact must select a team member or provide an external name, not both');
  }

  if (hasTeamMember) {
    if (typeof value.teamMemberId !== 'string') fail('contact.teamMemberId must be a string');
    const member = teamMembers.find((item) => item.id === value.teamMemberId);
    if (!member) fail('contact team member must be a current member of this Production Project');
    return { kind: 'team_member', teamMemberId: member.id, nameSnapshot: member.label };
  }

  if (Object.prototype.hasOwnProperty.call(value, 'externalName')) {
    const nameSnapshot = optionalString(value.externalName, 'contact.externalName', { max: 200 });
    return nameSnapshot ? { kind: 'external', teamMemberId: null, nameSnapshot } : null;
  }

  fail('contact must include teamMemberId or externalName');
}

function validateFollowUp(value, existing = null) {
  if (value === undefined) return existing || null;
  if (value === null) return null;
  if (!isPlainObject(value)) fail('followUp must be an object or null');
  const base = isPlainObject(existing) ? existing : {};
  const dueDate = date(valueFrom(value, base, 'dueDate'), 'followUp.dueDate', { required: true });
  const statusValue = String(valueFrom(value, base, 'status') ?? 'open').trim().toLowerCase();
  if (!FOLLOW_UP_STATUSES.includes(statusValue)) {
    fail(`followUp.status must be one of: ${FOLLOW_UP_STATUSES.join(', ')}`);
  }
  return { dueDate, status: statusValue };
}

function validateCommunicationLogEntry(
  body,
  existing = null,
  author = {},
  now = new Date().toISOString(),
  contactOptions = {},
) {
  if (!isPlainObject(body)) fail('Body must be an object');
  const base = existing || {};
  return {
    occurredAt:        timestamp(body.occurredAt ?? base.occurredAt, 'occurredAt', { required: true }),
    note:              string(body.note ?? base.note, 'note', { required: true, max: 5000 }),
    channel:           optionalString(valueFrom(body, base, 'channel'), 'channel', { max: 200 }),
    contact:           validateCommunicationContact(body.contact, base.contact, contactOptions),
    followUp:          validateFollowUp(body.followUp, base.followUp),
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
  const milestones = (Array.isArray(project.milestones) ? project.milestones : [])
    .map((milestone) => ({ ...milestone, dueDate: milestone.dueDate || null }));
  const completedMilestoneCount = milestones.filter((m) => m.completed === true).length;
  const milestoneTotal = milestones.length;
  const progressPercent = milestoneTotal === 0
    ? null
    : Math.round((completedMilestoneCount / milestoneTotal) * 100);
  const statusValue = PROJECT_STATUSES.includes(project.status) ? project.status : 'planned';
  const isOverdue = Boolean(
    project.deadline && project.deadline < today && !TERMINAL_STATUSES.has(statusValue)
  );
  const communicationLog = (Array.isArray(project.communicationLog) ? project.communicationLog : [])
    .map((entry) => ({
      ...entry,
      channel: entry.channel || null,
      contact: isPlainObject(entry.contact) ? entry.contact : null,
      followUp: isPlainObject(entry.followUp)
        ? { dueDate: entry.followUp.dueDate || null, status: entry.followUp.status || 'open' }
        : null,
    }))
    .sort((a, b) => String(b.occurredAt || '').localeCompare(String(a.occurredAt || '')));

  return {
    ...project,
    category: project.category || null,
    startDate: project.startDate || null,
    deadline: project.deadline || null,
    milestones,
    teamMemberIds: Array.isArray(project.teamMemberIds) ? project.teamMemberIds : [],
    communicationLog,
    milestoneTotal,
    completedMilestoneCount,
    progressPercent,
    isOverdue,
  };
}

function buildProductionProjectAgenda(projects, { today, endDate }) {
  const from = date(today, 'today', { required: true });
  const through = date(endDate, 'endDate', { required: true });
  if (through < from) fail('endDate must be on or after today');

  const items = [];
  for (const storedProject of Array.isArray(projects) ? projects : []) {
    const project = deriveProductionProject(storedProject, { today: from });
    if (TERMINAL_STATUSES.has(project.status)) continue;
    const add = (item) => {
      if (!item.dueDate || item.dueDate > through) return;
      items.push({
        ...item,
        projectId: project.id,
        projectName: project.name,
        isOverdue: item.dueDate < from,
      });
    };

    add({ id: `project:${project.id}`, kind: 'project_deadline', dueDate: project.deadline, title: project.name });
    project.milestones.forEach((milestone) => {
      if (!milestone.completed) {
        add({ id: `milestone:${project.id}:${milestone.id}`, kind: 'milestone', dueDate: milestone.dueDate, title: milestone.title });
      }
    });
    project.communicationLog.forEach((entry) => {
      if (entry.followUp?.status === 'open') {
        add({
          id: `follow-up:${project.id}:${entry.id}`,
          kind: 'follow_up',
          dueDate: entry.followUp.dueDate,
          title: entry.note,
          channel: entry.channel,
          contact: entry.contact,
        });
      }
    });
  }

  return items.sort((a, b) => (
    a.dueDate.localeCompare(b.dueDate)
    || a.projectName.localeCompare(b.projectName)
    || a.kind.localeCompare(b.kind)
  ));
}

module.exports = {
  PROJECT_STATUSES,
  ValidationError,
  validateProductionProject,
  validateMilestone,
  validateCommunicationContact,
  validateFollowUp,
  validateCommunicationLogEntry,
  deriveProductionProject,
  buildProductionProjectAgenda,
};
