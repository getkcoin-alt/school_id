import {
  createSeed,
  STORAGE_KEY,
  FIELDS,
  LOCKED_FIELDS,
  FATHER_PREFIXES,
  MOTHER_PREFIXES,
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
    "\uFEFF" +
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
const norm = (v) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const sameChild = (a, b) =>
  norm(a.name) === norm(b.name) &&
  norm(a.father) === norm(b.father) &&
  (a.dob || "") === (b.dob || "");
/** Excel serial numbers and DD/MM/YYYY become ISO dates. */
export function sheetDate(v) {
  if (v === undefined || v === null || v === "") return "";
  if (typeof v === "number" && v > 1000 && v < 80000)
    return new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10);
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : "";
}
/**
 * Reads the agreed upload sheet (SRNO, PHOTO, NAME, PREFIXF, FATHER, PREFIXM, MOTHER,
 * DOB, CLASS, SECTION, MOBILE, ADDRESS, ADMNO, SRN) and older templates. Duplicates
 * by admission number, or by name + father + date of birth, are skipped.
 */
export function parseImport(rows, school, existing, session = "2026–27") {
  let duplicates = 0,
    invalid = 0;
  const pool = existing.filter((s) => s.school === school);
  const seen = new Set(pool.map((s) => String(s.admission)).filter(Boolean));
  const students = [];
  for (const row of rows) {
    const r = Object.fromEntries(
      Object.entries(row).map(([k, v]) => [
        k.toLowerCase().replace(/[^a-z]/g, ""),
        v,
      ]),
    );
    const t = (...keys) => {
      for (const k of keys) {
        const v = r[k];
        if (v !== undefined && String(v).trim() !== "") return String(v).trim();
      }
      return "";
    };
    const name = t("name", "studentname");
    const admission = t("admno", "admission", "admissionnumber", "admissionno");
    const email = t("email", "emailaddress");
    const classNo = t("class", "classno");
    if (!name || !classNo || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      invalid++;
      continue;
    }
    const student = {
      id: uid("ST"),
      school,
      name,
      admission,
      email,
      photoNo: t("photo", "photono"),
      fatherPrefix: t("prefixf", "fatherprefix"),
      father: t("father", "fathername"),
      motherPrefix: t("prefixm", "motherprefix"),
      mother: t("mother", "mothername"),
      dob: sheetDate(r.dob ?? r.dateofbirth),
      phone: t("mobile", "phone", "contactnumber", "contactno").replace(/\D/g, "").slice(-10),
      classNo,
      section: t("section").toUpperCase(),
      address: t("address"),
      srn: t("srn"),
      status: "Draft",
      active: true,
      photo: "",
      photoSource: "",
      session,
      custom: {},
    };
    if ((admission && seen.has(admission)) || [...pool, ...students].some((s) => (s.father || s.dob) && sameChild(s, student))) {
      duplicates++;
      continue;
    }
    if (admission) seen.add(admission);
    students.push(student);
  }
  return { students, duplicates, invalid };
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
      ["Date of birth", s.dob],
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
export const STAGES = ["In progress", "Printed", "Delivered"];

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
