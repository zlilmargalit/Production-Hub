/* Interface strings only. Data values (show names, venues, crew, roles, event types) are never translated. */
const STR = {
  // nav / shell
  shows: ["Shows", "הופעות"], crewTypes: ["Crew & Types", "צוות וסוגים"], tasks: ["Tasks", "משימות"],
  automations: ["Automations", "אוטומציות"], teams: ["Teams", "צוות המשרד"], tools: ["Tools", "כלים"],
  today: ["Today", "היום"], timeLog: ["Time Log", "יומן שעות"], workspace: ["Workspace", "סביבת עבודה"],
  settings: ["Settings", "הגדרות"], signOut: ["Sign out", "התנתקות"], admin: ["Admin", "מנהלת"],
  // page headers
  inAugust: ["IN AUGUST", "באוגוסט"], active: ["ACTIVE", "פעילים"], upcoming: ["Upcoming", "עתידיות"],
  past: ["Past", "עברו"], archived: ["Archived", "בארכיון"], all: ["All", "הכול"],
  total: ["TOTAL", "סה״כ"], thisMonth: ["shows this month", "הופעות החודש"],
  activeArtists: ["active artists", "אמנים פעילים"],
  // actions
  sync: ["Sync", "סנכרון"], applyCrew: ["Apply Crew", "שיבוץ צוות"], newShow: ["+ New", "+ חדש"],
  filter: ["Filter", "סינון"], edit: ["Edit", "עריכה"], del: ["Delete", "מחיקה"], save: ["Save changes", "שמירת שינויים"],
  cancel: ["Cancel", "ביטול"], close: ["Close", "סגירה"], add: ["Add", "הוספה"], sortAlpha: ["Sort", "מיון"],
  // show card
  crewN: ["crew", "אנשי צוות"], address: ["Address", "כתובת"], parking: ["Parking", "חניה"],
  techCrew: ["Technical Crew", "צוות טכני"], transportation: ["Transportation", "הסעות"],
  contacts: ["Contacts", "אנשי קשר"], schedule: ["Schedule", "לוח זמנים"], notes: ["Notes", "הערות"],
  rental: ["Rental gear", "ציוד בהשכרה"], technical: ["Technical", "טכני"], logistics: ["Logistics", "לוגיסטיקה"],
  brief: ["Brief", "בריף"], pdf: ["PDF", "PDF"], invoice: ["Invoice", "חשבונית"], receipt: ["Receipt", "קבלה"],
  calInvite: ["Calendar invite sent", "זימון יומן נשלח"], sheetSent: ["Coordination sheet sent", "דף תיאום נשלח"],
  briefSent: ["Brief sent", "בריף נשלח"], pdfSaved: ["PDF saved", "PDF נשמר"],
  ready: ["ready", "מוכן"], inPdf: ["IN PDF", "בקובץ"],
  // today
  upNext: ["Up Next", "הבא בתור"], myTasks: ["My Tasks", "המשימות שלי"], allArtists: ["All artists", "כל האמנים"],
  month: ["Month", "חודש"], week: ["Week", "שבוע"], todayBtn: ["Today", "היום"],
  // crew
  members: ["Members", "אנשי צוות"], eventTypes: ["Event Types", "סוגי אירוע"],
  usedIn: ["used in", "בשימוש ב־"], showsLower: ["shows", "הופעות"], defaultCrew: ["Default crew", "צוות ברירת מחדל"],
  // tasks
  addTask: ["What needs doing?", "מה צריך לעשות?"], assignee: ["Assignee", "אחראי"],
  linkShow: ["Link to show", "שיוך להופעה"], dueDate: ["Due date", "תאריך יעד"],
  activeTab: ["Active", "פעילות"], completed: ["Completed", "הושלמו"],
  scheduled: ["Scheduled", "עם תאריך"], noDate: ["No date", "ללא תאריך"], noAssignee: ["Unassigned", "ללא אחראי"],
  // automations
  connectedApps: ["Connected apps", "אפליקציות מחוברות"], connected: ["Connected", "מחובר"],
  notConnected: ["Not connected", "לא מחובר"], recipes: ["Recipes", "מתכונים"], enable: ["Enable", "הפעלה"],
  enabled: ["Enabled", "פעיל"], ruleBuilder: ["Rule builder", "בניית כלל"], trigger: ["Trigger", "טריגר"],
  conditions: ["Conditions", "תנאים"], action: ["Action", "פעולה"], runsWhen: ["Runs when", "רץ כאשר"],
  // teams
  invite: ["Invite", "הזמנה"], activity: ["Activity", "פעילות"], memberName: ["Name", "שם"],
  email: ["Email", "אימייל"], access: ["Access", "הרשאות"], lastSeen: ["Last seen", "נראה לאחרונה"],
  artists: ["Artists", "אמנים"], inviteByEmail: ["Invite by email", "הזמנה באימייל"], sendInvite: ["Send invite", "שליחת הזמנה"],
  // tools
  setlistCalc: ["Setlist Calculator", "מחשבון סטליסט"], techSpec: ["Tech Spec Parser", "פענוח ריידר טכני"],
  setlistDesc: ["Paste a setlist, get the running time.", "הדביקו סטליסט, קבלו את משך הסט."],
  techDesc: ["Paste a rider — the fields come back filled.", "הדביקו ריידר — השדות חוזרים מלאים."],
  runTime: ["Running time", "משך הסט"], parse: ["Parse", "פענוח"], pasteHere: ["Paste here…", "הדביקו כאן…"],
  // time log
  hours: ["Hours", "שעות"], date: ["Date", "תאריך"], artist: ["Artist", "אמן"],
  description: ["Description", "תיאור"], billed: ["Billed", "חויב"], logTime: ["Log time", "רישום שעות"],
  exportCsv: ["Export CSV", "ייצוא CSV"], totalHours: ["total hours", "סך שעות"],
  // settings
  appearance: ["Appearance", "מראה"], theme: ["Theme", "ערכת נושא"], light: ["Light", "בהיר"], dark: ["Dark", "כהה"],
  language: ["Language", "שפה"], timezone: ["Time zone", "אזור זמן"],
  langDesc: ["Interface language. Your content stays exactly as you wrote it.", "שפת הממשק. התוכן שלכם נשאר בדיוק כפי שנכתב."],
  langReload: ["Changing the language reloads the page.", "שינוי השפה יטען מחדש את הדף."],
  reloading: ["Reloading…", "טוען מחדש…"],
  // show form
  editShow: ["Edit show", "עריכת הופעה"], secBasics: ["Basics", "פרטים"], secLogistics: ["Logistics", "לוגיסטיקה"],
  secSchedule: ["Schedule", "לוח זמנים"], secCrew: ["Crew", "צוות"], secDocs: ["Documents", "מסמכים"],
  showName: ["Show name", "שם ההופעה"], eventType: ["Event type", "סוג אירוע"], venue: ["Venue", "מקום"],
  startEnd: ["Start – End", "התחלה – סיום"], addRow: ["+ Add row", "+ הוספת שורה"], time: ["Time", "שעה"],
  what: ["What", "מה"], pickCrew: ["Tap to assign", "לחצו לשיבוץ"],
  // registration
  createAccount: ["Create your account", "יצירת חשבון"], step: ["Step", "שלב"], of: ["of", "מתוך"],
  chooseLang: ["Interface language", "שפת הממשק"],
  chooseLangSub: ["You can change this any time in Settings.", "אפשר לשנות בכל רגע בהגדרות."],
  continue: ["Continue", "המשך"], skip: ["Skip", "דילוג"],
  // demo rail
  demoLang: ["Interface", "ממשק"], demoTheme: ["Theme", "ערכת נושא"], demoHead: ["Hebrew headings", "כותרות בעברית"],
  notesBtn: ["Design notes", "הערות עיצוב"], bidiLab: ["Bidi lab", "דו־כיווניות"],
};

function makeT(lang) {
  const i = lang === "he" ? 1 : 0;
  const t = (k) => (STR[k] ? STR[k][i] : k);
  t.lang = lang;
  t.he = lang === "he";
  t.dir = lang === "he" ? "rtl" : "ltr";
  return t;
}
Object.assign(window, { STR, makeT });
