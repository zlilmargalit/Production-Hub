export default function Button({ role = 'secondary', size = 'md', danger = false, disabled = false, onClick, type = 'button', children, className = '', style }) {
  const cls = ['btn', role, `sz-${size}`, danger ? 'danger' : '', className].filter(Boolean).join(' ');
  return (
    <button type={type} className={cls} onClick={onClick} disabled={disabled} style={style}>
      {children}
    </button>
  );
}
