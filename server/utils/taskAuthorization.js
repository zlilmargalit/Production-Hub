// Authorization rules for the generic task store.
//
// The artist-scope middleware has already authenticated and authorised the
// requested workspace before a task route reaches these helpers. An owner uses
// their own scoped store; a shared member is intentionally restricted to tasks
// assigned to their authenticated user id.

function canMutateScopedTasks(req) {
  return !req.teamMemberView;
}

function tasksVisibleToRequester(tasks, req) {
  const list = Array.isArray(tasks) ? tasks : [];
  if (!req.teamMemberView) return list;
  return list.filter((task) => task.assigneeId === req.authUserId);
}

function validateAssignedTaskCompletion(body) {
  const patch = body || {};
  const keys = Object.keys(patch);
  if (keys.length !== 1 || keys[0] !== 'completed' || typeof patch.completed !== 'boolean') {
    return { ok: false, error: 'Only a completed true/false update is allowed' };
  }
  return { ok: true, completed: patch.completed };
}

module.exports = {
  canMutateScopedTasks,
  tasksVisibleToRequester,
  validateAssignedTaskCompletion,
};
