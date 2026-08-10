import PageBar from '../ui/PageBar';
import {
  ils, fmtDate, dateRange, todayStr, ballInCourt, projectAlert, daysBetween,
} from './adminFormat';

// One project, in full.
//
// The page answers three questions in order, because that is the order they get
// asked: what is this and when, who owes what, and what happens on each day.
//
// Purchases, expenses and debriefs land here in later phases. Their sections are
// present and say so, rather than being absent — an empty section that names
// what is coming reads as unfinished; a missing one reads as lost.

const TYPE_LABEL = {
  advertising: 'Advertising', film: 'Film', talent: 'Talent', other: 'Other',
};

// Every figure here is derived server-side and never stored, so this screen
// only ever displays what the API returned.
function Money({ project }) {
  const rate = Number(project.rate || 0);
  if (!rate) return <p className="adm-none">No rate set.</p>;
  const vatPct = Math.round((project.vatRate ?? 0.18) * 10000) / 100;
  return (
    <dl className="adm-facts">
      <div><dt>Rate, before VAT</dt><dd className="n">{ils(rate)}</dd></div>
      <div><dt>VAT</dt><dd className="n">{vatPct}%</dd></div>
      <div><dt>Total</dt><dd className="n adm-fact--strong">{ils(project.rateInclVat)}</dd></div>
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

function WorkDay({ day, today }) {
  const away = daysBetween(today, day.date);
  // Only forward-looking days get a countdown; "in -12 days" is not a sentence.
  const when = away === 0 ? 'Today' : away === 1 ? 'Tomorrow'
    : away > 1 ? `In ${away} days` : null;

  return (
    <li className="adm-day">
      <div className="adm-day-when">
        <span className="adm-day-date n">{fmtDate(day.date)}</span>
        {when && <span className="adm-day-rel">{when}</span>}
      </div>
      <div className="adm-day-what">
        {day.location
          ? <span dir="auto" className="adm-day-loc">{day.location}</span>
          : <span className="adm-day-loc adm-day-loc--empty">No location</span>}
        {day.callTime && <span className="adm-day-call n">Call {day.callTime}</span>}
      </div>
      {day.notes && <p dir="auto" className="adm-day-notes">{day.notes}</p>}
    </li>
  );
}

export default function ProjectDetail({ project, onBack, onEdit }) {
  if (!project) {
    // Reachable if the project was deleted in another tab while this was open.
    return (
      <div className="adm-page">
        <div className="adm-empty">
          <p>That project is no longer here.</p>
          <div className="adm-empty-actions">
            <button className="btn-primary" onClick={onBack}>Back to projects</button>
          </div>
        </div>
      </div>
    );
  }

  const today  = todayStr();
  const status = ballInCourt(project);
  const alert  = projectAlert(project, today);
  const days   = [...(project.workDays || [])].sort((a, b) => (a.date < b.date ? -1 : 1));

  // Client name and brand are separate elements, never one joined string —
  // mixing Hebrew and English in a single dir="auto" run reorders it.
  const facts = [project.clientNameSnapshot, project.brand].filter(Boolean);

  return (
    <div className="adm-page">
      {/* The bar's title is chrome and stays English; the project's own name is
          user content and gets its own heading below, free to run RTL. */}
      <PageBar
        title="Project"
        count={days.length}
        countLabel={days.length === 1 ? 'WORK DAY' : 'WORK DAYS'}
        actions={
          <>
            <button className="btn-ghost" onClick={onBack}>← Projects</button>
            <button className="btn-primary" onClick={() => onEdit?.(project)}>Edit</button>
          </>
        }
      />

      {/* dir="auto" so the name reads correctly in either language, but NOT the
          `he` alignment class: this is a page heading in an LTR page, and
          right-aligning it strands the title at the far edge, away from the meta
          line under it. Alignment is layout; direction is the content's. */}
      <h2 dir="auto" className="adm-detail-name">{project.name}</h2>

      <div className="adm-detail-head">
        <span className="adm-card-type">{TYPE_LABEL[project.projectType] || 'Other'}</span>
        {facts.map((f, i) => (
          <span key={i} className="adm-detail-fact">
            <span dir="auto">{f}</span>
          </span>
        ))}
        {dateRange(project) && <span className="adm-card-date n">{dateRange(project)}</span>}
      </div>

      <div className="adm-detail-status">
        <span className={`adm-ball adm-ball--${status.marker}`} />
        <span className="adm-ball-label">{status.label}</span>
        <span className="adm-ball-caption">{status.caption}</span>
      </div>

      {alert && <p className={`adm-line adm-line--${alert.level}`}>{alert.text}</p>}

      <div className="adm-detail-grid">
        <section className="adm-section">
          <h3 className="adm-section-title">Money</h3>
          <Money project={project} />
          {project.outstandingOnCard > 0 && (
            <p className="adm-line adm-line--waiting">
              {ils(project.outstandingOnCard)} still out on the card
            </p>
          )}
        </section>

        <section className="adm-section">
          <h3 className="adm-section-title">Work days</h3>
          {days.length === 0 ? (
            <p className="adm-none">No work days yet. Add them from Edit.</p>
          ) : (
            <ul className="adm-days">
              {days.map((d) => <WorkDay key={d.id} day={d} today={today} />)}
            </ul>
          )}
        </section>

        {project.notes && (
          <section className="adm-section adm-section--wide">
            <h3 className="adm-section-title">Notes</h3>
            <p dir="auto" className="adm-detail-notes">{project.notes}</p>
          </section>
        )}

        {/* Named rather than hidden: an absent section reads as lost work. */}
        <section className="adm-section adm-section--wide adm-section--pending">
          <h3 className="adm-section-title">Purchases &amp; returns</h3>
          <p className="adm-none">Not built yet — this is where shop receipts and returns will live.</p>
        </section>
      </div>
    </div>
  );
}
