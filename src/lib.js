import { createSeed, STORAGE_KEY } from "./data.js";
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
  const entry = /^\/app\/?$/.test(window.location.pathname) ? "/app" : "/";
  return `${window.location.origin}${entry}?panel=student&student=${encodeURIComponent(id)}&token=demo-${encodeURIComponent(id)}`;
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
export function parseImport(rows, school, existing) {
  let duplicates = 0,
    invalid = 0;
  const seen = new Set(
    existing.filter((s) => s.school === school).map((s) => String(s.admission)),
  );
  const students = [];
  for (const row of rows) {
    const r = Object.fromEntries(
      Object.entries(row).map(([k, v]) => [
        k.toLowerCase().replace(/[^a-z]/g, ""),
        String(v ?? "").trim(),
      ]),
    );
    const name = r.name || r.studentname;
    const admission = r.admission || r.admissionnumber || r.admissionno;
    const email = r.email || r.emailaddress;
    if (
      !name ||
      !admission ||
      !email ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      invalid++;
      continue;
    }
    if (seen.has(admission)) {
      duplicates++;
      continue;
    }
    seen.add(admission);
    students.push({
      id: uid("ST"),
      school,
      name,
      admission,
      email,
      phone: r.phone || r.contactnumber || "",
      classNo: r.class || r.classno || "6",
      section: r.section || "A",
      father: r.father || r.fathername || "",
      mother: r.mother || r.mothername || "",
      address: r.address || "",
      status: "Draft",
      active: true,
      photo: "",
      photoSource: "",
      session: "2026–27",
      custom: {},
    });
  }
  return { students, duplicates, invalid };
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
