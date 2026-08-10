// Shared display helpers for the administration workspace.
//
// UI chrome is English; only user-entered content is Hebrew and renders RTL.
// Numbers, dates and currency stay LTR inside RTL text — see the `.n` class.

/** ₪ prefix, thousands separator, decimals only when non-zero. */
export function ils(amount) {
  const n = Number(amount) || 0;
  const hasFraction = Math.round(n * 100) % 100 !== 0;
  return '₪' + n.toLocaleString('en-US', {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  });
}

/** DD/MM/YYYY. */
export function fmtDate(value) {
  if (!value) return '';
  const d = new Date(String(value).length <= 10 ? value + 'T00:00:00' : value);
  if (Number.isNaN(d.getTime())) return '';
  const p = (x) => String(x).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Today in Asia/Jerusalem as YYYY-MM-DD, matching the server. */
export function todayStr() {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function daysBetween(fromStr, toStr) {
  const a = new Date(fromStr + 'T00:00:00');
  const b = new Date(toStr + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}

/** First work day of a project, or null. */
export function firstWorkDay(project) {
  const dates = (project.workDays || []).map((d) => d.date).filter(Boolean).sort();
  return dates[0] || null;
}

export function dateRange(project) {
  const dates = (project.workDays || []).map((d) => d.date).filter(Boolean).sort();
  if (!dates.length) return '';
  return dates.length === 1
    ? fmtDate(dates[0])
    : `${fmtDate(dates[0])} – ${fmtDate(dates[dates.length - 1])}`;
}

// ── Ball in court ───────────────────────────────────────────────────────────
// The status line is about who has to act, not the raw status name.
const BALL = {
  me:      { caption: 'ON ME',              marker: 'filled' },
  them:    { caption: 'WAITING ON CLIENT',  marker: 'hollow' },
  settled: { caption: 'SETTLED',            marker: 'muted'  },
};

const STATUS_LABEL = {
  proposed: 'Proposed',
  awaiting_contract: 'Awaiting contract',
  confirmed: 'Confirmed',
  completed: 'Completed',
  invoiced: 'Invoiced',
  paid: 'Paid',
};

export function ballInCourt(project) {
  const ball = project.ballInCourt || 'them';
  return { ...BALL[ball] || BALL.them, ball, label: STATUS_LABEL[project.status] || project.status };
}

// ── Alarm vocabulary (§4) — one implementation, imported everywhere ─────────
// alarm    money at risk or a deadline passed
// waiting  needs a follow-up soon, nothing lost yet
// Returns at most ONE line per project: first match wins.
export function projectAlert(project, today = todayStr()) {
  const first = firstWorkDay(project);

  if (project.status === 'awaiting_contract' && first) {
    const days = daysBetween(today, first);
    if (days >= 0 && days <= 4) {
      return { level: 'alarm', text: `Contract not received · first work day in ${days} day${days === 1 ? '' : 's'}` };
    }
  }

  const overdue = (project.purchases || []).some((p) => p.riskState === 'overdue');
  if ((project.outstandingOnCard || 0) > 0 && overdue) {
    return { level: 'alarm', text: `${ils(project.outstandingOnCard)} not back from shops · deadline passed` };
  }

  const openDebrief = (project.debriefs || []).find((d) => !d.closedAt);
  if (openDebrief) {
    const day = (project.workDays || []).find((d) => d.id === openDebrief.workDayId);
    return { level: 'waiting', text: `Debrief from ${fmtDate(day?.date)} still open` };
  }

  if (project.status === 'invoiced' && project.invoiceSentAt) {
    const terms = project.paymentTerms ?? 30;
    return {
      level: 'waiting',
      text: `Invoiced ${fmtDate(project.invoiceSentAt)} · net ${terms} · due ${fmtDate(project.paymentDueAt)}`,
    };
  }
  return null;
}

/** Overdue in either direction — drives the FINANCE nav badge. */
export function isOverdue(project, today = todayStr()) {
  if ((project.purchases || []).some((p) => p.riskState === 'overdue')) return true;
  if (project.status === 'invoiced' && project.paymentDueAt && today > project.paymentDueAt) return true;
  return false;
}
