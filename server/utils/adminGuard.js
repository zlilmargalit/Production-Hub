// Both administration routers must refuse to operate on a workspace whose
// workType is not "administration" — otherwise a production workspace could grow
// a clients.json and the two templates would quietly blur together.
//
// The check reads the artist record for the CURRENT user, so it also inherits the
// authorisation already applied by the artist-scope middleware.

const { readJsonCached } = require('../cache');
const { dataPath, cacheKey, parseUserId } = require('./userData');

async function requireAdministrationWorkspace(req, res, next) {
  try {
    const { realUserId, artistId } = parseUserId(req.userId);
    if (!artistId) {
      return res.status(400).json({ error: 'This endpoint requires a workspace (?artistId=…)' });
    }
    // Artist records live on the owning user, not inside the artist directory.
    const ownerId = realUserId || 'admin';
    const artists = await readJsonCached(
      cacheKey(ownerId, 'artists'), dataPath(ownerId, 'artists.json'), []
    );
    const artist = artists.find((a) => a.id === artistId);
    if (!artist) return res.status(404).json({ error: 'Workspace not found' });

    const workType = String(artist.workType || 'production').trim().toLowerCase();
    if (workType !== 'administration') {
      return res.status(400).json({
        error: 'This workspace is not an administration workspace',
        workType,
      });
    }
    req.workspace = artist;
    next();
  } catch (err) { next(err); }
}

module.exports = { requireAdministrationWorkspace };
