// Validation + derivation for the administration workspace.
//
// Two rules from the engineering brief drive this file.
//
// 1. Validate on write. The existing routers do none — POST /api/crew stores
//    { id, ...req.body } — and that produced three competing spellings of `role`
//    in crew.json, filtered three different ways. These records hold money, so
//    enums are closed, amounts must be numbers and dates must parse.
//
// 2. Derived values are never stored. Everything below is computed at read time.
//    This codebase already persists derived data that has drifted: technicalCrew
//    disagreed with crewIds on 11 of 20 shows. The same failure applied to money
//    owed to a person is a different category of problem.

const PROJECT_STATUS  = ['proposed', 'awaiting_contract', 'confirmed', 'completed', 'invoiced', 'paid'];
const PROJECT_TYPE    = ['advertising', 'film', 'talent', 'other'];
const DAY_TYPE        = ['full', 'half', 'pickup', 'other'];
const EXPENSE_TYPE    = ['taxi', 'parking', 'shipping', 'other'];
const PAYMENT_TERMS   = [30, 60, 90];

class ValidationError extends Error {
  constructor(msg) { super(msg); this.status = 400; }
}
const fail = (msg) => { throw new ValidationError(msg); };

// ── Primitives ──────────────────────────────────────────────────────────────
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function str(v, field, { required = false, max = 500 } = {}) {
  if (v === undefined || v === null) {
    if (required) fail(`${field} is required`);
    return '';
  }
  if (typeof v !== 'string') fail(`${field} must be a string`);
  const t = v.trim();
  if (required && !t) fail(`${field} is required`);
  if (t.length > max) fail(`${field} is too long (max ${max})`);
  return t;
}

// Money. Rejects NaN/Infinity and negatives, and rounds to agorot so floating
// point noise never reaches storage.
function money(v, field, { required = false } = {}) {
  if (v === undefined || v === null || v === '') {
    if (required) fail(`${field} is required`);
    return 0;
  }
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) fail(`${field} must be a number`);
  if (n < 0) fail(`${field} cannot be negative`);
  return Math.round(n * 100) / 100;
}

function dateStr(v, field, { required = false } = {}) {
  if (v === undefined || v === null || v === '') {
    if (required) fail(`${field} is required`);
    return null;
  }
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    fail(`${field} must be a date as YYYY-MM-DD`);
  }
  const d = new Date(v + 'T00:00:00');
  if (Number.isNaN(d.getTime())) fail(`${field} is not a real date`);
  return v;
}

// Enums are normalised (trim + lowercase) so casing can't fork a value, then
// checked against the closed set. Free text never gets through.
function enumOf(v, allowed, field, { required = false, fallback = null } = {}) {
  if (v === undefined || v === null || v === '') {
    if (required) fail(`${field} is required`);
    return fallback;
  }
  const t = String(v).trim().toLowerCase();
  if (!allowed.includes(t)) fail(`${field} must be one of: ${allowed.join(', ')}`);
  return t;
}

const bool = (v, fallback = false) => (typeof v === 'boolean' ? v : fallback);

// ── Clients ─────────────────────────────────────────────────────────────────
function validateClient(body, existing = null) {
  if (!isPlainObject(body)) fail('Body must be an object');
  const base = existing || {};
  const terms = body.paymentTerms === undefined ? (base.paymentTerms ?? 30) : Number(body.paymentTerms);
  if (!PAYMENT_TERMS.includes(terms)) fail(`paymentTerms must be one of: ${PAYMENT_TERMS.join(', ')}`);
  return {
    name:           str(body.name ?? base.name, 'name', { required: true, max: 200 }),
    businessId:     str(body.businessId ?? base.businessId, 'businessId', { max: 50 }),
    contactName:    str(body.contactName ?? base.contactName, 'contactName', { max: 200 }),
    email:          str(body.email ?? base.email, 'email', { max: 200 }),
    phone:          str(body.phone ?? base.phone, 'phone', { max: 50 }),
    invoiceAddress: str(body.invoiceAddress ?? base.invoiceAddress, 'invoiceAddress', { max: 500 }),
    paymentTerms:   terms,
    notes:          str(body.notes ?? base.notes, 'notes', { max: 5000 }),
  };
}

// ── Projects ────────────────────────────────────────────────────────────────
function validateProject(body, existing = null) {
  if (!isPlainObject(body)) fail('Body must be an object');
  const base = existing || {};
  const out = {
    name:        str(body.name ?? base.name, 'name', { required: true, max: 200 }),
    clientId:    body.clientId === undefined ? (base.clientId ?? null) : (body.clientId || null),
    // Display-only copy so a deleted client doesn't blank a historical project.
    // Invoice details are always read live from clientId.
    clientNameSnapshot: str(body.clientNameSnapshot ?? base.clientNameSnapshot, 'clientNameSnapshot', { max: 200 }),
    brand:       str(body.brand ?? base.brand, 'brand', { max: 200 }),
    projectType: enumOf(body.projectType ?? base.projectType, PROJECT_TYPE, 'projectType', { fallback: 'other' }),
    // Stored EXCLUDING VAT. The inclusive figure is computed for display and is
    // never written back. vatRate lives on the project so a future change to the
    // national rate cannot retroactively alter a closed project.
    rate:        money(body.rate ?? base.rate, 'rate'),
    vatRate:     body.vatRate === undefined ? (base.vatRate ?? 0.18) : Number(body.vatRate),
    status:      enumOf(body.status ?? base.status, PROJECT_STATUS, 'status', { fallback: 'proposed' }),
    notes:       str(body.notes ?? base.notes, 'notes', { max: 5000 }),
  };
  if (!Number.isFinite(out.vatRate) || out.vatRate < 0 || out.vatRate > 1) {
    fail('vatRate must be a fraction between 0 and 1 (e.g. 0.18)');
  }
  return out;
}

function validateWorkDay(body, existing = null) {
  if (!isPlainObject(body)) fail('Body must be an object');
  const base = existing || {};
  // A work day is a billing unit, not a call sheet. The stylist does not run the
  // shoot day, so location, call time and day notes are gone: nothing computes
  // from them and nobody reads them. What survives is what costs or earns money.
  //
  // expensesCheckedAt is the "did anything get spent today that I have not
  // written down" checkpoint. It is a timestamp rather than a boolean so a past
  // day that was never checked can raise an alarm on its own.
  const checkedAt = body.expensesCheckedAt === undefined
    ? (base.expensesCheckedAt ?? null)
    : body.expensesCheckedAt;
  if (checkedAt !== null && !(typeof checkedAt === 'string' && !Number.isNaN(Date.parse(checkedAt)))) {
    fail('expensesCheckedAt must be a timestamp or null');
  }
  return {
    date: dateStr(body.date ?? base.date, 'date', { required: true }),
    expensesCheckedAt: checkedAt,
    // Assistants are edited through their own nested endpoints, never by
    // rewriting the work day — a day edit must not silently drop who was booked
    // on it, or what they are still owed.
    assistants: Array.isArray(base.assistants) ? base.assistants : [],
  };
}

// ── Assistants ──────────────────────────────────────────────────────────────
// The roster: who exists, and what they normally cost per day.
function validateAssistant(body, existing = null) {
  if (!isPlainObject(body)) fail('Body must be an object');
  const base = existing || {};
  return {
    name:    str(body.name ?? base.name, 'name', { required: true, max: 200 }),
    phone:   str(body.phone ?? base.phone, 'phone', { max: 50 }),
    dayRate: money(body.dayRate ?? base.dayRate, 'dayRate'),
    notes:   str(body.notes ?? base.notes, 'notes', { max: 5000 }),
  };
}

// One assistant booked on one work day.
//
// nameSnapshot exists for the same reason clientNameSnapshot does: deleting
// someone from the roster must not blank the record of a day they worked, or of
// money still owed to them. The amount is per booking, not read from the
// roster's dayRate — a rate that changes next year must not silently restate
// what was owed for a day last year.
function validateWorkDayAssistant(body, existing = null) {
  if (!isPlainObject(body)) fail('Body must be an object');
  const base = existing || {};
  const paidAt = body.paidAt === undefined ? (base.paidAt ?? null) : body.paidAt;
  if (paidAt !== null && !(typeof paidAt === 'string' && !Number.isNaN(Date.parse(paidAt)))) {
    fail('paidAt must be a timestamp or null');
  }
  return {
    assistantId:  body.assistantId ?? base.assistantId ?? null,
    nameSnapshot: str(body.nameSnapshot ?? base.nameSnapshot, 'nameSnapshot', { max: 200 }),
    amount:       money(body.amount ?? base.amount, 'amount'),
    notes:        str(body.notes ?? base.notes, 'notes', { max: 1000 }),
    paidAt,
  };
}

function validatePurchase(body, existing = null) {
  if (!isPlainObject(body)) fail('Body must be an object');
  const base = existing || {};
  return {
    // Free text, not a roster. Shops are long-tail and mostly one-off — a
    // managed list would be more upkeep than the thing it names. storeId stays
    // reserved in case the regulars ever justify one.
    storeName:      str(body.storeName ?? base.storeName, 'storeName', { max: 200 }),
    storeId:        body.storeId ?? base.storeId ?? null,
    date:           dateStr(body.date ?? base.date, 'date', { required: true }),
    // Gross, as charged to the card — deliberately the opposite convention to
    // project.rate. No VAT logic here; the accountant extracts input VAT.
    amount:         money(body.amount ?? base.amount, 'amount', { required: true }),
    receiptNumber:  str(body.receiptNumber ?? base.receiptNumber, 'receiptNumber', { max: 100 }),
    receiptFileUrl: body.receiptFileUrl ?? base.receiptFileUrl ?? null,
    // The Drive mirror of the receipt. Set by the background sync, never by the
    // client — the volume copy is the source of truth; this is only a link to
    // the accountant's copy, and null means "not mirrored yet", not "no receipt".
    receiptDriveUrl: body.receiptDriveUrl ?? base.receiptDriveUrl ?? null,
    returnDeadline: dateStr(body.returnDeadline ?? base.returnDeadline, 'returnDeadline'),
    workDayId:      body.workDayId ?? base.workDayId ?? null,
    keptOnPurpose:  bool(body.keptOnPurpose, base.keptOnPurpose ?? false),
    issue:          str(body.issue ?? base.issue, 'issue', { max: 1000 }),
    bankVerified:   bool(body.bankVerified, base.bankVerified ?? false),
    bankVerifiedAt: base.bankVerifiedAt ?? null,
    items:          Array.isArray(base.items) ? base.items : [],   // reserved; not built now
    returns:        Array.isArray(base.returns) ? base.returns : [],
  };
}

function validateReturn(body) {
  if (!isPlainObject(body)) fail('Body must be an object');
  return {
    date:           dateStr(body.date, 'date', { required: true }),
    amount:         money(body.amount, 'amount', { required: true }),
    receiptFileUrl: body.receiptFileUrl ?? null,
    // See the purchase note above — set by the background Drive sync, not the client.
    receiptDriveUrl: body.receiptDriveUrl ?? null,
  };
}

function validateExpense(body, existing = null) {
  if (!isPlainObject(body)) fail('Body must be an object');
  const base = existing || {};
  const paidBy = String(body.paidBy ?? base.paidBy ?? 'stylist').trim();
  // paidBy is 'stylist' | 'client' | 'assistant:<id>'
  if (!/^(stylist|client|assistant:[\w-]+)$/.test(paidBy)) {
    fail('paidBy must be "stylist", "client" or "assistant:<id>"');
  }
  return {
    workDayId:  body.workDayId ?? base.workDayId ?? null,
    date:       dateStr(body.date ?? base.date, 'date', { required: true }),
    type:       enumOf(body.type ?? base.type, EXPENSE_TYPE, 'type', { fallback: 'other' }),
    amount:     money(body.amount ?? base.amount, 'amount', { required: true }),
    paidBy,
    receiptFileUrl: body.receiptFileUrl ?? base.receiptFileUrl ?? null,
    // Independent by design: a taxi paid by an assistant is both reimbursable
    // and billable; parking absorbed into the day rate is reimbursable only; a
    // garment on the client's card is neither. Never derive one from the other.
    billable:   bool(body.billable, base.billable ?? false),
    reimbursed: bool(body.reimbursed, base.reimbursed ?? false),
    notes:      str(body.notes ?? base.notes, 'notes', { max: 2000 }),
  };
}

// ── Derivation (read time only) ─────────────────────────────────────────────
const todayStr = () => {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

function derivePurchase(p) {
  const returnedAmount = (p.returns || []).reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const outstanding    = Math.round((Number(p.amount || 0) - returnedAmount) * 100) / 100;
  const today = todayStr();
  const riskState =
      p.keptOnPurpose            ? 'kept'
    : outstanding === 0          ? (p.bankVerified ? 'settled' : 'unverified')
    : (p.returnDeadline && today > p.returnDeadline) ? 'overdue'
    : 'open';
  return { ...p, returnedAmount, outstanding, riskState };
}

function deriveProject(project, { paymentTerms = null } = {}) {
  const purchases = (project.purchases || []).map(derivePurchase);
  const outstandingOnCard = purchases
    .filter((p) => !p.keptOnPurpose)
    .reduce((s, p) => s + p.outstanding, 0);
  const keptOnPurposeTotal = purchases
    .filter((p) => p.keptOnPurpose)
    .reduce((s, p) => s + p.outstanding, 0);

  // Assistant amounts arrive in phase 2; the shape is here so callers don't branch.
  const owedToAssistants = (project.workDays || [])
    .flatMap((d) => d.assistants || [])
    .filter((a) => !a.paidAt)
    .reduce((s, a) => s + (Number(a.amount) || 0), 0);

  const ballInCourt =
      project.status === 'paid' ? 'settled'
    : ['confirmed', 'completed'].includes(project.status) ? 'me'
    : 'them';

  const vatRate = Number(project.vatRate ?? 0.18);
  const rate    = Number(project.rate || 0);

  // What actually goes on the invoice: the fee plus the expenses marked
  // billable. `billable` is set per expense and is deliberately independent of
  // `reimbursed` — a taxi an assistant paid for is both, parking absorbed into
  // the day rate is only reimbursed, a garment on the client's card is neither.
  const billableExpenses = (project.expenses || [])
    .filter((e) => e.billable)
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const invoiceSubtotal = rate + billableExpenses;

  // A day that has passed and was never checked is money that may be missing.
  const unchecked = (project.workDays || [])
    .filter((d) => d.date && d.date < todayStr() && !d.expensesCheckedAt)
    .map((d) => d.date);

  return {
    ...project,
    purchases,
    // Every figure below is computed on read and must never be written back.
    rateInclVat: Math.round(rate * (1 + vatRate) * 100) / 100,
    billableExpenses: Math.round(billableExpenses * 100) / 100,
    invoiceSubtotal:  Math.round(invoiceSubtotal * 100) / 100,
    invoiceTotal:     Math.round(invoiceSubtotal * (1 + vatRate) * 100) / 100,
    uncheckedDays:    unchecked,
    outstandingOnCard: Math.round(outstandingOnCard * 100) / 100,
    keptOnPurposeTotal: Math.round(keptOnPurposeTotal * 100) / 100,
    owedToAssistants: Math.round(owedToAssistants * 100) / 100,
    ballInCourt,
    paymentTerms,
  };
}

module.exports = {
  ValidationError,
  PROJECT_STATUS, PROJECT_TYPE, DAY_TYPE, EXPENSE_TYPE, PAYMENT_TERMS,
  validateClient, validateProject, validateWorkDay,
  validateAssistant, validateWorkDayAssistant,
  validatePurchase, validateReturn, validateExpense,
  derivePurchase, deriveProject, todayStr,
};
