const { useState, useEffect, useRef } = React;

/* ─── icons ─── mirror = movement/progression, no mirror = objects ─── */
const S = { width: 15, height: 15, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };
const Icon = {
  chev: (p) => <svg {...S} {...p} className={"mirror " + (p.className || "")}><path d="M9 5l7 7-7 7" /></svg>,
  chevP: (p) => <svg {...S} {...p}><path d="M9 5l7 7-7 7" /></svg>,
  chevDown: (p) => <svg {...S} width="12" height="12" {...p}><path d="M5 9l7 7 7-7" /></svg>,
  back: (p) => <svg {...S} {...p} className="mirror"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>,
  arrow: (p) => <svg {...S} width="16" height="16" {...p} className="mirror"><path d="M4 12h15M13 6l6 6-6 6" /></svg>,
  clock: (p) => <svg {...S} {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
  trash: (p) => <svg {...S} {...p}><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" /></svg>,
  pencil: (p) => <svg {...S} {...p}><path d="M4 20h4L19 9a2 2 0 0 0-3-3L5 17z" /></svg>,
  phone: (p) => <svg {...S} width="13" height="13" {...p}><path d="M5 3h4l2 5-2.5 1.5a12 12 0 0 0 5 5L15 12l5 2v4a2 2 0 0 1-2 2A15 15 0 0 1 3 5a2 2 0 0 1 2-2z" /></svg>,
  mail: (p) => <svg {...S} width="13" height="13" {...p}><rect x="3" y="5" width="18" height="14" rx="1" /><path d="M3 7l9 6 9-6" /></svg>,
  filter: (p) => <svg {...S} width="14" height="14" {...p}><path d="M3 5h18M6 12h12M10 19h4" /></svg>,
  sun: (p) => <svg {...S} width="14" height="14" {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" /></svg>,
  doc: (p) => <svg {...S} width="13" height="13" {...p}><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" /></svg>,
  plus: (p) => <svg {...S} width="14" height="14" {...p}><path d="M12 5v14M5 12h14" /></svg>,
  check: (p) => <svg {...S} width="14" height="14" {...p}><path d="M4 12l5 5L20 6" /></svg>,
  x: (p) => <svg {...S} width="15" height="15" {...p}><path d="M6 6l12 12M18 6L6 18" /></svg>,
};

/* ─── bidi atoms ─── */
const LTR = ({ children, cls }) => <span className={"ltr " + (cls || "")} dir="ltr">{children}</span>;
const Auto = ({ children, cls, tag }) => React.createElement(tag || "span", { className: "auto " + (cls || ""), dir: "auto" }, children);

/* ─── page header — two Hebrew heading systems ─── */
function PageHead({ t, mode, title, count, word, kick, sub, right, stats, children }) {
  const useB = t.he && mode === "b";
  return (
    <div className="ph-head">
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0, flex: "1 1 auto" }}>
          {useB ? (
            <div className="ph-b">
              <div className="num">{String(count).padStart(2, "0")}</div>
              <div className="stack">
                <div className="accent-rule"></div>
                <div className="kick">{kick}</div>
                <div className="word">{word}</div>
              </div>
            </div>
          ) : (
            <h1 className="ph-title">{title}<span className="dot">.</span></h1>
          )}
          {sub && sub.length > 0 && (
            <div className="ph-sub">
              {sub.map((s, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <span className="rule"></span>}
                  <span>{s}</span>
                </React.Fragment>
              ))}
            </div>
          )}
        </div>
        {right}
      </div>
      {stats && <div className="stats">{stats.map((s, i) => (
        <div className="stat" key={i}><b>{s.v}</b><span>{s.k}</span></div>
      ))}</div>}
      {children}
    </div>
  );
}

/* ─── header ─── */
function Header({ t, route, setRoute, onSettings, theme, setTheme }) {
  const [menu, setMenu] = useState(false);
  const items = [
    ["today", t("today")], ["shows", t("shows")], ["crew", t("crewTypes")], ["tasks", t("tasks"), 6],
    ["automations", t("automations")], ["teams", t("teams")], ["tools", t("tools")],
  ];
  return (
    <header className="app-header">
      <div className="brand"><span className="brand-mark"></span><b>Production Hub</b></div>
      <nav className="nav">
        {items.map(([k, label, badge]) => (
          <button key={k} className={route === k ? "on" : ""} onClick={() => setRoute(k)}>
            {label}{badge ? <span className="badge">{badge}</span> : null}
          </button>
        ))}
        <span className="nav-sep"></span>
        <button className={route === "timelog" ? "on" : ""} onClick={() => setRoute("timelog")}>{t("timeLog")}</button>
        <button className={route === "lab" ? "on" : ""} onClick={() => setRoute("lab")}>{t("bidiLab")}</button>
      </nav>
      <div className="hdr-r">
        <button className="ws-btn" onClick={() => setRoute("today")}>
          <span className="dot"></span>
          <span><small>{t("workspace")}</small><b className="auto" dir="auto">Assaf Amdursky</b></span>
          <Icon.chevDown style={{ opacity: .5 }} />
        </button>
        <button className="icon-btn" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} title={t("theme")}><Icon.sun /></button>
        <div className="pos">
          <button className="av" onClick={() => setMenu(!menu)}>ZL</button>
          {menu && (
            <div className="menu" onMouseLeave={() => setMenu(false)}>
              <div className="info"><b className="auto" dir="auto">צליל מרגלית</b><span>{t("admin")}</span></div>
              <button onClick={() => { setMenu(false); onSettings(); }}>{t("settings")}</button>
              <div className="div"></div>
              <button style={{ color: "var(--danger)" }}>{t("signOut")}</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

/* ─── settings modal — Language sits beside Theme and Timezone ─── */
function SettingsModal({ t, onClose, lang, requestLang, theme, setTheme }) {
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal narrow">
        <div className="modal-h"><h2>{t("settings")}</h2><button className="icon-btn" onClick={onClose}><Icon.x /></button></div>
        <div className="modal-main">
          <div className="sec-title">{t("appearance")}</div>
          <div className="set-row">
            <div><div className="lbl">{t("theme")}</div></div>
            <div className="seg">
              <button className={theme === "light" ? "on" : ""} onClick={() => setTheme("light")}>{t("light")}</button>
              <button className={theme === "dark" ? "on" : ""} onClick={() => setTheme("dark")}>{t("dark")}</button>
            </div>
          </div>
          <div className="set-row">
            <div>
              <div className="lbl">{t("language")}</div>
              <div className="desc">{t("langDesc")}</div>
            </div>
            <div className="seg lang">
              <button className={lang === "en" ? "on" : ""} onClick={() => requestLang("en")}>English</button>
              <button className={lang === "he" ? "on" : ""} onClick={() => requestLang("he")}>עברית</button>
            </div>
          </div>
          <div className="set-row">
            <div><div className="lbl">{t("timezone")}</div></div>
            <div style={{ width: 210 }}>
              <select defaultValue="jer"><option value="jer">Asia/Jerusalem (GMT+3)</option><option value="lon">Europe/London (GMT+1)</option></select>
            </div>
          </div>
          <div className="note-inline"><span>{t("langReload")}</span></div>
        </div>
      </div>
    </div>
  );
}

/* ─── registration language step ─── */
function RegistrationStep({ t, onClose, lang, requestLang }) {
  const [pick, setPick] = useState(lang);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal narrow">
        <div className="modal-h">
          <h2>{t("createAccount")}</h2>
          <span className="tag">{t("step")} <LTR>3</LTR> {t("of")} <LTR>4</LTR></span>
        </div>
        <div className="modal-main">
          <div style={{ display: "flex", gap: 4, marginBottom: 22 }}>
            {[1, 2, 3, 4].map((n) => <span key={n} style={{ height: 3, flex: 1, background: n <= 3 ? "var(--accent)" : "var(--border)" }}></span>)}
          </div>
          <div className="f-group">
            <label>{t("chooseLang")}</label>
            <div className="hint" style={{ marginBottom: 10 }}>{t("chooseLangSub")}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[["en", "English", "Default"], ["he", "עברית", "ממשק מלא מימין לשמאל"]].map(([k, label, note]) => (
                <button key={k} onClick={() => setPick(k)}
                  style={{ textAlign: "start", padding: "16px 18px", border: "1px solid " + (pick === k ? "var(--accent)" : "var(--border)"), background: pick === k ? "var(--accent-soft)" : "var(--surface-2)" }}>
                  <b style={{ fontSize: "1.05rem", fontWeight: 700, display: "block" }} dir="auto">{label}</b>
                  <span className="hint" dir="auto">{note}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="modal-f">
          <button className="btn sec" onClick={onClose}>{t("skip")}</button>
          <button className="btn pri" onClick={() => { if (pick !== lang) requestLang(pick); else onClose(); }}>
            {t("continue")} <Icon.arrow />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── demo rail ─── */
function DemoRail({ t, lang, requestLang, theme, setTheme, mode, setMode, onNotes, onSignup }) {
  return (
    <div className="rail" dir={t.dir}>
      <div className="g">
        <span className="lb">{t("demoLang")}</span>
        <div className="seg2">
          <button className={lang === "en" ? "on" : ""} onClick={() => requestLang("en")}>EN</button>
          <button className={lang === "he" ? "on" : ""} onClick={() => requestLang("he")}>עב</button>
        </div>
      </div>
      <div className="g">
        <span className="lb">{t("demoTheme")}</span>
        <div className="seg2">
          <button className={theme === "light" ? "on" : ""} onClick={() => setTheme("light")}>{t("light")}</button>
          <button className={theme === "dark" ? "on" : ""} onClick={() => setTheme("dark")}>{t("dark")}</button>
        </div>
      </div>
      <div className="g" style={{ opacity: lang === "he" ? 1 : .4 }}>
        <span className="lb">{t("demoHead")}</span>
        <div className="seg2">
          <button className={mode === "a" ? "on" : ""} onClick={() => setMode("a")}>A · הופעות.</button>
          <button className={mode === "b" ? "on" : ""} onClick={() => setMode("b")}>B · 07 הופעות</button>
        </div>
      </div>
      <div className="spacer"></div>
      <button className="btn util" style={{ color: "rgba(255,255,255,.75)", borderColor: "rgba(255,255,255,.3)" }} onClick={onSignup}>{t("createAccount")}</button>
      <button className="btn util" style={{ color: "rgba(255,255,255,.75)", borderColor: "rgba(255,255,255,.3)" }} onClick={onNotes}>{t("notesBtn")}</button>
    </div>
  );
}

Object.assign(window, { Icon, LTR, Auto, PageHead, Header, SettingsModal, RegistrationStep, DemoRail });
