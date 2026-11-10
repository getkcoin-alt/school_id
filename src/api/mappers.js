// Converts between API records and the shapes the screens already use.
const STATUS = {
  DRAFT: "Draft",
  INVITED: "Invited",
  IN_REVIEW: "In review",
  CHANGES_REQUESTED: "Changes requested",
  APPROVED: "Approved",
  SUBMITTED_FOR_PRINT: "Submitted for print",
};
const BATCH = { SUBMITTED: "Submitted", IN_PROGRESS: "In progress", PRINTED: "Printed", DELIVERED: "Delivered", CANCELLED: "Cancelled" };
const PHOTO_SOURCE = { UPLOAD: "School admin upload", CAMERA: "Live camera capture", LIBRARY: "School photo library", PDF: "Photo PDF", IMPORT: "Imported" };
const invert = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [v, k]));
export const statusToApi = invert(STATUS);
export const batchStatusToApi = invert(BATCH);
const title = (s) => (s ? s[0] + s.slice(1).toLowerCase() : s);

// Frontend field key <-> API field key
export const FIELD_KEYS = { admission: "admissionNo", classNo: "className", father: "fatherName", mother: "motherName", blood: "bloodGroup" };
const API_TO_UI = invert(FIELD_KEYS);
export const uiKey = (k) => API_TO_UI[k] || k;
export const apiKey = (k) => FIELD_KEYS[k] || k;
const blood = { toUi: (v) => v?.replace("-", "−") ?? "", toApi: (v) => (v ? v.replace("−", "-") : null) };

export const fromSchool = (s) => ({
  id: s.id,
  code: s.code,
  name: s.name,
  short: s.shortName || s.name.split(" ").map((w) => w[0]).join("").slice(0, 3),
  city: s.city || "",
  address: [s.address, s.city, s.state, s.pin].filter(Boolean).join(", "),
  address1: s.address || "",
  state: s.state || "",
  pin: s.pin || "",
  email: s.email || "",
  phone: s.phone || "",
  principal: s.principal || "",
  agent: s.agentId || "",
  status: title(s.status),
  color: s.color || "#3b7767",
  studentRounds: s.studentRounds,
  staffRounds: s.staffRounds,
  currentSession: s.currentSession,
  studentDesignId: s.studentDesignId,
  logoUrl: s.logoUrl,
});
export const toSchool = (s) => ({
  name: s.name,
  shortName: s.short || null,
  email: s.email || "",
  phone: s.phone || null,
  principal: s.principal || null,
  address: s.address1 ?? s.address ?? null,
  city: s.city || null,
  color: /^#[0-9a-f]{6}$/i.test(s.color || "") ? s.color : undefined,
  agentId: s.agent || null,
  status: (s.status || "Active").toUpperCase(),
  studentRounds: Number(s.studentRounds) || 0,
  staffRounds: Number(s.staffRounds) || 0,
});

export const fromAgent = (a) => ({
  id: a.id,
  code: a.code,
  name: a.name,
  email: a.email,
  phone: a.phone || "",
  type: title(a.tier),
  company: a.company || "",
  city: a.city || "",
  address: a.address || "",
  state: a.state || "",
  country: a.country || "",
  pin: a.pin || "",
  start: a.subscriptionStart || "",
  end: a.subscriptionEnd || "",
  status: title(a.status),
  printBySelf: a.printBySelf,
});
export const toAgent = (a) => ({
  name: a.name,
  company: a.company || null,
  phone: a.phone || null,
  tier: (a.type || "Regular").toUpperCase(),
  address: a.address || null,
  city: a.city || null,
  state: a.state || null,
  country: a.country || null,
  pin: a.pin || null,
  subscriptionStart: a.start || null,
  subscriptionEnd: a.end || null,
  status: (a.status || "Active").toUpperCase(),
  printBySelf: Boolean(a.printBySelf),
});

export const fromStudent = (s) => ({
  id: s.id,
  code: s.code,
  school: s.schoolId,
  name: s.name,
  admission: s.admissionNo || "",
  classNo: s.className,
  section: s.section || "",
  gender: s.gender || "",
  dob: s.dob || "",
  fatherPrefix: s.fatherPrefix || "",
  father: s.fatherName || "",
  motherPrefix: s.motherPrefix || "",
  mother: s.motherName || "",
  email: s.email || "",
  phone: s.phone || "",
  address: s.address || "",
  admissionDate: s.admissionDate || "",
  blood: blood.toUi(s.bloodGroup),
  transport: s.transport || "",
  photoNo: s.photoNo || "",
  srn: s.srn || "",
  rollNo: s.rollNo || "",
  status: STATUS[s.status],
  active: s.active,
  session: s.session,
  photo: s.photoUrl || "",
  photoSource: PHOTO_SOURCE[s.photoSource] || "",
  captureAt: s.photoSource === "CAMERA" ? s.photoCapturedAt : null,
  invitedAt: s.invitedAt,
  note: s.reviewNote || "",
  custom: s.extra || {},
  version: s.version,
});

const STUDENT_UI_FIELDS = ["name", "admission", "classNo", "section", "gender", "dob", "fatherPrefix", "father", "motherPrefix", "mother", "email", "phone", "address", "admissionDate", "blood", "transport", "photoNo", "srn", "rollNo", "active", "session"];
/** Only the fields that changed (or all for a new record), in API names. */
export function toStudent(s, prev) {
  const out = {};
  for (const k of STUDENT_UI_FIELDS) {
    if (prev && prev[k] === s[k]) continue;
    let v = s[k];
    if (k === "blood") v = blood.toApi(v);
    else if (k === "gender") v = ["Male", "Female", "Other"].includes(v) ? v : null;
    else if (typeof v === "string") v = v.trim() === "" ? null : v.trim();
    if (k === "active") v = Boolean(s.active);
    if (k === "session" && !v) continue;
    out[apiKey(k)] = v;
  }
  if (!prev || JSON.stringify(prev.custom || {}) !== JSON.stringify(s.custom || {})) out.extra = Object.fromEntries(Object.entries(s.custom || {}).map(([k, v]) => [k, String(v ?? "")]));
  return out;
}

export const fromStaff = (s) => ({
  id: s.id,
  code: s.code,
  school: s.schoolId,
  name: s.name,
  role: s.role || "",
  email: s.email || "",
  phone: s.phone || "",
  address: s.address || "",
  gender: s.gender || "",
  dob: s.dob || "",
  classNo: s.className || "",
  section: s.section || "",
  status: title(s.status),
  photo: s.photoUrl || "",
  printStatus: STATUS[s.reviewStatus],
  custom: s.extra || {},
});
export const toStaff = (s) => ({
  name: s.name,
  role: s.role || null,
  email: s.email || "",
  phone: s.phone || null,
  address: s.address || null,
  gender: ["Male", "Female", "Other"].includes(s.gender) ? s.gender : null,
  dob: s.dob || null,
  className: s.classNo || null,
  section: s.section || null,
  status: (s.status || "Active").toUpperCase(),
  extra: s.custom || {},
});

export const fromBatch = (b) => ({
  id: b.id,
  code: b.code,
  name: `${b.code} · ${b.name}`,
  rawName: b.name,
  school: b.schoolId,
  count: b.studentCount + b.staffCount,
  studentIds: [],
  staffIds: [],
  snapshot: null, // loaded on demand
  status: BATCH[b.status],
  fulfilledBy: b.fulfilledBy === "AGENT" ? "Agent" : "ID Card Studio",
  date: b.createdAt?.slice(0, 10),
  owner: b.fulfillerName,
  design: b.designName || "",
  tracking: b.tracking || "",
  carrier: b.carrier || "",
});

export const fromPdf = (u) => ({ id: u.id, school: u.schoolId, name: u.fileName, pages: u.pages || 0, status: { READY_FOR_REVIEW: "Ready for review", REVIEWED: "Reviewed", REJECTED: "Rejected" }[u.status], date: u.createdAt?.slice(0, 10), note: u.note || "", url: u.url || "", agent: u.agentName });
export const pdfStatusToApi = { "Ready for review": "READY_FOR_REVIEW", Reviewed: "REVIEWED", Rejected: "REJECTED" };

export const fromDesign = (d) => ({ id: d.id, name: d.name, kind: d.kind === "LANYARD" ? "Lanyard" : "ID card", audience: title(d.audience), color: d.color || "#326b5b" });

export const fromActivity = (l) => ({
  id: l.id,
  text: l.impersonatedBy ? `${l.summary} (by ${l.impersonatedBy} as ${l.actorName})` : l.summary,
  type: l.action.startsWith("batch") ? "print" : l.action.includes("invit") ? "email" : l.action.includes("photo") || l.action.includes("pdf") ? "upload" : "check",
  time: l.createdAt,
  actor: l.actorName,
  actorId: l.actorId,
  school: l.schoolId,
  action: l.action,
});

export const ROLE_FROM_API = (me) => (me.role === "SUPER_ADMIN" ? "super" : me.role === "SCHOOL_ADMIN" ? "school" : me.agentTier === "PREMIUM" ? "premium" : "regular");
