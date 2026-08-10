// Input rules shared by every form: a field that holds a number must not accept
// letters, and an address that will be invoiced must look like an address.
//
// Two different mechanisms on purpose:
//
//   Numeric fields filter as you type. A phone number has no valid non-numeric
//   spelling, so the wrong character should never appear in the first place —
//   rejecting it afterwards would mean telling the user off for something the
//   field could simply not have accepted.
//
//   Email is checked on submit instead. It is only wrong once it is finished:
//   filtering per keystroke would fight the user halfway through typing, and
//   type="email" hands the message off to the browser, in the browser's own
//   language and styling.

/** Digits only — business numbers, IDs, anything counted rather than formatted. */
export const digitsOnly = (v) => String(v ?? '').replace(/\D/g, '');

/**
 * Phone. Digits plus the punctuation real numbers are written with:
 * 052-000-0000, +972 52 000 0000, (03) 000-0000. Letters never get through.
 *
 * Dropping a letter would otherwise leave the space around it behind, so
 * "call me 052 x 000" collapses rather than turning into a gappy number. A
 * single trailing space survives, because removing it mid-typing would stop
 * the user from putting a space between groups of digits.
 */
export const phoneChars = (v) => String(v ?? '')
  .replace(/[^\d+\-() ]/g, '')
  .replace(/ {2,}/g, ' ')
  .replace(/^ +/, '');

/**
 * Money and percentages: digits and at most one decimal point. Kept as a string
 * so a half-typed "1200." survives being re-rendered — Number() would collapse
 * it to 1200 and eat the point the moment it was typed.
 */
export const decimalOnly = (v) => {
  const cleaned = String(v ?? '').replace(/[^\d.]/g, '');
  const [head, ...rest] = cleaned.split('.');
  return rest.length ? `${head}.${rest.join('')}` : head;
};

// Deliberately loose: something@something.tld. Stricter patterns reject valid
// addresses (plus-tags, new TLDs, unicode domains), and the cost of a false
// rejection here is a user who cannot save a real client.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Valid, or empty — an optional field left blank is not an error. */
export const isEmail = (v) => {
  const t = String(v ?? '').trim();
  return t === '' || EMAIL_RE.test(t);
};
