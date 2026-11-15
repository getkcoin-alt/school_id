import {
  createSeed,
  STORAGE_KEY,
  FIELDS,
  LOCKED_FIELDS,
  FATHER_PREFIXES,
  MOTHER_PREFIXES,
  STAFF_FIELDS,
  PARENT_PREFIXES,
} from "./data.js";
export function loadData() {
  try {
    const d = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return d?.version === 1 ? { ...createSeed(), ...d } : createSeed();
  } catch {
    return createSeed();
  }
}
export function saveData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}
export const uid = (prefix = "X") =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
export const initials = (name = "") =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join("");
export const fmtDate = (d) =>
  new Date(d).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
export function studentLink(id) {
  return `${window.location.origin}/?panel=student&student=${encodeURIComponent(id)}&token=demo-${encodeURIComponent(id)}`;
}
export function eligible(s) {
  return s.status === "Approved" && Boolean(s.photo) && s.active;
}
export function csvText(rows, columns) {
  const safe = (v) => {
    let s = String(v ?? "");
    if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  return (
    "\u{FEFF}" +
    [
      columns.map((c) => safe(c.label)).join(","),
      ...rows.map((row) => columns.map((c) => safe(row[c.key])).join(",")),
    ].join("\r\n")
  );
}
export function download(name, content, type = "text/plain") {
  const a = document.createElement("a");
  const url = URL.createObjectURL(new Blob([content], { type }));
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export function exportCSV(rows, name = "students.csv") {
  const keys = [
    "id",
    "name",
    "admission",
    "classNo",
    "section",
    "father",
    "mother",
    "email",
    "phone",
    "address",
    "blood",
    "dob",
    "status",
    "session",
  ];
  download(
    name,
    csvText(
      rows,
      keys.map((key) => ({ key, label: key })),
    ),
    "text/csv;charset=utf-8",
  );
}
export function validateStudent(s, fields) {
  const errors = {};
  for (const f of fields) {
    if (f[3] && !String(s[f[0]] || "").trim())
      errors[f[0]] = `Enter ${f[1].toLowerCase()}.`;
  }
  if (s.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email))
    errors.email = "Enter a valid email address.";
  if (
    s.phone &&
    !/^(?:\+91|91|0)?[6-9]\d{9}$/.test(s.phone.replace(/[\s-]/g, ""))
  )
    errors.phone = "Enter a valid 10-digit Indian mobile number.";
  if (s.dob && new Date(s.dob) > new Date())
    errors.dob = "Date of birth cannot be in the future.";
  return errors;
}




/** Spreadsheet in the agreed column order, in capitals, without disabled fields. */
export async function exportSheet(rows, fields, name = "students.xlsx") {
  const XLSX = await import("xlsx");
  const keys = fields.map((f) => f[0]).filter((k) => k !== "photoNo");
  const COLUMN = { name: "NAME", fatherPrefix: "PREFIXF", father: "FATHER", motherPrefix: "PREFIXM", mother: "MOTHER", dob: "DOB", classNo: "CLASS", section: "SECTION", phone: "MOBILE", address: "ADDRESS", admission: "ADMNO", srn: "SRN", email: "EMAIL", gender: "GENDER", admissionDate: "ADMDATE", blood: "BLOOD", transport: "TRANSPORT" };
  const dmy = (v) => (v && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10).split("-").reverse().join("-") : v || "");
  const sorted = [...rows].sort((a, b) => String(a.classNo).localeCompare(String(b.classNo), "en", { numeric: true }) || String(a.section).localeCompare(String(b.section)) || a.name.localeCompare(b.name));
  const sheet = sorted.map((s, i) => {
    const out = { SRNO: i + 1, PHOTO: String(s.photoNo || s.admission || s.id).toUpperCase() };
    for (const k of keys) {
      const v = ["dob", "admissionDate"].includes(k) ? dmy(s[k]) : s[k];
      out[COLUMN[k] || k.toUpperCase()] = k === "email" ? String(v || "").toLowerCase() : String(v ?? "").toUpperCase();
    }
    return out;
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheet), "Students");
  XLSX.writeFile(wb, name);
}
export async function cardPDF(students, school, design = "Classic") {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const color = design === "Campus" ? "#2d4468" : "#326b5b";
  for (let i = 0; i < students.length; i++) {
    const s = students[i];
    if (i > 0 && i % 3 === 0) doc.addPage();
    const x = 30,
      y = 15 + (i % 3) * 91,
      bx = 118;
    for (const xx of [x, bx]) {
      doc.setDrawColor("#d6ddd7");
      doc.setFillColor("#ffffff");
      doc.roundedRect(xx, y, 54, 85, 2, 2, "FD");
      doc.setFillColor(color);
      doc.rect(xx, y, 54, 15, "F");
      doc.setTextColor("#ffffff");
      doc.setFontSize(7);
      doc.text(doc.splitTextToSize(school.name, 46).slice(0, 2), xx + 4, y + 5);
      doc.setFontSize(4.5);
      doc.text(
        xx === x
          ? "IDENTITY CARD / " + (s.session || "2026-27").replace("–", "-")
          : "PERSONAL & SCHOOL DETAILS",
        xx + 4,
        y + 12,
      );
    }
    if (s.photo) {
      try {
        const photo = await rasterPhoto(s.photo);
        doc.addImage(photo, "JPEG", x + 18, y + 20, 18, 23);
      } catch {
        /* The proof remains downloadable if an image cannot be decoded. */
      }
    }
    doc.setTextColor(color);
    doc.setFontSize(9);
    doc.text(doc.splitTextToSize(s.name, 46).slice(0, 2), x + 27, y + 50, {
      align: "center",
    });
    doc.setFontSize(6);
    doc.text(
      s.cardType === "STAFF"
        ? s.role || s.classNo || "Staff"
        : `Class ${s.classNo || "-"} - ${s.section || "-"}`,
      x + 27,
      y + 59,
      { align: "center" },
    );
    doc.text(`ID: ${s.admission || s.id}`, x + 27, y + 66, { align: "center" });
    doc.setFontSize(5);
    doc.text("Blood group: " + (s.blood || "-"), x + 27, y + 72, {
      align: "center",
    });
    const fields = [
      ["Name", s.name],
      ["Admission", s.admission || s.id],
      ["Father", s.father],
      ["Mother", s.mother],
      ["Date of birth", toDMY(s.dob)],
      ["Gender", s.gender],
      ["Phone", s.phone],
      ["Email", s.email],
      ["Address", s.address],
      ["Admission date", s.admissionDate],
      ["Blood group", s.blood],
      ["Transport", s.transport],
      ["Role", s.role],
      ...Object.entries(s.custom || {}).map(([, v]) => ["Extra field", v]),
    ].filter(([, v]) => v);
    let yy = y + 21;
    doc.setTextColor("#55665a");
    doc.setFontSize(5.1);
    for (const [label, value] of fields) {
      const lines = doc.splitTextToSize(label + ": " + value, 46);
      if (yy + lines.length * 2.6 > y + 76) break;
      doc.text(lines, bx + 4, yy);
      yy += lines.length * 2.6 + 1.4;
    }
    for (const xx of [x, bx]) {
      doc.setTextColor("#bb7068");
      doc.setFontSize(4);
      doc.text("DESIGN PROOF - NOT A VALID SCHOOL ID", xx + 27, y + 81, {
        align: "center",
      });
    }
  }
  return doc.output("blob");
}
function rasterPhoto(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(
      () => reject(new Error("Image decoding timed out")),
      2500,
    );
    img.onload = () => {
      clearTimeout(timer);
      const c = document.createElement("canvas");
      c.width = 240;
      c.height = 300;
      const g = c.getContext("2d");
      g.fillStyle = "#fff";
      g.fillRect(0, 0, 240, 300);
      g.drawImage(img, 0, 0, 240, 300);
      resolve(c.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = (e) => {
      clearTimeout(timer);
      reject(e);
    };
    img.src = src;
  });
}
export const STAGES = ["Submitted", "In progress", "Printed", "Delivered"];

/** The school's printed fields with its own compulsory/optional choices (change sheet #11). */
export function schoolFieldList(data, schoolId) {
  const keys = data.fieldScope?.[schoolId] || data.enabledFields;
  const required = data.fieldRequired?.[schoolId];
  return FIELDS.filter((f) => keys.includes(f[0]) || LOCKED_FIELDS.includes(f[0])).map(
    ([key, label, type, req]) => [
      key,
      label,
      type,
      LOCKED_FIELDS.includes(key) || (required ? required.includes(key) : req),
    ],
  );
}
export function requiredKeys(data, schoolId) {
  return (
    data.fieldRequired?.[schoolId] ||
    FIELDS.filter((f) => f[3]).map((f) => f[0])
  );
}
/** Options for select-type fields; returns null for free-text inputs. */
export function optionsFor(type, data) {
  return type === "class"
    ? data.classes
    : type === "section"
      ? data.sections
      : type === "gender"
        ? ["Male", "Female", "Other"]
        : type === "blood"
          ? ["A+", "A−", "B+", "B−", "AB+", "AB−", "O+", "O−"]
          : type === "fatherPrefix"
            ? FATHER_PREFIXES
            : type === "motherPrefix"
              ? MOTHER_PREFIXES
              : null;
}

/** Indian academic year label for a date, e.g. 2026–27 (April to March). */
export function academicYear(d = new Date()) {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}–${String((y + 1) % 100).padStart(2, "0")}`;
}
/** "2027", "2027-28", "2027/2028" -> "2027–28"; null when not a sensible year. */
export function normaliseSession(input) {
  const m = String(input ?? "").trim().match(/^(\d{4})(?:\s*[-–/]\s*(\d{2}|\d{4}))?$/);
  if (!m) return null;
  const y = Number(m[1]);
  if (y < 2000 || y > 2100) return null;
  if (m[2]) {
    const end = Number(m[2].length === 2 ? String(y + 1).slice(0, 2) + m[2] : m[2]);
    if (end !== y + 1) return null;
  }
  return `${y}–${String((y + 1) % 100).padStart(2, "0")}`;
}
/** Default dates of a session: 1 April to 31 March. */
export function sessionDates(name) {
  const y = Number(String(name).slice(0, 4));
  return { start: `${y}-04-01`, end: `${y + 1}-03-31` };
}
/** The session after the latest one in the list (this year's when empty). */
export function nextSession(names) {
  const years = names.map((n) => Number(String(n).slice(0, 4))).filter(Boolean);
  if (!years.length) return academicYear();
  const y = Math.max(...years) + 1;
  return `${y}–${String((y + 1) % 100).padStart(2, "0")}`;
}

/** "2015-12-09" (or a Date) -> "09-12-2015"; other values pass through. */
export function toDMY(v) {
  if (!v) return "";
  if (v instanceof Date) v = v.toISOString();
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : String(v);
}
/** "09-12-2015", "9/12/2015" or "09.12.2015" -> "2015-12-09"; null when not a real date. */
export function fromDMY(v) {
  const m = String(v || "").trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Staff fields on the server, and the ones that must always be filled. */
export const STAFF_SERVER_FIELDS = ["name", "role", "phone", "email", "address", "gender", "dob", "classNo", "section"];
export const STAFF_LOCKED = ["name", "role"];
export function staffRequiredKeys(data, schoolId) {
  return data.staffFieldRequired?.[schoolId] || ["name", "role", "email", "phone", "address"];
}

// ---- Merged from the preview branch (phone preview helpers) ----
export function readPreviewData(serialized) {
  const stored = JSON.parse(serialized);
  if (stored?.version !== 1) return null;
  const data = { ...createSeed(), ...stored };
  const prefixKeys = Object.keys(PARENT_PREFIXES);
  if (data.studentSheetFieldsVersion !== 1) {
    data.enabledFields = [
      ...new Set([...data.enabledFields, "photoNo", "srn"]),
    ];
    data.fieldScope = Object.fromEntries(
      Object.entries(data.fieldScope).map(([id, keys]) => [
        id,
        [...new Set([...keys, "photoNo", "srn"])],
      ]),
    );
    data.studentSheetFieldsVersion = 1;
  }
  if (prefixKeys.every((key) => data.enabledFields.includes(key))) return data;
  const addPrefixes = (keys) => [...new Set([...keys, ...prefixKeys])];
  return {
    ...data,
    enabledFields: addPrefixes(data.enabledFields),
    fieldScope: Object.fromEntries(
      Object.entries(data.fieldScope).map(([school, keys]) => [
        school,
        addPrefixes(keys),
      ]),
    ),
  };
}

export function parentName(student, parent) {
  const name = student?.[parent]?.trim();
  const prefix = student?.[`${parent}Prefix`]?.trim();
  if (!name) return "";
  if (!prefix || name.toLowerCase().startsWith(`${prefix.toLowerCase()} `))
    return name;
  return `${prefix} ${name}`;
}

export const firstName = (name = "") =>
  name
    .trim()
    .split(/\s+/)
    .find(
      (part) => part && !/^(mr|mrs|ms|miss|dr|prof|shri|smt)\.?$/i.test(part),
    ) || "there";

export const lockedFields = (staff) =>
  staff ? ["name", "role"] : ["name", "classNo"];

export function schoolFields(data, school, staff = false) {
  const definitions = staff ? STAFF_FIELDS : FIELDS;
  const enabled = staff
    ? data.staffFieldScope?.[school]
    : data.fieldScope?.[school] || data.enabledFields;
  const required = (staff ? data.staffFieldRequired : data.fieldRequired)?.[
    school
  ];
  const locked = lockedFields(staff);
  return definitions
    .filter(
      ([key]) => !enabled || enabled.includes(key) || locked.includes(key),
    )
    .map(([key, label, type, defaultRequired]) => [
      key,
      label,
      type,
      locked.includes(key) ||
        (required ? required.includes(key) : defaultRequired),
    ]);
}

export function cardRecord(data, school, record, staff = false) {
  if (!record) return record;
  const fields = schoolFields(data, school, staff);
  const enabled = new Set(fields.map(([key]) => key));
  const definitions = staff ? STAFF_FIELDS : FIELDS;
  const hidden = Object.fromEntries(
    definitions.filter(([key]) => !enabled.has(key)).map(([key]) => [key, ""]),
  );
  const extras = schoolExtras(data, school, staff);
  return {
    ...record,
    ...hidden,
    custom: Object.fromEntries(
      extras.map((field) => [field.name, record.custom?.[field.id] || ""]),
    ),
    cardFields: [...enabled],
  };
}

export function schoolExtras(data, school, staff = false) {
  return data.customFields.filter(
    (field) =>
      field.school === school &&
      (field.audience === "staff") === staff &&
      field.enabled !== false,
  );
}

export function validateExtras(record, fields) {
  return Object.fromEntries(
    fields.flatMap((field) => {
      const value = String(record.custom?.[field.id] || "").trim();
      if (field.required && !value)
        return [[`extra:${field.id}`, `Enter ${field.name.toLowerCase()}.`]];
      if (value && field.type === "select" && !field.options.includes(value))
        return [
          [`extra:${field.id}`, `Choose a valid option for ${field.name}.`],
        ];
      return [];
    }),
  );
}

export const isNotSubmitted = (student) =>
  ["Draft", "Invited"].includes(student.status);

export function approvalError(student, fields, extras = []) {
  if (!student.active) return "Activate this student before approving.";
  if (
    !student.photo ||
    Object.keys({
      ...validateStudent(student, fields),
      ...validateExtras(student, extras),
    }).length
  )
    return "Complete the required ID fields and add a photo before approving.";
  return "";
}

export function approvedStudent(student) {
  return {
    ...student,
    status: "Approved",
    note: "",
    approvedAt: new Date().toISOString(),
  };
}

export const photoNumber = (value) =>
  String(value ?? "")
    .trim()
    .replace(/\.(jpe?g|png|webp)$/i, "")
    .toUpperCase();

export const photoLimit = 15 * 1024 * 1024;

export function validPhoto(file) {
  return (
    file.size > 0 &&
    file.size <= photoLimit &&
    ["image/jpeg", "image/png", "image/webp"].includes(file.type)
  );
}

export async function studentPhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    return await rasterPhoto(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function exportStudents(rows, school, customFields, format) {
  const filename = school.short || school.id;
  if (format === "checklist") {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    for (const [index, student] of rows.entries()) {
      if (index % 7 === 0) {
        if (index > 0) doc.addPage();
        doc.setFontSize(15);
        doc.text(doc.splitTextToSize(school.name, 175).slice(0, 1), 14, 16);
        doc.setFontSize(10);
        doc.text("ID card checking sheet", 14, 23);
        doc.text(
          "Reviewed by: ___________________   Date: __________",
          14,
          283,
        );
      }
      const y = 32 + (index % 7) * 34;
      if (student.photo) {
        const photo = await rasterPhoto(student.photo).catch(() => null);
        if (photo) doc.addImage(photo, "JPEG", 14, y, 19, 24);
      }
      doc.text(doc.splitTextToSize(student.name, 105).slice(0, 1), 38, y + 6);
      doc.text(
        `ADM ${student.admission} | Class ${student.classNo} ${student.section}`,
        38,
        y + 12,
      );
      doc.text(`Status: ${student.status}`, 38, y + 19);
      doc.rect(154, y + 5, 4, 4);
      doc.text("Checked", 160, y + 8);
      doc.line(14, y + 29, 196, y + 29);
    }
    download(
      `${filename}-checking-sheet.pdf`,
      doc.output("blob"),
      "application/pdf",
    );
    return;
  }

  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  const columns = [
    "SRNO",
    "PHOTO",
    "NAME",
    "PREFIXF",
    "FATHER",
    "PREFIXM",
    "MOTHER",
    "DOB",
    "CLASS",
    "SECTION",
    "MOBILE",
    "ADDRESS",
    "ADMNO",
    "SRN",
    "EMAIL",
    "GENDER",
    "ADMDATE",
    "BLOOD",
    "TRANSPORT",
  ];
  const keys = [
    "name",
    "fatherPrefix",
    "father",
    "motherPrefix",
    "mother",
    "dob",
    "classNo",
    "section",
    "phone",
    "address",
    "admission",
    "srn",
    "email",
    "gender",
    "admissionDate",
    "blood",
    "transport",
  ];
  const sorted = [...rows].sort(
    (a, b) =>
      String(a.classNo || "").localeCompare(String(b.classNo || ""), "en", {
        numeric: true,
      }) ||
      String(a.section || "").localeCompare(String(b.section || "")) ||
      a.name.localeCompare(b.name),
  );
  const used = new Set();
  const exportRows = sorted.map((student, index) => {
    const stem = (
      photoNumber(student.photoNo || student.admission || student.id) ||
      String(index + 1)
    ).replace(/[^a-z0-9_-]/gi, "_");
    let photo = stem;
    let suffix = 2;
    while (used.has(photo)) photo = `${stem}-${suffix++}`;
    used.add(photo);
    return {
      student,
      photo,
      row: [
        index + 1,
        photo,
        ...keys.map((key) => student[key] || ""),
        ...customFields.map(({ id }) => student.custom?.[id] || ""),
      ],
    };
  });
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      [...columns, ...customFields.map(({ name }) => name)],
      ...exportRows.map(({ row }) => row),
    ]),
    "Students",
  );
  const spreadsheet = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  if (format === "excel") {
    download(
      `${filename}-students.xlsx`,
      spreadsheet,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    return;
  }

  const { zipSync } = await import("fflate");
  const contents = { "students.xlsx": new Uint8Array(spreadsheet) };
  for (const { student, photo: basename } of exportRows) {
    if (!student.photo) continue;
    const photo = await rasterPhoto(student.photo).catch(() => null);
    if (!photo) continue;
    const bytes = await (await fetch(photo)).arrayBuffer();
    contents[`photos/${basename}.jpg`] = new Uint8Array(bytes);
  }
  download(
    `${filename}-students-and-photos.zip`,
    zipSync(contents, { level: 0 }),
    "application/zip",
  );
}

export const batchSession = (batch) =>
  batch.session ||
  batch.snapshot?.[0]?.session ||
  batch.staffSnapshot?.[0]?.session ||
  academicYear(new Date(batch.date));

export function printRounds(batches, school, session, kind) {
  const allowed =
    school[kind === "staff" ? "staffRounds" : "studentRounds"] ?? 3;
  const used = batches.filter(
    (batch) =>
      batch.school === school.id &&
      batchSession(batch) === session &&
      batch.status !== "Cancelled" &&
      (batch.kind
        ? batch.kind === kind
        : kind === "staff"
          ? batch.staffIds?.length || batch.staffSnapshot?.length
          : batch.studentIds?.length ||
            batch.snapshot?.length ||
            (!batch.staffIds?.length && !batch.staffSnapshot?.length)),
  ).length;
  return { allowed, used, remaining: Math.max(0, allowed - used) };
}

export function sessionsFor(data, schoolId) {
  return data.schoolSessions?.[schoolId] || data.sessions;
}

export function currentSession(data, schoolId) {
  const list = sessionsFor(data, schoolId);
  return (
    list.find((session) => session.active)?.name ||
    list[0]?.name ||
    academicYear()
  );
}

// ---- Merged from the preview branch (phone preview helpers) ----
/** Names are printed in capitals on ID cards. */
const upper = (v) => String(v || "").replace(/\s+/g, " ").trim().toUpperCase();

function importPrefix(key, value = "") {
  const comparable = (text) =>
    text.toLowerCase().replaceAll(".", "").replace(/\s+/g, " ").trim();
  return (
    PARENT_PREFIXES[key].find(
      (option) => comparable(option) === comparable(value),
    ) || value
  );
}

export function sheetDate(value) {
  if (value instanceof Date)
    return Number.isNaN(+value) ? "" : value.toISOString().slice(0, 10);
  const input = String(value ?? "").trim();
  if (/^\d{5}(?:\.\d+)?$/.test(input)) {
    let days = Math.floor(Number(input));
    return new Date(Date.UTC(1899, 11, 30) + days * 86400000)
      .toISOString()
      .slice(0, 10);
  }
  const dmy = input.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/);
  const iso = dmy
    ? `${dmy[3].length === 2 ? "20" + dmy[3] : dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`
    : input.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const date = new Date(iso + "T00:00:00Z");
  return !Number.isNaN(+date) && date.toISOString().slice(0, 10) === iso
    ? iso
    : "";
}

function identityKey(student) {
  const norm = (value) =>
    String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]/gu, "");
  if (!student.father && !student.dob) return "";
  return [
    norm(student.name),
    norm(student.father),
    sheetDate(student.dob),
  ].join("|");
}

export function parseImport(
  rows,
  school,
  existing,
  session = "2026–27",
  customFields = [],
) {
  let duplicates = 0,
    invalid = 0;
  const pool = existing.filter(
    (s) => s.school === school && s.session === session,
  );
  const seen = new Set(
    pool
      .map((s) =>
        String(s.admission || "")
          .trim()
          .toLowerCase(),
      )
      .filter(Boolean),
  );
  const identities = new Set(pool.map(identityKey).filter(Boolean));
  const students = [];
  const normalize = (heading) =>
    heading.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const row of rows) {
    const r = Object.fromEntries(
      Object.entries(row).map(([k, v]) => [
        normalize(k),
        String(v ?? "").trim(),
      ]),
    );
    const name = r.name || r.studentname || r.fullname;
    const admission =
      r.admission || r.admissionnumber || r.admissionno || r.admno;
    const email = r.email || r.emailaddress;
    const classNo = r.class || r.classno || r.classname;
    if (
      !name ||
      (!classNo && !admission) ||
      (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    ) {
      invalid++;
      continue;
    }
    const candidate = {
      id: uid("ST"),
      school,
      name: upper(name),
      admission: admission || "",
      photoNo: photoNumber(r.photo || r.photono || r.photonumber),
      srn: r.srn || "",
      email: email || "",
      phone: (
        r.phone ||
        r.contactnumber ||
        r.contactno ||
        r.mobilenumber ||
        r.mobile ||
        ""
      )
        .replace(/\D/g, "")
        .slice(-10),
      classNo: classNo || "6",
      section: (r.section || "").toUpperCase(),
      // An empty prefix defaults to Mr. / Mrs. when the parent's name is given.
      fatherPrefix: importPrefix(
        "fatherPrefix",
        r.prefixf || r.fatherprefix || r.prefixfather || (r.father || r.fathername || r.fathersname ? "Mr." : ""),
      ),
      father: upper(r.father || r.fathername || r.fathersname || ""),
      motherPrefix: importPrefix(
        "motherPrefix",
        r.prefixm || r.motherprefix || r.prefixmother || (r.mother || r.mothername || r.mothersname ? "Mrs." : ""),
      ),
      mother: upper(r.mother || r.mothername || r.mothersname || ""),
      address: r.address || r.residentialaddress || "",
      gender: r.gender || "",
      dob: sheetDate(r.dob || r.dateofbirth),
      blood: (r.blood || r.bloodgroup || "").replace("-", "−"),
      admissionDate: sheetDate(r.admissiondate || r.admdate),
      transport: r.transport || r.transportroute || "",
      status: "Draft",
      active: true,
      photo: "",
      photoSource: "",
      session,
      custom: Object.fromEntries(
        customFields.map(({ id, name }) => [id, r[normalize(name)] || ""]),
      ),
    };
    const admissionKey = candidate.admission.toLowerCase();
    const identity = identityKey(candidate);
    if (
      (admissionKey && seen.has(admissionKey)) ||
      (identity && identities.has(identity))
    ) {
      duplicates++;
      continue;
    }
    if (admissionKey) seen.add(admissionKey);
    if (identity) identities.add(identity);
    students.push(candidate);
  }
  return { students, duplicates, invalid };
}
