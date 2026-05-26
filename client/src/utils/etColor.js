/**
 * Maps any event-type string to a deterministic palette slot 0–15.
 * Uses a polynomial (Bernstein) hash so even very similar strings
 * (e.g. "אירוח" vs "להקה") land on different slots.
 *
 * @param {string} type  event type string
 * @returns {string|undefined}  "0"–"15", or undefined for falsy input
 */
export function etColorIdx(type) {
  if (!type) return undefined;
  const h = type.split('').reduce((a, c) => ((a * 31 + c.charCodeAt(0)) >>> 0), 0);
  return String(h % 16);
}
