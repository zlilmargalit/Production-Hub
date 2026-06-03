export default function MetricBox({ value, label, className = '' }) {
  const padded = String(value).padStart(2, '0');
  return (
    <div className={`metric-box${className ? ' ' + className : ''}`}>
      <span className="metric-box-num">{padded}</span>
      <span className="metric-box-label">
        <span className="metric-box-dot" />
        {label}
      </span>
    </div>
  );
}
