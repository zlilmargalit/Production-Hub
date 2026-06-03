export function scheduleToString(schedule) {
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

export function parseScheduleRows(schedule) {
  if (!schedule) return [];
  if (Array.isArray(schedule)) return schedule;
  return String(schedule)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = l.match(/^(\d{1,2}:\d{2})\s+(.*)$/);
      return m ? { time: m[1], activity: m[2] } : { time: '', activity: l };
    });
}
