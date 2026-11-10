import type { Student, StudentStatus } from "@prisma/client";
import { z } from "zod";
import { FATHER_PREFIXES, MOTHER_PREFIXES, type ResolvedField } from "./fields.js";
import { clean, dedupeKey, keep, fatherPrefix, isoDate, motherPrefix, normalizePhone, parseDate, validPhone } from "./normalize.js";
import { fileUrl } from "./storage.js";
import { prisma, type Tx } from "./db.js";

export const STUDENT_STATUS_LABEL: Record<StudentStatus, string> = {
  DRAFT: "Draft",
  INVITED: "Invited",
  IN_REVIEW: "In review",
  CHANGES_REQUESTED: "Changes requested",
  APPROVED: "Approved",
  SUBMITTED_FOR_PRINT: "Submitted for print",
};

export async function serializeStudent(s: Student) {
  return {
    id: s.id,
    code: s.code,
    schoolId: s.schoolId,
    session: s.session,
    className: s.className,
    section: s.section,
    name: s.name,
    admissionNo: s.admissionNo,
    srn: s.srn,
    photoNo: s.photoNo,
    rollNo: s.rollNo,
    fatherPrefix: s.fatherPrefix,
    fatherName: s.fatherName,
    motherPrefix: s.motherPrefix,
    motherName: s.motherName,
    dob: isoDate(s.dob),
    gender: s.gender,
    email: s.email,
    phone: s.phone,
    address: s.address,
    admissionDate: isoDate(s.admissionDate),
    bloodGroup: s.bloodGroup,
    transport: s.transport,
    extra: s.extra as Record<string, string>,
    status: s.status,
    active: s.active,
    photoUrl: await fileUrl(s.photoKey),
    photoSource: s.photoSource,
    photoCapturedAt: s.photoCapturedAt,
    invitedAt: s.invitedAt,
    submittedAt: s.submittedAt,
    approvedAt: s.approvedAt,
    reviewNote: s.reviewNote,
    version: s.version,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

const text = (max = 120) => z.string().max(max).optional().nullable().transform(keep((v) => clean(v) ?? null));

/** Input accepted from staff screens and from the student portal. */
export const studentInput = z.object({
  name: z.string().trim().min(2, "Enter the student's full name.").max(120).optional(),
  className: z.string().trim().min(1).max(30).optional(),
  section: text(10),
  admissionNo: text(40),
  srn: text(40),
  photoNo: z.string().max(60).optional().nullable().transform(keep((v) => clean(v)?.replace(/[^A-Za-z0-9_.-]/g, "_") ?? null)),
  rollNo: text(20),
  fatherPrefix: text(20).transform((v) => (v === undefined ? undefined : (fatherPrefix(v ?? undefined) ?? null))),
  fatherName: text(),
  motherPrefix: text(20).transform((v) => (v === undefined ? undefined : (motherPrefix(v ?? undefined) ?? null))),
  motherName: text(),
  dob: z.string().optional().nullable(),
  gender: z.enum(["Male", "Female", "Other"]).optional().nullable(),
  email: z.string().email("Enter a valid email address.").optional().nullable().or(z.literal("")).transform(keep((v) => (v ? v.toLowerCase() : null))),
  phone: z.string().optional().nullable().transform(keep((v) => normalizePhone(v ?? undefined) ?? null)).refine((v) => validPhone(v ?? undefined), "Enter a valid 10-digit mobile number."),
  address: text(300),
  admissionDate: z.string().optional().nullable(),
  bloodGroup: z.enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]).optional().nullable().or(z.literal("").transform(() => null)),
  transport: text(80),
  extra: z.record(z.string(), z.string().max(200)).optional(),
  active: z.boolean().optional(),
  session: z.string().max(20).optional(),
  version: z.number().int().optional(),
});
export type StudentInput = z.infer<typeof studentInput>;

export function toData(input: StudentInput) {
  const { dob, admissionDate, version: _v, ...rest } = input;
  const data: Record<string, unknown> = { ...rest };
  if (dob !== undefined) {
    const d = parseDate(dob);
    if (dob && !d) throw Object.assign(new Error("Enter the date of birth as DD-MM-YYYY."), { statusCode: 400 });
    if (d && d > new Date()) throw Object.assign(new Error("Date of birth cannot be in the future."), { statusCode: 400 });
    data.dob = d ?? null;
  }
  if (admissionDate !== undefined) data.admissionDate = parseDate(admissionDate) ?? null;
  for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k];
  return data;
}

/** Missing required fields (per the school's settings) for a student record. */
export function missingFields(s: Partial<Student>, fields: ResolvedField[], needPhoto = true) {
  const missing: string[] = [];
  for (const f of fields) {
    if (!f.enabled || !f.required) continue;
    const v = f.custom ? (s.extra as Record<string, string> | undefined)?.[f.key] : (s as Record<string, unknown>)[f.key];
    if (v === null || v === undefined || String(v).trim() === "") missing.push(f.label);
  }
  if (needPhoto && !s.photoKey) missing.push("Photo");
  return missing;
}

/** Finds an existing record that would duplicate this one (change sheet #16). */
export async function findDuplicate(
  db: Tx | typeof prisma,
  schoolId: string,
  session: string,
  s: { admissionNo?: string | null; name?: string | null; fatherName?: string | null; dob?: Date | null; className?: string | null },
  excludeId?: string,
) {
  if (s.admissionNo) {
    const hit = await db.student.findFirst({ where: { schoolId, session, admissionNo: s.admissionNo, deletedAt: null, NOT: excludeId ? { id: excludeId } : undefined }, select: { id: true, name: true, code: true } });
    if (hit) return { ...hit, reason: `Admission number ${s.admissionNo} is already used by ${hit.name}.` };
  }
  if (s.name && (s.fatherName || s.dob)) {
    const candidates = await db.student.findMany({
      where: { schoolId, session, deletedAt: null, name: { equals: s.name, mode: "insensitive" }, NOT: excludeId ? { id: excludeId } : undefined },
      select: { id: true, name: true, code: true, fatherName: true, dob: true, className: true },
    });
    const key = dedupeKey(s);
    const hit = candidates.find((c) => dedupeKey(c) === key && (!s.className || c.className === s.className || key.split("|").filter(Boolean).length >= 3));
    if (hit) return { id: hit.id, name: hit.name, code: hit.code, reason: `${hit.name} with the same parent and date of birth already exists.` };
  }
  return null;
}

export const PREFIXES = { father: FATHER_PREFIXES, mother: MOTHER_PREFIXES };
