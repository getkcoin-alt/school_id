import type { FastifyInstance } from "fastify";
import type { Prisma, Staff } from "@prisma/client";
import { z } from "zod";
import { prisma, nextCode } from "../lib/db.js";
import { badRequest, notFound } from "../lib/errors.js";
import { can, principal, require, schoolWhere, targetSchool } from "../lib/access.js";
import { audit } from "../lib/audit.js";
import { fileUrl, storage } from "../lib/storage.js";
import { clean, keep, isoDate, normalizePhone, parseDate, validPhone } from "../lib/normalize.js";
import { normalisePhoto } from "../lib/images.js";
import { readMultipart } from "../lib/upload.js";
import { schoolFields } from "../lib/fields.js";
import { missingFields } from "../lib/students.js";
import { buildWorkbook, type PrintRecord } from "../lib/exporter.js";

export async function serializeStaff(s: Staff) {
  return {
    id: s.id,
    code: s.code,
    schoolId: s.schoolId,
    session: s.session,
    name: s.name,
    role: s.role,
    email: s.email,
    phone: s.phone,
    address: s.address,
    gender: s.gender,
    dob: isoDate(s.dob),
    className: s.className,
    section: s.section,
    extra: s.extra as Record<string, string>,
    photoUrl: await fileUrl(s.photoKey),
    photoSource: s.photoSource,
    status: s.status,
    reviewStatus: s.reviewStatus,
    approvedAt: s.approvedAt,
    version: s.version,
    updatedAt: s.updatedAt,
  };
}

const t = z.string().optional().nullable().transform(keep((v) => clean(v) ?? null));
const staffInput = z.object({
  name: z.string().trim().min(2, "Enter the staff member's name.").transform((v) => v.replace(/\s+/g, " ").toUpperCase()).optional(),
  role: t,
  email: z.string().email("Enter a valid email address.").optional().nullable().or(z.literal("")).transform(keep((v) => (v ? v.toLowerCase() : null))),
  phone: z.string().optional().nullable().transform(keep((v) => normalizePhone(v ?? undefined) ?? null)).refine((v) => validPhone(v ?? undefined), "Enter a valid 10-digit mobile number."),
  address: t,
  gender: z.enum(["Male", "Female", "Other"]).optional().nullable(),
  dob: z.string().optional().nullable(),
  className: t,
  section: t,
  extra: z.record(z.string(), z.string().max(200)).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

function toData(b: z.infer<typeof staffInput>) {
  const { dob, ...rest } = b;
  const data: Record<string, unknown> = { ...rest };
  if (dob !== undefined) data.dob = parseDate(dob) ?? null;
  for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k];
  return data;
}

async function loadStaff(p: ReturnType<typeof principal>, id: string) {
  const s = await prisma.staff.findFirst({ where: { OR: [{ id }, { code: id }], deletedAt: null, school: schoolWhere(p) } });
  if (!s) throw notFound("Staff member");
  return s;
}

export async function staffRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const p = principal(req);
    const q = z.object({ schoolId: z.string().optional(), search: z.string().optional(), reviewStatus: z.string().optional(), status: z.enum(["ACTIVE", "INACTIVE"]).optional() }).parse(req.query);
    const school = await targetSchool(p, q.schoolId);
    const rows = await prisma.staff.findMany({
      where: {
        schoolId: school.id,
        deletedAt: null,
        status: q.status,
        reviewStatus: q.reviewStatus ? (q.reviewStatus as never) : undefined,
        ...(q.search ? { OR: [{ name: { contains: q.search, mode: "insensitive" } }, { role: { contains: q.search, mode: "insensitive" } }, { code: { contains: q.search, mode: "insensitive" } }] } : {}),
      },
      orderBy: { name: "asc" },
    });
    return { items: await Promise.all(rows.map(serializeStaff)) };
  });

  app.post("/", async (req) => {
    const p = principal(req);
    require(can.editStudents(p));
    const body = staffInput.extend({ schoolId: z.string().optional(), name: z.string().trim().min(2, "Enter the staff member's name.").transform((v) => v.replace(/\s+/g, " ").toUpperCase()) }).parse(req.body);
    const school = await targetSchool(p, body.schoolId);
    const { schoolId: _s, ...input } = body;
    const staff = await prisma.staff.create({
      data: { ...(toData(input) as Prisma.StaffUncheckedCreateInput), schoolId: school.id, session: school.currentSession, code: await nextCode(prisma, "staff", "SF", 5), extra: (input.extra ?? {}) as object },
    });
    await audit(req, { action: "staff.created", summary: `${p.name} added staff member ${staff.name}`, entityType: "staff", entityId: staff.id, schoolId: school.id });
    return serializeStaff(staff);
  });

  app.patch("/:id", async (req) => {
    const p = principal(req);
    require(can.editStudents(p));
    const s = await loadStaff(p, (req.params as { id: string }).id);
    const body = staffInput.parse(req.body);
    const updated = await prisma.staff.update({
      where: { id: s.id },
      data: { ...(toData(body) as Prisma.StaffUncheckedUpdateInput), extra: body.extra ? ({ ...(s.extra as object), ...body.extra } as object) : undefined, version: { increment: 1 } },
    });
    await audit(req, { action: "staff.updated", summary: `${p.name} edited staff member ${s.name}`, entityType: "staff", entityId: s.id, schoolId: s.schoolId });
    return serializeStaff(updated);
  });

  app.delete("/:id", async (req) => {
    const p = principal(req);
    require(can.editStudents(p));
    const s = await loadStaff(p, (req.params as { id: string }).id);
    await prisma.staff.update({ where: { id: s.id }, data: { deletedAt: new Date() } });
    await audit(req, { action: "staff.deleted", summary: `${p.name} deleted staff member ${s.name}`, entityType: "staff", entityId: s.id, schoolId: s.schoolId });
    return { ok: true };
  });

  app.post("/:id/photo", async (req) => {
    const p = principal(req);
    require(can.editStudents(p));
    const s = await loadStaff(p, (req.params as { id: string }).id);
    const { files, fields } = await readMultipart(req);
    if (!files[0]) throw badRequest("Choose a photo to upload.");
    const photo = await normalisePhoto(files[0].buffer, files[0].mimetype);
    const key = `schools/${s.schoolId}/staff/${s.id}-${photo.checksum.slice(0, 12)}.jpg`;
    await storage.put(key, photo.buffer, photo.mime);
    const updated = await prisma.staff.update({ where: { id: s.id }, data: { photoKey: key, photoSource: fields.source === "CAMERA" ? "CAMERA" : "UPLOAD", version: { increment: 1 } } });
    await audit(req, { action: "staff.photo_updated", summary: `${p.name} updated the photo for ${s.name}`, entityType: "staff", entityId: s.id, schoolId: s.schoolId });
    return serializeStaff(updated);
  });

  app.post("/approve", async (req) => {
    const p = principal(req);
    require(can.approve(p));
    const { ids } = z.object({ ids: z.array(z.string()).min(1).max(1000) }).parse(req.body);
    const rows = await prisma.staff.findMany({ where: { id: { in: ids }, deletedAt: null, school: schoolWhere(p) } });
    const approved: string[] = [], failed: { id: string; name: string; reason: string }[] = [];
    const fields = new Map<string, Awaited<ReturnType<typeof schoolFields>>>();
    for (const s of rows) {
      if (!fields.has(s.schoolId)) fields.set(s.schoolId, await schoolFields(s.schoolId, "STAFF"));
      const missing = missingFields(s as never, fields.get(s.schoolId)!);
      if (s.reviewStatus === "SUBMITTED_FOR_PRINT") failed.push({ id: s.id, name: s.name, reason: "Already sent to print." });
      else if (missing.length) failed.push({ id: s.id, name: s.name, reason: `Missing: ${missing.join(", ")}` });
      else approved.push(s.id);
    }
    if (approved.length) {
      await prisma.staff.updateMany({ where: { id: { in: approved } }, data: { reviewStatus: "APPROVED", approvedAt: new Date() } });
      await audit(req, { action: "staff.approved", summary: `${p.name} approved ${approved.length} staff ID card${approved.length === 1 ? "" : "s"}`, schoolId: rows[0]?.schoolId });
    }
    return { approved: approved.length, approvedIds: approved, failed };
  });

  app.get("/export.xlsx", async (req, reply) => {
    const p = principal(req);
    require(can.download(p), "Your plan does not include downloads.");
    const q = z.object({ schoolId: z.string().optional() }).parse(req.query);
    const school = await targetSchool(p, q.schoolId);
    const rows = await prisma.staff.findMany({ where: { schoolId: school.id, deletedAt: null } });
    const { buffer } = await buildWorkbook(rows as unknown as PrintRecord[], await schoolFields(school.id, "STAFF"), "Staff");
    await audit(req, { action: "staff.exported", summary: `${p.name} downloaded ${rows.length} staff records of ${school.name}`, schoolId: school.id });
    return reply.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").header("Content-Disposition", `attachment; filename="${school.code}-staff.xlsx"`).send(buffer);
  });
}
