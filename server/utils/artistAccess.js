// Pure artist-scope authorization decisions shared by middleware, Production
// Project team validation, and regression tests.

function normalizeUserAccess(settings, userId) {
  const source = settings || {};
  const raw = (source.userArtistAccess || {})[userId];
  if (!raw) return {};
  const permissions = (source.userPermissions || {})[userId] || {};
  const visibleRubrics = permissions.viewRubrics || source.visibleRubrics || [];
  const editRubrics = permissions.editRubrics || [];
  if (Array.isArray(raw)) {
    return Object.fromEntries(
      raw.map((artistId) => [artistId, { role: 'viewer', visibleRubrics, editRubrics }])
    );
  }
  return Object.fromEntries(
    Object.entries(raw).map(([artistId, roleInfo]) => {
      const role = typeof roleInfo === 'string' ? roleInfo : (roleInfo?.role || 'viewer');
      return [artistId, { role, visibleRubrics, editRubrics }];
    })
  );
}

function decideArtistAccess({ artistId, ownedArtists = [], sharedAccess = {} }) {
  if ((ownedArtists || []).some((artist) => artist?.id === artistId)) {
    return { allowed: true, owned: true };
  }
  const access = sharedAccess?.[artistId];
  if (access) return { allowed: true, owned: false, access };
  return { allowed: false };
}

module.exports = { normalizeUserAccess, decideArtistAccess };
