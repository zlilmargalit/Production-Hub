import { useRef, useEffect, useState } from 'react';

/**
 * Compact sticky page-bar — replaces the giant page-header-edit + separate stats cards.
 *
 * Props:
 *  title       string          — page name
 *  accentColor string?         — custom dot color (defaults to var(--accent))
 *  count       number?         — main count shown inline next to the title
 *  countLabel  string?         — e.g. "members", "shows"
 *  metrics     {value,label}[] — right-side metric strip segments
 *  actions     ReactNode?      — right-side action buttons (rendered after metrics)
 *  children    ReactNode?      — tabs / segmented control (second row)
 */
export default function PageBar({ title, accentColor, count, countLabel, metrics = [], actions, children }) {
  const sentinelRef = useRef(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !('IntersectionObserver' in window)) return;
    // Fire when the sentinel (1px div just above the bar) goes out of view —
    // i.e. the bar has scrolled up to its sticky position under the navbar.
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
          {(metrics.length > 0 || actions) && (
            <div className="pg-bar-right">
              {metrics.length > 0 && (
                <div className="pg-bar-metric-strip">
                  {metrics.map((m, i) => (
                    <div key={i} className="pg-bar-metric">
                      <span className="pg-bar-metric-val">
                        {String(m.value).padStart(2, '0')}
                      </span>
                      <span className="pg-bar-metric-lbl">{m.label}</span>
                    </div>
                  ))}
                </div>
              )}
              {actions && <div className="pg-bar-actions">{actions}</div>}
            </div>
          )}
        </div>
        {children && <div className="pg-bar-tabs">{children}</div>}
      </div>
    </>
  );
}
