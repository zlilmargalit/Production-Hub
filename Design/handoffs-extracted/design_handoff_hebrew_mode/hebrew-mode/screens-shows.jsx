const { useState: uS } = React;

/* crew as discrete chips — replaces the delimited compound string */
function CrewChips({ ids, t }) {
  return (
    <div className="chips">
      {ids.map((id) => { const c = byId(id); return (
        <span className="chip" key={id} dir="auto">
          <span className="face" style={{ background: c.c }}>{c.n.slice(0, 1)}</span>
          <b style={{ fontWeight: 500 }}>{c.n}</b>
          <span className="role">{c.role}</span>
        </span>
      ); })}
    </div>
  );
}

function Field({ k, v, pdf, children }) {
  return (
    <div className="fld">
      <div className="k"><span>{k}</span>{pdf && <span className="pdfmark"><Icon.doc /> PDF</span>}</div>
      {children || <div className={"v" + (v === "—" ? " muted" : "")} dir="auto">{v}</div>}
    </div>
  );
}

function ShowCard({ s, t, open, onToggle, onEdit }) {
  const [tab, setTab] = uS("technical");
  const [checks, setChecks] = uS(s.checks);
  const et = ET[s.type];
  const toggle = (k) => setChecks({ ...checks, [k]: !checks[k] });
  return (
    <article className={"card" + (open ? " open" : "")} style={{ "--et": et.c, "--et-bg": et.bg }}>
      <div className="card-band"></div>
      <div className="card-head" onClick={onToggle}>
        <div className="card-top">
          <span style={{ display: "inline-flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <span className="card-type" dir="auto">{et.he}</span>
            <span style={{ color: "var(--border-strong)" }}>·</span>
            <span className="lat" style={{ fontSize: ".75rem", fontWeight: 600, color: "var(--text-3)", letterSpacing: ".04em" }} dir="auto">{s.artist}</span>
          </span>
          <div className="card-acts" onClick={(e) => e.stopPropagation()}>
            <button className="btn-txt" onClick={onToggle} aria-label="expand">
              <Icon.chevDown style={{ transform: open ? "rotate(180deg)" : "" }} />
            </button>
            <button className="btn-txt" onClick={onEdit}>{t("edit")}</button>
            <button className="btn-txt danger">{t("del")}</button>
          </div>
        </div>
        <h2 dir="auto">{s.name}</h2>
        <div className="card-meta">
          <span className="date">{s.dateLabel[t.lang]}</span>
          <span className="m sep" dir="auto">{s.venue}</span>
          <span className="m sep"><span className="ltr" dir="ltr">{s.time}</span></span>
          <span className="m sep"><a className="ltr" dir="ltr" href={"tel:" + s.contacts[0].p} onClick={(e) => e.stopPropagation()}>{s.contacts[0].p}</a></span>
          <span className="m sep card-crewcount">
            <span className="faces">{s.crew.slice(0, 3).map((id) => <i key={id} style={{ background: byId(id).c }}>{byId(id).n.slice(0, 1)}</i>)}</span>
            <span><span className="ltr">{s.crew.length}</span> {t("crewN")}</span>
          </span>
        </div>
      </div>
      <div className="prog">
        <span className="track"><i style={{ width: s.progress + "%" }}></i></span>
        <span className="pct">{s.progress}%</span>
      </div>
      {open && (
        <div className="details">
          <div className="dtabs">
            <button className={tab === "technical" ? "on" : ""} onClick={() => setTab("technical")}>{t("technical")}</button>
            <button className={tab === "logistics" ? "on" : ""} onClick={() => setTab("logistics")}>{t("logistics")}</button>
          </div>
          {tab === "technical" ? (
            <>
              <div className="dgrid">
                <Field k={t("techCrew")} pdf>
                  <CrewChips ids={s.crew} t={t} />
                </Field>
                <Field k={t("schedule")} pdf>
                  <div className="sched">
                    {s.schedule.map((l, i) => (
                      <span className="line" dir="auto" key={i}><time dir="ltr">{l.t}</time>{" "}{l.d}</span>
                    ))}
                  </div>
                </Field>
                <Field k={t("rental")} v={s.rental} />
                <Field k={t("notes")} v={s.notes} pdf />
              </div>
              <div className="checks">
                {[["brief", t("briefSent")], ["pdf", t("pdfSaved")], ["cal", t("calInvite")], ["sheet", t("sheetSent")]].map(([k, label]) => (
                  <label className="check" key={k}>
                    <input type="checkbox" checked={!!checks[k]} onChange={() => toggle(k)} />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </>
          ) : (
            <div className="dgrid">
              <Field k={t("address")} v={s.address} pdf />
              <Field k={t("parking")} v={s.parking} pdf />
              <Field k={t("transportation")} v={s.transport} pdf />
              <Field k={t("contacts")} pdf>
                <div className="stack-sm">
                  {s.contacts.map((c, i) => (
                    <div className="v" key={i} dir="auto">
                      <b style={{ fontWeight: 600 }}>{c.n}</b> <span style={{ color: "var(--text-3)" }}>{c.r}</span>{" "}
                      <a href={"tel:" + c.p} className="ltr" dir="ltr">{c.p}</a>
                    </div>
                  ))}
                </div>
              </Field>
            </div>
          )}
        </div>
      )}
      <div className="card-foot">
        <div className="foot-l">
          <button className="btn doc">{t("brief")}</button>
          <button className="btn doc">{t("pdf")}</button>
        </div>
        <div className="foot-r">
          {[["invoice", t("invoice")], ["receipt", t("receipt")]].map(([k, label]) => (
            <label className="check" key={k}>
              <input type="checkbox" checked={!!checks[k]} onChange={() => toggle(k)} /><span>{label}</span>
            </label>
          ))}
        </div>
      </div>
    </article>
  );
}

function ShowsScreen({ t, mode, onEdit }) {
  const [filter, setFilter] = uS("upcoming");
  const [openId, setOpenId] = uS(1);
  const [sort, setSort] = uS(0);
  const sorts = [
    { key: t("date"), lab: null },
    { key: t("sortAlpha"), lab: "א–ב" },
    { key: t("sortAlpha"), lab: "A–Z" },
  ];
  const upcoming = SHOWS.filter((s) => !s.past);
  const past = SHOWS.filter((s) => s.past);
  const sets = { upcoming, past, archived: [], all: SHOWS };
  let list = sets[filter].slice();
  if (sort === 1) list.sort((a, b) => a.name.localeCompare(b.name, "he"));
  if (sort === 2) list.sort((a, b) => a.artist.localeCompare(b.artist, "en"));
  const sc = sorts[sort];
  return (
    <>
      <PageHead t={t} mode={mode}
        title={t("shows")} count={upcoming.length} word={t("shows")} kick={t.he ? "אוגוסט 2026" : "AUGUST 2026"}
        sub={t.he && mode === "b" ? null : [<span key="a"><b>{String(upcoming.length).padStart(2, "0")}</b> {t("inAugust")}</span>]}
        stats={[{ v: String(upcoming.length).padStart(2, "0"), k: t("upcoming") }, { v: "0" + past.length, k: t("past") }, { v: String(SHOWS.length).padStart(2, "0"), k: t("total") }]}
        right={<div className="wrap-actions">
          <button className="btn util">{t("sync")}</button>
          <button className="btn util">{t("applyCrew")}</button>
          <button className="btn pri">{t("newShow")}</button>
        </div>} />
      <div className="bar-row">
        <div className="filters">
          {[["upcoming", t("upcoming"), upcoming.length], ["past", t("past"), past.length], ["archived", t("archived"), 0], ["all", t("all"), SHOWS.length]].map(([k, label, n]) => (
            <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>
              {label}<span className="c">{n}</span>
            </button>
          ))}
        </div>
        <div className="wrap-actions">
          <button className="btn util" onClick={() => setSort((sort + 1) % 3)}>
            {sc.key}{sc.lab ? <span className="ltr" style={{ marginInlineStart: 6 }}>{sc.lab}</span> : null}
            <Icon.chevDown />
          </button>
          <button className="btn util"><Icon.filter />{t("filter")}</button>
        </div>
      </div>
      <div className="shows-grid">
        {list.map((s) => <ShowCard key={s.id} s={s} t={t} open={openId === s.id} onToggle={() => setOpenId(openId === s.id ? null : s.id)} onEdit={() => onEdit(s)} />)}
      </div>
    </>
  );
}

/* ─── show edit modal ─── */
function ShowModal({ t, show, onClose }) {
  const [sec, setSec] = uS("basics");
  const [rows, setRows] = uS(show.schedule);
  const [crew, setCrew] = uS(show.crew);
  const secs = [["basics", t("secBasics")], ["logistics", t("secLogistics")], ["schedule", t("secSchedule")], ["crew", t("secCrew")], ["docs", t("secDocs")]];
  const toggleCrew = (id) => setCrew(crew.includes(id) ? crew.filter((x) => x !== id) : [...crew, id]);
  const roles = [...new Set(CREW.map((c) => c.role))];
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-h">
          <h2>{t("editShow")} — <span dir="auto" className="auto">{show.name}</span></h2>
          <button className="icon-btn" onClick={onClose}><Icon.x /></button>
        </div>
        <div className="modal-body">
          <div className="modal-nav">
            {secs.map(([k, label], i) => (
              <button key={k} className={sec === k ? "on" : ""} onClick={() => setSec(k)}>
                <span className="idx">{String(i + 1).padStart(2, "0")}</span>{label}
              </button>
            ))}
          </div>
          <div className="modal-main">
            {sec === "basics" && (
              <div className="f-grid">
                <div className="f-group span2"><label>{t("showName")}</label><input type="text" defaultValue={show.name} dir="auto" /></div>
                <div className="f-group"><label>{t("eventType")}</label>
                  <select defaultValue={show.type}>{Object.entries(ET).map(([k, v]) => <option key={k} value={k}>{v.he}</option>)}</select></div>
                <div className="f-group"><label>{t("artist")}</label><select defaultValue="a"><option value="a">Assaf Amdursky</option><option value="h">Hila Ruach</option></select></div>
                <div className="f-group"><label>{t("date")}</label><input type="date" defaultValue={show.date} dir="ltr" /></div>
                <div className="f-group"><label>{t("startEnd")}</label>
                  <div style={{ display: "flex", gap: 8, direction: "ltr" }}>
                    <input type="time" defaultValue="18:15" /><input type="time" defaultValue="22:20" />
                  </div></div>
                <div className="f-group span2"><label>{t("venue")}</label><input type="text" defaultValue={show.venue} dir="auto" /></div>
              </div>
            )}
            {sec === "logistics" && (
              <div className="f-grid">
                <div className="f-group span2"><label>{t("address")}</label><input type="text" defaultValue={show.address} dir="auto" /></div>
                <div className="f-group span2"><label>{t("parking")}</label><input type="text" defaultValue={show.parking} dir="auto" /></div>
                <div className="f-group span2"><label>{t("transportation")}</label><input type="text" defaultValue={show.transport} dir="auto" /></div>
                <div className="f-group span2"><label>{t("contacts")}</label>
                  {show.contacts.map((c, i) => (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 130px", gap: 8, marginTop: 6 }}>
                      <input type="text" defaultValue={c.n} dir="auto" /><input type="text" defaultValue={c.r} dir="auto" />
                      <input type="text" defaultValue={c.p} dir="ltr" style={{ direction: "ltr" }} />
                    </div>
                  ))}
                </div>
                <div className="f-group span2"><label>{t("notes")}</label><textarea rows="3" defaultValue={show.notes} dir="auto"></textarea></div>
              </div>
            )}
            {sec === "schedule" && (
              <div>
                <div className="sched-row" style={{ borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
                  <span></span>
                  <label style={{ fontSize: ".6875rem", fontWeight: 600, color: "var(--text-3)" }}>{t("time")}</label>
                  <label style={{ fontSize: ".6875rem", fontWeight: 600, color: "var(--text-3)" }}>{t("what")}</label>
                  <span></span>
                </div>
                {rows.map((r, i) => (
                  <div className="sched-row" key={i}>
                    <span className="grip">⠿</span>
                    <input type="time" defaultValue={r.t} style={{ direction: "ltr" }} />
                    <input type="text" defaultValue={r.d} dir="auto" />
                    <button className="btn-txt danger" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Icon.trash /></button>
                  </div>
                ))}
                <button className="btn sec sm mt12" onClick={() => setRows([...rows, { t: "23:59", d: "" }])}>{t("addRow")}</button>
              </div>
            )}
            {sec === "crew" && (
              <div>
                <div className="hint" style={{ marginBottom: 14 }}>{t("pickCrew")}</div>
                {roles.map((r) => (
                  <div key={r} style={{ marginBottom: 16 }}>
                    <div className="sec-title mb0" style={{ marginBottom: 8 }} dir="auto">{r}</div>
                    <div className="chips">
                      {CREW.filter((c) => c.role === r).map((c) => (
                        <button key={c.id} className={"chip pick" + (crew.includes(c.id) ? " on" : "")} onClick={() => toggleCrew(c.id)} dir="auto">
                          {crew.includes(c.id) && <Icon.check width="12" height="12" />}{c.n}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {sec === "docs" && (
              <div className="rows">
                {[[t("brief"), "Google Doc", true], [t("pdf"), "PDF", true], [t("invoice"), "—", false], [t("receipt"), "—", false]].map(([k, v, on], i) => (
                  <div className="row" key={i}>
                    <div className="grow"><div className="t">{k}</div><div className="s">{v}</div></div>
                    <span className={"tag " + (on ? "ok" : "")}>{on ? t("ready") : "—"}</span>
                    <button className="btn sec sm">{on ? t("pdf") : t("add")}</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="modal-f">
          <button className="btn sec" onClick={onClose}>{t("cancel")}</button>
          <button className="btn pri" onClick={onClose}>{t("save")}</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ShowsScreen, ShowModal, ShowCard, CrewChips, Field });
