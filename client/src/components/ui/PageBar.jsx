import { useRef, useEffect, useState } from 'react';

/**
 * Compact sticky page-bar — replaces the giant page-header-edit + separate stats cards.
 *
 * Layout (matching design):
 *   Row 1 — [title + de-emphasized count] LEFT  /  [stat strip] RIGHT
 *            justifyContent:space-between, alignItems:flex-end, full width
 *   Full-width 2px ink divider
 *   Row 2 — tabs (left) + action button (right, optional)
 *
 * Props:
 *  title       string          — page name
 *  accentColor string?         — custom dot color (defaults to var(--accent))
 *  count       number?         — main count shown inline next to the title
 *  countLabel  string?         — e.g. "members", "shows"
 *  metrics     {value,label}[] — right-side stat strip segments
 *  actions     ReactNode?      — action buttons (tabs row right side)
 *  children    ReactNode?      — tabs / segmented control (tabs row left side)
 */
export default function PageBar({ title, accentColor, count, countLabel, metrics = [], actions, headerAction, children }) {
  const sentinelRef = useRef(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !('IntersectionObserver' in window)) return;
    const obs = new IntersectionObserver(
      ([entry]) => setStuck(!entry.isIntersecting),
      { rootMargin: '-73px 0px 0px 0px', threshold: 0 },
    );
    obs.observe(sentinel);
    return () => obs.disconnect();
  }, []);

  return (
    <>
      <div ref={sentinelRef} className="pg-bar-sentinel" aria-hidden="true" />
      <div className={`pg-bar${stuck ? ' pg-bar--stuck' : ''}`}>

        {/* Row 1 — title+count LEFT / stat strip RIGHT */}
        <div className="pg-bar-row1">
          <div className="pg-bar-left">
            <h1 className="pg-bar-title">
              {title}
              <span
                className="pg-bar-title-dot"
                style={accentColor ? { color: accentColor } : undefined}
              >.</span>
            </h1>
            {count != null && countLabel && (
              <span className="pg-bar-count">
                {String(count).padStart(2, '0')} {countLabel}
              </span>
            )}
          </div>

          {metrics.length > 0 && (
            <div className="pg-bar-stat-strip">
              {metrics.map((m, i) => (
                <div key={i} className="pg-bar-stat">
                  <span className="pg-bar-stat-val">
                    {typeof m.value === 'number'
                      ? String(m.value).padStart(2, '0')
                      : m.value}
                  </span>
                  <span className="pg-bar-stat-lbl">{m.label}</span>
                </div>
              ))}
            </div>
          )}
          {headerAction && <div className="pg-bar-header-action">{headerAction}</div>}
        </div>

        {/* Full-width 2px ink divider */}
        <div className="pg-bar-divider" />

        {/* Row 2 — tabs (left) + actions (right) */}
        {(children || actions) && (
          <div className="pg-bar-tabs">
            <div className="pg-bar-tabs-left">{children}</div>
            {actions && <div className="pg-bar-actions">{actions}</div>}
          </div>
        )}
      </div>
    </>
  );
}
