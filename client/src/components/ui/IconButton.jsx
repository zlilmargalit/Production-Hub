export default function IconButton({ danger = false, onClick, title, type = 'button', disabled = false, children, className = '' }) {
  const cls = ['icon-btn', danger ? 'danger' : '', className].filter(Boolean).join(' ');
  return (
    <button type={type} className={cls} onClick={onClick} title={title} disabled={disabled}>
      {children}
    </button>
  );
}
