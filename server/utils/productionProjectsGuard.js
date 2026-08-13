// Production Projects belong only to artist-scoped Production workspaces.
//
// Artist-access authorisation happens first in server/index.js. This guard
// confirms the selected workspace type. Project-level membership checks happen
// in the Production Projects router after the scoped record is loaded.

const { readJsonCached } = require('../cache');
const { dataPath, cacheKey, parseUserId } = require('./userData');
const { resolveProductionWorkspace, canAccessProductionProjects } = require('./productionProjectsAccess');

async function requireProductionWorkspace(req, res, next) {
  try {
    const { realUserId, artistId } = parseUserId(req.userId);
    if (!artistId) {
      return res.status(400).json({ error: 'This endpoint requires a workspace (?artistId=…)' });
    }

    const ownerId = realUserId || 'admin';
    const artists = await readJsonCached(
      cacheKey(ownerId, 'artists'), dataPath(ownerId, 'artists.json'), []
    );
    const resolved = resolveProductionWorkspace(req.userId, artists);
    if (!resolved.ok) return res.status(resolved.status).json({ error: resolved.error, ...(resolved.workType ? { workType: resolved.workType } : {}) });
    req.workspace = resolved.artist;
    next();
  } catch (err) { next(err); }
}

// Structural changes remain owner/admin-only. The router intentionally places
// member-readable routes before this guard.
function requireProductionProjectOwner(req, res, next) {
  if (!canAccessProductionProjects(req)) {
    return res.status(403).json({ error: 'Only the workspace owner can change Production Project structure' });
  }
  next();
}

module.exports = { requireProductionWorkspace, requireProductionProjectOwner };
