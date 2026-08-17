describe('authenticated client bootstrap decisions', () => {
  let artistsEndpointForRole;
  let initialWorkspaceFromArtists;
  let loadAuthenticatedWorkspaces;

  beforeAll(async () => {
    ({ artistsEndpointForRole, initialWorkspaceFromArtists, loadAuthenticatedWorkspaces } =
      await import('../../client/src/utils/appBootstrap.js'));
  });

  it('loads an admin from /api/artists and uses the returned first workspace', async () => {
    const requestedEndpoints = [];
    const artists = [
      { id: 'artist-admin-primary', name: 'Primary workspace' },
      { id: 'artist-secondary', name: 'Secondary workspace' },
    ];
    const fetchFixture = async (endpoint) => {
      requestedEndpoints.push(endpoint);
      return { ok: true, json: async () => artists };
    };

    const result = await loadAuthenticatedWorkspaces('admin', fetchFixture);

    expect(requestedEndpoints).toEqual(['/api/artists']);
    expect(requestedEndpoints).not.toContain('/api/team/artists');
    expect(result.artists).toBe(artists);
    expect(result.initialWorkspace).toBe(artists[0]);
  });

  it('keeps the role endpoint decision explicit', () => {
    expect(artistsEndpointForRole('admin')).toBe('/api/artists');
    expect(artistsEndpointForRole('user')).toBe('/api/team/artists');
  });

  it('uses the first returned artist as the initial workspace', () => {
    const artists = [
      { id: 'artist-admin-primary', name: 'Primary workspace' },
      { id: 'artist-secondary', name: 'Secondary workspace' },
    ];

    expect(initialWorkspaceFromArtists(artists)).toBe(artists[0]);
    expect(initialWorkspaceFromArtists([])).toBeNull();
    expect(initialWorkspaceFromArtists(null)).toBeNull();
  });
});
