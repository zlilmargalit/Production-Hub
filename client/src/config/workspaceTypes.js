// Workspace templates.
//
// A workspace is an artist record with a `workType`. This module is the ONLY
// place that turns that field into behaviour — navigation, labels, which list
// component a workspace opens on. Everything else in the client reads from here.
//
// The rule that makes this worth having: adding a fifth template must be one
// entry in this file, not a search for `workType` across the app. So do not add
// `workType === 'administration'` conditionals elsewhere — add a key here and
// read it.
//
// Records saved before workType existed have no value; resolveWorkType() treats
// them as 'production', matching the server.

export const DEFAULT_WORK_TYPE = 'production';

// Nav manifests. `page` matches the existing `page` state values in App.jsx, so
// unforked screens (Tasks, Tools) keep rendering exactly as they do today.
const PRODUCTION_NAV = [
  { page: 'shows',       label: 'Shows' },
  { page: 'crew',        label: 'Crew & Types' },
  { page: 'tasks',       label: 'Tasks',       badge: 'tasks' },
  { page: 'automations', label: 'Automations' },
  { page: 'team',        label: 'Teams',       adminOnly: true },
  { page: 'tools',       label: 'Tools',       dropdown: true },
];

// Administration order is fixed by the design:
// PROJECTS · FINANCE · TASKS · TEAM · CLIENTS · TOOLS
const ADMINISTRATION_NAV = [
  { page: 'projects', label: 'Projects' },
  { page: 'finance',  label: 'Finance', badge: 'financeOverdue' },
  { page: 'tasks',    label: 'Tasks',   badge: 'tasks' },
  { page: 'team',     label: 'Team' },
  { page: 'clients',  label: 'Clients' },
  { page: 'tools',    label: 'Tools',   dropdown: true },
];

export const WORKSPACE_TYPES = {
  production: {
    id: 'production',
    label: 'Production',          // switcher group header (uppercased in the UI)
    createLabel: 'Production',
    createHint: 'Shows, crew, setlists and coordination sheets',
    nav: PRODUCTION_NAV,
    defaultPage: 'shows',
    listComponent: 'shows',
  },
  administration: {
    id: 'administration',
    label: 'Administration',
    createLabel: 'Administration',
    createHint: 'Projects, clients, purchases and invoicing',
    nav: ADMINISTRATION_NAV,
    defaultPage: 'projects',
    listComponent: 'projects',
  },
};

/** Normalise any stored value (including missing) to a known type. */
export function resolveWorkType(workType) {
  const t = String(workType || '').trim().toLowerCase();
  return WORKSPACE_TYPES[t] ? t : DEFAULT_WORK_TYPE;
}

/** Full template config for an artist/workspace record. */
export function workspaceConfig(artist) {
  return WORKSPACE_TYPES[resolveWorkType(artist?.workType)];
}

/** Nav items for a workspace, filtered by the viewer's role. */
export function navFor(artist, { userRole } = {}) {
  return workspaceConfig(artist).nav
    .filter((item) => !item.adminOnly || userRole === 'admin');
}

/** Templates offered when creating a workspace. */
export function creatableTypes() {
  return Object.values(WORKSPACE_TYPES).map(({ id, createLabel, createHint }) => ({
    id, label: createLabel, hint: createHint,
  }));
}

/** Group workspaces by type for the switcher, preserving template order. */
export function groupByWorkType(artists = []) {
  return Object.values(WORKSPACE_TYPES)
    .map((cfg) => ({
      type: cfg.id,
      label: cfg.label,
      items: artists.filter((a) => resolveWorkType(a.workType) === cfg.id),
    }))
    .filter((g) => g.items.length > 0);
}
