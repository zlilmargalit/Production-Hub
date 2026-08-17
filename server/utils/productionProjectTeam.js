const fs = require('fs');
const path = require('path');

const { DATA_DIR } = require('./userData');
const { loadUsers } = require('../auth');
const { normalizeUserAccess } = require('./artistAccess');

const TEAM_SETTINGS_FILE = path.join(DATA_DIR, 'team-settings.json');

class ProjectTeamError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ProjectTeamError';
    this.status = status;
  }
}

function loadTeamSettings() {
  try { return JSON.parse(fs.readFileSync(TEAM_SETTINGS_FILE, 'utf8')); }
  catch { return { userArtistAccess: {}, userPermissions: {} }; }
}

function validateProjectTeamMemberIds(value, { artistId, users, settings }) {
  if (!Array.isArray(value)) throw new ProjectTeamError(400, 'teamMemberIds must be an array');
  const ids = [...new Set(value)];
  if (ids.some((id) => typeof id !== 'string' || !id.trim())) {
    throw new ProjectTeamError(400, 'teamMemberIds must contain user ids');
  }
  const usersById = new Map((Array.isArray(users) ? users : []).map((user) => [user.id, user]));
  for (const userId of ids) {
    if (!usersById.has(userId)) throw new ProjectTeamError(404, `User not found: ${userId}`);
    if (!normalizeUserAccess(settings, userId)[artistId]) {
      throw new ProjectTeamError(403, `User does not have access to this artist workspace: ${userId}`);
    }
  }
  return ids;
}

function validateStoredProjectTeam(value) {
  return Array.isArray(value) ? value.filter((id) => typeof id === 'string' && id) : [];
}

function canReadProductionProject(req, project) {
  if (!req.teamMemberView) return true;
  return validateStoredProjectTeam(project?.teamMemberIds).includes(req.authUserId);
}

function projectsVisibleToRequester(projects, req) {
  const list = Array.isArray(projects) ? projects : [];
  return req.teamMemberView ? list.filter((project) => canReadProductionProject(req, project)) : list;
}

function replaceProjectTeam(project, teamMemberIds, updatedAt) {
  return { ...project, teamMemberIds: [...teamMemberIds], updatedAt };
}

function validateTeamFromCurrentAccess(teamMemberIds, artistId) {
  return validateProjectTeamMemberIds(teamMemberIds, {
    artistId,
    users: loadUsers(),
    settings: loadTeamSettings(),
  });
}

// The picker and the write validator deliberately share this exact predicate.
// A client must never be offered someone the PUT route would reject (or have a
// valid grantee silently omitted because their access is not their primary
// artist assignment).
function eligibleWorkspaceMembers(artistId, { users = loadUsers(), settings = loadTeamSettings() } = {}) {
  return (Array.isArray(users) ? users : [])
    .filter((user) => normalizeUserAccess(settings, user.id)[artistId])
    .map((user) => ({
      id: user.id,
      label: user.displayName || user.username || user.id,
      accessRole: normalizeUserAccess(settings, user.id)[artistId].role || 'viewer',
    }));
}

function projectTeamMembers(project, eligibleMembers) {
  const allowed = new Set(validateStoredProjectTeam(project?.teamMemberIds));
  return (Array.isArray(eligibleMembers) ? eligibleMembers : [])
    .filter((member) => allowed.has(member.id));
}

function currentProjectTeamMembers(project, artistId) {
  return projectTeamMembers(project, eligibleWorkspaceMembers(artistId));
}

module.exports = {
  ProjectTeamError,
  validateProjectTeamMemberIds,
  validateStoredProjectTeam,
  canReadProductionProject,
  projectsVisibleToRequester,
  replaceProjectTeam,
  validateTeamFromCurrentAccess,
  eligibleWorkspaceMembers,
  projectTeamMembers,
  currentProjectTeamMembers,
};
