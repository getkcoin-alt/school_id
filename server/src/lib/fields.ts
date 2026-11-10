import type { Audience } from "@prisma/client";
import { prisma, type Tx } from "./db.js";

export interface FieldDef {
  key: string;
  label: string;
  type: string;
  enabled: boolean;
  required: boolean;
  /** Locked fields are always printed and always required. */
  locked?: boolean;
  /** Spreadsheet header used by the ID Card Studio sample sheet. */
  column: string;
  aliases?: string[];
}

export const FATHER_PREFIXES = ["Mr.", "Sh.", "Dr.", "Md.", "Late Sh."];
export const MOTHER_PREFIXES = ["Mrs.", "Smt.", "Dr.", "Ms.", "Late Smt."];

// Order follows the agreed export: Sr. No., Photo No., Student Name, Prefix (Father),
// Father Name, Prefix (Mother), Mother Name, Date of Birth, Class, Contact No., Address.
export const STUDENT_FIELDS: FieldDef[] = [
  { key: "photoNo", label: "Photo No.", type: "text", enabled: true, required: false, column: "PHOTO", aliases: ["photono", "photonumber", "imagename", "image"] },
  { key: "name", label: "Student Name", type: "text", enabled: true, required: true, locked: true, column: "NAME", aliases: ["studentname", "fullname"] },
  { key: "fatherPrefix", label: "Prefix (Father)", type: "fatherPrefix", enabled: true, required: false, column: "PREFIXF", aliases: ["fatherprefix", "prefixfather"] },
  { key: "fatherName", label: "Father Name", type: "text", enabled: true, required: true, column: "FATHER", aliases: ["fathername", "fathersname"] },
  { key: "motherPrefix", label: "Prefix (Mother)", type: "motherPrefix", enabled: true, required: false, column: "PREFIXM", aliases: ["motherprefix", "prefixmother"] },
  { key: "motherName", label: "Mother Name", type: "text", enabled: true, required: false, column: "MOTHER", aliases: ["mothername", "mothersname"] },
  { key: "dob", label: "Date of Birth", type: "date", enabled: true, required: false, column: "DOB", aliases: ["dateofbirth", "birthdate"] },
  { key: "className", label: "Class", type: "class", enabled: true, required: true, locked: true, column: "CLASS", aliases: ["classno", "classname", "standard"] },
  { key: "section", label: "Section", type: "section", enabled: true, required: false, column: "SECTION", aliases: ["sec", "div", "division"] },
  { key: "phone", label: "Contact No.", type: "tel", enabled: true, required: false, column: "MOBILE", aliases: ["contactno", "contactnumber", "phone", "mobileno", "mobilenumber"] },
  { key: "address", label: "Address", type: "text", enabled: true, required: false, column: "ADDRESS", aliases: ["residentialaddress"] },
  { key: "admissionNo", label: "Admission No.", type: "text", enabled: true, required: false, column: "ADMNO", aliases: ["admission", "admissionno", "admissionnumber", "admno", "studentid"] },
  { key: "srn", label: "SRN", type: "text", enabled: true, required: false, column: "SRN", aliases: ["srnno", "registrationno"] },
  { key: "rollNo", label: "Roll No.", type: "text", enabled: false, required: false, column: "ROLLNO", aliases: ["roll", "rollnumber"] },
  { key: "gender", label: "Gender", type: "gender", enabled: false, required: false, column: "GENDER", aliases: ["sex"] },
  { key: "email", label: "Email", type: "email", enabled: true, required: false, column: "EMAIL", aliases: ["emailid", "emailaddress", "mail"] },
  { key: "admissionDate", label: "Date of Admission", type: "date", enabled: false, required: false, column: "ADMDATE", aliases: ["admissiondate", "dateofadmission"] },
  { key: "bloodGroup", label: "Blood Group", type: "blood", enabled: false, required: false, column: "BLOOD", aliases: ["blood", "bloodgroup"] },
  { key: "transport", label: "Transport Route", type: "text", enabled: false, required: false, column: "TRANSPORT", aliases: ["route", "transportroute", "busroute"] },
];

export const STAFF_FIELDS: FieldDef[] = [
  { key: "name", label: "Full name", type: "text", enabled: true, required: true, locked: true, column: "NAME" },
  { key: "role", label: "Staff role", type: "role", enabled: true, required: true, column: "DESIGNATION" },
  { key: "phone", label: "Contact No.", type: "tel", enabled: true, required: false, column: "MOBILE" },
  { key: "email", label: "Email", type: "email", enabled: true, required: false, column: "EMAIL" },
  { key: "address", label: "Address", type: "text", enabled: true, required: false, column: "ADDRESS" },
  { key: "gender", label: "Gender", type: "gender", enabled: false, required: false, column: "GENDER" },
  { key: "dob", label: "Date of Birth", type: "date", enabled: false, required: false, column: "DOB" },
  { key: "className", label: "Class", type: "class", enabled: false, required: false, column: "CLASS" },
  { key: "section", label: "Section", type: "section", enabled: false, required: false, column: "SECTION" },
];

export const builtIn = (audience: Audience) => (audience === "STAFF" ? STAFF_FIELDS : STUDENT_FIELDS);

export async function seedSchoolFields(tx: Tx, schoolId: string) {
  const rows = [
    ...STUDENT_FIELDS.map((f, i) => ({ schoolId, audience: "STUDENT" as const, key: f.key, label: f.label, type: f.type, enabled: f.enabled, required: f.required, sortOrder: i })),
    ...STAFF_FIELDS.map((f, i) => ({ schoolId, audience: "STAFF" as const, key: f.key, label: f.label, type: f.type, enabled: f.enabled, required: f.required, sortOrder: i })),
  ];
  await tx.schoolField.createMany({ data: rows, skipDuplicates: true });
}

export interface ResolvedField {
  key: string;
  label: string;
  type: string;
  enabled: boolean;
  required: boolean;
  custom: boolean;
  locked: boolean;
  column: string;
  aliases: string[];
}

/** The school's field configuration merged with built-in definitions, in print order. */
export async function schoolFields(schoolId: string, audience: Audience = "STUDENT", db: Tx | typeof prisma = prisma): Promise<ResolvedField[]> {
  const rows = await db.schoolField.findMany({ where: { schoolId, audience }, orderBy: { sortOrder: "asc" } });
  const defs = builtIn(audience);
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const out: (ResolvedField & { order: number })[] = [];
  for (const [i, d] of defs.entries()) {
    const r = byKey.get(d.key);
    out.push({
      key: d.key,
      label: r?.label ?? d.label,
      type: d.type,
      enabled: d.locked ? true : (r?.enabled ?? d.enabled),
      required: d.locked ? true : (r ? r.enabled && r.required : d.required),
      custom: false,
      locked: Boolean(d.locked),
      column: d.column,
      aliases: d.aliases ?? [],
      order: r?.sortOrder ?? 1000 + i,
    });
  }
  for (const r of rows.filter((x) => x.custom)) {
    out.push({ key: r.key, label: r.label, type: r.type, enabled: r.enabled, required: r.enabled && r.required, custom: true, locked: false, column: r.label.toUpperCase(), aliases: [r.label.toLowerCase().replace(/[^a-z0-9]/g, "")], order: r.sortOrder });
  }
  return out.sort((a, b) => a.order - b.order).map(({ order: _o, ...f }) => f);
}
