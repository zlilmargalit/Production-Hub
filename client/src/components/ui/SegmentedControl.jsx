export default function SegmentedControl({ items, activeId, onChange, className = '' }) {
  return (
    <div className={`seg${className ? ' ' + className : ''}`}>
      {items.map((item) => (
        <button
          key={item.id}
          className={`seg-btn${activeId === item.id ? ' active' : ''}`}
          onClick={() => onChange(item.id)}
          type="button"
        >
          {item.label}
          {item.count != null && <span className="seg-count">{item.count}</span>}
        </button>
      ))}
    </div>
  );
}
