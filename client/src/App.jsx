import { useState, useEffect, useCallback, useRef } from 'react';
import { subscribeToPush } from './utils/pushSubscribe';
import ShowList from './components/ShowList';
import ShowForm from './components/ShowForm';
import CrewManager from './components/CrewManager';
import ConfirmModal from './components/ConfirmModal';
import DemoBanner from './components/DemoBanner';
import GlobalTaskPanel from './components/GlobalTaskPanel';
import TeamPanel       from './components/TeamPanel';
import TeamsPage        from './components/TeamsPage';
import SetlistCalculator from './components/SetlistCalculator';
import TechSpecParser    from './components/TechSpecParser';
import AutomationsPage  from './components/automations/AutomationsPage';
import BacklinerDashboard from './components/backliner/BacklinerDashboard';
import Dashboard from './components/Dashboard';
import TimeLog from './components/TimeLog';
import { groupByWorkType, resolveWorkType, creatableTypes, workspaceConfig } from './config/workspaceTypes';
import ProjectsPage from './components/admin/ProjectsPage';
import ClientsPage from './components/admin/ClientsPage';
import ClientForm from './components/admin/ClientForm';
import ProjectForm from './components/admin/ProjectForm';
import { uploadReceipt } from './utils/receiptUpload';
import AssistantsPage from './components/admin/AssistantsPage';
import AssistantForm from './components/admin/AssistantForm';
import { isOverdue } from './components/admin/adminFormat';
import { DIR_FOR_LANG, LANGS, storeLang, switchLanguage, useT } from './i18n';
import { applyDirection } from './utils/direction';
import ProductionProjectsPage from './components/production-projects/ProductionProjectsPage';

function App({ demoMode = false }) {
  const { lang, t, tx } = useT();
  const [shows, setShows] = useState([]);
  const [crew, setCrew] = useState([]);
  const [templates, setTemplates] = useState({});
  const [fieldTemplates, setFieldTemplates] = useState({});
  const [eventTypes, setEventTypes] = useState([]);
  const [eventTypeChecklists, setEventTypeChecklists] = useState({});
  const [showForm, setShowForm] = useState(false);
  const [editingShow, setEditingShow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState('home');
  const [quickLogOpen, setQuickLogOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null);
  const [applyStatus, setApplyStatus] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('ph-theme') || 'light');
  const [confirmModal, setConfirmModal] = useState(null);
  const [userRole, setUserRole] = useState(null); // 'admin' | 'user' | null
  const [username, setUsername] = useState(null);
  const [workspaceRole, setWorkspaceRole] = useState(null); // 'producer' | 'backliner' | null
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [tasks,       setTasks]       = useState([]);
  const [joinRequests, setJoinRequests] = useState([]);
  const [wsToast, setWsToast] = useState(null);
  const [productionProjects, setProductionProjects] = useState([]);

  // ── Multi-artist state ────────────────────────────────────────────────────
  const [artists, setArtists] = useState([]);
  const [projects, setProjects] = useState([]);
  const [clients,  setClients]  = useState([]);
  const [adminLoading, setAdminLoading] = useState(false);
  // null = closed; an object = editing that record; {} = creating a new one.
  const [clientForm, setClientForm]   = useState(null);
  const [projectForm, setProjectForm] = useState(null);
  const [assistants, setAssistants]       = useState([]);
  const [assistantForm, setAssistantForm] = useState(null);
  const [adminBusy, setAdminBusy]         = useState(false);
  const [currentArtist, setCurrentArtist] = useState(null);
  const [newArtistModal, setNewArtistModal] = useState(false);
  // Ref holds the CURRENT artist ID so stable useCallback fetchers can read it
  // without being re-created whenever the artist changes.
  const currentArtistRef    = useRef(null);
  const switchAbortRef      = useRef(null);  // AbortController for in-flight artist switch fetches

  // Sync theme attribute to <html> and persist
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ph-theme', theme);
  }, [theme]);

  // Scroll to top on page change
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [page]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'light' ? 'dark' : 'light'));
  }, []);

  // ── Data fetchers (stable references via useCallback) ─────────────────────
  // Each fetcher reads currentArtistRef to append ?artistId when an artist is
  // active. The ref is updated synchronously before any fetch is triggered, so
  // there is no race between artist selection and the data request.
  // One place decides whether this workspace is an administration one, so the
  // nav and the render chain can never disagree about which screens exist.
  const isAdministration = resolveWorkType(currentArtist?.workType) === 'administration';

  const artistQS = () => {
    const id = currentArtistRef.current;
    return id ? `?artistId=${encodeURIComponent(id)}` : '';
  };

  // Guard against a slow response for the previous artist landing after a switch
  // and overwriting the new artist's data on screen. switchAbortRef existed but
  // its signal was never passed to any fetch, so aborting did nothing — and abort
  // alone can't help once a response is already in flight. Instead each fetch
  // records which artist it was issued for and simply declines to commit if the
  // workspace has changed since.
  const fetchedFor = () => currentArtistRef.current;
  const stillCurrent = (issuedFor) => currentArtistRef.current === issuedFor;

  const fetchShows = useCallback(async () => {
    const issuedFor = fetchedFor();
    const res = await fetch(`/api/shows${artistQS()}`);
    if (!res.ok) throw new Error('Failed to load shows');
    const data = await res.json();
    if (stillCurrent(issuedFor)) setShows(data);
  }, []);

  const fetchCrew = useCallback(async () => {
    const issuedFor = fetchedFor();
    const res = await fetch(`/api/crew${artistQS()}`);
    if (!res.ok) throw new Error('Failed to load crew');
    const data = await res.json();
    if (stillCurrent(issuedFor)) setCrew(data);
  }, []);

  const fetchTemplates = useCallback(async () => {
    const issuedFor = fetchedFor();
    const res = await fetch(`/api/templates${artistQS()}`);
    if (!res.ok) throw new Error('Failed to load templates');
    const data = await res.json();
    if (stillCurrent(issuedFor)) setTemplates(data);
  }, []);

  const fetchFieldTemplates = useCallback(async () => {
    const issuedFor = fetchedFor();
    const res = await fetch(`/api/field-templates${artistQS()}`);
    if (!res.ok) throw new Error('Failed to load field templates');
    const data = await res.json();
    if (stillCurrent(issuedFor)) setFieldTemplates(data);
  }, []);

  const fetchEventTypes = useCallback(async () => {
    const issuedFor = fetchedFor();
    const res = await fetch(`/api/event-types${artistQS()}`);
    if (!res.ok) throw new Error('Failed to load event types');
    const data = await res.json();
    if (stillCurrent(issuedFor)) setEventTypes(data);
    // Load checklists alongside event types
    const cr = await fetch(`/api/event-types/checklists${artistQS()}`);
    if (cr.ok) {
      const checklists = await cr.json();
      if (stillCurrent(issuedFor)) setEventTypeChecklists(checklists);
    }
  }, []);

  // Administration slices. Only fetched for an administration workspace, so a
  // production workspace never pays for them. Same stale-response guard as the
  // other fetchers: a response for the previous workspace must not land here.
  // `silent` skips the loading flag. A refetch triggered by an action must not
  // swap the cards for skeletons: that unmounts them, and an expanded card
  // would collapse itself every time you booked someone or marked a payment.
  const fetchAdminData = useCallback(async ({ silent = false } = {}) => {
    if (demoMode) return;
    const issuedFor = fetchedFor();
    if (!issuedFor) { setProjects([]); setClients([]); setAssistants([]); return; }
    if (!silent) setAdminLoading(true);
    try {
      const [p, c, a] = await Promise.all([
        fetch(`/api/projects${artistQS()}`).then((r) => (r.ok ? r.json() : [])).catch(() => []),
        fetch(`/api/clients${artistQS()}`).then((r) => (r.ok ? r.json() : [])).catch(() => []),
        fetch(`/api/assistants${artistQS()}`).then((r) => (r.ok ? r.json() : [])).catch(() => []),
      ]);
      if (!stillCurrent(issuedFor)) return;
      setProjects(Array.isArray(p) ? p : []);
      setClients(Array.isArray(c) ? c : []);
      setAssistants(Array.isArray(a) ? a : []);
    } finally {
      if (!silent && stillCurrent(issuedFor)) setAdminLoading(false);
    }
  }, [demoMode]);

  // Create or update a client. Throws with the server's own message so the form
  // can show which field it rejected instead of a generic failure.
  const saveClient = useCallback(async (fields) => {
    const editing = fields.id ? `/${fields.id}` : '';
    const res = await fetch(`/api/clients${editing}${artistQS()}`, {
      method: fields.id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Save failed (${res.status})`);
    }
    const saved = await res.json();
    setClients((list) => (fields.id
      ? list.map((c) => (c.id === saved.id ? saved : c))
      : [...list, saved]));
    return saved;
  }, []);

  const adminApi = useCallback(async (path, method, body) => {
    const res = await fetch(`/api${path}${artistQS()}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Request failed (${res.status})`);
    }
    return res.status === 204 ? null : res.json();
  }, []);

  // Two steps, because work days are their own nested collection on the server:
  // save the project, then reconcile its days. A day is matched by id — anything
  // the form dropped is deleted, anything without an id is new.
  const saveProject = useCallback(async (fields, days) => {
    const saved = fields.id
      ? await adminApi(`/projects/${fields.id}`, 'PUT', fields)
      : await adminApi('/projects', 'POST', fields);

    const before = (fields.workDays || []).map((d) => d.id);
    const kept   = new Set(days.map((d) => d.id).filter(Boolean));
    await Promise.all([
      ...before.filter((id) => !kept.has(id))
        .map((id) => adminApi(`/projects/${saved.id}/work-days/${id}`, 'DELETE')),
      ...days.map((d) => (d.id
        ? adminApi(`/projects/${saved.id}/work-days/${d.id}`, 'PUT', d)
        : adminApi(`/projects/${saved.id}/work-days`, 'POST', d))),
    ]);

    // Re-read rather than patching state by hand: paymentDueAt, ballInCourt and
    // the rest are derived server-side and would otherwise be stale until the
    // next fetch.
    await fetchAdminData();
    return saved;
  }, [adminApi, fetchAdminData]);

  const saveAssistant = useCallback(async (fields) => {
    const saved = fields.id
      ? await adminApi(`/assistants/${fields.id}`, 'PUT', fields)
      : await adminApi('/assistants', 'POST', fields);
    setAssistants((list) => (fields.id
      ? list.map((a) => (a.id === saved.id ? saved : a))
      : [...list, saved]));
    return saved;
  }, [adminApi]);

  // Removing someone from the roster leaves every booking they already have —
  // the work day keeps its own name and amount. Nothing owed is lost.
  const deleteAssistant = useCallback(async (assistant) => {
    await adminApi(`/assistants/${assistant.id}`, 'DELETE');
    setAssistants((list) => list.filter((a) => a.id !== assistant.id));
  }, [adminApi]);

  // Bookings are nested two deep, so each change re-reads rather than patching
  // state by hand: owedToAssistants is derived server-side and would otherwise
  // disagree with the rows it is supposed to be summing.
  const bookingAction = useCallback(async (fn) => {
    setAdminBusy(true);
    try { await fn(); await fetchAdminData({ silent: true }); }
    finally { setAdminBusy(false); }
  }, [fetchAdminData]);

  // One bundle per project, so a card never has to know its own id to act.
  // expensesFor reads from the project the caller already holds — expenses are
  // stored on the project and tagged with a workDayId, not nested in the day.
  const projectHandlers = useCallback((project) => ({
    book: (dayId, booking) => bookingAction(() =>
      adminApi(`/projects/${project.id}/work-days/${dayId}/assistants`, 'POST', booking)),

    setPaid: (dayId, bookingId, paid) => bookingAction(() =>
      adminApi(`/projects/${project.id}/work-days/${dayId}/assistants/${bookingId}`, 'PUT',
        { paidAt: paid ? new Date().toISOString() : null })),

    unbook: (dayId, bookingId) => bookingAction(() =>
      adminApi(`/projects/${project.id}/work-days/${dayId}/assistants/${bookingId}`, 'DELETE')),

    // Only expensesCheckedAt is sent; the day's date falls back to what is
    // stored, so this can never blank it.
    setChecked: (dayId, checked) => bookingAction(() =>
      adminApi(`/projects/${project.id}/work-days/${dayId}`, 'PUT',
        { expensesCheckedAt: checked ? new Date().toISOString() : null })),

    addExpense: (expense) => bookingAction(() =>
      adminApi(`/projects/${project.id}/expenses`, 'POST', expense)),

    removeExpense: (expenseId) => bookingAction(() =>
      adminApi(`/projects/${project.id}/expenses/${expenseId}`, 'DELETE')),

    expensesFor: (dayId) => (project.expenses || []).filter((e) => e.workDayId === dayId),

    addPurchase: (purchase) => bookingAction(() =>
      adminApi(`/projects/${project.id}/purchases`, 'POST', purchase)),

    removePurchase: (purchaseId) => bookingAction(() =>
      adminApi(`/projects/${project.id}/purchases/${purchaseId}`, 'DELETE')),

    // Patch, not replace: validatePurchase merges against the stored record, so
    // sending one flag cannot blank the shop name or the receipt.
    setPurchaseFlag: (purchaseId, patch) => bookingAction(() =>
      adminApi(`/projects/${project.id}/purchases/${purchaseId}`, 'PUT', patch)),

    addReturn: (purchaseId, ret) => bookingAction(() =>
      adminApi(`/projects/${project.id}/purchases/${purchaseId}/returns`, 'POST', ret)),

    // Deliberately outside bookingAction: storing the file changes nothing the
    // card displays, so refetching every project afterwards would be wasted —
    // and it would fire between the upload and the record that points at it.
    uploadReceipt: (file) => uploadReceipt(file, artistQS()),

    // The stored URL is deliberately scope-free — baking a workspace id into
    // stored data is how records stop being movable. Links add it at render.
    scope: artistQS(),
  }), [adminApi, bookingAction]);

  const fetchTasks = useCallback(async () => {
    if (demoMode) return;
    const issuedFor = fetchedFor();
    const res = await fetch(`/api/tasks${artistQS()}`);
    if (!res.ok) return;
    const data = await res.json();
    if (stillCurrent(issuedFor)) setTasks(data);
  }, [demoMode]);

  const fetchProductionProjects = useCallback(async () => {
    if (demoMode || resolveWorkType(currentArtistRef.current?.workType) === 'administration') return;
    const issuedFor = fetchedFor();
    const res = await fetch(`/api/production-projects${artistQS()}`);
    if (!res.ok) return;
    const data = await res.json();
    if (stillCurrent(issuedFor)) setProductionProjects(Array.isArray(data) ? data : []);
  }, [demoMode]);

  const productionProjectsApi = useCallback(async (path = '', method = 'GET', body) => {
    const res = await fetch(`/api/production-projects${path}${artistQS()}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error.error || `Request failed (${res.status})`);
    }
    return res.status === 204 ? null : res.json();
  }, []);

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    setError(null);

    if (demoMode) {
      fetch('/api/demo/data')
        .then((r) => r.json())
        .then((d) => {
          setShows(d.shows || []);
          setCrew(d.crew || []);
          setTemplates(d.templates || {});
          setFieldTemplates(d.fieldTemplates || {});
          setEventTypes(d.eventTypes || []);
          setArtists(d.artists || []);
        })
        .catch(() => setError('Could not load demo data'))
        .finally(() => setLoading(false));
      return;
    }

    // Normal mode — three-step init:
    // 1. Fetch /api/me, then choose the correct artists endpoint for that role
    // 2. Set currentArtist (ref first, then state)
    // 3. Fetch all scoped data with the correct artistId already in the ref
    const init = async () => {
      try {
        const meResponse = await fetch('/api/me');
        const meData = meResponse.ok ? await meResponse.json() : null;
        if (meData) {
          setUserRole(meData.role);
          setUsername(meData.username);
          if (meData.avatarUrl) setAvatarUrl(meData.avatarUrl);
          const wr = meData.workspaceRole || 'producer';
          setWorkspaceRole(wr);
          if (wr === 'backliner') setPage('backliner');
        }

        // The cached choice only protects first paint. Once authenticated, the
        // account preference wins so the interface and document direction are
        // the same on every device. A reload remounts the translated tree with
        // the right locale rather than flipping direction mid-interaction.
        if (LANGS.includes(meData?.lang) && meData.lang !== lang) {
          storeLang(meData.lang);
          applyDirection(DIR_FOR_LANG[meData.lang]);
          window.location.reload();
          return;
        }

        // Admin → own artists list; guest → permitted artists from admin's workspace
        const artistsEndpoint = meData?.role === 'admin' ? '/api/artists' : '/api/team/artists';
        const artistDataResult = await fetch(artistsEndpoint)
          .then((r) => r.ok ? r.json() : [])
          .catch(() => []);

        setArtists(artistDataResult);
        const first = artistDataResult[0] || null;
        if (first) {
          currentArtistRef.current = first.id;   // sync — must precede fetches below
          setCurrentArtist(first);
        }

        // Non-admin users: poll for pending join requests
        if (meData?.role !== 'admin') {
          fetch('/api/me/join-requests').then((r) => r.ok ? r.json() : []).then(setJoinRequests).catch(() => {});
        }

        await Promise.all([
          fetchShows(), fetchCrew(), fetchTemplates(), fetchFieldTemplates(), fetchEventTypes(),
          fetchTasks(),
          fetchProductionProjects(),
        ]);
      } catch (err) {
        setError(err.message || 'Could not connect to server');
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [demoMode, fetchShows, fetchCrew, fetchTemplates, fetchFieldTemplates, fetchEventTypes, fetchTasks, fetchProductionProjects, lang]);

  // ── Refresh on focus/visibility ───────────────────────────────────────────
  // iOS freezes a home-screen PWA and restores the old state without reloading,
  // so without this the app shows stale data after reopening. Re-fetch scoped
  // data whenever the app returns to the foreground (also keeps desktop tabs live).
  useEffect(() => {
    if (demoMode) return;
    let last = Date.now();
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - last < 1500) return; // throttle duplicate focus/visibility fires
      last = now;
      Promise.all([
        fetchShows(), fetchCrew(), fetchTemplates(), fetchFieldTemplates(),
        fetchEventTypes(), fetchTasks(),
        fetchProductionProjects(),
      ]).catch(() => {});
    };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [demoMode, fetchShows, fetchCrew, fetchTemplates, fetchFieldTemplates, fetchEventTypes, fetchTasks, fetchProductionProjects]);

  // ── Mutations — real (normal mode) ────────────────────────────────────────
  const saveFieldTemplate = useCallback(async (eventType, fields) => {
    if (demoMode) {
      setFieldTemplates((prev) => ({ ...prev, [eventType]: fields }));
      return;
    }
    await fetch(`/api/field-templates/${encodeURIComponent(eventType)}${artistQS()}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    });
    setFieldTemplates((prev) => ({ ...prev, [eventType]: fields }));
  }, [demoMode]);

  const saveEventTypeChecklist = useCallback(async (typeName, checklist) => {
    if (demoMode) { setEventTypeChecklists((prev) => ({ ...prev, [typeName]: checklist })); return; }
    const res = await fetch(
      `/api/event-types/checklists/${encodeURIComponent(typeName)}${artistQS()}`,
      { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(checklist) }
    );
    if (res.ok) setEventTypeChecklists((prev) => ({ ...prev, [typeName]: checklist }));
    else console.error('[saveChecklist] PUT failed', res.status);
  }, [demoMode]);

  const saveEventTypes = useCallback(async (types) => {
    if (demoMode) { setEventTypes(types); return; }
    const res = await fetch(`/api/event-types${artistQS()}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(types),
    });
    if (res.ok) setEventTypes(types);
    else console.error('[saveEventTypes] PUT failed', res.status);
  }, [demoMode]);

  const createShow = useCallback(async (data) => {
    if (demoMode) {
      const fakeShow = { id: 'demo-' + Date.now(), ...data, tasks: data.tasks || [], createdAt: new Date().toISOString() };
      setShows((prev) => [...prev, fakeShow]);
      return fakeShow;
    }
    const res = await fetch(`/api/shows${artistQS()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('[createShow] POST failed', res.status, err);
      return null;
    }
    const created = await res.json();
    setShows((prev) => [...prev, created]);
    return created;
  }, [demoMode]);

  const updateShow = useCallback(async (id, data) => {
    if (demoMode) {
      setShows((prev) => prev.map((s) => (s.id === id ? { ...s, ...data } : s)));
      return;
    }
    const res = await fetch(`/api/shows/${id}${artistQS()}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('[updateShow] PUT failed', res.status, err);
      return; // don't corrupt local state with error response
    }
    const updated = await res.json();
    setShows((prev) => prev.map((s) => (s.id === id ? updated : s)));
  }, [demoMode]);

  const deleteShow = useCallback((id) => {
    const show = shows.find((s) => s.id === id);
    setConfirmModal({
      title: t('app.deleteShow'),
      message: show ? tx('app.deleteShowNamed', { name: show.name }) : t('app.deleteShowUnnamed'),
      danger: true,
      onConfirm: async () => {
        setConfirmModal(null);
        if (!demoMode) await fetch(`/api/shows/${id}${artistQS()}`, { method: 'DELETE' });
        setShows((prev) => prev.filter((s) => s.id !== id));
      },
    });
  }, [shows, demoMode, t, tx]);

  const handleSubmit = useCallback(
    async (data) => {
      if (editingShow) {
        await updateShow(editingShow.id, { ...editingShow, ...data });
      } else {
        await createShow(data);
      }
      setShowForm(false);
      setEditingShow(null);
    },
    [editingShow, updateShow, createShow]
  );

  const applyCrewTemplates = useCallback(async () => {
    if (demoMode) return; // no-op in demo
    setApplyStatus('loading');
    try {
      const res = await fetch(`/api/shows/apply-crew-templates${artistQS()}`, { method: 'POST' });
      const data = await res.json();
      setApplyStatus(data);
      if (data.updated > 0) await fetchShows();
      setTimeout(() => setApplyStatus(null), 5000);
    } catch {
      setApplyStatus({ error: true });
      setTimeout(() => setApplyStatus(null), 4000);
    }
  }, [fetchShows, demoMode]);

  // Accept auto-imported shows. `ids` omitted = every pending show in the
  // workspace. The server strips `importPending`; local state mirrors that so
  // the card un-fades without a refetch.
  const confirmImportedShows = useCallback(async (ids) => {
    if (demoMode) {
      setShows((prev) => prev.map((s) => (
        s.importPending && (!ids || ids.includes(s.id))
          ? (({ importPending, ...rest }) => rest)(s)
          : s
      )));
      return;
    }
    const res = await fetch(`/api/shows/confirm-import${artistQS()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ids ? { ids } : {}),
    });
    if (!res.ok) {
      console.error('[confirmImportedShows] POST failed', res.status);
      return;
    }
    setShows((prev) => prev.map((s) => (
      s.importPending && (!ids || ids.includes(s.id))
        ? (({ importPending, ...rest }) => rest)(s)
        : s
    )));
  }, [demoMode]);

  const syncShows = useCallback(async () => {
    if (demoMode) return;
    setSyncStatus('loading');
    try {
      const res = await fetch('/api/import/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = await res.json();
      setSyncStatus(data);
      if (data.added > 0) await fetchShows();
      setTimeout(() => setSyncStatus(null), 5000);
    } catch {
      setSyncStatus({ error: true });
      setTimeout(() => setSyncStatus(null), 4000);
    }
  }, [fetchShows, demoMode]);

  // ── Artist switching ──────────────────────────────────────────────────────
  const switchToArtist = useCallback(async (artist) => {
    // Demo mode holds all data in memory (no per-artist API) — just switch context.
    if (demoMode) {
      currentArtistRef.current = artist?.id || null;
      setCurrentArtist(artist);
      return;
    }
    // Cancel any previous in-flight switch to avoid stale data races
    if (switchAbortRef.current) switchAbortRef.current.abort();
    const ac = new AbortController();
    switchAbortRef.current = ac;

    currentArtistRef.current = artist?.id || null;
    setCurrentArtist(artist);
    // Clear stale data so the UI doesn't briefly show the previous artist's content
    setShows([]); setCrew([]); setTasks([]); setProjects([]); setClients([]); setAssistants([]); setProductionProjects([]);
    // Entering a workspace lands on the page its template defines, so an
    // administration workspace never opens on Shows.
    const cfg = workspaceConfig(artist);
    setPage(cfg.defaultPage);
    try {
      await Promise.all([
        fetchShows(), fetchCrew(), fetchTemplates(), fetchFieldTemplates(), fetchEventTypes(),
        fetchTasks(),
        resolveWorkType(artist?.workType) === 'production' ? fetchProductionProjects() : Promise.resolve(),
        resolveWorkType(artist?.workType) === 'administration' ? fetchAdminData() : Promise.resolve(),
      ]);
    } catch (err) {
      if (err.name !== 'AbortError') console.error('[artist-switch]', err.message);
    }
  }, [demoMode, fetchShows, fetchCrew, fetchTemplates, fetchFieldTemplates, fetchEventTypes, fetchTasks, fetchAdminData, fetchProductionProjects]);

  const createArtist = useCallback(async (name, workType = 'production') => {
    const res = await fetch('/api/artists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, workType }),
    });
    if (!res.ok) throw new Error('Failed to create artist');
    const artist = await res.json();
    setArtists((prev) => [...prev, artist]);
    await switchToArtist(artist);
    return artist;
  }, [switchToArtist]);

  const deleteArtist = useCallback((artist) => {
    setConfirmModal({
      title: t('app.deleteWorkspace'),
      message: tx('app.deleteWorkspaceMessage', { name: artist.name }),
      danger: true,
      onConfirm: async () => {
        setConfirmModal(null);
        await fetch(`/api/artists/${artist.id}`, { method: 'DELETE' });
        setArtists((prev) => {
          const remaining = prev.filter((a) => a.id !== artist.id);
          // If the deleted artist was current, switch to the first remaining one
          if (currentArtistRef.current === artist.id) {
            if (remaining.length > 0) {
              // switchToArtist updates ref + state + data
              switchToArtist(remaining[0]);
            } else {
              currentArtistRef.current = null;
              setCurrentArtist(null);
              setShows([]); setCrew([]);
              setTemplates({}); setFieldTemplates({}); setEventTypes([]);
            }
          }
          return remaining;
        });
      },
    });
  }, [switchToArtist, t, tx]);

  // ── Task CRUD ─────────────────────────────────────────────────────────────
  const createTask = useCallback(async (data) => {
    const res = await fetch(`/api/tasks${artistQS()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const task = await res.json();
      setTasks((prev) => [...prev, task]);
    }
  }, []);

  const toggleTask = useCallback(async (id, completed, taskOverride = null) => {
    // Optimistically update so the UI feels instant
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, completed } : t));
    // Find task metadata to decide which endpoint to call
    const task = taskOverride || tasks.find((t) => t.id === id);
    let res;
    if (task?.assignedToMe && task?.fromArtistId) {
      res = await fetch(`/api/tasks/assigned/${task.fromArtistId}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed }),
      });
    } else {
      res = await fetch(`/api/tasks/${id}${artistQS()}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed }),
      });
    }
    if (res.ok) {
      const updated = await res.json();
      setTasks((prev) => prev.map((t) => (t.id === id
        ? { ...updated, assignedToMe: task?.assignedToMe, fromArtistId: task?.fromArtistId }
        : t
      )));
    } else {
      // Revert optimistic update on failure
      setTasks((prev) => prev.map((t) => t.id === id ? { ...t, completed: !completed } : t));
    }
  }, [tasks]);

  const updateTask = useCallback(async (id, data) => {
    const res = await fetch(`/api/tasks/${id}${artistQS()}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const updated = await res.json();
      setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
    }
  }, []);

  const deleteTask = useCallback(async (id) => {
    // Use functional updater to avoid stale closure on tasks array
    setTasks((prev) => {
      const task = prev.find((t) => t.id === id);
      if (task?.assignedToMe) return prev; // cannot delete tasks assigned from team
      fetch(`/api/tasks/${id}${artistQS()}`, { method: 'DELETE' }).catch(
        (err) => console.error('[deleteTask]', err)
      );
      return prev.filter((t) => t.id !== id);
    });
  }, []);

  const openEdit = useCallback(async (show) => {
    const qs = currentArtistRef.current
      ? `?artistId=${encodeURIComponent(currentArtistRef.current)}` : '';
    try {
      const res = await fetch(`/api/shows/${show.id}${qs}`);
      setEditingShow(res.ok ? await res.json() : show);
    } catch {
      setEditingShow(show); // fallback to slim show
    }
    setShowForm(true);
  }, []);

  const closeForm = useCallback(() => {
    setShowForm(false);
    setEditingShow(null);
  }, []);

  // ── Open a show from the Dashboard (switches artist context first) ──────────
  const openShowFromDashboard = useCallback(async (show) => {
    const artist = artists.find((a) => a.id === show.artistId);
    if (artist && artist.id !== currentArtistRef.current) {
      await switchToArtist(artist);
    }
    setPage('shows');
  }, [artists, switchToArtist]);

  // ── Workspace selector: switch to an artist workspace ─────────────────────
  const handleWorkspaceSwitch = useCallback(async (artist) => {
    setWsToast(`Entering ${artist.name}'s workspace…`);
    // switchToArtist already lands on the template's defaultPage — do not
    // override it here, or an administration workspace opens on Shows.
    await switchToArtist(artist);
    setTimeout(() => setWsToast(null), 2200);
  }, [switchToArtist]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="app">
      {demoMode && <DemoBanner />}
      {quickLogOpen && <QuickLogModal onClose={() => setQuickLogOpen(false)} />}

      <header className="app-header">
        {/* Brand — always left; clicking goes to Home */}
        <div
          className="header-brand"
          onClick={() => setPage('home')}
          style={{ cursor: 'pointer' }}
          role="link"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && setPage('home')}
          aria-label={t('app.goHome')}
        >
          <svg width="36" height="28" viewBox="0 0 100 70" fill="none" xmlns="http://www.w3.org/2000/svg" className="header-logo-svg" aria-hidden="true">
            <path d="M 6 62 A 44 44 0 0 1 94 62" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.4"/>
            <path d="M 21 62 A 29 29 0 0 1 79 62" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" fill="none" opacity="0.65"/>
            <path d="M 35 62 A 15 15 0 0 1 65 62" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.9"/>
            <line x1="2" y1="62" x2="98" y2="62" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.35"/>
            <circle cx="50" cy="62" r="5" fill="#F08D39"/>
          </svg>
          <h1>{t('app.productName')}</h1>
        </div>

        {/* Nav: home + timelog are global pages — no artist nav */}
        <nav className="page-nav">{(page === 'home' || page === 'timelog') ? null : (<>
          {/* Production keeps its existing buttons; an administration workspace
              renders its own nav from the template config instead. Adding a
              template must not mean editing this file. */}
          {isAdministration ? (
            workspaceConfig(currentArtist).nav
              .map((item) => (
                <button
                  key={item.page}
                  className={`nav-btn ${page === item.page ? 'active' : ''}`}
                  onClick={() => setPage(item.page)}
                >
                  {item.label}
                  {item.badge === 'tasks' && tasks.filter((t) => !t.completed).length > 0 && (
                    <span className="nav-tasks-badge">{tasks.filter((t) => !t.completed).length}</span>
                  )}
                  {item.badge === 'financeOverdue' && projects.filter((p) => isOverdue(p)).length > 0 && (
                    <span className="nav-tasks-badge nav-badge--warn">
                      {projects.filter((p) => isOverdue(p)).length}
                    </span>
                  )}
                </button>
              ))
          ) : (<>
          <button
            className={`nav-btn ${page === 'shows' ? 'active' : ''}`}
            onClick={() => setPage('shows')}
          >
            {t('shows.title')}
          </button>
          {!demoMode && (
            <button
              className={`nav-btn ${page === 'production-projects' ? 'active' : ''}`}
              onClick={() => setPage('production-projects')}
            >
              {t('productionProjects.title')}
            </button>
          )}
          <button
            className={`nav-btn ${page === 'crew' ? 'active' : ''}`}
            onClick={() => setPage('crew')}
          >
            {t('app.crewTypes')}
          </button>
          {!demoMode && (
            <button
              className={`nav-btn ${page === 'tasks' ? 'active' : ''}`}
              onClick={() => setPage('tasks')}
            >
              {t('app.tasks')}
              {tasks.filter((t) => !t.completed).length > 0 && (
                <span className="nav-tasks-badge">
                  {tasks.filter((t) => !t.completed).length}
                </span>
              )}
            </button>
          )}
          {!demoMode && (
            <button
              className={`nav-btn ${page === 'automations' ? 'active' : ''}`}
              onClick={() => setPage('automations')}
            >
              {t('automations.title')}
            </button>
          )}
          {!demoMode && userRole !== 'admin' && workspaceRole === 'backliner' && (
            <button
              className={`nav-btn ${page === 'backliner' ? 'active' : ''}`}
              onClick={() => setPage('backliner')}
            >
              {t('backline.title')}
            </button>
          )}
          {!demoMode && userRole !== 'admin' && (
            <button
              className={`nav-btn ${page === 'teams' ? 'active' : ''}`}
              onClick={() => setPage('teams')}
            >
              {t('app.teams')}
            </button>
          )}
          {!demoMode && userRole === 'admin' && (
            <button
              className={`nav-btn ${page === 'team' ? 'active' : ''}`}
              onClick={() => setPage('team')}
            >
              {t('app.teams')}
            </button>
          )}
          </>)}
          {/* Both tools are Spotify/tech-rider specific, so they are hidden
              wherever the template's nav doesn't ask for them. */}
          {!demoMode && workspaceConfig(currentArtist).nav.some((i) => i.page === 'tools') && (
            <ToolsDropdown
              activeTool={page}
              onSelectTool={(tool) => setPage(tool)}
            />
          )}
        </>)}</nav>

        {/* Action buttons (right — admin tools hidden on mobile) */}
        <div className="header-right">
          {/* Notification bell — join requests + assigned tasks */}
          {!demoMode && userRole !== 'admin' && (
            <NotificationBell
              joinRequests={joinRequests}
              tasks={tasks}
              onNavigate={setPage}
            />
          )}
          {!demoMode && (
            <button
              className="header-log-btn"
              onClick={() => setQuickLogOpen(true)}
              title={t('app.logTime')}
              aria-label={t('app.logTime')}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.6"/>
                <path d="M8 4.5v3.8l2.2 1.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
            </button>
          )}
          <WorkspaceSelector
            page={page}
            artists={artists}
            currentArtist={currentArtist}
            onSwitch={handleWorkspaceSwitch}
            onGoHome={() => setPage('home')}
            onOpenTimeLog={() => setPage('timelog')}
            onAddNew={userRole === 'admin' ? () => setNewArtistModal(true) : null}
            demoMode={demoMode}
          />
          {!demoMode && <UserMenu username={username} userRole={userRole} onOpenSettings={() => setShowSettings(true)} avatarUrl={avatarUrl} />}
        </div>
      </header>

      <main className="app-main">
        {loading ? (
          <div className="loading-screen">
            <div className="spinner" />
            <p>{t('app.loading')}</p>
          </div>
        ) : error ? (
          <div className="error-state">
            <div className="error-icon">!</div>
            <p className="error-title">{t('app.serverError')}</p>
            <p className="error-sub">{error}</p>
            <button className="btn-primary" onClick={() => window.location.reload()}>
              {t('app.retry')}
            </button>
          </div>
        ) : page === 'home' ? (
          <Dashboard
            artists={artists}
            tasks={tasks}
            crew={crew}
            onOpenShow={openShowFromDashboard}
            onToggleTask={toggleTask}
            eventTypeChecklists={eventTypeChecklists}
            demoMode={demoMode}
            demoShows={shows}
          />
        ) : page === 'projects' ? (
          <ProjectsPage
            projects={projects}
            assistants={assistants}
            busy={adminBusy}
            loading={adminLoading}
            hasClients={clients.length > 0}
            onNew={() => setProjectForm({})}
            onEdit={(p) => setProjectForm(p)}
            makeHandlers={projectHandlers}
            onAddClient={() => { setPage('clients'); setClientForm({}); }}
          />
        ) : page === 'finance' ? (
          // Finance arrives in phase 5. Without this branch the render chain
          // falls through to CrewManager, which would show the Crew screen
          // inside an administration workspace.
          <div className="adm-page">
            <div className="adm-empty">
              <p>{t('app.financeComingSoon')}</p>
            </div>
          </div>
        ) : page === 'clients' ? (
          <ClientsPage
            clients={clients}
            projects={projects}
            loading={adminLoading}
            onAdd={() => setClientForm({})}
            onOpen={(c) => setClientForm(c)}
          />
        ) : page === 'timelog' ? (
          <TimeLog onBack={() => setPage('home')} />
        ) : page === 'shows' ? (
          <ShowList
            shows={demoMode && currentArtist ? shows.filter((s) => s.artistId === currentArtist.id) : shows}
            crew={crew}
            fieldTemplates={fieldTemplates}
            onEdit={userRole === 'admin' ? openEdit : null}
            onDelete={userRole === 'admin' ? deleteShow : null}
            onUpdateShow={updateShow}
            artistId={currentArtist?.id || null}
            readOnly={userRole !== 'admin'}
            onNew={userRole === 'admin' ? () => setShowForm(true) : null}
            workspaceRole={workspaceRole}
            onSync={userRole === 'admin' && !demoMode ? syncShows : null}
            syncStatus={syncStatus}
            onApplyCrew={!demoMode ? applyCrewTemplates : null}
            applyStatus={applyStatus}
            onConfirmImport={userRole === 'admin' ? confirmImportedShows : null}
          />
        ) : page === 'production-projects' ? (
          <ProductionProjectsPage
            projects={productionProjects}
            tasks={tasks}
            workspaceId={currentArtist?.id || null}
            api={productionProjectsApi}
            onRefresh={async () => { await Promise.all([fetchProductionProjects(), fetchTasks()]); }}
            onToggleAssignedTask={toggleTask}
          />
        ) : page === 'automations' ? (
          <AutomationsPage />
        ) : page === 'backliner' ? (
          <BacklinerDashboard
            shows={shows}
            tasks={tasks}
            crew={crew}
            userRole={userRole}
            onUpdateShow={updateShow}
            onAddTask={createTask}
            onToggleTask={toggleTask}
            onDeleteTask={deleteTask}
          />
        ) : page === 'calculator' ? (
          <SetlistCalculator
            defaultArtistName={currentArtist?.name || ''}
            artistName={currentArtist?.name || ''}
            artistId={currentArtist?.id || null}
            shows={shows}
          />
        ) : page === 'tech-spec' ? (
          <TechSpecParser
            shows={shows}
            onUpdateShow={updateShow}
            artistId={currentArtist?.id || null}
          />
        ) : page === 'teams' ? (
          <TeamsPage />
        ) : page === 'team' && isAdministration ? (
          // Administration's Team is the assistant roster. Without this branch it
          // fell through to TeamPanel — the production screen, wrong workspace.
          <AssistantsPage
            assistants={assistants}
            projects={projects}
            loading={adminLoading}
            onAdd={() => setAssistantForm({})}
            onOpen={(a) => setAssistantForm(a)}
          />
        ) : page === 'team' && userRole === 'admin' ? (
          <TeamPanel artists={artists} shows={shows} tasks={tasks} onUpdateShow={updateShow} artistId={currentArtist?.id || null} onCreateTask={createTask} onToggleTask={toggleTask} />
        ) : page === 'tasks' ? (
          <GlobalTaskPanel
            tasks={tasks}
            crew={crew}
            shows={shows}
            onAdd={createTask}
            onToggle={toggleTask}
            onDelete={deleteTask}
            onUpdate={updateTask}
          />
        ) : (
          <CrewManager
            crew={crew}
            setCrew={demoMode
              ? (updater) => setCrew(updater)
              : setCrew}
            templates={templates}
            setTemplates={setTemplates}
            fieldTemplates={fieldTemplates}
            onSaveFieldTemplate={saveFieldTemplate}
            eventTypes={eventTypes}
            onSaveEventTypes={saveEventTypes}
            eventTypeChecklists={eventTypeChecklists}
            onSaveEventTypeChecklist={saveEventTypeChecklist}
            tasks={tasks}
            demoMode={demoMode}
            artistId={currentArtist?.id || null}
          />
        )}
      </main>

      {showForm && userRole === 'admin' && (
        <ShowForm
          show={editingShow}
          crew={crew}
          templates={templates}
          fieldTemplates={fieldTemplates}
          eventTypes={eventTypes}
          onSubmit={handleSubmit}
          onClose={closeForm}
        />
      )}

      {clientForm && (
        <ClientForm
          client={clientForm.id ? clientForm : null}
          onSave={saveClient}
          onClose={() => setClientForm(null)}
        />
      )}

      {projectForm && (
        <ProjectForm
          project={projectForm.id ? projectForm : null}
          clients={clients}
          onSave={saveProject}
          onCreateClient={saveClient}
          onClose={() => setProjectForm(null)}
        />
      )}

      {assistantForm && (
        <AssistantForm
          assistant={assistantForm.id ? assistantForm : null}
          onSave={saveAssistant}
          onDelete={async (a) => { await deleteAssistant(a); setAssistantForm(null); }}
          onClose={() => setAssistantForm(null)}
        />
      )}

      {confirmModal && (
        <ConfirmModal
          title={confirmModal.title}
          message={confirmModal.message}
          danger={confirmModal.danger !== false}
          onConfirm={confirmModal.onConfirm}
          onCancel={() => setConfirmModal(null)}
        />
      )}

      {newArtistModal && (
        <NewArtistModal
          onClose={() => setNewArtistModal(false)}
          onCreate={createArtist}
        />
      )}

      {showSettings && (
        <UserSettingsModal
          onClose={() => setShowSettings(false)}
          currentWorkspaceRole={workspaceRole}
          userRole={userRole}
          onChangeWorkspaceRole={(r) => setWorkspaceRole(r)}
          onAvatarChange={(url) => setAvatarUrl(url)}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      )}

      {wsToast && (
        <div className="ws-toast" role="status" aria-live="polite">{wsToast}</div>
      )}
    </div>
  );
}

// ── Tools dropdown nav item ───────────────────────────────────────────────────
const TOOLS = [
  { key: 'calculator',  labelKey: 'app.setlistCalculator' },
  { key: 'tech-spec',   labelKey: 'techSpec.title' },
];

function ToolsDropdown({ activeTool, onSelectTool }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const isActive = TOOLS.some((t) => t.key === activeTool);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="tools-nav-dropdown" ref={ref}>
      <button
        className={`nav-btn tools-nav-dropdown-trigger${isActive ? ' active' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {t('app.tools')}
        <span className="tools-nav-caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="tools-nav-dropdown-panel">
          {TOOLS.map((tool) => (
            <button
              key={tool.key}
              className={`tools-nav-dropdown-item${tool.key === activeTool ? ' active' : ''}`}
              onClick={() => { onSelectTool(tool.key); setOpen(false); }}
            >
              {t(tool.labelKey)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Quick Log Time modal (global, available on every page) ───────────────────
const QUICK_LOG_ARTISTS = [
  { id: 'assaf',   name: 'Assaf Amdursky', color: '#3852B4' },
  { id: 'hila',    name: 'Hila Ruach',     color: '#F08D39' },
  { id: 'general', nameKey: 'app.quickLog.general', color: '#6B6259' },
];

function QuickLogModal({ onClose }) {
  const { t, lang } = useT();
  const todayISO  = new Date().toISOString().slice(0, 10);
  const dateLabel = new Date().toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });

  const [artist, setArtist] = useState('assaf');
  const [desc,   setDesc]   = useState('');
  const [hours,  setHours]  = useState('');
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');

  // "DD-MM" from ISO date
  const todayDDMM = (() => {
    const [, m, d] = todayISO.split('-');
    return `${d}-${m}`;
  })();

  const save = async (andClose) => {
    const h = parseFloat(hours);
    if (!desc.trim()) { setErr(t('app.quickLog.descriptionRequired')); return; }
    if (!(h > 0))     { setErr(t('app.quickLog.hoursRequired')); return; }
    setSaving(true); setErr('');
    try {
      const res = await fetch('/api/timelog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ date: todayDDMM, artist, desc: desc.trim(), hours: h, billed: false }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || t('app.quickLog.saveFailed'));
      }
      if (andClose) {
        onClose();
      } else {
        // Save & Stay: reset form, keep artist
        setDesc('');
        setHours('');
        setSaving(false);
      }
    } catch (e) {
      setErr(e.message);
      setSaving(false);
    }
  };

  // Close on backdrop click
  const handleBackdrop = (e) => { if (e.target === e.currentTarget) onClose(); };

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const activeArtist = QUICK_LOG_ARTISTS.find((a) => a.id === artist);

  return (
    <div className="ql-backdrop" onMouseDown={handleBackdrop}>
      <div className="ql-modal" role="dialog" aria-modal="true" aria-label={t('app.quickLog.title')}>
        {/* Header */}
        <div className="ql-header">
          <div className="ql-header-left">
            <svg className="ql-clock-icon" width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <circle cx="9" cy="9" r="7.2" stroke="currentColor" strokeWidth="1.6"/>
              <path d="M9 5.5v4l2.6 1.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
            <span className="ql-title">{t('app.quickLog.title')}</span>
          </div>
          <span className="ql-date">{dateLabel}</span>
        </div>

        {/* Body */}
        <div className="ql-body">
          {/* Artist */}
          <div className="ql-field">
            <span className="ql-label">{t('app.quickLog.artist')}</span>
            <div className="ql-artist-select-wrap">
              <span className="ql-artist-dot" style={{ background: activeArtist?.color }} />
              <select
                className="ql-select"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
              >
                {QUICK_LOG_ARTISTS.map((a) => (
                  <option key={a.id} value={a.id} dir="auto">{a.nameKey ? t(a.nameKey) : a.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Description + Hours */}
          <div className="ql-row">
            <div className="ql-field ql-field--grow">
              <span className="ql-label">{t('app.quickLog.description')}</span>
              <input
                className="ql-input"
                type="text"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder={t('app.quickLog.descriptionPlaceholder')}
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) save(false); }}
              />
            </div>
            <div className="ql-field ql-field--hours">
              <span className="ql-label">{t('app.quickLog.hours')}</span>
              <input
                className="ql-input ql-input--hours"
                type="number"
                step="0.25"
                min="0"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder="2.5"
              />
            </div>
          </div>

          {err && <p className="ql-err">{err}</p>}
        </div>

        {/* Actions */}
        <div className="ql-actions">
          <button className="ql-cancel" onClick={onClose} disabled={saving}>{t('common.cancel')}</button>
          <button className="ql-save" onClick={() => save(false)} disabled={saving}>
            {saving ? t('common.saving') : t('app.quickLog.saveStay')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Artist switcher dropdown ──────────────────────────────────────────────────
function ArtistSwitcher({ artists, currentArtist, onSwitch, onAddNew, onDelete }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [dotsOpenFor, setDotsOpenFor] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        setDotsOpenFor(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const label = currentArtist?.name || (artists.length === 0 ? t('app.noArtists') : t('app.select'));

  return (
    <div className="artist-switcher" ref={ref}>
      <button
        className="artist-switcher-btn"
        onClick={() => { setOpen((o) => !o); setDotsOpenFor(null); }}
        aria-expanded={open}
        title={t('app.switchArtist')}
      >
        <span className="artist-switcher-label" dir="auto">{label}</span>
        <span className="artist-switcher-caret">▾</span>
      </button>

      {open && (
        <div className="artist-switcher-panel">
          {artists.map((a) => (
            <div key={a.id} className="artist-option-row">
              <button
                className={`artist-option${a.id === currentArtist?.id ? ' active' : ''}`}
                onClick={() => { onSwitch(a); setOpen(false); setDotsOpenFor(null); }}
              >
                <span dir="auto">{a.name}</span>
              </button>
              <button
                className={`artist-dots-btn${dotsOpenFor === a.id ? ' active' : ''}`}
                title={t('app.artistOptions')}
                onClick={(e) => {
                  e.stopPropagation();
                  setDotsOpenFor((prev) => (prev === a.id ? null : a.id));
                }}
              >
                ···
              </button>
              {dotsOpenFor === a.id && (
                <div className="artist-dots-menu">
                  <button
                    className="artist-dots-item artist-dots-item--danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDotsOpenFor(null);
                      setOpen(false);
                      onDelete(a);
                    }}
                  >
                    {t('app.deleteArtist')}
                  </button>
                </div>
              )}
            </div>
          ))}
          {artists.length > 0 && <div className="artist-option-divider" />}
          <button
            className="artist-option artist-option--new"
            onClick={() => { setOpen(false); setDotsOpenFor(null); onAddNew(); }}
          >
            {t('app.newArtist')}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Workspace Selector ────────────────────────────────────────────────────────
const WS_PALETTE = ['#3852B4', '#F08D39', '#C79A3F', '#4E7265'];

function WorkspaceSelector({ page, artists, currentArtist, onSwitch, onGoHome, onOpenTimeLog, onAddNew, demoMode = false }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const isHome = page === 'home' || page === 'timelog';
  const isTimeLog = page === 'timelog';
  const activeColor = !isHome && currentArtist
    ? WS_PALETTE[artists.findIndex((a) => a.id === currentArtist.id) % WS_PALETTE.length] || '#3852B4'
    : null;

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="ws-selector" ref={ref}>
      <button
        className="ws-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={t('app.switchWorkspace')}
      >
        {activeColor ? (
          <span className="ws-artist-dot-trigger" style={{ background: activeColor }} />
        ) : (
          <span className="ws-globe-dot" />
        )}
        <span className="ws-trigger-text">
          <span className="ws-trigger-eyebrow">{t('app.workspace')}</span>
          <span className="ws-trigger-label" dir="auto">
            {isTimeLog ? t('app.timeLog') : isHome ? t('app.globalHome') : (currentArtist?.name || t('app.globalHome'))}
          </span>
        </span>
        <span className="ws-trigger-caret">▾</span>
      </button>

      {open && (
        <div className="ws-dropdown">
          <div className="ws-dropdown-head">{t('app.switchWorkspace')}</div>

          {/* Global Home row */}
          <button
            className={`ws-dropdown-item${page === 'home' ? ' ws-dropdown-item--active' : ''}`}
            onClick={() => { onGoHome(); setOpen(false); }}
          >
            <span className="ws-dropdown-item-globe" />
            <span className="ws-dropdown-item-text">
              <span className="ws-dropdown-item-name">{t('app.globalHome')}</span>
              <span className="ws-dropdown-item-sub">{t('app.allArtists')}</span>
            </span>
            {page === 'home' && <span className="ws-dropdown-check">✓</span>}
          </button>

          {/* Time Log row — hidden in demo (needs a real account) */}
          {!demoMode && <button
            className={`ws-dropdown-item${isTimeLog ? ' ws-dropdown-item--active' : ''}`}
            onClick={() => { onOpenTimeLog?.(); setOpen(false); }}
          >
            <span className="ws-dropdown-item-clock">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M7 4v3.2l2 1.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </span>
            <span className="ws-dropdown-item-text">
              <span className="ws-dropdown-item-name">{t('app.timeLog')}</span>
              <span className="ws-dropdown-item-sub">{t('app.sessionsBilling')}</span>
            </span>
            {isTimeLog ? <span className="ws-dropdown-check">✓</span> : <span className="ws-dropdown-arrow">→</span>}
          </button>}

          {/* Workspace rows, grouped by template. One flat level: a group header
              per type, then its workspaces. Deliberately not a nested menu. */}
          {groupByWorkType(artists).map((group) => (
            <div key={group.type}>
              <div className="ws-dropdown-divider">{t(`app.workspaceType.${group.type}.label`)}</div>
              {group.items.map((a) => {
                // Colour is the workspace's identity — keep it stable per record
                // rather than tied to position in a filtered list.
                const idx = artists.findIndex((x) => x.id === a.id);
                const color = a.color || WS_PALETTE[idx % WS_PALETTE.length];
                const isActive = !isHome && currentArtist?.id === a.id;
                return (
                  <button
                    key={a.id}
                    className={`ws-dropdown-item${isActive ? ' ws-dropdown-item--active' : ''}`}
                    onClick={() => { onSwitch(a); setOpen(false); }}
                  >
                    <span className="ws-dropdown-item-swatch" style={{ background: color }} />
                    <span className="ws-dropdown-item-text">
                      <span className="ws-dropdown-item-name" dir="auto">{a.name}</span>
                    </span>
                    {isActive
                      ? <span className="ws-dropdown-check">✓</span>
                      : <span className="ws-dropdown-arrow">→</span>
                    }
                  </button>
                );
              })}
            </div>
          ))}

          {/* Entry point for creating a workspace. The template picker was
              unreachable without this: ArtistSwitcher owns an add button but is
              not rendered anywhere, so NewArtistModal could never open. */}
          {!demoMode && onAddNew && (
            <>
              <div className="ws-dropdown-divider" />
              <button
                className="ws-dropdown-item ws-dropdown-item--add"
                onClick={() => { setOpen(false); onAddNew(); }}
              >
                <span className="ws-dropdown-item-add-icon">+</span>
                <span className="ws-dropdown-item-text">
                  <span className="ws-dropdown-item-name">{t('app.newWorkspace')}</span>
                  <span className="ws-dropdown-item-sub">{t('app.newWorkspaceHint')}</span>
                </span>
              </button>
            </>
          )}

          <div className="ws-dropdown-footer">
            {t('app.workspaceFooter')}
          </div>
        </div>
      )}
    </div>
  );
}

// ── New Artist modal ───────────────────────────────────────────────────────────
function NewArtistModal({ onClose, onCreate }) {
  const { t } = useT();
  const [name, setName] = useState('');
  const [workType, setWorkType] = useState('production');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) { setErr(t('app.workspaceNameRequired')); return; }
    setBusy(true);
    try {
      await onCreate(trimmed, workType);
      onClose();
    } catch {
      setErr(t('app.workspaceCreateFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay confirm-overlay" onClick={onClose}>
      <div className="modal artist-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="artist-modal-title">{t('app.newWorkspaceTitle')}</h3>
        {/* Template first: it decides the navigation and the screens this
            workspace opens on, so it is a choice, not a setting to find later. */}
        <div className="ws-type-picker">
          {creatableTypes().map((type) => (
            <button
              key={type.id}
              type="button"
              className={`ws-type-option${workType === type.id ? ' ws-type-option--active' : ''}`}
              onClick={() => setWorkType(type.id)}
            >
              <span className="ws-type-option-label">{t(`app.workspaceType.${type.id}.label`)}</span>
              <span className="ws-type-option-hint">{t(`app.workspaceType.${type.id}.hint`)}</span>
            </button>
          ))}
        </div>
        <input
          className="artist-modal-input"
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); setErr(''); }}
          placeholder={t('app.workspaceName')}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCreate();
            if (e.key === 'Escape') onClose();
          }}
        />
        {err && <p className="artist-modal-error">{err}</p>}
        <div className="artist-modal-actions">
          <button className="btn-ghost" onClick={onClose} disabled={busy}>{t('common.cancel')}</button>
          <button className="btn-primary" onClick={handleCreate} disabled={busy || !name.trim()}>
            {busy ? t('app.creating') : t('app.create')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── User avatar + logout panel ────────────────────────────────────────────────
function UserMenu({ username, userRole, onOpenSettings, avatarUrl }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [imgBroken, setImgBroken] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Reset broken flag when avatarUrl changes
  useEffect(() => { setImgBroken(false); }, [avatarUrl]);

  const initials = (username || '?').slice(0, 2).toUpperCase();

  const logout = async () => {
    try { await fetch('/logout', { method: 'POST', credentials: 'same-origin' }); } catch {}
    window.location.href = '/login';
  };

  return (
    <div className="user-menu" ref={ref}>
      <button
        className="user-avatar-btn"
        onClick={() => setOpen((o) => !o)}
        aria-label={t('app.userMenu')}
        title={t('app.userMenu')}
      >
        {avatarUrl && !imgBroken
          ? <img src={avatarUrl} alt={username || t('app.avatar')} className="user-avatar-img" onError={() => setImgBroken(true)} />
          : initials}
      </button>

      {open && (
        <div className="user-menu-panel">
          <div className="user-menu-info">
            <span className="user-menu-name" dir="auto">{username || t('app.user')}</span>
            {userRole && (
              <span className={`user-menu-role user-menu-role--${userRole}`}>{t(`app.userRole.${userRole}`)}</span>
            )}
          </div>
          <div className="user-menu-divider" />
          <button className="user-menu-item" onClick={() => { setOpen(false); onOpenSettings?.(); }}>
            {t('settings.title')}
          </button>
          <div className="user-menu-divider" />
          <button className="user-menu-logout" onClick={logout}>
            {t('app.signOut')}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Notification Bell ─────────────────────────────────────────────────────────
function NotificationBell({ joinRequests, tasks, onNavigate }) {
  const { t: tr, tx } = useT();
  const [open, setOpen] = useState(false);
  const [seenIds, setSeenIds] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('ph-seen-notifs') || '[]')); }
    catch { return new Set(); }
  });
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const inviteNotifs = (joinRequests || []).map((r) => ({
    id:   `invite:${r.id}`,
    type: 'invite',
    text: tx('app.notification.invite', { user: r.fromUsername || tr('teams.admin') }),
    nav:  'teams',
  }));

  const taskNotifs = (tasks || [])
    .filter((t) => t.assignedToMe && !t.completed)
    .map((t) => ({
      id:   `task:${t.id}`,
      type: 'task',
      text: t.text ? tx('app.notification.taskAssigned', { task: t.text }) : tr('app.notification.newTask'),
      nav:  'tasks',
    }));

  const all    = [...inviteNotifs, ...taskNotifs];
  const unread = all.filter((n) => !seenIds.has(n.id));

  const saveSeen = (s) => {
    setSeenIds(s);
    localStorage.setItem('ph-seen-notifs', JSON.stringify([...s]));
  };
  const dismiss    = (id) => saveSeen(new Set([...seenIds, id]));
  const dismissAll = ()   => saveSeen(new Set(all.map((n) => n.id)));

  if (all.length === 0) return null;

  return (
    <div className="notif-bell" ref={ref}>
      <button
        className="notif-bell-btn"
        onClick={() => setOpen((o) => !o)}
        aria-label={tr('app.notifications')}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {unread.length > 0 && (
          <span className="notif-badge">{unread.length}</span>
        )}
      </button>

      {open && (
        <div className="notif-panel">
          <div className="notif-panel-header">
            <span className="notif-panel-title">{tr('app.notifications')}</span>
            {unread.length > 0 && (
              <button className="notif-dismiss-all" onClick={dismissAll}>
                {tr('app.dismissAll')}
              </button>
            )}
          </div>
          {all.length === 0 ? (
            <p className="notif-empty">{tr('app.noNotifications')}</p>
          ) : (
            <div className="notif-list">
              {all.map((n) => (
                <div key={n.id} className={`notif-item${seenIds.has(n.id) ? ' seen' : ' unseen'}`}>
                  <button
                    className="notif-item-text"
                    onClick={() => { onNavigate(n.nav); setOpen(false); }}
                  >
                    {n.text}
                  </button>
                  <button
                    className="notif-item-dismiss"
                    onClick={() => dismiss(n.id)}
                    title={tr('app.dismiss')}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Timezone list ─────────────────────────────────────────────────────────────
const TIMEZONES = [
  'Africa/Cairo', 'Africa/Johannesburg', 'America/New_York', 'America/Chicago',
  'America/Denver', 'America/Los_Angeles', 'America/Sao_Paulo', 'Asia/Jerusalem',
  'Asia/Dubai', 'Asia/Kolkata', 'Asia/Bangkok', 'Asia/Singapore', 'Asia/Tokyo',
  'Europe/London', 'Europe/Lisbon', 'Europe/Paris', 'Europe/Helsinki', 'Europe/Moscow',
  'Pacific/Sydney', 'Pacific/Auckland',
];

// ── User Settings Modal ───────────────────────────────────────────────────────
function UserSettingsModal({ onClose, currentWorkspaceRole, userRole, onChangeWorkspaceRole, onAvatarChange, theme, onToggleTheme }) {
  const { t, lang } = useT();
  // ── Push notifications ────────────────────────────────────────────────────
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushMsg,     setPushMsg]     = useState('');
  const [pushBusy,    setPushBusy]    = useState(false);

  // ── Workspace role ────────────────────────────────────────────────────────
  const [roleValue,  setRoleValue]  = useState(currentWorkspaceRole || 'producer');
  const [roleSaving, setRoleSaving] = useState(false);
  const [roleMsg,    setRoleMsg]    = useState('');

  // ── Profile ───────────────────────────────────────────────────────────────
  const [displayName,     setDisplayName]     = useState('');
  const [avatarPreview,   setAvatarPreview]   = useState(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [profileSaving,   setProfileSaving]   = useState(false);
  const [profileMsg,      setProfileMsg]      = useState('');
  const avatarInputRef = useRef(null);

  // ── Change Password ───────────────────────────────────────────────────────
  const [pwOpen,        setPwOpen]        = useState(false);
  const [pwCurrent,     setPwCurrent]     = useState('');
  const [pwNew,         setPwNew]         = useState('');
  const [pwConfirm,     setPwConfirm]     = useState('');
  const [pwSaving,      setPwSaving]      = useState(false);
  const [pwMsg,         setPwMsg]         = useState('');


  // ── Preferences ───────────────────────────────────────────────────────────
  const [timezone, setTimezone] = useState('');
  const [tzSaving, setTzSaving] = useState(false);
  const [tzMsg,    setTzMsg]    = useState('');
  const [languageSaving, setLanguageSaving] = useState(false);
  const [languageMsg, setLanguageMsg] = useState('');

  // ── Integrations ──────────────────────────────────────────────────────────
  const [integrations,    setIntegrations]    = useState({ gmail: false, gcal: false, gdrive: false });
  const [spotifyConnected, setSpotifyConnected] = useState(false);
  const [intgLoading,     setIntgLoading]     = useState(true);
  const [intgMsg,         setIntgMsg]         = useState('');

  // Reflect the REAL subscription state, not "was the toggle pressed this
  // session". pushEnabled is component state, so without this the switch reads
  // off after every reload even when the device is subscribed — and, worse, it
  // could read on while the server had no record of the device at all.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (!cancelled) setPushEnabled(!!sub);
      } catch { /* leave it off — the toggle will surface any real error */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Load data on mount ───────────────────────────────────────────────────
  useEffect(() => {
    // Profile fields
    fetch('/api/me')
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!d) return;
        setDisplayName(d.displayName || '');
        setTimezone(d.timezone || '');
        if (d.avatarUrl) setAvatarPreview(d.avatarUrl);
      })
      .catch(() => {});

    // Integrations status
    Promise.all([
      fetch('/api/automations/integrations').then((r) => r.ok ? r.json() : null),
      fetch('/api/spotify/status').then((r) => r.ok ? r.json() : null),
    ]).then(([intg, spot]) => {
      if (intg) setIntegrations(intg);
      if (spot) setSpotifyConnected(spot.connected);
      setIntgLoading(false);
    }).catch(() => setIntgLoading(false));

    // Push subscription state
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.ready
        .then((reg) => reg.pushManager.getSubscription())
        .then((sub) => { if (sub) setPushEnabled(true); })
        .catch(() => {});
    }
  }, []);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleAvatarPick = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setProfileMsg(t('app.settings.selectImage')); return; }
    if (file.size > 2 * 1024 * 1024) { setProfileMsg(t('app.settings.imageTooLarge')); return; }

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target.result;
      setAvatarPreview(dataUrl);
      setAvatarUploading(true);
      setProfileMsg('');
      try {
        const r = await fetch('/api/me/avatar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataUrl }),
        });
        if (r.ok) {
          const d = await r.json();
          onAvatarChange?.(d.avatarUrl);
          setProfileMsg(t('app.settings.avatarUpdated'));
          setTimeout(() => setProfileMsg(''), 2500);
        } else {
          setProfileMsg(t('app.settings.avatarUploadFailed'));
        }
      } catch {
        setProfileMsg(t('app.settings.avatarUploadFailed'));
      } finally {
        setAvatarUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = async () => {
    setProfileSaving(true);
    setProfileMsg('');
    try {
      const r = await fetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName }),
      });
      if (r.ok) {
        setProfileMsg(t('settings.saved'));
        setTimeout(() => setProfileMsg(''), 2500);
      } else {
        setProfileMsg(t('settings.saveError'));
      }
    } catch {
      setProfileMsg(t('settings.saveError'));
    } finally {
      setProfileSaving(false);
    }
  };

  const handleSaveTz = async () => {
    setTzSaving(true);
    setTzMsg('');
    try {
      const r = await fetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone }),
      });
      if (r.ok) {
        setTzMsg(t('settings.saved'));
        setTimeout(() => setTzMsg(''), 2500);
      } else {
        setTzMsg(t('settings.saveError'));
      }
    } catch {
      setTzMsg(t('settings.saveError'));
    } finally {
      setTzSaving(false);
    }
  };

  const handleLanguageChange = async (nextLang) => {
    if (nextLang === lang || languageSaving) return;
    setLanguageSaving(true);
    setLanguageMsg('');
    try {
      await switchLanguage(nextLang);
    } catch {
      setLanguageSaving(false);
      setLanguageMsg(t('settings.lang.error'));
    }
  };

  // ── Change password ─────────────────────────────────────────────────────
  const handleChangePassword = async () => {
    setPwMsg('');
    if (!pwCurrent || !pwNew) { setPwMsg(t('app.settings.passwordRequired')); return; }
    if (pwNew !== pwConfirm)  { setPwMsg(t('app.settings.passwordMismatch'));  return; }
    if (pwNew.length < 8)     { setPwMsg(t('app.settings.passwordLength')); return; }
    setPwSaving(true);
    try {
      const r = await fetch('/api/me/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: pwCurrent, newPassword: pwNew }),
      });
      const d = await r.json();
      if (r.ok) {
        setPwMsg(t('app.settings.passwordChanged'));
        setPwOpen(false);
        setPwCurrent(''); setPwNew(''); setPwConfirm('');
      } else {
        setPwMsg(d.error || t('app.settings.passwordChangeFailed'));
      }
    } catch {
      setPwMsg(t('app.serverError'));
    } finally {
      setPwSaving(false);
    }
  };

  const handleConnect = (provider) => {
    window.location.href = `/api/automations/integrations/${provider}/connect`;
  };

  const handleDisconnect = async (provider) => {
    try {
      const r = await fetch(`/api/automations/integrations/${provider}`, { method: 'DELETE' });
      if (r.ok) {
        setIntegrations((prev) => ({ ...prev, [provider]: false }));
        setIntgMsg(t('app.settings.disconnected'));
        setTimeout(() => setIntgMsg(''), 2500);
      }
    } catch {}
  };

  // Admin-only: copies current integrations token data to clipboard so it can be
  // pasted into the INTEGRATIONS_DATA Railway env var for persistence across deploys.
  const handleBackupIntegrations = async () => {
    try {
      const r = await fetch('/api/automations/integrations/export');
      if (!r.ok) throw new Error(t('app.settings.exportFailed'));
      const { data } = await r.json();
      await navigator.clipboard.writeText(data);
      setIntgMsg(<>{t('app.settings.integrationDataCopiedPrefix')} <span className="ltr">INTEGRATIONS_DATA</span> {t('app.settings.integrationDataCopiedSuffix')}</>);
      setTimeout(() => setIntgMsg(''), 6000);
    } catch (e) {
      setIntgMsg(e.message || t('app.settings.integrationDataCopyFailed'));
      setTimeout(() => setIntgMsg(''), 4000);
    }
  };

  const handlePushToggle = async () => {
    setPushBusy(true);
    setPushMsg('');
    try {
      if (!pushEnabled) {
        await subscribeToPush();
        setPushEnabled(true);
        setPushMsg(t('app.settings.pushEnabled'));
      } else {
        if (!('serviceWorker' in navigator)) throw new Error(t('app.settings.pushUnsupported'));
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) await sub.unsubscribe();
        setPushEnabled(false);
        setPushMsg(t('app.settings.pushDisabled'));
      }
    } catch (e) {
      setPushMsg(e.message || t('app.settings.pushUpdateFailed'));
    } finally {
      setPushBusy(false);
    }
  };

  const handleRoleChange = async (newRole) => {
    setRoleValue(newRole);
    setRoleSaving(true);
    setRoleMsg('');
    try {
      const r = await fetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceRole: newRole }),
      });
      if (r.ok) {
        onChangeWorkspaceRole?.(newRole);
        setRoleMsg(t('settings.saved'));
        setTimeout(() => setRoleMsg(''), 2500);
      } else {
        setRoleMsg(t('settings.saveError'));
      }
    } catch {
      setRoleMsg(t('settings.saveError'));
    } finally {
      setRoleSaving(false);
    }
  };

  const initials = displayName
    ? displayName.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  const GOOGLE_SERVICES = [
    { id: 'gcal',   labelKey: 'app.settings.googleCalendar' },
    { id: 'gdrive', labelKey: 'app.settings.googleDrive' },
    { id: 'gmail',  labelKey: 'app.settings.gmail' },
  ];

  const INTG_ICONS = {
    /* Google Calendar — official brand icon */
    gcal: (
      <svg width="28" height="28" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M17 3h-1V1h-2v2H8V1H6v2H5C3.9 3 3 3.9 3 5v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V9h14v10z" fill="#1A73E8"/>
        <path d="M5 5h14v4H5z" fill="#1A73E8"/>
        <rect x="5" y="9" width="14" height="10" fill="white"/>
        <path d="M7 11h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2zM7 15h2v2H7zm4 0h2v2h-2z" fill="#5F6368"/>
        <path d="M15 15h2v2h-2z" fill="#EA4335"/>
        <path d="M6 3h2v2H6zm10 0h2v2h-2z" fill="#5F6368"/>
      </svg>
    ),
    /* Google Drive — official 6-path source SVG */
    gdrive: (
      <svg width="28" height="28" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
        <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
        <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/>
        <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
        <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
        <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
        <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
      </svg>
    ),
    /* Gmail — Simple Icons M-envelope path */
    gmail: (
      <svg width="28" height="28" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z" fill="#EA4335"/>
      </svg>
    ),
    /* Spotify — Simple Icons circle-waves path */
    spotify: (
      <svg width="28" height="28" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" fill="#1DB954"/>
      </svg>
    ),
  };

  return (
    <div className="modal-overlay confirm-overlay" onClick={onClose}>
      <div className="modal user-settings-modal" onClick={(e) => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="user-settings-header">
          <h3 className="user-settings-title">{t('settings.title')}</h3>
          <button className="user-settings-close" onClick={onClose} aria-label={t('common.close')}>✕</button>
        </div>

        {/* ── Appearance ── */}
        <div className="user-settings-section">
          <h4 className="user-settings-section-title">{t('app.settings.appearance')}</h4>
          <div className="user-settings-row">
            <div className="user-settings-row-info">
              <span className="user-settings-row-label">{t('app.settings.theme')}</span>
              <span className="user-settings-row-desc">{t('app.settings.themeDescription')}</span>
            </div>
            <div className="ust-theme-seg" role="radiogroup" aria-label={t('app.settings.theme')}>
              <button
                type="button"
                className={`ust-theme-opt${theme !== 'dark' ? ' is-active' : ''}`}
                role="radio"
                aria-checked={theme !== 'dark'}
                onClick={() => { if (theme === 'dark') onToggleTheme(); }}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <circle cx="8" cy="8" r="3.2" fill="currentColor"/>
                  <g stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                    <path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1"/>
                  </g>
                </svg>
                {t('app.settings.light')}
              </button>
              <button
                type="button"
                className={`ust-theme-opt${theme === 'dark' ? ' is-active' : ''}`}
                role="radio"
                aria-checked={theme === 'dark'}
                onClick={() => { if (theme !== 'dark') onToggleTheme(); }}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M13.2 9.6A5.6 5.6 0 0 1 6.4 2.8 5.6 5.6 0 1 0 13.2 9.6z" fill="currentColor"/>
                </svg>
                {t('app.settings.dark')}
              </button>
            </div>
          </div>
        </div>

        {/* ── Account ── */}
        <div className="user-settings-section">
          <h4 className="user-settings-section-title">{t('app.account')}</h4>

          {/* Avatar + Display Name */}
          <div className="ust-profile-row">
            <div
              className={`ust-avatar-wrap${avatarUploading ? ' uploading' : ''}`}
              onClick={() => avatarInputRef.current?.click()}
              title={t('app.settings.changePhoto')}
            >
              {avatarPreview
                ? <img src={avatarPreview} alt={t('app.avatar')} className="ust-avatar-img" />
                : <span className="ust-avatar-initials">{initials}</span>}
              <span className="ust-avatar-overlay">{avatarUploading ? '…' : t('common.edit')}</span>
            </div>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleAvatarPick}
            />
            <div className="ust-profile-fields">
              <label className="ust-field-label">{t('app.settings.displayName')}</label>
              <input
                className="ust-field-input"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={t('app.settings.yourName')}
                dir="auto"
                maxLength={100}
              />
            </div>
          </div>

          <div className="ust-save-row">
            <button className="btn-primary ust-save-btn" onClick={handleSaveProfile} disabled={profileSaving}>
              {profileSaving ? t('common.saving') : t('common.save')}
            </button>
            {profileMsg && (
              <span className={`user-settings-msg${profileMsg === t('settings.saved') || profileMsg === t('app.settings.avatarUpdated') ? ' ok' : ' err'}`}>
                {profileMsg}
              </span>
            )}
          </div>

          {/* ── Change Password ── */}
          <div className="ust-security-block">
            <span className="ust-security-label">{t('app.settings.security')}</span>

            {userRole === 'admin' ? (
              <p className="ust-security-note">
                {t('app.settings.adminPasswordPrefix')} <code className="ltr">AUTH_PASSWORD</code> {t('app.settings.adminPasswordSuffix')}
              </p>
            ) : (
              <div className="ust-pw-form">
                <input
                  className="ust-field-input"
                  type="password"
                  placeholder={t('app.settings.currentPassword')}
                  value={pwCurrent}
                  onChange={(e) => setPwCurrent(e.target.value)}
                  autoComplete="current-password"
                />
                <input
                  className="ust-field-input"
                  type="password"
                  placeholder={t('app.settings.newPassword')}
                  value={pwNew}
                  onChange={(e) => setPwNew(e.target.value)}
                  autoComplete="new-password"
                />
                <input
                  className="ust-field-input"
                  type="password"
                  placeholder={t('app.settings.confirmPassword')}
                  value={pwConfirm}
                  onChange={(e) => setPwConfirm(e.target.value)}
                  autoComplete="new-password"
                  onKeyDown={(e) => e.key === 'Enter' && handleChangePassword()}
                />
                <div className="ust-save-row" style={{ marginTop: 6 }}>
                  <button className="btn-primary ust-save-btn" onClick={handleChangePassword} disabled={pwSaving}>
                    {pwSaving ? t('common.saving') : t('app.settings.updatePassword')}
                  </button>
                  {pwMsg && (
                    <span className={`user-settings-msg${pwMsg === t('app.settings.passwordChanged') ? ' ok' : ' err'}`}>
                      {pwMsg}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Preferences ── */}
        <div className="user-settings-section">
          <h4 className="user-settings-section-title">{t('app.settings.preferences')}</h4>
          <div className="user-settings-row">
            <div className="user-settings-row-info">
              <span className="user-settings-row-label">{t('settings.language')}</span>
              <span className="user-settings-row-desc">{t('settings.languageDesc')}</span>
            </div>
            <div className="ust-theme-seg" role="radiogroup" aria-label={t('settings.language')}>
              <button
                type="button"
                className={`ust-theme-opt${lang === 'en' ? ' is-active' : ''}`}
                role="radio"
                aria-checked={lang === 'en'}
                onClick={() => handleLanguageChange('en')}
                disabled={languageSaving}
              >
                {t('settings.lang.en')}
              </button>
              <button
                type="button"
                className={`ust-theme-opt${lang === 'he' ? ' is-active' : ''}`}
                role="radio"
                aria-checked={lang === 'he'}
                onClick={() => handleLanguageChange('he')}
                disabled={languageSaving}
              >
                {t('settings.lang.he')}
              </button>
            </div>
          </div>
          {languageMsg && <p className="user-settings-msg err">{languageMsg}</p>}
          <div className="user-settings-row ust-tz-row">
            <div className="user-settings-row-info">
              <span className="user-settings-row-label">{t('app.settings.timezone')}</span>
              <span className="user-settings-row-desc">{t('app.settings.timezoneDescription')}</span>
            </div>
            <select
              className="ust-select"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            >
              <option value="">{t('app.settings.systemDefault')}</option>
              {TIMEZONES.map((timezoneValue) => (
                <option key={timezoneValue} value={timezoneValue}>{t(`app.timezone.${timezoneValue}`)}</option>
              ))}
            </select>
          </div>
          <div className="ust-save-row">
            <button className="btn-primary ust-save-btn" onClick={handleSaveTz} disabled={tzSaving}>
              {tzSaving ? t('common.saving') : t('common.save')}
            </button>
            {tzMsg && (
              <span className={`user-settings-msg${tzMsg === t('settings.saved') ? ' ok' : ' err'}`}>{tzMsg}</span>
            )}
          </div>
        </div>

        {/* ── Integrations ── */}
        <div className="user-settings-section">
          <h4 className="user-settings-section-title">{t('app.settings.integrations')}</h4>
          {intgLoading ? (
            <p className="user-settings-section-desc">{t('common.loading')}</p>
          ) : (
            <div className="ust-intg-list">
              {GOOGLE_SERVICES.map(({ id, labelKey }) => (
                <div key={id} className="ust-intg-row">
                  <span className="ust-intg-icon">{INTG_ICONS[id]}</span>
                  <span className="ust-intg-name">{t(labelKey)}</span>
                  <span className={`ust-intg-status${integrations[id] ? ' connected' : ''}`}>
                    {integrations[id] ? t('app.settings.connected') : t('app.settings.disconnected')}
                  </span>
                  {integrations[id] ? (
                    <button className="ust-btn-disconnect" onClick={() => handleDisconnect(id)}>
                      {t('app.settings.disconnect')}
                    </button>
                  ) : (
                    <button className="ust-btn-connect" onClick={() => handleConnect(id)}>
                      {t('app.settings.connect')}
                    </button>
                  )}
                </div>
              ))}
              {/* Spotify — server credentials only */}
              <div className="ust-intg-row">
                <span className="ust-intg-icon">{INTG_ICONS.spotify}</span>
                <span className="ust-intg-name">{t('app.settings.spotify')}</span>
                <span className={`ust-intg-status${spotifyConnected ? ' connected' : ''}`}>
                  {spotifyConnected ? t('app.settings.connected') : t('app.settings.notConfigured')}
                </span>
                <span className="ust-intg-hint">
                  {spotifyConnected ? t('app.settings.serverCredentials') : (
                    <>{t('app.settings.addCredentialsPrefix')} <code className="ltr">SPOTIFY_CLIENT_ID</code> {t('app.settings.addCredentialsSuffix')}</>
                  )}
                </span>
              </div>
            </div>
          )}
          {userRole === 'admin' && (
            <div className="ust-intg-backup-row">
              <button className="ust-btn-backup" onClick={handleBackupIntegrations}>
                {t('app.settings.backupConnections')}
              </button>
              <span className="ust-intg-backup-hint">
                {t('app.settings.backupHintPrefix')} <code className="ltr">INTEGRATIONS_DATA</code> {t('app.settings.backupHintSuffix')}
              </span>
            </div>
          )}
          {intgMsg && <p className="user-settings-msg">{intgMsg}</p>}
        </div>

        {/* ── Notifications ── */}
        <div className="user-settings-section">
          <h4 className="user-settings-section-title">{t('app.notifications')}</h4>
          <div className="user-settings-row">
            <div className="user-settings-row-info">
              <span className="user-settings-row-label">{t('app.settings.pushNotifications')}</span>
              <span className="user-settings-row-desc">{t('app.settings.pushDescription')}</span>
            </div>
            <button
              role="switch"
              aria-checked={pushEnabled}
              className={`settings-toggle-switch${pushEnabled ? ' on' : ''}`}
              onClick={handlePushToggle}
              disabled={pushBusy}
              aria-label={t('app.settings.togglePush')}
            >
              <span className="settings-toggle-thumb" />
            </button>
          </div>
          {pushMsg && (
            <p className={`user-settings-msg${pushMsg === t('app.settings.pushEnabled') ? ' ok' : pushMsg === t('app.settings.pushDisabled') ? '' : ' err'}`}>
              {pushMsg}
            </p>
          )}
        </div>

        {/* ── My View (non-admin only) ── */}
        {userRole !== 'admin' && (
          <div className="user-settings-section">
            <h4 className="user-settings-section-title">{t('app.settings.myView')}</h4>
            <p className="user-settings-section-desc">{t('app.settings.myViewDescription')}</p>
            <div className="user-settings-role-grid">
              {[
                { value: 'producer',  labelKey: 'app.settings.producer',  descKey: 'app.settings.producerDescription' },
                { value: 'backliner', labelKey: 'app.settings.backliner', descKey: 'app.settings.backlinerDescription' },
              ].map(({ value, labelKey, descKey }) => (
                <button
                  key={value}
                  className={`user-settings-role-card${roleValue === value ? ' active' : ''}`}
                  onClick={() => handleRoleChange(value)}
                  disabled={roleSaving}
                >
                  <span className="user-settings-role-label">{t(labelKey)}</span>
                  <span className="user-settings-role-desc">{t(descKey)}</span>
                </button>
              ))}
            </div>
            {roleMsg && <p className={`user-settings-msg${roleMsg === t('settings.saved') ? ' ok' : ' err'}`}>{roleMsg}</p>}
          </div>
        )}

      </div>
    </div>
  );
}

export default App;
