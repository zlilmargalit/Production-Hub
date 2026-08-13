// Pure Production Project access decisions. Keeping these independent of
// Express and the JSON cache makes the workspace boundary easy to test.

const { parseUserId } = require('./userData');

function resolveProductionWorkspace(userId, artists) {
  const { artistId } = parseUserId(userId);
  if (!artistId) {
    return { ok: false, status: 400, error: 'This endpoint requires a workspace (?artistId=…)' };
  }
  const artist = (Array.isArray(artists) ? artists : []).find((item) => item.id === artistId);
  if (!artist) return { ok: false, status: 404, error: 'Workspace not found' };

  const workType = String(artist.workType || 'production').trim().toLowerCase();
  if (workType !== 'production') {
    return { ok: false, status: 400, error: 'This workspace is not a production workspace', workType };
  }
  return { ok: true, artist };
}

function canAccessProductionProjects(req) {
  return !req.teamMemberView;
}

module.exports = { resolveProductionWorkspace, canAccessProductionProjects };
