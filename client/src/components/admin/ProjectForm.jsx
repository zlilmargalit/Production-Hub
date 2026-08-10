import { useState } from 'react';
import IconButton from '../ui/IconButton';
import { decimalOnly } from '../../utils/fieldInput';
import { ils } from './adminFormat';

// Create / edit a project.
//
// Work days are edited here even though the server keeps them in their own
// nested collection, because everything the Projects list shows about a project
// — its date range, whether it is upcoming or past, the contract alarm — is
// derived from them. A project saved without work days would sit in UPCOMING
// with no date forever, which is not a state worth being able to create.
//
// The form therefore saves in two steps: the project, then its work days. The
// parent's onSave owns that sequencing; see saveProject in App.jsx.

const PROJECT_TYPES = [
  ['advertising', 'Advertising'],
  ['film',        'Film'],
  ['talent',      'Talent'],
  ['other',       'Other'],
];

const STATUSES = [
  ['proposed',          'Proposed'],
  ['awaiting_contract', 'Awaiting contract'],
  ['confirmed',         'Confirmed'],
  ['completed',         'Completed'],
  ['invoiced',          'Invoiced'],
  ['paid',              'Paid'],
];

const EMPTY = {
  name: '', clientId: '', brand: '', projectType: 'advertising',
  rate: '', vatPercent: '18', status: 'proposed', notes: '',
};

// Work days carry a local key so React can track rows that have no id yet.
let rowSeq = 0;
const blankDay = () => ({ localKey: `new-${rowSeq++}`, date: '' });

// Sentinel option, same shape CrewManager uses for "add new role".
const ADD_CLIENT = '__add_client__';

export default function ProjectForm({ project = null, clients = [], onSave, onCreateClient, onClose }) {
  const [form, setForm] = useState(() => {
    if (!project) return { ...EMPTY };
    return {
      ...EMPTY,
      ...project,
      clientId: project.clientId || '',
      rate: project.rate === 0 || project.rate ? String(project.rate) : '',
      // Stored as a fraction (0.18); shown as a percentage, because that is how
      // a rate is spoken about and typed.
      vatPercent: String(Math.round((project.vatRate ?? 0.18) * 10000) / 100),
    };
  });
  const [days, setDays] = useState(() =>
    (project?.workDays || []).map((d) => ({ ...d, localKey: d.id })));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Inline client creation, like "New Folder" inside a save dialog: you should
  // not have to abandon a half-filled project to go and add the client first.
  // Name and terms only — the rest is filled in on the Clients screen, and the
  // server defaults paymentTerms to 30 anyway.
  const [addingClient, setAddingClient] = useState(false);
  const [newClient, setNewClient] = useState({ name: '', paymentTerms: 30 });
  const [clientBusy, setClientBusy] = useState(false);

  const CLEAN = { rate: decimalOnly, vatPercent: decimalOnly };

  const set = (e) => {
    const { name, value } = e.target;
    if (name === 'clientId' && value === ADD_CLIENT) {
      setAddingClient(true);
      setNewClient({ name: '', paymentTerms: 30 });
      return;                                  // leave the select where it was
    }
    const clean = CLEAN[name];
    setForm((f) => ({ ...f, [name]: clean ? clean(value) : value }));
  };

  const confirmNewClient = async () => {
    const name = newClient.name.trim();
    if (!name || clientBusy) return;
    setClientBusy(true);
    setError(null);
    try {
      const created = await onCreateClient({ name, paymentTerms: newClient.paymentTerms });
      // Select it straight away — creating it and then having to find it in the
      // list would defeat the point.
      setForm((f) => ({ ...f, clientId: created.id }));
      setAddingClient(false);
    } catch (err) {
      setError(err.message || 'Could not create the client');
    } finally {
      setClientBusy(false);
    }
  };

  const cancelNewClient = () => { setAddingClient(false); setClientBusy(false); };

  const setDay = (key, field, value) =>
    setDays((list) => list.map((d) => (d.localKey === key ? { ...d, [field]: value } : d)));
  const addDay    = () => setDays((list) => [...list, blankDay()]);
  const removeDay = (key) => setDays((list) => list.filter((d) => d.localKey !== key));

  // Shown, never stored. The server holds `rate` excluding VAT; recomputing the
  // inclusive figure on read is what stops the two from drifting apart.
  const rateNum  = Number(form.rate) || 0;
  const vatNum   = (Number(form.vatPercent) || 0) / 100;
  const withVat  = Math.round(rateNum * (1 + vatNum) * 100) / 100;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;

    // A work day with no date is an empty row the user left behind, not an
    // error — drop it rather than making them find and clear it.
    const filled = days.filter((d) => d.date);
    const dupe = filled.map((d) => d.date).find((d, i, all) => all.indexOf(d) !== i);
    if (dupe) { setError(`Two work days share the date ${dupe}.`); return; }
    if (vatNum < 0 || vatNum > 1) { setError('VAT must be between 0 and 100 percent.'); return; }

    setSaving(true);
    setError(null);
    try {
      await onSave(
        {
          ...form,
          clientId: form.clientId || null,
          rate: rateNum,
          vatRate: vatNum,
        },
        filled.map(({ localKey, ...d }) => ({ ...d, id: d.id })),
      );
      onClose();
    } catch (err) {
      setError(err.message || 'Could not save the project');
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{project ? 'Edit Project' : 'New Project'}</h2>
          <IconButton onClick={onClose}>✕</IconButton>
        </div>

        <form onSubmit={handleSubmit} className="show-form">
          <div className="form-grid">
            <div className="form-group span-2">
              <label>Project name *</label>
              <input dir="auto" name="name" value={form.name} onChange={set}
                     required autoFocus placeholder="What this job is called" />
            </div>

            <div className="form-group">
              <label>Client</label>
              <select name="clientId" value={form.clientId} onChange={set}>
                <option value="">— No client —</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                <option value={ADD_CLIENT}>＋ Add new client…</option>
              </select>

              {addingClient ? (
                <div className="adm-inline-add">
                  <input
                    autoFocus dir="auto" value={newClient.name}
                    placeholder="Client name"
                    onChange={(e) => setNewClient((c) => ({ ...c, name: e.target.value }))}
                    onKeyDown={(e) => {
                      // Enter must not submit the project — the user is naming a
                      // client, not finishing the form.
                      if (e.key === 'Enter') { e.preventDefault(); confirmNewClient(); }
                      if (e.key === 'Escape') { e.preventDefault(); cancelNewClient(); }
                    }}
                  />
                  <select
                    value={newClient.paymentTerms}
                    onChange={(e) => setNewClient((c) => ({ ...c, paymentTerms: Number(e.target.value) }))}
                  >
                    {[30, 60, 90].map((t) => <option key={t} value={t}>Net {t}</option>)}
                  </select>
                  <button type="button" className="btn-primary btn-sm"
                          onClick={confirmNewClient} disabled={clientBusy || !newClient.name.trim()}>
                    {clientBusy ? '…' : 'Add'}
                  </button>
                  <button type="button" className="btn-secondary btn-sm" onClick={cancelNewClient}>
                    Cancel
                  </button>
                </div>
              ) : !clients.length ? (
                <span className="field-hint">No clients yet — add one above, or save without.</span>
              ) : null}
            </div>

            <div className="form-group">
              <label>Brand</label>
              <input dir="auto" name="brand" value={form.brand} onChange={set}
                     placeholder="The brand being shot for" />
            </div>

            <div className="form-group">
              <label>Type</label>
              <select name="projectType" value={form.projectType} onChange={set}>
                {PROJECT_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>Status</label>
              <select name="status" value={form.status} onChange={set}>
                {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>Rate, before VAT</label>
              <input dir="ltr" name="rate" value={form.rate} onChange={set}
                     inputMode="decimal" placeholder="0" />
            </div>

            <div className="form-group">
              <label>VAT %</label>
              <input dir="ltr" name="vatPercent" value={form.vatPercent} onChange={set}
                     inputMode="decimal" />
              <span className="field-hint">
                {rateNum > 0 ? `${ils(withVat)} including VAT` : 'Total appears once a rate is set.'}
              </span>
            </div>

            {/* Work days drive the whole Projects list — the date range on the
                card, upcoming vs past, and the contract alarm. */}
            <div className="form-group span-2">
              <label>Work days</label>
              {days.length === 0 && (
                <span className="field-hint">
                  No work days yet. A day is what assistants are paid for and what
                  purchases attach to — without one this project has no date.
                </span>
              )}
              {days.map((d) => (
                <div key={d.localKey} className="adm-day-row">
                  <input type="date" value={d.date || ''}
                         onChange={(e) => setDay(d.localKey, 'date', e.target.value)} />
                  <IconButton danger onClick={() => removeDay(d.localKey)} title="Remove work day">✕</IconButton>
                </div>
              ))}
              <button type="button" className="btn-ghost btn-sm adm-day-add" onClick={addDay}>
                + Add work day
              </button>
            </div>

            <div className="form-group span-2">
              <label>Notes</label>
              <textarea dir="auto" name="notes" rows={3} value={form.notes} onChange={set} />
            </div>
          </div>

          {error && <p className="adm-form-error">{error}</p>}

          <div className="form-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving || !form.name.trim()}>
              {saving ? 'Saving…' : project ? 'Save changes' : 'Create project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
