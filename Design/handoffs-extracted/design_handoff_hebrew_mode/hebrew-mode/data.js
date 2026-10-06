/* Production Hub — Hebrew mode demo content. Data values are never translated. */
const ET = {
  show:     { he: "הופעה",      idx: 0, c: "#3852B4", bg: "#E8ECF7" },
  rehearse: { he: "חזרה",        idx: 4, c: "#6B7F56", bg: "#EAEDE7" },
  festival: { he: "פסטיבל",      idx: 3, c: "#F08D39", bg: "#FCE3CC" },
  private:  { he: "אירוע פרטי",  idx: 1, c: "#B89050", bg: "#F3EBDA" },
  launch:   { he: "השקה",        idx: 9, c: "#4E7265", bg: "#E6EDEA" },
};

const CREW = [
  { id: 1, n: "צליל מרגלית",  role: "הפקה",        p: "054-7298501", e: "tslil@spotpool.co.il",   c: "#3852B4", types: ["הופעה", "פסטיבל"] },
  { id: 2, n: "רני ליבנה",     role: "סאונד",       p: "052-8264434", e: "rani.livne@gmail.com",   c: "#F08D39", types: ["הופעה", "השקה"] },
  { id: 3, n: "אדיר דדיה",     role: "סאונד",       p: "050-3319847", e: "adir.d@soundhouse.co.il",c: "#F08D39", types: ["הופעה"] },
  { id: 4, n: "נעם מויאל",     role: "בקליין",      p: "053-7714290", e: "noam.moyal@gmail.com",   c: "#6B7F56", types: ["הופעה", "חזרה"] },
  { id: 5, n: "שי שטרקר",      role: "תאורה",       p: "054-4402218", e: "shtarker@lightbox.co.il",c: "#B89050", types: ["הופעה", "פסטיבל"] },
  { id: 6, n: "אורי קוטנר",    role: "מוניטורים",   p: "052-6650073", e: "uri.kotner@gmail.com",   c: "#4E7265", types: ["הופעה"] },
  { id: 7, n: "סטלה גוטשטיין", role: "סטייג׳ מנג׳ר", p: "058-7238866", e: "stella.g@spotpool.co.il", c: "#8C5E50", types: ["הופעה", "פסטיבל"] },
  { id: 8, n: "שלומי מאיה",    role: "בקליין",      p: "050-8264434", e: "shlomi.maya@gmail.com",  c: "#6B7F56", types: ["חזרה"] },
];
const byId = (id) => CREW.find((c) => c.id === id);

const SHOWS = [
  {
    id: 1, name: "סולו מועדון הג׳ורג׳ ת״א", artist: "Assaf Amdursky", type: "show",
    date: "2026-08-14", dateLabel: { en: "August 14, 2026", he: "14 באוגוסט 2026" },
    venue: "מועדון הג׳ורג׳", city: "תל אביב", time: "18:15 – 22:20", progress: 82,
    address: "אבן גבירול 71, תל אביב–יפו", parking: "חניון גן העיר · כניסה מרחוב מלכי ישראל",
    transport: "ואן 9 מקומות — איסוף 15:30 מרחוב הרכבת 58", crew: [1, 2, 4, 5, 6, 7],
    contacts: [
      { n: "צליל מרגלית", r: "הפקה", p: "054-7298501" },
      { n: "Danny Okun", r: "Venue manager", p: "03-6042100" },
    ],
    schedule: [
      { t: "15:30", d: "יציאה מהרכבת 58" },
      { t: "16:00", d: "הגעת צוות טכני" },
      { t: "17:00", d: "סאונדצ׳ק — Assaf Amdursky" },
      { t: "18:15", d: "פתיחת שערים" },
      { t: "20:30", d: "עלייה לבמה" },
      { t: "22:20", d: "סיום וסידור במה" },
    ],
    checks: { brief: true, pdf: true, invoice: false, receipt: false, cal: true, sheet: false },
    notes: "הבמה קטנה — דראם ריזר 2×1 בלבד. הכניסה לציוד מהחניון האחורי.",
    rental: "אורגן Nord Stage 3 מ־Sound House · החזרה 15/08",
  },
  {
    id: 2, name: "בארבי מנועים שקטים", artist: "Assaf Amdursky", type: "show",
    date: "2026-08-19", dateLabel: { en: "August 19, 2026", he: "19 באוגוסט 2026" },
    venue: "בארבי", city: "תל אביב", time: "16:00 – 23:30", progress: 56,
    address: "כפר גלעדי 52, תל אביב–יפו", parking: "חניון בית הדר · אישור מראש דרך ההפקה",
    transport: "הגעה עצמאית · טנדר ציוד 14:00", crew: [1, 3, 4, 5],
    contacts: [{ n: "מאיה גולן", r: "הפקה — בארבי", p: "050-8264434" }],
    schedule: [
      { t: "14:00", d: "פריקת ציוד" },
      { t: "16:00", d: "הגעת צוות טכני" },
      { t: "18:00", d: "סאונדצ׳ק" },
      { t: "21:00", d: "עלייה לבמה" },
      { t: "23:30", d: "סיום" },
    ],
    checks: { brief: true, pdf: false, invoice: false, receipt: false, cal: false, sheet: true },
    notes: "PA של המקום. מוניטורים אישיים מגיעים איתנו.",
    rental: "—",
  },
  {
    id: 3, name: "מנועים שקטים זאפה חיפה", artist: "Assaf Amdursky", type: "show",
    date: "2026-08-27", dateLabel: { en: "August 27, 2026", he: "27 באוגוסט 2026" },
    venue: "זאפה חיפה", city: "חיפה", time: "16:45 – 23:00", progress: 34,
    address: "שדרות ההסתדרות 128, חיפה", parking: "חניון המפרץ · 30 ₪ ליום",
    transport: "ואן 9 מקומות — איסוף 12:00 מתל אביב", crew: [1, 2, 5, 7],
    contacts: [{ n: "Ronen Bar", r: "Venue tech", p: "052-4419002" }],
    schedule: [
      { t: "12:00", d: "יציאה מתל אביב" },
      { t: "16:45", d: "הגעת צוות טכני" },
      { t: "18:30", d: "סאונדצ׳ק" },
      { t: "21:30", d: "עלייה לבמה" },
      { t: "23:00", d: "סיום" },
    ],
    checks: { brief: false, pdf: false, invoice: false, receipt: false, cal: false, sheet: false },
    notes: "לוודא מלונית לצוות הטכני — חוזרים אחרי חצות.",
    rental: "—",
  },
  {
    id: 4, name: "חזרת להקה עם אלון", artist: "Hila Ruach", type: "rehearse",
    date: "2026-08-11", dateLabel: { en: "August 11, 2026", he: "11 באוגוסט 2026" },
    venue: "אולפני קסטל", city: "מבשרת ציון", time: "10:00 – 14:00", progress: 100,
    address: "הרי יהודה 4, מבשרת ציון", parking: "חניה חופשית בשטח האולפן",
    transport: "הגעה עצמאית", crew: [4, 8],
    contacts: [{ n: "אלון בן דוד", r: "מנהל מוזיקלי", p: "054-9910044" }],
    schedule: [
      { t: "10:00", d: "כוונון והתארגנות" },
      { t: "11:00", d: "מעבר על הסט" },
      { t: "14:00", d: "סיום" },
    ],
    checks: { brief: true, pdf: true, invoice: true, receipt: true, cal: true, sheet: true },
    notes: "—", rental: "—",
  },
  {
    id: 5, name: "השקת אלבום — תיאטרון ירושלים", artist: "Hila Ruach", type: "launch",
    date: "2026-09-03", dateLabel: { en: "September 3, 2026", he: "3 בספטמבר 2026" },
    venue: "תיאטרון ירושלים", city: "ירושלים", time: "17:00 – 23:15", progress: 21,
    address: "דוד מרקוס 20, ירושלים", parking: "חניון התיאטרון · תגי חניה דרך ההפקה",
    transport: "ואן 9 מקומות + טנדר ציוד", crew: [1, 3, 5, 6, 7],
    contacts: [{ n: "נטע אלמוג", r: "הפקה — תיאטרון ירושלים", p: "02-5605755" }],
    schedule: [
      { t: "13:00", d: "פריקת ציוד" },
      { t: "17:00", d: "הגעת צוות טכני" },
      { t: "19:00", d: "סאונדצ׳ק מלא עם מיתרים" },
      { t: "21:00", d: "עלייה לבמה" },
      { t: "23:15", d: "סיום" },
    ],
    checks: { brief: false, pdf: false, invoice: false, receipt: false, cal: false, sheet: false },
    notes: "רביעיית מיתרים — 4 כיסאות ללא ידיות, 4 סטנדרים.", rental: "הגברה נוספת מ־Bass Line · הזמנה 28/08",
  },
  {
    id: 6, name: "פסטיבל ג׳אז אילת — במה ראשית", artist: "Assaf Amdursky", type: "festival",
    date: "2026-07-24", dateLabel: { en: "July 24, 2026", he: "24 ביולי 2026" },
    venue: "נמל אילת", city: "אילת", time: "19:00 – 22:00", progress: 100, past: true,
    address: "נמל אילת, במה ראשית", parking: "חניון הנמל",
    transport: "טיסה 06:40 · ציוד בהסעה", crew: [1, 2, 5, 7],
    contacts: [{ n: "Guy Peleg", r: "Stage manager", p: "054-2201188" }],
    schedule: [
      { t: "14:00", d: "צ׳יינג׳ אובר" },
      { t: "19:00", d: "עלייה לבמה" },
      { t: "22:00", d: "סיום" },
    ],
    checks: { brief: true, pdf: true, invoice: true, receipt: false, cal: true, sheet: true },
    notes: "—", rental: "—",
  },
];

const TASKS = [
  { id: 1, t: "לאשר תגי חניה לצוות — תיאטרון ירושלים", date: "2026-08-12", who: "צליל מרגלית", show: "השקת אלבום — תיאטרון ירושלים", done: false },
  { id: 2, t: "להזמין ואן 9 מקומות לחיפה", date: "2026-08-13", who: "צליל מרגלית", show: "מנועים שקטים זאפה חיפה", done: false },
  { id: 3, t: "לשלוח ריידר טכני ל־Danny Okun", date: "2026-08-11", who: "רני ליבנה", show: "סולו מועדון הג׳ורג׳ ת״א", done: false },
  { id: 4, t: "להחזיר Nord Stage 3 ל־Sound House", date: "2026-08-15", who: "נעם מויאל", show: "סולו מועדון הג׳ורג׳ ת״א", done: false },
  { id: 5, t: "לסגור מלונית לצוות הטכני בחיפה", date: null, who: "סטלה גוטשטיין", show: "מנועים שקטים זאפה חיפה", done: false },
  { id: 6, t: "לעדכן רשימת סטים לפסטיבל", date: null, who: "צליל מרגלית", show: null, done: false },
  { id: 7, t: "לשלוח חשבונית לזאפה חיפה", date: "2026-08-06", who: "צליל מרגלית", show: null, done: true },
];

const SESSIONS = [
  { d: "2026-08-09", a: "Assaf Amdursky", t: "תיאום ריידר ושיחות עם מועדון הג׳ורג׳", h: 2.5, billed: true },
  { d: "2026-08-08", a: "Hila Ruach", t: "בניית לוח זמנים להשקה — תיאטרון ירושלים", h: 3.0, billed: false },
  { d: "2026-08-06", a: "Assaf Amdursky", t: "הזמנת ואן וטנדר ציוד לחיפה", h: 1.25, billed: true },
  { d: "2026-08-05", a: "Assaf Amdursky", t: "סבב שיבוץ צוות טכני לאוגוסט", h: 4.0, billed: false },
  { d: "2026-08-03", a: "Hila Ruach", t: "חזרה באולפני קסטל — ליווי", h: 4.5, billed: true },
];

const TEAM = [
  { n: "צליל מרגלית", e: "tslil@spotpool.co.il", role: "admin", seen: "לפני 4 דקות", artists: ["Assaf Amdursky", "Hila Ruach"] },
  { n: "יעל בן חיים", e: "yael@spotpool.co.il", role: "user", seen: "אתמול, 22:14", artists: ["Assaf Amdursky"] },
  { n: "Danny Okun", e: "danny.okun@thegeorge.co.il", role: "guest", seen: "לפני 6 ימים", artists: ["Assaf Amdursky"] },
];

const CAL = { month: { en: "August", he: "אוגוסט" }, year: 2026, firstDow: 6, days: 31, today: 10,
  events: { 11: [4], 14: [1], 19: [2], 27: [3] } };

const SETLIST = [
  { n: "מנועים שקטים", m: 4.2 }, { n: "כמו חול", m: 3.5 }, { n: "בסוף מתרגלים להכול", m: 5.1 },
  { n: "Barefoot", m: 3.8 }, { n: "אחרי הכול", m: 4.6 }, { n: "יש לי סימנים", m: 6.0 },
];

Object.assign(window, { ET, CREW, byId, SHOWS, TASKS, SESSIONS, TEAM, CAL, SETLIST });
