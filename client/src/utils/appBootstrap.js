export function artistsEndpointForRole(role) {
  return role === 'admin' ? '/api/artists' : '/api/team/artists';
}

export function initialWorkspaceFromArtists(artists) {
  return Array.isArray(artists) ? artists[0] || null : null;
}

export async function loadAuthenticatedWorkspaces(role, fetchImpl = fetch) {
  const endpoint = artistsEndpointForRole(role);
  const artists = await fetchImpl(endpoint)
    .then((response) => response.ok ? response.json() : [])
    .catch(() => []);

  return { artists, initialWorkspace: initialWorkspaceFromArtists(artists) };
}
