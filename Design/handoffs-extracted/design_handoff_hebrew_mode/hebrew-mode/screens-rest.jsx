const { useState: uR } = React;

/* ─── Crew & Types ─── */
function CrewScreen({ t, mode }) {
  const [tab, setTab] = uR("members");
  const roles = [...new Set(CREW.map((c) => c.role))];
  return (
    <>
      <PageHead t={t} mode={mode} title={t("crewTypes")} count={CREW.length} word={t("crewTypes")}
        kick={t.he ? "פעילים" : "ACTIVE"}
        sub={[<span key="a"><b>{String(CREW.length).padStart(2, "0")}</b> {t("active")}</span>]} 
        right={<button className="btn pri"><Icon.plus />{t("add")}</button>} />
      <div className="tabs">
        <button className={tab === "members" ? "on" : ""} onClick={() => setTab("members")}>{t("members")}<span className="c">{CREW.length}</span></button>
        <button className={tab === "types" ? "on" : ""} onClick={() => setTab("types")}>{t("eventTypes")}<span className="c">{Object.keys(ET).length}</span></button>
      </div>
      {tab === "members" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 30 }}>
          {roles.map((r) => (
            <div key={r}>
              <div className="sec-title"><span dir="auto">{r}</span><span className="n">{CREW.filter((c) => c.role === r).length}</span></div>
              <div className="crew-grid">
                {CREW.filter((c) => c.role === r).map((c) => (
                  <div className="crew-card" key={c.id} style={{ "--role": c.c }}>
                    <div style={{ minWidth: 0 }}>
                      <div className="nm" dir="auto">{c.n}</div>
                      <a className="ln ltr" href={"tel:" + c.p}><Icon.phone style={{ marginInlineEnd: 5, verticalAlign: -2 }} />{c.p}</a>
                      <a className="ln ltr" href={"mailto:" + c.e} style={{ overflow: "hidden", textOverflow: "ellipsis", display: "block" }}><Icon.mail style={{ marginInlineEnd: 5, verticalAlign: -2 }} />{c.e}</a>
                      <div className="tags">{c.types.map((x) => <span className="tag" key={x} dir="auto">{x}</span>)}</div>
                    </div>
                    <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                      <button className="btn-txt"><Icon.pencil /></button>
                      <button className="btn-txt danger"><Icon.trash /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rows">
          {Object.entries(ET).map(([k, v]) => (
            <div className="row" key={k} style={{ borderInlineStart: "3px solid " + v.c }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: v.c, flex: "0 0 auto" }}></span>
              <div className="grow"><div className="t" dir="auto">{v.he}</div>
                <div className="s">{t("usedIn")} <span className="ltr">{SHOWS.filter((s) => s.type === k).length}</span> {t("showsLower")}</div></div>
              <div className="chips">{CREW.filter((c) => c.types.includes(v.he)).slice(0, 3).map((c) => <span className="tag" key={c.id} dir="auto">{c.n}</span>)}</div>
              <button className="btn-txt"><Icon.pencil /></button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ─── Tasks ─── */
function TasksScreen({ t, mode }) {
  const [tab, setTab] = uR("active");
  const [tasks, setTasks] = uR(TASKS);
  const active = tasks.filter((x) => !x.done), done = tasks.filter((x) => x.done);
  const shown = tab === "active" ? active : done;
  const toggle = (id) => setTasks(tasks.map((x) => x.id === id ? { ...x, done: !x.done } : x));
  const col = (items) => (
    <div className="rows">
      {items.length === 0 && <div className="hint" style={{ padding: "18px 0" }}>—</div>}
      {items.map((k) => (
        <label className="row" key={k.id} style={{ cursor: "pointer" }}>
          <input type="checkbox" checked={k.done} onChange={() => toggle(k.id)} style={{ width: 15, height: 15, accentColor: "var(--accent)", flex: "0 0 auto" }} />
          <div className="grow">
            <div className="t" dir="auto" style={{ textDecoration: k.done ? "line-through" : "", color: k.done ? "var(--text-3)" : "" }}>{k.t}</div>
            <div className="s">
              {k.date && <span className="tag ac"><span className="ltr">{k.date.slice(8) + "/" + k.date.slice(5, 7)}</span></span>}
              <span className="tag" dir="auto">{k.who}</span>
              {k.show && <span className="tag wa" dir="auto" style={{ maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis" }}>{k.show}</span>}
            </div>
          </div>
          <button className="btn-txt danger"><Icon.trash /></button>
        </label>
      ))}
    </div>
  );
  return (
    <>
      <PageHead t={t} mode={mode} title={t("tasks")} count={active.length} word={t("tasks")} kick={t.he ? "פעילות" : "ACTIVE"}
        sub={[<span key="a"><b>{String(active.length).padStart(2, "0")}</b> {t("activeTab")}</span>]} />
      <div className="panel" style={{ padding: "16px 18px", marginBottom: 22, maxWidth: 760 }}>
        <input type="text" placeholder={t("addTask")} dir="auto" style={{ marginBottom: 10 }} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input type="date" style={{ flex: "1 1 130px", direction: "ltr" }} />
          <input type="time" style={{ flex: "1 1 100px", direction: "ltr" }} />
          <select style={{ flex: "1 1 140px" }}><option>{t("noAssignee")}</option>{CREW.map((c) => <option key={c.id}>{c.n}</option>)}</select>
          <select style={{ flex: "1 1 160px" }}><option>{t("linkShow")}</option>{SHOWS.map((s) => <option key={s.id}>{s.name}</option>)}</select>
          <button className="btn pri"><Icon.plus />{t("add")}</button>
        </div>
      </div>
      <div className="tabs">
        <button className={tab === "active" ? "on" : ""} onClick={() => setTab("active")}>{t("activeTab")}<span className="c">{active.length}</span></button>
        <button className={tab === "done" ? "on" : ""} onClick={() => setTab("done")}>{t("completed")}<span className="c">{done.length}</span></button>
      </div>
      <div className="two-col">
        <div><div className="sec-title">{t("scheduled")}</div>{col(shown.filter((x) => x.date))}</div>
        <div><div className="sec-title">{t("noDate")}</div>{col(shown.filter((x) => !x.date))}</div>
      </div>
    </>
  );
}

/* ─── Automations ─── */
function AutomationsScreen({ t, mode }) {
  const [on, setOn] = uR([0]);
  const apps = [["Gmail", "#C03B30", true], ["Google Drive", "#3852B4", true], ["WhatsApp", "#3D7A51", false], ["Google Calendar", "#F08D39", true]];
  const recipes = [
    { a: t.he ? "אימייל" : "Email", b: t.he ? "הופעה" : "Show", d: t.he ? "מייל מהמועדון יוצר טיוטת הופעה עם התאריך והמקום." : "A venue email drafts a show with date and venue filled in." },
    { a: t.he ? "הופעה" : "Show", b: t.he ? "דף תיאום" : "Coordination sheet", d: t.he ? "48 שעות לפני — דף תיאום נשלח לכל הצוות המשובץ." : "48h before — the coordination sheet goes to the assigned crew." },
    { a: t.he ? "משימה" : "Task", b: "WhatsApp", d: t.he ? "משימה שעברה את תאריך היעד שולחת תזכורת לאחראי." : "An overdue task pings its assignee." },
  ];
  return (
    <>
      <PageHead t={t} mode={mode} title={t("automations")} count={on.length} word={t("automations")} kick={t.he ? "פעילות" : "ENABLED"}
        sub={[<span key="a"><b>0{on.length}</b> {t("enabled")}</span>]} />
      <div className="sec-title">{t("connectedApps")}</div>
      <div className="apps">
        {apps.map(([n, c, conn]) => (
          <div className="app-card" key={n}>
            <span className="ico" style={{ background: c }}>{n.slice(0, 1)}</span>
            <div><div style={{ fontWeight: 600, fontSize: ".875rem" }} className="lat">{n}</div>
              <div className="st">{conn ? t("connected") : t("notConnected")}</div></div>
          </div>
        ))}
      </div>
      <div className="sec-title">{t("recipes")}</div>
      <div className="recipes">
        {recipes.map((r, i) => (
          <div className="recipe" key={i}>
            <div className="flow">
              <span className="node" dir="auto">{r.a}</span>
              <Icon.arrow className="flow-arrow mirror" />
              <span className="node" dir="auto">{r.b}</span>
            </div>
            <p style={{ fontSize: ".8125rem", color: "var(--text-2)", lineHeight: 1.55 }} dir="auto">{r.d}</p>
            <button className={"btn " + (on.includes(i) ? "pri" : "sec") + " sm"} style={{ alignSelf: "flex-start" }}
              onClick={() => setOn(on.includes(i) ? on.filter((x) => x !== i) : [...on, i])}>
              {on.includes(i) ? <><Icon.check />{t("enabled")}</> : t("enable")}
            </button>
          </div>
        ))}
      </div>
      <div className="sec-title">{t("ruleBuilder")}</div>
      <div className="builder">
        <div>
          <div className="step"><i>1</i>{t("trigger")}</div>
          <select defaultValue="m"><option value="m">{t.he ? "מייל חדש מכתובת" : "New email from address"}</option></select>
          <input type="text" defaultValue="bookings@thegeorge.co.il" dir="ltr" className="mt12" style={{ direction: "ltr" }} />
        </div>
        <div>
          <div className="step"><i>2</i>{t("conditions")}</div>
          <select defaultValue="s"><option value="s">{t.he ? "הנושא מכיל" : "Subject contains"}</option></select>
          <input type="text" defaultValue="הופעה" dir="auto" className="mt12" />
          <label className="check mt12"><input type="checkbox" defaultChecked /><span>{t.he ? "רק בימי חול" : "Weekdays only"}</span></label>
        </div>
        <div>
          <div className="step"><i>3</i>{t("action")}</div>
          <select defaultValue="c"><option value="c">{t.he ? "יצירת טיוטת הופעה" : "Create draft show"}</option></select>
          <div className="hint mt12">{t("runsWhen")}: <span dir="auto">{t.he ? "מייל מ־" : "email from "}</span><span className="ltr">bookings@thegeorge.co.il</span></div>
        </div>
      </div>
    </>
  );
}

/* ─── Teams ─── */
function TeamsScreen({ t, mode }) {
  const [tab, setTab] = uR("members");
  return (
    <>
      <PageHead t={t} mode={mode} title={t("teams")} count={TEAM.length} word={t("teams")} kick={t.he ? "חברי צוות" : "MEMBERS"}
        sub={[<span key="a"><b>0{TEAM.length}</b> {t("members")}</span>, <span key="b"><b>01</b> {t("invite")}</span>]} />
      <div className="tabs">
        <button className={tab === "members" ? "on" : ""} onClick={() => setTab("members")}>{t("members")}<span className="c">{TEAM.length}</span></button>
        <button className={tab === "invite" ? "on" : ""} onClick={() => setTab("invite")}>{t("invite")}</button>
        <button className={tab === "activity" ? "on" : ""} onClick={() => setTab("activity")}>{t("activity")}</button>
      </div>
      {tab === "members" && (
        <table>
          <thead><tr><th>{t("memberName")}</th><th>{t("email")}</th><th>{t("access")}</th><th>{t("artists")}</th><th>{t("lastSeen")}</th><th></th></tr></thead>
          <tbody>
            {TEAM.map((m, i) => (
              <tr key={i}>
                <td className="strong" dir="auto">{m.n}</td>
                <td><span className="ltr">{m.e}</span></td>
                <td><span className={"tag " + (m.role === "admin" ? "ac" : m.role === "guest" ? "wa" : "")}>{m.role === "admin" ? t("admin") : m.role === "guest" ? (t.he ? "אורח" : "Guest") : (t.he ? "משתמש" : "User")}</span></td>
                <td><span className="lat">{m.artists.join(", ")}</span></td>
                <td dir="auto">{m.seen}</td>
                <td style={{ width: 40 }}><button className="btn-txt"><Icon.pencil /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {tab === "invite" && (
        <div className="panel" style={{ padding: "20px 22px", maxWidth: 520 }}>
          <div className="f-group"><label>{t("inviteByEmail")}</label>
            <input type="email" placeholder="name@studio.co.il" dir="ltr" style={{ direction: "ltr" }} /></div>
          <div className="f-group mt12"><label>{t("access")}</label>
            <select><option>{t("admin")}</option><option>{t.he ? "משתמש" : "User"}</option><option>{t.he ? "אורח" : "Guest"}</option></select></div>
          <button className="btn pri mt18">{t("sendInvite")}</button>
        </div>
      )}
      {tab === "activity" && (
        <div className="rows">
          {[["צליל מרגלית", t.he ? "עדכנה לוח זמנים" : "updated the schedule", "סולו מועדון הג׳ורג׳ ת״א", "09:41"],
            ["יעל בן חיים", t.he ? "שלחה דף תיאום" : "sent a coordination sheet", "בארבי מנועים שקטים", "אתמול 18:02"],
            ["Danny Okun", t.he ? "צפה בבריף" : "viewed the brief", "סולו מועדון הג׳ורג׳ ת״א", "אתמול 14:20"]].map((r, i) => (
            <div className="row" key={i}>
              <div className="grow">
                <div className="t"><span dir="auto">{r[0]}</span> <span style={{ fontWeight: 400, color: "var(--text-2)" }} dir="auto">{r[1]}</span></div>
                <div className="s"><span className="tag wa" dir="auto">{r[2]}</span></div>
              </div>
              <span className="hint" dir="auto">{r[3]}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ─── Tools ─── */
function ToolsScreen({ t, mode }) {
  const total = SETLIST.reduce((a, s) => a + s.m, 0);
  const mm = Math.floor(total), ss = Math.round((total - mm) * 60);
  return (
    <>
      <PageHead t={t} mode={mode} title={t("tools")} count={2} word={t("tools")} kick={t.he ? "כלים" : "UTILITIES"} sub={[<span key="a"><b>02</b> {t("tools")}</span>]} />
      <div className="two-col">
        <div className="tool">
          <h3>{t("setlistCalc")}</h3>
          <p>{t("setlistDesc")}</p>
          <ul className="setlist">
            {SETLIST.map((s, i) => (
              <li key={i}>
                <span className="i">{String(i + 1).padStart(2, "0")}</span>
                <span dir="auto">{s.n}</span>
                <span className="ltr">{Math.floor(s.m)}:{String(Math.round((s.m % 1) * 60)).padStart(2, "0")}</span>
              </li>
            ))}
          </ul>
          <div className="total-row"><span className="sec-title mb0" style={{ marginBottom: 0 }}>{t("runTime")}</span><b>{mm}:{String(ss).padStart(2, "0")}</b></div>
        </div>
        <div className="tool">
          <h3>{t("techSpec")}</h3>
          <p>{t("techDesc")}</p>
          <textarea rows="6" dir="auto" defaultValue={"FOH: Midas M32\nMonitors: 4 wedges + 2 IEM\nPatch: 24 ch\nContact: Ronen Bar 052-4419002"}></textarea>
          <button className="btn pri mt12">{t("parse")}</button>
          <div className="rows mt18">
            {[[t("techCrew"), "FOH · Midas M32"], [t("contacts"), "Ronen Bar · 052-4419002"]].map((r, i) => (
              <div className="row" key={i}><div className="grow"><div className="t">{r[0]}</div><div className="s"><span className="ltr">{r[1]}</span></div></div><span className="tag ok"><Icon.check width="11" height="11" /></span></div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

/* ─── Time Log ─── */
function TimeLogScreen({ t, mode }) {
  const [artist, setArtist] = uR("all");
  const rows = SESSIONS.filter((s) => artist === "all" || s.a === artist);
  const sum = (a) => SESSIONS.filter((s) => a === "all" || s.a === a).reduce((x, s) => x + s.h, 0);
  return (
    <>
      <PageHead t={t} mode={mode} title={t("timeLog")} count={Math.round(sum("all"))} word={t("hours")} kick={t.he ? "אוגוסט 2026" : "AUGUST 2026"}
        sub={[<span key="a"><b>{sum("all").toFixed(2)}</b> {t("totalHours")}</span>]}
        right={<div className="wrap-actions"><button className="btn util">{t("exportCsv")}</button><button className="btn pri"><Icon.plus />{t("logTime")}</button></div>} />
      <div className="chips" style={{ marginBottom: 22 }}>
        <button className={"chip pick" + (artist === "all" ? " on" : "")} onClick={() => setArtist("all")}>
          {t("allArtists")}<span className="ltr" style={{ opacity: .65 }}>{sum("all").toFixed(2)}</span>
        </button>
        {["Assaf Amdursky", "Hila Ruach"].map((a) => (
          <button key={a} className={"chip pick" + (artist === a ? " on" : "")} onClick={() => setArtist(a)}>
            <span className="lat">{a}</span><span className="ltr" style={{ opacity: .65 }}>{sum(a).toFixed(2)}</span>
          </button>
        ))}
      </div>
      <table>
        <thead><tr><th style={{ width: 110 }}>{t("date")}</th><th style={{ width: 170 }}>{t("artist")}</th><th>{t("description")}</th><th style={{ width: 80 }}>{t("hours")}</th><th style={{ width: 80 }}>{t("billed")}</th><th style={{ width: 46 }}></th></tr></thead>
        <tbody>
          {rows.map((s, i) => (
            <tr key={i}>
              <td><span className="ltr">{s.d.slice(8) + "/" + s.d.slice(5, 7) + "/" + s.d.slice(0, 4)}</span></td>
              <td className="strong lat">{s.a}</td>
              <td dir="auto">{s.t}</td>
              <td className="num">{s.h.toFixed(2)}</td>
              <td>{s.billed ? <span className="tag ok"><Icon.check width="11" height="11" /></span> : <span className="tag">—</span>}</td>
              <td><button className="btn-txt"><Icon.pencil /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

Object.assign(window, { CrewScreen, TasksScreen, AutomationsScreen, TeamsScreen, ToolsScreen, TimeLogScreen });
