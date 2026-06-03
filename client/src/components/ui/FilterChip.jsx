export default function FilterChip({ on = true, swatch, count, onToggle, children, className = '' }) {
  const cls = ['chip', on ? 'on' : 'off', className].filter(Boolean).join(' ');
  return (
    <button type="button" className={cls} onClick={onToggle} style={swatch ? { '--chip-color': swatch } : undefined}>
      {swatch && <span className="chip-swatch" />}
      {children}
      {count != null && <span className="chip-count">{count}</span>}
    </button>
  );
}
