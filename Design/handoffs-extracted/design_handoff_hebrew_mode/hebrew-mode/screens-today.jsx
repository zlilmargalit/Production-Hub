const { useState: uT } = React;

const DOW = { en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], he: ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"] };
const MON3 = { en: "AUG", he: "אוג׳" };

function TodayScreen({ t, mode, setRoute }) {
  const [artist, setArtist] = uT("all");
  const [view, setView] = uT("month");
  const showsFor = (a) => SHOWS.filter((s) => a === "all" || s.artist === a);
  const list = showsFor(artist).filter((s) => !s.past).sort((a, b) => a.date.localeCompare(b.date));
  const cells = [];
  for (let i = 0; i < CAL.firstDow; i++) cells.push({ dim: true, n: 26 + i });
  for (let d = 1; d <= CAL.days; d++) cells.push({ n: d, evts: CAL.events[d] || [] });
  const dow = DOW[t.lang];
  return (
    <>
      <PageHead t={t} mode={mode}
        title={t("today")} count={list.length} word={t("shows")} kick={t.he ? "אוגוסט 2026" : "AUGUST 2026"}
        sub={[
          t.he ? "יום שני, 10 באוגוסט 2026" : "Monday, 10 August 2026",
          <span key="b"><b>2</b> {t("activeArtists")}</span>,
          <span key="c"><b>{SHOWS.length}</b> {t("thisMonth")}</span>,
        ]} />
      <div className="chips" style={{ marginBottom: 22 }}>
        <button className={"chip pick" + (artist === "all" ? " on" : "")} onClick={() => setArtist("all")}>{t("allArtists")}</button>
        {[["Assaf Amdursky", "#3852B4"], ["Hila Ruach", "#F08D39"]].map(([a, c]) => (
          <button key={a} className={"chip pick" + (artist === a ? " on" : "")} onClick={() => setArtist(a)} dir="auto">
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: c, display: "inline-block" }}></span>
            <span className="lat">{a}</span>
            <span className="ltr" style={{ opacity: .6 }}>{showsFor(a).length}</span>
          </button>
        ))}
      </div>
      <div className="two-col">
        <div className="panel">
          <div className="panel-h">
            <h3>{CAL.month[t.lang]} <span className="ltr">{CAL.year}</span></h3>
            <div className="calnav">
              <button aria-label="prev"><span className="mirror"><Icon.chevP style={{ transform: "rotate(180deg)" }} /></span></button>
              <button className="today">{t("todayBtn")}</button>
              <button aria-label="next"><span className="mirror"><Icon.chevP /></span></button>
              <div className="seg" style={{ marginInlineStart: 8 }}>
                <button className={view === "month" ? "on" : ""} onClick={() => setView("month")}>{t("month")}</button>
                <button className={view === "week" ? "on" : ""} onClick={() => setView("week")}>{t("week")}</button>
              </div>
            </div>
          </div>
          <div className="dow">{dow.map((d) => <div key={d}>{d}</div>)}</div>
          <div className="days">
            {(view === "month" ? cells : cells.slice(7, 14)).map((c, i) => (
              <div className={"day" + (c.dim ? " dim" : "") + (c.n === CAL.today && !c.dim ? " today" : "")} key={i}>
                <span className="dn">{c.n}</span>
                {(c.evts || []).map((id) => { const s = SHOWS.find((x) => x.id === id); const et = ET[s.type]; return (
                  <span className="evt" key={id} style={{ "--et": et.c, "--et-bg": et.bg }} dir="auto">
                    <span className="ltr" style={{ opacity: .75 }}>{s.time.slice(0, 5)}</span>{" " + s.name}
                  </span>
                ); })}
              </div>
            ))}
          </div>
        </div>
        <div className="panel">
          <div className="panel-h"><h3>{t("upNext")}</h3></div>
          {list.slice(0, 4).map((s) => { const et = ET[s.type]; return (
            <button className="upnext-row" key={s.id} style={{ "--et": et.c }} onClick={() => setRoute("shows")}>
              <span className="d"><b>{parseInt(s.date.slice(8), 10)}</b><span>{MON3[t.lang]}</span></span>
              <span className="stripe"></span>
              <span className="body">
                <span className="kick lat">{s.artist}</span>
                <span className="ti" dir="auto">{s.name}</span>
                <span className="su">
                  <span className="ltr">{s.time.slice(0, 5)}</span>
                  <span style={{ color: "var(--border-strong)" }}>·</span>
                  <span dir="auto">{s.venue}</span>
                </span>
              </span>
            </button>
          ); })}
        </div>
      </div>
      <div className="mt24">
        <div className="sec-title">{t("myTasks")} <span className="n">{TASKS.filter((x) => !x.done).length}</span></div>
        <div className="crew-grid">
          {TASKS.filter((x) => !x.done).slice(0, 6).map((k) => (
            <label className="crew-card" key={k.id} style={{ "--role": k.date ? "var(--accent)" : "var(--border-strong)", cursor: "pointer" }}>
              <span style={{ display: "flex", gap: 10, minWidth: 0 }}>
                <input type="checkbox" style={{ width: 14, height: 14, accentColor: "var(--accent)", marginTop: 4, flex: "0 0 auto" }} />
                <span style={{ minWidth: 0 }}>
                  <span className="nm" dir="auto" style={{ display: "block" }}>{k.t}</span>
                  <span className="tags">
                    {k.date && <span className="tag ac"><Icon.clock width="11" height="11" /><span className="ltr">{k.date.slice(8) + "/" + k.date.slice(5, 7)}</span></span>}
                    <span className="tag" dir="auto">{k.who}</span>
                  </span>
                </span>
              </span>
            </label>
          ))}
        </div>
      </div>
    </>
  );
}
Object.assign(window, { TodayScreen });
