import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import ExcelJS from "exceljs";
import { z } from "zod";
import { prisma, nextCode, nextCodes } from "../lib/db.js";
import { badRequest, conflict, notFound } from "../lib/errors.js";
import { accessSchool, can, principal, require, schoolWhere, targetSchool } from "../lib/access.js";
import { audit } from "../lib/audit.js";
import { schoolFields, STUDENT_FIELDS } from "../lib/fields.js";
import { findDuplicate, missingFields, serializeStudent, studentInput, toData } from "../lib/students.js";
import { buildChecklist, buildWorkbook, zipWithPhotos, type PrintRecord } from "../lib/exporter.js";
import { studentImpact } from "../lib/impact.js";
import { cellText, dedupeKey, headerKey, parseDate } from "../lib/normalize.js";
import { normalisePhoto } from "../lib/images.js";
import { storage } from "../lib/storage.js";
import { readMultipart } from "../lib/upload.js";
import { emailInvitation, issueInvitation } from "../lib/invitations.js";

const listQuery = z.object({
  schoolId: z.string().optional(),
  session: z.string().optional(),
  className: z.string().optional(),
  section: z.string().optional(),
  status: z.enum(["DRAFT", "INVITED", "IN_REVIEW", "CHANGES_REQUESTED", "APPROVED", "SUBMITTED_FOR_PRINT"]).optional(),
  statuses: z.string().optional(),
  search: z.string().optional(),
  active: z.enum(["true", "false"]).optional(),
  hasPhoto: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(1000).default(50),
});

async function scopedWhere(p: ReturnType<typeof principal>, q: z.infer<typeof listQuery>) {
  const school = await targetSchool(p, q.schoolId);
  const where: Prisma.StudentWhereInput = {
    schoolId: school.id,
    session: q.session ?? school.currentSession ?? undefined,
    deletedAt: null,
    className: q.className || undefined,
    section: q.section || undefined,
    status: q.status ?? (q.statuses ? { in: q.statuses.split(",") as never } : undefined),
    active: q.active ? q.active === "true" : undefined,
    photoKey: q.hasPhoto === "true" ? { not: null } : q.hasPhoto === "false" ? null : undefined,
  };
  if (q.search) {
    where.OR = [
      { name: { contains: q.search, mode: "insensitive" } },
      { admissionNo: { contains: q.search, mode: "insensitive" } },
      { code: { contains: q.search, mode: "insensitive" } },
      { fatherName: { contains: q.search, mode: "insensitive" } },
      { phone: { contains: q.search } },
    ];
  }
  return { school, where };
}

async function loadStudent(p: ReturnType<typeof principal>, id: string) {
  const s = await prisma.student.findFirst({ where: { OR: [{ id }, { code: id }], deletedAt: null, school: schoolWhere(p) } });
  if (!s) throw notFound("Student");
  return s;
}

async function ensureClass(schoolId: string, className: string, section?: string | null) {
  const cls = await prisma.schoolClass.upsert({
    where: { schoolId_name: { schoolId, name: className } },
    create: { schoolId, name: className, sortOrder: 999 },
    update: {},
  });
  if (section) await prisma.section.upsert({ where: { classId_name: { classId: cls.id, name: section } }, create: { classId: cls.id, name: section }, update: {} });
}

export async function studentRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const p = principal(req);
    const q = listQuery.parse(req.query);
    const { where } = await scopedWhere(p, q);
    const [total, rows, byStatus] = await Promise.all([
      prisma.student.count({ where }),
      prisma.student.findMany({ where, orderBy: [{ className: "asc" }, { section: "asc" }, { name: "asc" }], skip: (q.page - 1) * q.size, take: q.size }),
      prisma.student.groupBy({ by: ["status"], where: { ...where, status: undefined }, _count: true }),
    ]);
    return {
      items: await Promise.all(rows.map(serializeStudent)),
      total,
      page: q.page,
      size: q.size,
      counts: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
    };
  });

  app.get("/:id", async (req) => {
    const s = await loadStudent(principal(req), (req.params as { id: string }).id);
    const invitations = await prisma.invitation.findMany({ where: { studentId: s.id }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, channel: true, sentTo: true, createdAt: true, expiresAt: true, openedAt: true, submittedAt: true, revokedAt: true } });
    return { ...(await serializeStudent(s)), invitations };
  });

  app.post("/", async (req) => {
    const p = principal(req);
    require(can.editStudents(p));
    const body = studentInput.extend({ schoolId: z.string().optional(), name: z.string().trim().min(2, "Enter the student's full name."), className: z.string().trim().min(1, "Choose a class.") }).parse(req.body);
    const school = await targetSchool(p, body.schoolId);
    const { schoolId: _s, ...input } = body;
    const data = toData(input);
    const session = (input.session as string) ?? school.currentSession!;
    const dup = await findDuplicate(prisma, school.id, session, { ...data, className: input.className } as never);
    if (dup) throw conflict(dup.reason, { duplicateOf: dup.id });
    await ensureClass(school.id, input.className, input.section);
    const student = await prisma.student.create({
      data: { ...(data as Prisma.StudentUncheckedCreateInput), schoolId: school.id, session, code: await nextCode(prisma, "student", "ST", 6), extra: (input.extra ?? {}) as object },
    });
    await audit(req, { action: "student.created", summary: `${p.name} added ${student.name} (Class ${student.className}${student.section ? "-" + student.section : ""})`, entityType: "student", entityId: student.id, schoolId: school.id });
    return serializeStudent(student);
  });

  app.patch("/:id", async (req) => {
    const p = principal(req);
    require(can.editStudents(p));
    const s = await loadStudent(p, (req.params as { id: string }).id);
    if (s.status === "SUBMITTED_FOR_PRINT" && !can.approve(p)) throw conflict("This card has been sent to print and can no longer be edited.");
    const body = studentInput.parse(req.body);
    if (body.version && body.version !== s.version) throw conflict("Someone else changed this student. Reload to see the latest details.", { version: s.version });
    const data = toData(body);
    const merged = { ...s, ...data };
    const dup = await findDuplicate(prisma, s.schoolId, (data.session as string) ?? s.session, merged as never, s.id);
    if (dup) throw conflict(dup.reason, { duplicateOf: dup.id });
    if (data.className) await ensureClass(s.schoolId, String(data.className), (data.section as string) ?? s.section);
    const updated = await prisma.student.update({
      where: { id: s.id },
      data: { ...(data as Prisma.StudentUncheckedUpdateInput), extra: body.extra ? ({ ...(s.extra as object), ...body.extra } as object) : undefined, version: { increment: 1 } },
    });
    await audit(req, { action: "student.updated", summary: `${p.name} edited ${updated.name}`, entityType: "student", entityId: s.id, schoolId: s.schoolId, meta: { fields: Object.keys(data) } });
    return serializeStudent(updated);
  });

  app.get("/:id/impact", async (req) => {
    const p = principal(req);
    require(can.editStudents(p));
    const s = await loadStudent(p, (req.params as { id: string }).id);
    return studentImpact(s.id);
  });

  app.delete("/:id", async (req) => {
    const p = principal(req);
    require(can.editStudents(p));
    const s = await loadStudent(p, (req.params as { id: string }).id);
    await prisma.student.update({ where: { id: s.id }, data: { deletedAt: new Date(), admissionNo: null } });
    await audit(req, { action: "student.deleted", summary: `${p.name} deleted ${s.name}`, entityType: "student", entityId: s.id, schoolId: s.schoolId });
    return { ok: true };
  });

  app.post("/bulk-delete", async (req) => {
    const p = principal(req);
    require(can.editStudents(p));
    const { ids } = z.object({ ids: z.array(z.string()).min(1).max(1000) }).parse(req.body);
    const rows = await prisma.student.findMany({ where: { id: { in: ids }, deletedAt: null, school: schoolWhere(p) }, select: { id: true, schoolId: true } });
    await prisma.student.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { deletedAt: new Date(), admissionNo: null } });
    if (rows[0]) await audit(req, { action: "student.bulk_deleted", summary: `${p.name} deleted ${rows.length} students`, schoolId: rows[0].schoolId });
    return { deleted: rows.length };
  });

  // ---- Photo: upload/camera capture, or pick from the school's photo library ----
  app.post("/:id/photo", async (req) => {
    const p = principal(req);
    require(can.editStudents(p));
    const s = await loadStudent(p, (req.params as { id: string }).id);
    let key: string, source: "UPLOAD" | "CAMERA" | "LIBRARY";
    if (req.isMultipart()) {
      const { files, fields } = await readMultipart(req);
      if (!files[0]) throw badRequest("Choose a photo to upload.");
      const photo = await normalisePhoto(files[0].buffer, files[0].mimetype);
      key = `schools/${s.schoolId}/students/${s.id}-${photo.checksum.slice(0, 12)}.jpg`;
      await storage.put(key, photo.buffer, photo.mime);
      source = fields.source === "CAMERA" ? "CAMERA" : "UPLOAD";
    } else {
      const { photoAssetId } = z.object({ photoAssetId: z.string() }).parse(req.body);
      const asset = await prisma.photoAsset.findFirst({ where: { id: photoAssetId, schoolId: s.schoolId } });
      if (!asset) throw notFound("Photo");
      key = asset.storageKey;
      source = "LIBRARY";
    }
    const updated = await prisma.student.update({ where: { id: s.id }, data: { photoKey: key, photoSource: source, photoCapturedAt: new Date(), version: { increment: 1 } } });
    await audit(req, { action: "student.photo_updated", summary: `${p.name} updated the photo for ${s.name}`, entityType: "student", entityId: s.id, schoolId: s.schoolId, meta: { source } });
    return serializeStudent(updated);
  });

  // ---- Review (change sheet #13: approval does not need an invitation) ----
  app.post("/approve", async (req) => {
    const p = principal(req);
    require(can.approve(p), "Only the school or a super admin can approve ID card details.");
    const { ids } = z.object({ ids: z.array(z.string()).min(1).max(2000) }).parse(req.body);
    const rows = await prisma.student.findMany({ where: { id: { in: ids }, deletedAt: null, school: schoolWhere(p) } });
    const fieldsBySchool = new Map<string, Awaited<ReturnType<typeof schoolFields>>>();
    const approved: string[] = [], failed: { id: string; name: string; reason: string }[] = [];
    for (const s of rows) {
      if (s.status === "APPROVED" || s.status === "SUBMITTED_FOR_PRINT") {
        failed.push({ id: s.id, name: s.name, reason: s.status === "APPROVED" ? "Already approved." : "Already sent to print." });
        continue;
      }
      if (!fieldsBySchool.has(s.schoolId)) fieldsBySchool.set(s.schoolId, await schoolFields(s.schoolId));
      const missing = missingFields(s, fieldsBySchool.get(s.schoolId)!);
      if (missing.length) failed.push({ id: s.id, name: s.name, reason: `Missing: ${missing.join(", ")}` });
      else approved.push(s.id);
    }
    if (approved.length) {
      await prisma.student.updateMany({ where: { id: { in: approved } }, data: { status: "APPROVED", approvedAt: new Date(), approvedById: p.userId, reviewNote: null, version: { increment: 1 } } });
      await audit(req, { action: "student.approved", summary: `${p.name} approved ${approved.length} ID card${approved.length === 1 ? "" : "s"}`, schoolId: rows[0]?.schoolId, meta: { ids: approved } });
    }
    return { approved: approved.length, approvedIds: approved, failed };
  });

  app.post("/unapprove", async (req) => {
    const p = principal(req);
    require(can.approve(p));
    const { ids } = z.object({ ids: z.array(z.string()).min(1).max(2000) }).parse(req.body);
    const res = await prisma.student.updateMany({ where: { id: { in: ids }, status: "APPROVED", school: schoolWhere(p) }, data: { status: "IN_REVIEW", approvedAt: null, version: { increment: 1 } } });
    return { updated: res.count };
  });

  app.post("/request-changes", async (req) => {
    const p = principal(req);
    require(can.approve(p));
    const { ids, note, notify } = z.object({ ids: z.array(z.string()).min(1).max(500), note: z.string().trim().min(3, "Tell the student what to correct.").max(500), notify: z.boolean().default(true) }).parse(req.body);
    const rows = await prisma.student.findMany({ where: { id: { in: ids }, deletedAt: null, status: { not: "SUBMITTED_FOR_PRINT" }, school: schoolWhere(p) }, include: { school: true } });
    let emailed = 0;
    for (const s of rows) {
      const updated = await prisma.student.update({ where: { id: s.id }, data: { status: "CHANGES_REQUESTED", reviewNote: note, approvedAt: null, version: { increment: 1 } } });
      if (notify && s.email) {
        const { url } = await issueInvitation(updated, { channel: "EMAIL", createdById: p.userId });
        if (await emailInvitation(updated, s.school, url, { correction: note })) emailed++;
      }
    }
    if (rows[0]) await audit(req, { action: "student.changes_requested", summary: `${p.name} asked ${rows.length} student${rows.length === 1 ? "" : "s"} for corrections`, schoolId: rows[0].schoolId, meta: { note } });
    return { updated: rows.length, emailed };
  });

  // ---- Promotion to a new session (history is kept) ----
  app.post("/promote", async (req) => {
    const p = principal(req);
    require(can.editStudents(p));
    const body = z.object({ ids: z.array(z.string()).min(1).max(2000), toSession: z.string().min(4), className: z.string().min(1), section: z.string().optional().nullable() }).parse(req.body);
    const rows = await prisma.student.findMany({ where: { id: { in: body.ids }, deletedAt: null, school: schoolWhere(p) } });
    if (!rows.length) throw notFound("Students");
    const schoolId = rows[0].schoolId;
    if (rows.some((r) => r.schoolId !== schoolId)) throw badRequest("Promote one school at a time.");
    await prisma.academicSession.upsert({ where: { schoolId_name: { schoolId, name: body.toSession } }, create: { schoolId, name: body.toSession }, update: {} });
    await ensureClass(schoolId, body.className, body.section);
    const codes = await nextCodes(prisma, "student", "ST", rows.length);
    let promoted = 0, skipped = 0;
    for (const [i, s] of rows.entries()) {
      if (await findDuplicate(prisma, schoolId, body.toSession, s)) {
        skipped++;
        continue;
      }
      const { id: _id, code: _c, createdAt: _a, updatedAt: _u, version: _v, invitedAt: _i, submittedAt: _sub, approvedAt: _ap, approvedById: _ab, reviewNote: _r, ...rest } = s;
      await prisma.student.create({ data: { ...rest, extra: s.extra as object, code: codes[i], session: body.toSession, className: body.className, section: body.section ?? null, status: "DRAFT", promotedFromId: s.id } });
      promoted++;
    }
    await audit(req, { action: "student.promoted", summary: `${p.name} promoted ${promoted} students to Class ${body.className}${body.section ? "-" + body.section : ""} for ${body.toSession}`, schoolId, meta: { skipped } });
    return { promoted, skipped };
  });

  // ---- Import: JSON rows (browser-parsed, any Excel format) or an uploaded XLSX/CSV ----
  app.post("/import", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req) => {
    const p = principal(req);
    require(can.editStudents(p));
    let rows: Record<string, unknown>[], opts: { schoolId?: string; className?: string; section?: string; session?: string };
    if (req.isMultipart()) {
      const { files, fields } = await readMultipart(req);
      if (!files[0]) throw badRequest("Choose an Excel or CSV file.");
      rows = await parseSheet(files[0].buffer, files[0].filename);
      opts = fields;
    } else {
      const body = z.object({ rows: z.array(z.record(z.string(), z.unknown())).max(10000), schoolId: z.string().optional(), className: z.string().optional(), section: z.string().optional(), session: z.string().optional() }).parse(req.body);
      rows = body.rows;
      opts = body;
    }
    const school = await targetSchool(p, opts.schoolId);
    const session = opts.session || school.currentSession!;
    const fields = await schoolFields(school.id);
    const lookup = new Map<string, string>();
    for (const f of [...STUDENT_FIELDS, ...fields]) {
      const def = fields.find((x) => x.key === f.key) ?? f;
      for (const k of [f.key, f.column, f.label, ...(f.aliases ?? [])]) lookup.set(headerKey(k), def.key);
    }
    const customKeys = new Set(fields.filter((f) => f.custom).map((f) => f.key));

    const existing = await prisma.student.findMany({ where: { schoolId: school.id, session, deletedAt: null }, select: { admissionNo: true, name: true, fatherName: true, dob: true } });
    const seenAdm = new Set(existing.map((e) => e.admissionNo).filter(Boolean) as string[]);
    const seenKey = new Set(existing.filter((e) => e.fatherName || e.dob).map(dedupeKey));
    const library = new Map((await prisma.photoAsset.findMany({ where: { schoolId: school.id }, select: { fileName: true, storageKey: true } })).map((a) => [a.fileName.replace(/\.[^.]+$/, "").toUpperCase(), a.storageKey]));

    const toCreate: Prisma.StudentCreateManyInput[] = [];
    const skipped: { row: number; name?: string; reason: string }[] = [];
    const invalid: { row: number; name?: string; reason: string }[] = [];
    for (const [i, raw] of rows.entries()) {
      const rowNo = i + 2;
      const mapped: Record<string, unknown> = {}, extra: Record<string, string> = {};
      for (const [h, v] of Object.entries(raw)) {
        const key = lookup.get(headerKey(h));
        if (!key) continue;
        const value = key === "dob" || key === "admissionDate" ? (parseDate(v) ? parseDate(v)!.toISOString().slice(0, 10) : cellText(v)) : cellText(v);
        if (customKeys.has(key)) {
          if (value) extra[key] = String(value);
        } else mapped[key] = value ?? null;
      }
      if (!mapped.className && opts.className) mapped.className = opts.className;
      if (!mapped.section && opts.section) mapped.section = opts.section;
      if (Object.values(mapped).every((v) => v === null || v === undefined)) continue;
      if (mapped.gender) mapped.gender = /^f/i.test(String(mapped.gender)) ? "Female" : /^m/i.test(String(mapped.gender)) ? "Male" : "Other";
      if (mapped.section) mapped.section = String(mapped.section).toUpperCase();
      const parsed = studentInput.extend({ name: z.string().trim().min(2, "Name is missing."), className: z.string().trim().min(1, "Class is missing.") }).safeParse({ ...mapped, extra });
      if (!parsed.success) {
        invalid.push({ row: rowNo, name: mapped.name as string, reason: parsed.error.issues[0].message });
        continue;
      }
      let data: Record<string, unknown>;
      try {
        data = toData(parsed.data);
      } catch (e) {
        invalid.push({ row: rowNo, name: parsed.data.name, reason: (e as Error).message });
        continue;
      }
      const adm = data.admissionNo as string | undefined;
      const key = dedupeKey(data as never);
      if (adm && seenAdm.has(adm)) {
        skipped.push({ row: rowNo, name: parsed.data.name, reason: `Admission number ${adm} already exists.` });
        continue;
      }
      if ((data.fatherName || data.dob) && seenKey.has(key)) {
        skipped.push({ row: rowNo, name: parsed.data.name, reason: "Same student, parent and date of birth already exists." });
        continue;
      }
      if (adm) seenAdm.add(adm);
      if (data.fatherName || data.dob) seenKey.add(key);
      const photoKey = data.photoNo ? library.get(String(data.photoNo).toUpperCase()) : undefined;
      toCreate.push({
        ...(data as Prisma.StudentCreateManyInput),
        extra: extra as object,
        schoolId: school.id,
        session,
        code: "",
        photoKey,
        photoSource: photoKey ? "LIBRARY" : undefined,
      });
    }
    const classes = new Map<string, Set<string>>();
    for (const r of toCreate) {
      if (!classes.has(r.className)) classes.set(r.className, new Set());
      if (r.section) classes.get(r.className)!.add(r.section);
    }
    for (const [c, secs] of classes) {
      await ensureClass(school.id, c);
      for (const s of secs) await ensureClass(school.id, c, s);
    }
    const codes = await nextCodes(prisma, "student", "ST", toCreate.length);
    toCreate.forEach((r, i) => (r.code = codes[i]));
    for (let i = 0; i < toCreate.length; i += 500) await prisma.student.createMany({ data: toCreate.slice(i, i + 500) });
    await audit(req, {
      action: "student.imported",
      summary: `${p.name} imported ${toCreate.length} students into ${school.name} (${skipped.length} duplicates skipped, ${invalid.length} rows need fixing)`,
      schoolId: school.id,
      meta: { created: toCreate.length, skipped: skipped.length, invalid: invalid.length },
    });
    return { created: toCreate.length, withPhoto: toCreate.filter((r) => r.photoKey).length, skipped, invalid };
  });

  // ---- Downloads (regular agents have no download access) ----
  app.get("/template.xlsx", async (req, reply) => {
    const p = principal(req);
    const q = z.object({ schoolId: z.string().optional() }).parse(req.query);
    const fields = q.schoolId || p.schoolId ? await schoolFields((await targetSchool(p, q.schoolId)).id) : (await import("../lib/fields.js")).STUDENT_FIELDS.map((f) => ({ ...f, custom: false, locked: Boolean(f.locked), aliases: f.aliases ?? [] }));
    const sample: PrintRecord = { code: "ST-000001", name: "ADITYA", photoNo: "DSC_0101", fatherPrefix: "Mr.", fatherName: "SUNIL", motherPrefix: "Mrs.", motherName: "POONAM", dob: "2015-12-09", className: "VII", section: "A", phone: "9494949494", address: "SONIPAT", admissionNo: "9196", srn: "2002510881" };
    const { buffer } = await buildWorkbook([sample], fields);
    return reply.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").header("Content-Disposition", 'attachment; filename="student-upload-template.xlsx"').send(buffer);
  });

  app.get("/export.xlsx", async (req, reply) => {
    const p = principal(req);
    require(can.download(p), "Your plan does not include downloads.");
    const q = listQuery.parse(req.query);
    const { school, where } = await scopedWhere(p, q);
    const rows = await prisma.student.findMany({ where });
    const { buffer } = await buildWorkbook(rows as unknown as PrintRecord[], await schoolFields(school.id));
    await audit(req, { action: "student.exported", summary: `${p.name} downloaded ${rows.length} student records of ${school.name}`, schoolId: school.id });
    return reply.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").header("Content-Disposition", `attachment; filename="${school.code}-students.xlsx"`).send(buffer);
  });

  app.get("/export.zip", async (req, reply) => {
    const p = principal(req);
    require(can.download(p), "Your plan does not include downloads.");
    const q = listQuery.parse(req.query);
    const { school, where } = await scopedWhere(p, q);
    const rows = (await prisma.student.findMany({ where })) as unknown as PrintRecord[];
    const { buffer, named } = await buildWorkbook(rows, await schoolFields(school.id));
    await audit(req, { action: "student.exported_photos", summary: `${p.name} downloaded ${rows.length} records with photos of ${school.name}`, schoolId: school.id });
    return reply.header("Content-Type", "application/zip").header("Content-Disposition", `attachment; filename="${school.code}-students.zip"`).send(zipWithPhotos(buffer, `${school.code}-students.xlsx`, named));
  });

  // Change sheet #7: printable checklist for the school to verify before printing.
  app.get("/checklist.pdf", async (req, reply) => {
    const p = principal(req);
    require(can.download(p), "Your plan does not include downloads.");
    const q = listQuery.extend({ perPage: z.coerce.number().refine((n) => n === 10 || n === 12).default(12) }).parse(req.query);
    const { school, where } = await scopedWhere(p, q);
    const rows = (await prisma.student.findMany({ where })) as unknown as PrintRecord[];
    const pdf = await buildChecklist(rows, await schoolFields(school.id), { title: school.name, subtitle: `Student ID checklist · ${where.session ?? ""}`, perPage: q.perPage as 10 | 12 });
    await audit(req, { action: "student.checklist", summary: `${p.name} downloaded the checklist of ${school.name} (${rows.length} students)`, schoolId: school.id });
    return reply.header("Content-Type", "application/pdf").header("Content-Disposition", `attachment; filename="${school.code}-checklist.pdf"`).send(pdf);
  });
}

async function parseSheet(buffer: Buffer, filename: string) {
  const wb = new ExcelJS.Workbook();
  if (/\.csv$/i.test(filename)) {
    const text = buffer.toString("utf8").replace(/^﻿/, "");
    return csvRows(text);
  }
  if (!/\.xlsx$/i.test(filename)) throw badRequest("Upload an .xlsx or .csv file. Other Excel formats are read in the browser.");
  await wb.xlsx.load(buffer as never);
  const ws = wb.worksheets[0];
  if (!ws) throw badRequest("The workbook has no sheets.");
  const headers: string[] = [];
  ws.getRow(1).eachCell((c, i) => (headers[i] = String(cellText(c.value) ?? "")));
  const rows: Record<string, unknown>[] = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const r: Record<string, unknown> = {};
    row.eachCell((c, i) => headers[i] && (r[headers[i]] = c.value));
    rows.push(r);
  });
  return rows;
}

function csvRows(text: string) {
  const out: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") row.push(cell), (cell = "");
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell), out.push(row), (row = []), (cell = "");
    } else cell += ch;
  }
  if (cell || row.length) row.push(cell), out.push(row);
  const [header, ...body] = out;
  return body.filter((r) => r.some((c) => c.trim())).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}
