import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { badRequest, notFound } from "../lib/errors.js";
import { accessSchool, can, isAgent, principal, require, schoolWhere, targetSchool } from "../lib/access.js";
import { audit } from "../lib/audit.js";
import { isPdf, normalisePhoto, pdfPageCount } from "../lib/images.js";
import { fileUrl, storage } from "../lib/storage.js";
import { readMultipart } from "../lib/upload.js";
import { notifySchool, notifySuperAdmins } from "../lib/notify.js";
import { randomToken } from "../lib/crypto.js";

const stem = (name: string) => name.replace(/\.[^.]+$/, "").trim().toUpperCase();
const safeName = (name: string) => name.replace(/[^A-Za-z0-9_. -]/g, "_").slice(0, 120);

/** Photo library, agents' school-photo PDFs and order forms. */
export async function photoRoutes(app: FastifyInstance) {
  // ---- Photo library (Flow 1 step 3: bulk photos). Files are matched to students by
  // Photo No. or admission number, so DSC_0101.jpg lands on the row whose PHOTO is DSC_0101.
  app.get("/photos", async (req) => {
    const p = principal(req);
    const q = z.object({ schoolId: z.string().optional(), search: z.string().optional(), page: z.coerce.number().default(1), size: z.coerce.number().max(500).default(100) }).parse(req.query);
    const school = await targetSchool(p, q.schoolId);
    const where = { schoolId: school.id, ...(q.search ? { fileName: { contains: q.search, mode: "insensitive" as const } } : {}) };
    const [total, rows] = await Promise.all([
      prisma.photoAsset.count({ where }),
      prisma.photoAsset.findMany({ where, orderBy: { fileName: "asc" }, skip: (q.page - 1) * q.size, take: q.size }),
    ]);
    return { total, items: await Promise.all(rows.map(async (r) => ({ id: r.id, fileName: r.fileName, size: r.size, url: await fileUrl(r.storageKey), createdAt: r.createdAt }))) };
  });

  app.post("/photos", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req) => {
    const p = principal(req);
    require(can.editStudents(p));
    const { files, fields } = await readMultipart(req);
    const school = await targetSchool(p, fields.schoolId);
    if (!files.length) throw badRequest("Choose one or more photos.");
    const session = fields.session || school.currentSession!;
    const students = await prisma.student.findMany({ where: { schoolId: school.id, session, deletedAt: null }, select: { id: true, photoNo: true, admissionNo: true, code: true, status: true } });
    const index = new Map<string, string>();
    for (const s of students) for (const k of [s.photoNo, s.admissionNo, s.code]) if (k) index.set(k.toUpperCase(), s.id);
    const results: { fileName: string; status: "saved" | "replaced" | "failed"; matchedStudentId?: string; reason?: string }[] = [];
    for (const f of files) {
      try {
        const photo = await normalisePhoto(f.buffer, f.mimetype);
        const fileName = safeName(`${stem(f.filename)}.jpg`);
        const key = `schools/${school.id}/library/${stem(f.filename).replace(/[^A-Z0-9_.-]/g, "_")}-${photo.checksum.slice(0, 10)}.jpg`;
        await storage.put(key, photo.buffer, photo.mime);
        const existing = await prisma.photoAsset.findUnique({ where: { schoolId_fileName: { schoolId: school.id, fileName } } });
        await prisma.photoAsset.upsert({
          where: { schoolId_fileName: { schoolId: school.id, fileName } },
          create: { schoolId: school.id, fileName, storageKey: key, mime: photo.mime, size: photo.buffer.length, checksum: photo.checksum, uploadedById: p.userId },
          update: { storageKey: key, size: photo.buffer.length, checksum: photo.checksum, uploadedById: p.userId },
        });
        const studentId = index.get(stem(f.filename));
        if (studentId) {
          await prisma.student.updateMany({ where: { id: studentId, status: { not: "SUBMITTED_FOR_PRINT" } }, data: { photoKey: key, photoSource: "LIBRARY", photoCapturedAt: new Date(), version: { increment: 1 } } });
        }
        results.push({ fileName, status: existing ? "replaced" : "saved", matchedStudentId: studentId });
      } catch (e) {
        results.push({ fileName: f.filename, status: "failed", reason: (e as Error).message });
      }
    }
    const matched = results.filter((r) => r.matchedStudentId).length;
    await audit(req, { action: "photo.bulk_uploaded", summary: `${p.name} uploaded ${results.filter((r) => r.status !== "failed").length} photos to ${school.name} (${matched} matched to students)`, schoolId: school.id });
    return { results, matched };
  });

  app.delete("/photos/:id", async (req) => {
    const p = principal(req);
    require(can.editStudents(p));
    const asset = await prisma.photoAsset.findFirst({ where: { id: (req.params as { id: string }).id, school: schoolWhere(p) } });
    if (!asset) throw notFound("Photo");
    const inUse = await prisma.student.count({ where: { photoKey: asset.storageKey, deletedAt: null } });
    await prisma.photoAsset.delete({ where: { id: asset.id } });
    if (!inUse) await storage.remove(asset.storageKey).catch(() => undefined);
    await audit(req, { action: "photo.deleted", summary: `${p.name} removed photo ${asset.fileName}`, schoolId: asset.schoolId });
    return { ok: true, stillUsedBy: inUse };
  });

  // ---- School-wise photo PDFs uploaded by agents ----
  app.get("/pdfs", async (req) => {
    const p = principal(req);
    const q = z.object({ schoolId: z.string().optional() }).parse(req.query);
    const where = q.schoolId || p.schoolId ? { schoolId: (await targetSchool(p, q.schoolId)).id } : { school: schoolWhere(p) };
    const rows = await prisma.pdfUpload.findMany({ where, orderBy: { createdAt: "desc" }, include: { school: { select: { name: true, code: true } }, agent: { select: { name: true } } } });
    return {
      items: await Promise.all(
        rows.map(async (r) => ({ id: r.id, schoolId: r.schoolId, schoolName: r.school.name, agentName: r.agent?.name ?? null, fileName: r.fileName, size: r.size, pages: r.pages, note: r.note, status: r.status, createdAt: r.createdAt, url: can.download(p) || r.uploadedById === p.userId ? await storage.url(r.storageKey, 3600) : null })),
      ),
    };
  });

  app.post("/pdfs", async (req) => {
    const p = principal(req);
    require(can.uploadPdf(p), "Only agents and super admins upload photo PDFs.");
    const { files, fields } = await readMultipart(req);
    const school = await accessSchool(p, fields.schoolId ?? "");
    const created = [];
    for (const f of files) {
      if (!isPdf(f.buffer)) throw badRequest(`${f.filename} is not a PDF file.`);
      const key = `schools/${school.id}/pdfs/${randomToken(8)}-${safeName(f.filename).replace(/ /g, "_")}`;
      await storage.put(key, f.buffer, "application/pdf");
      const pages = Number(fields.pages) > 0 ? Number(fields.pages) : pdfPageCount(f.buffer);
      created.push(
        await prisma.pdfUpload.create({ data: { schoolId: school.id, agentId: isAgent(p) ? p.agentId : school.agentId, fileName: safeName(f.filename), storageKey: key, size: f.buffer.length, pages, note: fields.note?.slice(0, 500), uploadedById: p.userId } }),
      );
    }
    if (!created.length) throw badRequest("Choose a PDF file.");
    await audit(req, { action: "pdf.uploaded", summary: `${p.name} uploaded ${created.length} photo PDF${created.length === 1 ? "" : "s"} for ${school.name}`, schoolId: school.id });
    await notifySuperAdmins(`Photo PDF received for ${school.name}`, created.map((c) => c.fileName).join(", "), "photos");
    return { items: created.map((c) => ({ id: c.id, fileName: c.fileName, pages: c.pages, status: c.status })) };
  });

  app.patch("/pdfs/:id", async (req) => {
    const p = principal(req);
    const row = await prisma.pdfUpload.findFirst({ where: { id: (req.params as { id: string }).id, school: schoolWhere(p) } });
    if (!row) throw notFound("PDF");
    const body = z.object({ status: z.enum(["READY_FOR_REVIEW", "REVIEWED", "REJECTED"]).optional(), note: z.string().max(500).optional(), pages: z.number().int().min(0).optional() }).parse(req.body);
    const updated = await prisma.pdfUpload.update({ where: { id: row.id }, data: body });
    await audit(req, { action: "pdf.updated", summary: `${p.name} marked ${row.fileName} as ${(body.status ?? updated.status).toLowerCase().replace(/_/g, " ")}`, schoolId: row.schoolId });
    return { id: updated.id, status: updated.status };
  });

  app.delete("/pdfs/:id", async (req) => {
    const p = principal(req);
    require(can.uploadPdf(p));
    const row = await prisma.pdfUpload.findFirst({ where: { id: (req.params as { id: string }).id, school: schoolWhere(p) } });
    if (!row) throw notFound("PDF");
    await prisma.pdfUpload.delete({ where: { id: row.id } });
    await storage.remove(row.storageKey).catch(() => undefined);
    await audit(req, { action: "pdf.deleted", summary: `${p.name} removed ${row.fileName}`, schoolId: row.schoolId });
    return { ok: true };
  });

  // ---- Order forms (change sheet #6: all panels can upload) ----
  app.get("/order-forms", async (req) => {
    const p = principal(req);
    const q = z.object({ schoolId: z.string().optional(), batchId: z.string().optional() }).parse(req.query);
    const where = { school: schoolWhere(p), ...(q.schoolId ? { schoolId: (await accessSchool(p, q.schoolId)).id } : {}), ...(q.batchId ? { batchId: q.batchId } : {}) };
    const rows = await prisma.orderForm.findMany({ where, orderBy: { createdAt: "desc" }, include: { school: { select: { name: true } }, batch: { select: { code: true } } } });
    return { items: await Promise.all(rows.map(async (r) => ({ id: r.id, schoolId: r.schoolId, schoolName: r.school.name, batchCode: r.batch?.code ?? null, fileName: r.fileName, size: r.size, note: r.note, createdAt: r.createdAt, url: await storage.url(r.storageKey, 3600, r.fileName) }))) };
  });

  app.post("/order-forms", async (req) => {
    const p = principal(req);
    const { files, fields } = await readMultipart(req);
    const school = await targetSchool(p, fields.schoolId);
    const file = files[0];
    if (!file) throw badRequest("Choose the order form file.");
    const allowed = ["application/pdf", "image/jpeg", "image/png", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
    if (!allowed.includes(file.mimetype)) throw badRequest("Upload the order form as PDF, image, Excel or Word.");
    let batchId: string | null = null;
    if (fields.batchId) {
      const batch = await prisma.printBatch.findFirst({ where: { OR: [{ id: fields.batchId }, { code: fields.batchId }], schoolId: school.id } });
      if (!batch) throw notFound("Batch");
      batchId = batch.id;
    }
    const key = `schools/${school.id}/order-forms/${randomToken(8)}-${safeName(file.filename).replace(/ /g, "_")}`;
    await storage.put(key, file.buffer, file.mimetype);
    const row = await prisma.orderForm.create({ data: { schoolId: school.id, batchId, fileName: safeName(file.filename), storageKey: key, mime: file.mimetype, size: file.buffer.length, note: fields.note?.slice(0, 500), uploadedById: p.userId } });
    await audit(req, { action: "order_form.uploaded", summary: `${p.name} uploaded order form ${row.fileName} for ${school.name}`, schoolId: school.id, entityType: "order_form", entityId: row.id });
    await notifySchool(school.id, `Order form uploaded for ${school.name}`, row.fileName, "printing", true);
    await notifySuperAdmins(`Order form uploaded for ${school.name}`, row.fileName, "printing");
    return { id: row.id, fileName: row.fileName };
  });

  app.delete("/order-forms/:id", async (req) => {
    const p = principal(req);
    const row = await prisma.orderForm.findFirst({ where: { id: (req.params as { id: string }).id, school: schoolWhere(p) } });
    if (!row) throw notFound("Order form");
    require(row.uploadedById === p.userId || can.manageSchools(p), "Only the uploader or a super admin can remove this file.");
    await prisma.orderForm.delete({ where: { id: row.id } });
    await storage.remove(row.storageKey).catch(() => undefined);
    return { ok: true };
  });
}
