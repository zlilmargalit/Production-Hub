// One place that knows how to read a show's `schedule`.
//
// The canonical stored form is a string: the show form edits an array of
// { time, activity } rows and flattens it on save. But older records hold the
// raw array, so every reader has to cope with both shapes — and they didn't.
// server/routes/calendar.js called schedule.trim() directly, which throws
// "trim is not a function" on an array, and documents.js interpolated it
// straight into a template, rendering "[object Object]".
//
// Both now go through this, so the stored shape can no longer break a reader.
function scheduleToString(schedule) {
  if (!schedule) return '';
  if (Array.isArray(schedule)) {
    return schedule
      .filter((r) => r && (r.time || r.activity))
      .map((r) => (r.time ? `${r.time} ${r.activity || ''}`.trim() : r.activity || ''))
      .filter(Boolean)
      .join('\n');
  }
  return String(schedule);
}

module.exports = { scheduleToString };
