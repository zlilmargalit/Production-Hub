import { useState } from 'react';
import IconButton from '../ui/IconButton';
import { decimalOnly } from '../../utils/fieldInput';
import {
  ils, fmtDate, dateRange, todayStr, ballInCourt, projectAlert, daysBetween,
} from './adminFormat';

// A project, as a card that expands in place — the same disclosure the show
// cards use, so the two workspaces behave alike.
//
// What made this possible was cutting the project back to money. The stylist
// does not run the shoot day, so a work day is a billing unit: a date, who
// worked it, what was spent on it. Everything that was a call sheet is gone.
//
// Purchases and returns still need room, so they get a panel that opens inside
// the expanded card — the same shape as the Technical panel inside a show card,
// which is what keeps the returns detail from inflating the common case.

const TYPE_LABEL = {
  advertising: 'Advertising', film: 'Film', talent: 'Talent', other: 'Other',
};

// The bar colour is the project TYPE, never the status — status is carried by
// the ball-in-court line instead.
const TYPE_COLOR = {
  advertising: '#3852B4', film: '#7A4E8C', talent: '#C26C1F', other: '#4E7265',
};

const EXPENSE_TYPES = [
  ['taxi', 'Taxi'], ['parking', 'Parking'], ['shipping', 'Shipping'], ['other', 'Other'],
];

// Every figure here is derived server-side, so the card only ever displays what
// the API returned — the totals can never disagree with the rows they sum.
function Money({ project }) {
  const rate = Number(project.rate || 0);
  const vatPct = Math.round((project.vatRate ?? 0.18) * 10000) / 100;
  const hasBillable = project.billableExpenses > 0;

  return (
    <dl className="adm-facts">
      <div><dt>Fee, before VAT</dt><dd className="n">{ils(rate)}</dd></div>
      {hasBillable && (
        <div><dt>Billable expenses</dt><dd className="n">{ils(project.billableExpenses)}</dd></div>
      )}
      <div><dt>VAT</dt><dd className="n">{vatPct}%</dd></div>
      <div>
        <dt>{hasBillable ? 'To invoice' : 'Total'}</dt>
        <dd className="n adm-fact--strong">{ils(project.invoiceTotal)}</dd>
      </div>
      {project.paymentTerms != null && (
        <div><dt>Payment terms</dt><dd className="n">Net {project.paymentTerms}</dd></div>
      )}
      {project.invoiceSentAt && (
        <div><dt>Invoiced</dt><dd className="n">{fmtDate(project.invoiceSentAt)}</dd></div>
      )}
      {project.paymentDueAt && (
        <div><dt>Due</dt><dd className="n">{fmtDate(project.paymentDueAt)}</dd></div>
      )}
      {project.paidAt && <div><dt>Paid</dt><dd className="n">{fmtDate(project.paidAt)}</dd></div>}
    </dl>
  );
}

// One work day: the date, who worked it, what was spent on it, and whether it
// has been checked over yet.
function WorkDay({ day, today, roster, handlers, busy }) {
  const [adding, setAdding] = useState(null);          // 'assistant' | 'expense' | null
  const [pick, setPick] = useState({ assistantId: '', amount: '' });
  const [exp, setExp]   = useState({ type: 'taxi', amount: '', billable: true });

  const away = daysBetween(today, day.date);
  const when = away === 0 ? 'Today' : away === 1 ? 'Tomorrow'
    : away > 1 ? `In ${away} days` : null;

  const booked = day.assistants || [];
  const spent  = handlers.expensesFor(day.id);
  const past   = day.date < today;
  const checked = !!day.expensesCheckedAt;

  const alreadyHere = new Set(booked.map((b) => b.assistantId).filter(Boolean));
  const available = roster.filter((r) => !alreadyHere.has(r.id));

  const choose = (id) => {
    const r = roster.find((x) => x.id === id);
    setPick({ assistantId: id, amount: r?.dayRate ? String(r.dayRate) : '' });
  };

  const confirmAssistant = async () => {
    if (!pick.assistantId) return;
    const r = roster.find((x) => x.id === pick.assistantId);
    await handlers.book(day.id, {
      assistantId: pick.assistantId,
      nameSnapshot: r?.name || '',
      amount: Number(pick.amount) || 0,
    });
    setAdding(null);
  };

  const confirmExpense = async () => {
    if (!exp.amount) return;
    await handlers.addExpense({
      workDayId: day.id, date: day.date,
      type: exp.type, amount: Number(exp.amount) || 0,
      paidBy: 'stylist', billable: exp.billable,
    });
    setExp({ type: 'taxi', amount: '', billable: true });
    setAdding(null);
  };

  return (
    <li className="adm-day">
      <div className="adm-day-when">
        <span className="adm-day-date n">{fmtDate(day.date)}</span>
        {when && <span className="adm-day-rel">{when}</span>}
        {/* Only a day that has happened can be checked over. */}
        {past && (
          <button
            type="button"
            className={`adm-day-check${checked ? ' adm-day-check--done' : ''}`}
            disabled={busy}
            onClick={() => handlers.setChecked(day.id, !checked)}
            title={checked ? 'Checked for expenses — click to reopen' : 'Not yet checked for expenses'}
          >
            {checked ? '✓ Checked' : '⚠ Check expenses'}
          </button>
        )}
      </div>

      <ul className="adm-bookings">
        {booked.map((b) => (
          <li key={b.id} className={`adm-booking${b.paidAt ? ' adm-booking--paid' : ''}`}>
            <span dir="auto" className="adm-booking-name">{b.nameSnapshot || 'Unnamed'}</span>
            <span className="adm-booking-amount n">{ils(b.amount)}</span>
            <button type="button" className="adm-booking-state" disabled={busy}
                    onClick={() => handlers.setPaid(day.id, b.id, !b.paidAt)}
                    title={b.paidAt ? 'Mark as unpaid' : 'Mark as paid'}>
              {b.paidAt ? '✓ Paid' : 'Unpaid'}
            </button>
            <IconButton danger onClick={() => handlers.unbook(day.id, b.id)} title="Remove from this day">✕</IconButton>
          </li>
        ))}
        {spent.map((e) => (
          <li key={e.id} className="adm-booking adm-booking--expense">
            <span className="adm-booking-name">
              {(EXPENSE_TYPES.find(([v]) => v === e.type) || [, 'Other'])[1]}
            </span>
            <span className="adm-booking-amount n">{ils(e.amount)}</span>
            <span className="adm-booking-state adm-booking-state--static">
              {e.billable ? 'Billable' : 'Not billed on'}
            </span>
            <IconButton danger onClick={() => handlers.removeExpense(e.id)} title="Remove expense">✕</IconButton>
          </li>
        ))}
      </ul>

      {adding === 'assistant' ? (
        <div className="adm-inline-add">
          <select value={pick.assistantId} onChange={(e) => choose(e.target.value)}>
            <option value="">— Choose —</option>
            {available.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <input dir="ltr" inputMode="decimal" placeholder="Amount" value={pick.amount}
                 onChange={(e) => setPick((p) => ({ ...p, amount: decimalOnly(e.target.value) }))} />
          <button type="button" className="btn-primary btn-sm" disabled={busy || !pick.assistantId}
                  onClick={confirmAssistant}>Book</button>
          <button type="button" className="btn-secondary btn-sm" onClick={() => setAdding(null)}>Cancel</button>
        </div>
      ) : adding === 'expense' ? (
        <div className="adm-inline-add">
          <select value={exp.type} onChange={(e) => setExp((x) => ({ ...x, type: e.target.value }))}>
            {EXPENSE_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <input dir="ltr" inputMode="decimal" placeholder="Amount" value={exp.amount}
                 onChange={(e) => setExp((x) => ({ ...x, amount: decimalOnly(e.target.value) }))} />
          <label className="adm-inline-check">
            <input type="checkbox" checked={exp.billable}
                   onChange={(e) => setExp((x) => ({ ...x, billable: e.target.checked }))} />
            Bill to client
          </label>
          <button type="button" className="btn-primary btn-sm" disabled={busy || !exp.amount}
                  onClick={confirmExpense}>Add</button>
          <button type="button" className="btn-secondary btn-sm" onClick={() => setAdding(null)}>Cancel</button>
        </div>
      ) : (
        <div className="adm-day-actions">
          {available.length > 0 && (
            <button type="button" className="btn-ghost btn-sm"
                    onClick={() => { setPick({ assistantId: '', amount: '' }); setAdding('assistant'); }}>
              + Assistant
            </button>
          )}
          <button type="button" className="btn-ghost btn-sm" onClick={() => setAdding('expense')}>
            + Expense
          </button>
          {/* Says why there is nothing to add, instead of just showing nothing. */}
          {roster.length > 0 && available.length === 0 && (
            <span className="field-hint">Everyone on the roster is already on this day.</span>
          )}
        </div>
      )}
    </li>
  );
}

export default function ProjectCard({
  project, assistants = [], busy = false, onEdit, handlers,
}) {
  const [expanded, setExpanded] = useState(false);
  const [panel, setPanel] = useState(null);            // 'purchases' | null

  const today  = todayStr();
  const status = ballInCourt(project);
  const alert  = projectAlert(project, today);
  const days   = [...(project.workDays || [])].sort((a, b) => (a.date < b.date ? -1 : 1));
  const isPaid = project.status === 'paid';

  // Separate parts, never one joined string: mixing Hebrew and English in a
  // single dir="auto" run makes bidi reorder the English to the far end.
  const secondary = [project.clientNameSnapshot, project.brand,
    days.length ? `${days.length} work day${days.length === 1 ? '' : 's'}` : null].filter(Boolean);

  return (
    <div className={`adm-card${isPaid ? ' adm-card--settled' : ''}${expanded ? ' adm-card--open' : ''}`}>
      <div className="adm-card-bar" style={{ background: TYPE_COLOR[project.projectType] || TYPE_COLOR.other }} />

      <div className="adm-card-body">
        <div className="adm-card-top">
          <span className="adm-card-type">{TYPE_LABEL[project.projectType] || 'Other'}</span>
          <span className="adm-card-date n">{dateRange(project)}</span>
          <button className="adm-card-expand" onClick={() => setExpanded((v) => !v)}
                  title={expanded ? 'Collapse' : 'Expand'} aria-expanded={expanded}>
            {expanded ? '−' : '+'}
          </button>
        </div>

        <h3 dir="auto" className="adm-card-name he">{project.name}</h3>
        {secondary.length > 0 && (
          <p dir="auto" className="adm-card-sub he">
            {secondary.map((part, i) => (
              <span key={i}>{i > 0 ? ' · ' : null}<span dir="auto">{part}</span></span>
            ))}
          </p>
        )}

        {alert && <p className={`adm-line adm-line--${alert.level}`}>{alert.text}</p>}
      </div>

      {expanded && (
        <div className="adm-card-open-body">
          <section className="adm-section">
            <h4 className="adm-section-title">Money</h4>
            <Money project={project} />
            {project.outstandingOnCard > 0 && (
              <p className="adm-line adm-line--waiting">
                {ils(project.outstandingOnCard)} still out on the card
              </p>
            )}
            {project.owedToAssistants > 0 && (
              <p className="adm-line adm-line--waiting">
                {ils(project.owedToAssistants)} owed to assistants
              </p>
            )}
          </section>

          <section className="adm-section">
            <h4 className="adm-section-title">Work days</h4>
            {days.length === 0 ? (
              <p className="adm-none">No work days yet. Add them from Edit.</p>
            ) : (
              <ul className="adm-days">
                {days.map((d) => (
                  <WorkDay key={d.id} day={d} today={today} roster={assistants}
                           handlers={handlers} busy={busy} />
                ))}
              </ul>
            )}
          </section>

          {project.notes && (
            <section className="adm-section">
              <h4 className="adm-section-title">Notes</h4>
              <p dir="auto" className="adm-detail-notes">{project.notes}</p>
            </section>
          )}

          {/* Panel row, the same shape the show card uses for Technical/Tasks. */}
          <div className="adm-panel-row">
            <button className={`show-expand-btn${panel === 'purchases' ? ' active' : ''}`}
                    onClick={() => setPanel((p) => (p === 'purchases' ? null : 'purchases'))}>
              Purchases &amp; Returns
              {project.outstandingOnCard > 0 && (
                <span className="nav-tasks-badge nav-badge--warn">
                  {ils(project.outstandingOnCard)}
                </span>
              )}
            </button>
            <button className="btn-ghost btn-sm" onClick={() => onEdit?.(project)}>Edit project</button>
          </div>

          {panel === 'purchases' && (
            <div className="show-expand-panel">
              <p className="adm-none">
                Not built yet — shop receipts, what came back, and what is still out.
              </p>
            </div>
          )}
        </div>
      )}

      <div className="adm-card-foot">
        <span className={`adm-ball adm-ball--${status.marker}`} />
        <span className="adm-ball-label">{status.label}</span>
        <span className="adm-ball-caption">{status.caption}</span>
      </div>
    </div>
  );
}
