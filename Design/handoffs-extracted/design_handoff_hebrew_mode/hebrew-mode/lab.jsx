const { useState: uL } = React;

const Bad = ({ dir, children, note }) => <div><div className="lab-bad" dir={dir} style={{ unicodeBidi: "normal" }}>{children}</div>{note && <span className="mono">{note}</span>}</div>;
const Good = ({ dir, children, note }) => <div><div className="lab-good" dir={dir}>{children}</div>{note && <span className="mono">{note}</span>}</div>;
const Lbl = ({ children }) => <span className="lab-tag">{children}</span>;

function LabScreen({ t, mode }) {
  const [ctx, setCtx] = uL(t.he ? "rtl" : "ltr");
  const other = ctx === "rtl" ? "ltr" : "rtl";
  return (
    <>
      <PageHead t={t} mode={mode} title={t("bidiLab")} count={6} word={t("bidiLab")} kick={t.he ? "מקרי קצה" : "EDGE CASES"}
        sub={[t.he ? "כל מקרה: מה קורה בלי בידוד, ומה הפתרון." : "Each case: what happens without isolation, and the fix."]}
        right={<div className="seg">
          <button className={ctx === "ltr" ? "on" : ""} onClick={() => setCtx("ltr")}>LTR context</button>
          <button className={ctx === "rtl" ? "on" : ""} onClick={() => setCtx("rtl")}>RTL context</button>
        </div>} />

      <div className="lab">
        <div className="lab-card">
          <h4>1 · {t.he ? "מספרי טלפון" : "Phone numbers"}</h4>
          <Lbl>{t.he ? "ללא בידוד" : "unisolated"}</Lbl>
          <Bad dir={ctx} note="direction inherited">054-7298501 · 052-8264434</Bad>
          <Lbl>{t.he ? "מבודד" : "isolated"}</Lbl>
          <Good dir={ctx} note="dir=ltr; unicode-bidi:isolate"><span className="ltr" dir="ltr">054-7298501</span> · <span className="ltr" dir="ltr">052-8264434</span></Good>
        </div>

        <div className="lab-card">
          <h4>2 · {t.he ? "טווחי שעות" : "Time ranges"}</h4>
          <Lbl>{t.he ? "ללא בידוד — הקצוות מתהפכים" : "unisolated — the ends swap"}</Lbl>
          <Bad dir={ctx} note="18:15 – 22:20 becomes 22:20 – 18:15 in RTL">18:15 – 22:20</Bad>
          <Lbl>{t.he ? "מבודד" : "isolated"}</Lbl>
          <Good dir={ctx}><span className="ltr" dir="ltr">18:15 – 22:20</span></Good>
        </div>

        <div className="lab-card">
          <h4>3 · {t.he ? "שורות לוח זמנים" : "Schedule lines"}</h4>
          <p className="hint" style={{ marginBottom: 10 }}>{t.he ? "כל שורה קובעת את כיוונה בעצמה — dir=\"auto\"." : "Each line resolves its own direction — dir=\"auto\"."}</p>
          <div className="sched">
            {[["16:00", "הגעת צוות טכני"], ["17:00", "סאונדצ׳ק — Assaf Amdursky"], ["18:15", "Doors open"], ["20:30", "עלייה לבמה"]].map(([a, b], i) => (
              <span className="line" dir="auto" key={i}><time dir="ltr">{a}</time> {b}</span>
            ))}
          </div>
          <span className="mono">first-strong per line</span>
        </div>

        <div className="lab-card">
          <h4>4 · {t.he ? "מחרוזת מורכבת" : "Compound string"}</h4>
          <Lbl>{t.he ? "מחרוזת מופרדת — הסדר לא צפוי" : "delimited string — order is unpredictable"}</Lbl>
          <Bad dir={ctx} note="| and – are direction-neutral">הפקה – צליל מרגלית | Sound – רני ליבנה | בקליין – Noam Moyal</Bad>
          <Lbl>{t.he ? "צ׳יפים נפרדים — הפתרון" : "discrete chips — the answer"}</Lbl>
          <div className="chips" style={{ marginTop: 6 }}>
            {[[1, "צליל מרגלית", "הפקה"], [2, "רני ליבנה", "Sound"], [4, "Noam Moyal", "בקליין"]].map(([id, n, r]) => (
              <span className="chip" key={id} dir="auto"><span className="face" style={{ background: byId(id).c }}>{String(n).slice(0, 1)}</span><b style={{ fontWeight: 500 }}>{n}</b><span className="role">{r}</span></span>
            ))}
          </div>
          <span className="mono">each chip is its own isolate</span>
        </div>

        <div className="lab-card">
          <h4>5 · {t.he ? "אימייל וכתובות" : "Emails and URLs"}</h4>
          <Lbl>{t.he ? "ללא בידוד" : "unisolated"}</Lbl>
          <Bad dir={ctx}>לפרטים: tslil@spotpool.co.il, או production-hub.app/shows/14.</Bad>
          <Lbl>{t.he ? "מבודד" : "isolated"}</Lbl>
          <Good dir={ctx}>לפרטים: <a className="ltr" dir="ltr" href="#lab">tslil@spotpool.co.il</a>, או <a className="ltr" dir="ltr" href="#lab">production-hub.app/shows/14</a>.</Good>
        </div>

        <div className="lab-card">
          <h4>6 · {t.he ? "תוויות ממשק דו־לשוניות" : "Mixed-script UI labels"}</h4>
          <p className="hint" style={{ marginBottom: 10 }}>{t.he ? "התווית נושאת את האלף־בית שלפיו ממיינים, לא את שפת הממשק." : "The label carries the alphabet being sorted, not the interface language."}</p>
          <div className="wrap-actions">
            <button className="btn util">Sort <span className="ltr" style={{ marginInlineStart: 5 }}>א–ב</span></button>
            <button className="btn util">מיון <span className="ltr" style={{ marginInlineStart: 5 }}>א–ב</span></button>
            <button className="btn util">מיון <span className="ltr" style={{ marginInlineStart: 5 }}>A–Z</span></button>
          </div>
          <span className="mono">alphabet range is an isolated atom</span>
        </div>

        <div className="lab-card" style={{ gridColumn: "1 / -1" }}>
          <h4>{t.he ? "המבחן האמיתי — כרטיס אחד, ארבעה כיוונים" : "The real test — one card, four directions"}</h4>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 4 }}>
            {["ltr", "rtl"].map((d) => (
              <div key={d} dir={d} style={{ border: "1px solid var(--border)", background: "var(--surface-2)", padding: "14px 16px" }}>
                <span className="lab-tag">{d === "ltr" ? "English layout" : "פריסה עברית"}</span>
                <div style={{ fontSize: "1.15rem", fontWeight: 700, letterSpacing: "-.02em" }} dir="auto">סולו מועדון הג׳ורג׳ ת״א</div>
                <div style={{ fontSize: ".875rem", color: "var(--text-2)", marginTop: 5, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <span className="lat">Assaf Amdursky</span>
                  <span style={{ color: "var(--border-strong)" }}>·</span>
                  <span className="ltr" dir="ltr">18:15 – 22:20</span>
                  <span style={{ color: "var(--border-strong)" }}>·</span>
                  <span className="ltr" dir="ltr">054-7298501</span>
                </div>
                <div className="sched" style={{ marginTop: 10 }}>
                  <span className="line" dir="auto"><time dir="ltr">18:15</time> פתיחת שערים</span>
                  <span className="line" dir="auto"><time dir="ltr">20:30</time> Assaf on stage</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="lab-card" style={{ gridColumn: "1 / -1" }}>
          <h4>{t.he ? "אייקונים כיווניים" : "Directional icons"}</h4>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 6 }}>
            <div>
              <Lbl>{t.he ? "מתהפכים — תנועה והתקדמות" : "mirror — movement & progression"}</Lbl>
              <div style={{ display: "flex", gap: 16, alignItems: "center", padding: "10px 0", color: "var(--text-2)" }}>
                <Icon.chev /><Icon.back /><Icon.arrow /><span style={{ display: "inline-block", width: 70, height: 3, background: "var(--surface-sunk)" }}><i style={{ display: "block", height: "100%", width: "60%", background: "var(--accent)" }}></i></span>
              </div>
            </div>
            <div>
              <Lbl>{t.he ? "לא מתהפכים — עצמים" : "no mirror — objects"}</Lbl>
              <div style={{ display: "flex", gap: 16, alignItems: "center", padding: "10px 0", color: "var(--text-2)" }}>
                <Icon.clock /><Icon.trash /><Icon.pencil /><Icon.phone width="15" height="15" /><Icon.mail width="15" height="15" /><Icon.doc width="15" height="15" />
              </div>
            </div>
          </div>
          <p className="hint">{t.he ? "מסומן לבדיקה: אייקון ה־PDF וסמל ההורדה — צורת הדף עצמה לא מתהפכת, אבל החץ שבתוכה כן. כרגע לא מתהפך." : "Flagged: the PDF / download glyph — the sheet is an object, the arrow inside it is movement. Currently not mirrored."}</p>
        </div>
      </div>
    </>
  );
}

/* ─── design notes drawer ─── */
function NotesDrawer({ t, onClose, mode }) {
  const N = [
    ["Heading system", "מערכת הכותרות",
      "The English display gesture — lowercase word plus a full stop — has no Hebrew counterpart. Two candidates ship in this demo; switch them in the bottom rail.",
      "מחוות הכותרת האנגלית — מילה באותיות קטנות ונקודה — חסרת מקבילה בעברית. שני מועמדים בדמו, החלפה בסרגל התחתון."],
    ["A · direct", "א · תרגום ישיר",
      "הופעות. — same object, translated. Heebo 900 holds the weight, and the accent dot survives. Cheapest to ship; the period reads as punctuation rather than as a mark, so the voice is quieter.",
      "הופעות. — אותו אובייקט, מתורגם. Heebo 900 מחזיק את המשקל והנקודה נשמרת. הכי זול ליישום, אבל הנקודה נקראת כפיסוק ולא כסימן, והקול נחלש."],
    ["B · numeral-led", "ב · מספר ראשי",
      "The counter becomes the display element and the Hebrew word drops to caption scale. Latin numerals keep the original Bricolage voice, so the page still opens with a big editorial mark — without asking Hebrew to imitate lowercase.",
      "המונה הופך לאלמנט הראשי והמילה העברית יורדת לגודל כותרת משנה. הספרות נשארות ב־Bricolage, כך שהעמוד עדיין נפתח בסימן מערכתי גדול — בלי לבקש מהעברית לחקות אותיות קטנות."],
    ["Metadata line", "שורת המטא",
      "Small-caps metadata (07 IN AUGUST) has no Hebrew equivalent either. In Hebrew mode the tracking drops to .05em, case is dropped, and size goes up one step — letterspaced Hebrew at 11px is unreadable.",
      "גם ל־07 IN AUGUST אין מקבילה. במצב עברית המרווח יורד ל־.05em, אין אותיות גדולות, והגודל עולה שלב — עברית מרווחת ב־11px אינה קריאה."],
    ["Compound strings", "מחרוזות מורכבות",
      "The crew line was a delimited string. Delimiters are direction-neutral, so segments reorder unpredictably. It is now discrete chips — each chip its own isolate, order guaranteed.",
      "שורת הצוות הייתה מחרוזת מופרדת. המפרידים ניטרליים, ולכן הקטעים מתערבבים. עכשיו צ׳יפים נפרדים — כל אחד בבידוד משלו, הסדר מובטח."],
    ["Every container is bidi", "כל מיכל דו־כיווני",
      "No container assumes its content's direction. Names, venues and notes carry dir=\"auto\"; numbers, times, phones, emails and URLs are isolated LTR atoms in both modes.",
      "אף מיכל לא מניח את כיוון התוכן שלו. שמות, מקומות והערות מקבלים dir=\"auto\"; מספרים, שעות, טלפונים, אימיילים וכתובות הם אטומים מבודדים משמאל לימין בשני המצבים."],
    ["Short strings", "מחרוזות קצרות",
      "Hebrew runs ~25% shorter. Rather than padding the copy, nav tracking tightens and the type size goes up a step, so the nav row keeps its measure.",
      "עברית קצרה בכ־25%. במקום למתוח את הטקסט, המרווח בתפריט מתהדק והגודל עולה שלב, כך שהשורה שומרת על אורכה."],
    ["Reload, not live swap", "טעינה מחדש",
      "Switching the language in Settings reloads the page — the same behaviour the product ships. The demo fakes the reload so you can see it.",
      "החלפת שפה בהגדרות טוענת מחדש את הדף — בדיוק כמו במוצר. הדמו מדמה את הטעינה."],
    ["Flagged as ambiguous", "מסומן לבדיקה",
      "The PDF glyph holds a download arrow inside a sheet — object plus movement. Left unmirrored. The progress bar fills from the inline start, so it runs right-to-left in Hebrew.",
      "אייקון ה־PDF מכיל חץ הורדה בתוך דף — עצם ועם תנועה. הושאר ללא היפוך. סרגל ההתקדמות מתמלא מתחילת השורה, כלומר מימין לשמאל בעברית."],
  ];
  const i = t.he ? 1 : 0;
  return (
    <aside className="notes">
      <div className="notes-h"><b>{t("notesBtn")}</b><button className="icon-btn" onClick={onClose}><Icon.x /></button></div>
      <div className="notes-body">
        {N.map((n, k) => (
          <div className={"note" + (k === 8 ? " warn" : "")} key={k}>
            <h4 dir="auto">{n[i]}</h4>
            <p dir="auto">{n[2 + i]}</p>
          </div>
        ))}
      </div>
    </aside>
  );
}

Object.assign(window, { LabScreen, NotesDrawer });
