// Canonical construction for records in tasks.json. Both the generic Tasks
// router and Production Project task creation use this shape, so adding a
// project link does not fork the task entity.

class TaskValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TaskValidationError';
  }
}

function createTaskRecord(body, { id, now = new Date().toISOString(), productionProjectId = null } = {}) {
  const input = body || {};
  if (!input.text?.trim()) throw new TaskValidationError('text required');
  const resolvedShowIds = Array.isArray(input.showIds) && input.showIds.length
    ? input.showIds
    : input.showId ? [input.showId] : [];

  return {
    id,
    text:                input.text.trim(),
    notes:               input.notes?.trim() || null,
    completed:           false,
    showId:              resolvedShowIds[0] || null,
    showIds:             resolvedShowIds,
    dueDate:             input.dueDate || null,
    dueTime:             input.dueTime || null,
    assignedTo:          input.assignedTo || null,
    assigneeId:          input.assigneeId || null,
    assigneeName:        input.assigneeName || null,
    reminder:            input.reminder || null,
    productionProjectId: productionProjectId || null,
    createdAt:           now,
    pushNotifiedAt:      null,
  };
}

function attemptsProjectLink(body) {
  return Object.prototype.hasOwnProperty.call(body || {}, 'productionProjectId');
}

module.exports = { TaskValidationError, createTaskRecord, attemptsProjectLink };
