import type { FastifyInstance } from "fastify";
import type { BatchStatus, FulfilledBy, PrintBatch, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma, nextCode } from "../lib/db.js";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors.js";
import { can, isAgent, isPremium, isSchool, isSuper, principal, require, schoolWhere, targetSchool } from "../lib/access.js";
import { audit } from "../lib/audit.js";
import { schoolFields } from "../lib/fields.js";
import { buildChecklist, buildWorkbook, sortForPrint, zipWithPhotos, type PrintRecord } from "../lib/exporter.js";
import { isoDate } from "../lib/normalize.js";
import { fileUrl } from "../lib/storage.js";
import { notifyAgent, notifySchool, notifySuperAdmins } from "../lib/notify.js";

const NEXT: Record<BatchStatus, BatchStatus[]> = {
  SUBMITTED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["PRINTED", "SUBMITTED"],
  PRINTED: ["DELIVERED", "IN_PROGRESS"],
  DELIVERED: [],
  CANCELLED: [],
};

function serializeBatch(b: PrintBatch & { school?: { name: string; code: string } | null; fulfillerAgent?: { name: string; company: string | null } | null }) {
  return {
    id: b.id,
    code: b.code,
    name: b.name,
    schoolId: b.schoolId,
    schoolName: b.school?.name,
    schoolCode: b.school?.code,
    session: b.session,
    status: b.status,
    fulfilledBy: b.fulfilledBy,
    fulfillerAgentId: b.fulfillerAgentId,
    fulfillerName: b.fulfilledBy === "AGENT" ? (b.fulfillerAgent?.company || b.fulfillerAgent?.name || "Agent") : "ID Card Studio",
    designName: b.designName,
    carrier: b.carrier,
    tracking: b.tracking,
    studentCount: b.studentCount,
    staffCount: b.staffCount,
    createdAt: b.createdAt,
    printedAt: b.printedAt,
    deliveredAt: b.deliveredAt,
  };
}

/** Plain snapshot of a record at print time. */
function snapshotOf(r: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) {
    if (["deletedAt", "version", "createdAt", "updatedAt"].includes(k)) continue;
    out[k] = v instanceof Date ? isoDate(v) : v;
  }
  return out;
}

async function loadBatch(p: ReturnType<typeof principal>, id: string) {
  const b = await prisma.printBatch.findFirst({
    where: {
      OR: [{ id }, { code: id }],
      // Premium agents also see central-school batches they were asked to fulfil.
      ...(isAgent(p) ? { AND: [{ OR: [{ school: schoolWhere(p) }, { fulfillerAgentId: p.agentId }] }] } : { school: schoolWhere(p) }),
    },
    include: { school: { select: { name: true, code: true } }, fulfillerAgent: { select: { name: true, company: true } } },
  });
  if (!b) throw notFound("Batch");
  return b;
}

export async function batchRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const p = principal(req);
    const q = z
      .object({
        schoolId: z.string().optional(),
        status: z.enum(["SUBMITTED", "IN_PROGRESS", "PRINTED", "DELIVERED", "CANCELLED"]).optional(),
        fulfilledBy: z.enum(["CENTRAL", "AGENT"]).optional(),
        fulfillerAgentId: z.string().optional(),
        search: z.string().optional(),
        page: z.coerce.number().default(1),
        size: z.coerce.number().max(200).default(50),
      })
      .parse(req.query);
    const where: Prisma.PrintBatchWhereInput = {
      ...(isAgent(p) ? { OR: [{ school: schoolWhere(p) }, { fulfillerAgentId: p.agentId }] } : { school: schoolWhere(p) }),
      status: q.status,
      fulfilledBy: q.fulfilledBy, // change sheet #14: "fulfilled by" filter
      fulfillerAgentId: q.fulfillerAgentId,
      schoolId: q.schoolId ? (await targetSchool(p, q.schoolId)).id : undefined,
      ...(q.search ? { AND: [{ OR: [{ name: { contains: q.search, mode: "insensitive" } }, { code: { contains: q.search, mode: "insensitive" } }, { school: { name: { contains: q.search, mode: "insensitive" } } }] }] } : {}),
    };
    const [total, rows, byStatus] = await Promise.all([
      prisma.printBatch.count({ where }),
      prisma.printBatch.findMany({ where, include: { school: { select: { name: true, code: true } }, fulfillerAgent: { select: { name: true, company: true } } }, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.size, take: q.size }),
      prisma.printBatch.groupBy({ by: ["status"], where: { ...where, status: undefined }, _count: true }),
    ]);
    return { items: rows.map(serializeBatch), total, counts: Object.fromEntries(byStatus.map((s) => [s.status, s._count])) };
  });

  app.post("/", async (req) => {
    const p = principal(req);
    require(can.createBatch(p));
    const body = z
      .object({
        schoolId: z.string().optional(),
        name: z.string().trim().max(120).optional(),
        studentIds: z.array(z.string()).max(5000).default([]),
        staffIds: z.array(z.string()).max(1000).default([]),
        allApproved: z.boolean().default(false),
        className: z.string().optional(),
        fulfilledBy: z.enum(["CENTRAL", "AGENT"]).optional(),
        fulfillerAgentId: z.string().optional(),
      })
      .parse(req.body);
    const school = await targetSchool(p, body.schoolId);
    const session = school.currentSession;
    const studentWhere: Prisma.StudentWhereInput = { schoolId: school.id, deletedAt: null, status: "APPROVED", active: true, photoKey: { not: null } };
    const students = body.allApproved
      ? await prisma.student.findMany({ where: { ...studentWhere, session: session ?? undefined, className: body.className } })
      : body.studentIds.length
        ? await prisma.student.findMany({ where: { ...studentWhere, id: { in: body.studentIds } } })
        : [];
    const staff = body.staffIds.length ? await prisma.staff.findMany({ where: { schoolId: school.id, deletedAt: null, reviewStatus: "APPROVED", photoKey: { not: null }, id: { in: body.staffIds } } }) : [];
    const skipped = body.allApproved ? 0 : body.studentIds.length - students.length + (body.staffIds.length - staff.length);
    if (!students.length && !staff.length) throw badRequest("Only approved records with a photo can be sent to print. None of the selected records qualify.");

    // Who prints: premium agents with own printing, otherwise ID Card Studio (central).
    let fulfilledBy: FulfilledBy = "CENTRAL";
    let fulfillerAgentId: string | null = null;
    if (isPremium(p)) {
      const agent = await prisma.agent.findUniqueOrThrow({ where: { id: p.agentId! } });
      if (agent.printBySelf && body.fulfilledBy !== "CENTRAL") (fulfilledBy = "AGENT"), (fulfillerAgentId = agent.id);
    } else if (isSuper(p) && body.fulfilledBy === "AGENT") {
      const agent = await prisma.agent.findFirst({ where: { id: body.fulfillerAgentId ?? school.agentId ?? "", tier: "PREMIUM", deletedAt: null } });
      if (!agent) throw badRequest("Choose a premium agent to fulfil this batch.");
      fulfilledBy = "AGENT";
      fulfillerAgentId = agent.id;
    } else if (isSchool(p) && school.agentId) {
      const agent = await prisma.agent.findUnique({ where: { id: school.agentId } });
      if (agent?.tier === "PREMIUM" && agent.printBySelf && agent.status === "ACTIVE") (fulfilledBy = "AGENT"), (fulfillerAgentId = agent.id);
    }

    // Printing rounds per session (super admin may override).
    if (students.length && school.studentRounds > 0 && !isSuper(p)) {
      const used = await prisma.printBatch.count({ where: { schoolId: school.id, session, studentCount: { gt: 0 }, status: { not: "CANCELLED" } } });
      if (used >= school.studentRounds) throw forbidden(`This school has used all ${school.studentRounds} student printing round${school.studentRounds === 1 ? "" : "s"} for ${session}. Contact ID Card Studio for another round.`);
    }

    const design = school.studentDesignId ? await prisma.design.findUnique({ where: { id: school.studentDesignId } }) : null;
    const batch = await prisma.$transaction(async (tx) => {
      const code = await nextCode(tx, "batch", "B", 4, 1000);
      // Guard against a concurrent batch grabbing the same records.
      const locked = await tx.student.updateMany({ where: { id: { in: students.map((s) => s.id) }, status: "APPROVED" }, data: { status: "SUBMITTED_FOR_PRINT" } });
      if (locked.count !== students.length) throw conflict("Some records were sent to print by someone else. Refresh and try again.");
      await tx.staff.updateMany({ where: { id: { in: staff.map((s) => s.id) } }, data: { reviewStatus: "SUBMITTED_FOR_PRINT" } });
      return tx.printBatch.create({
        data: {
          code,
          name: body.name || `${school.shortName || school.name} · ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`,
          schoolId: school.id,
          session,
          fulfilledBy,
          fulfillerAgentId,
          designName: design?.name,
          studentCount: students.length,
          staffCount: staff.length,
          createdById: p.userId,
          items: {
            create: [
              ...students.map((s) => ({ kind: "STUDENT" as const, studentId: s.id, snapshot: snapshotOf(s as never) as object, photoKey: s.photoKey, photoNo: s.photoNo || s.admissionNo || s.code, sortName: s.name, className: s.className })),
              ...staff.map((s) => ({ kind: "STAFF" as const, staffId: s.id, snapshot: snapshotOf(s as never) as object, photoKey: s.photoKey, photoNo: s.code, sortName: s.name, className: "STAFF" })),
            ],
          },
        },
        include: { school: { select: { name: true, code: true } }, fulfillerAgent: { select: { name: true, company: true } } },
      });
    });
    await audit(req, { action: "batch.created", summary: `${p.name} sent ${students.length + staff.length} cards of ${school.name} to print (${batch.code})`, entityType: "batch", entityId: batch.id, schoolId: school.id });
    await notifySuperAdmins(`New print batch ${batch.code}`, `${school.name} · ${students.length + staff.length} cards`, "printing");
    if (fulfillerAgentId) await notifyAgent(fulfillerAgentId, `New print batch ${batch.code}`, `${school.name} · ${students.length + staff.length} cards`, "printing");
    return { ...serializeBatch(batch), skipped };
  });

  app.get("/:id", async (req) => {
    const p = principal(req);
    const b = await loadBatch(p, (req.params as { id: string }).id);
    const items = await prisma.printBatchItem.findMany({ where: { batchId: b.id } });
    const sorted = sortForPrint(items.map((i) => ({ ...(i.snapshot as Record<string, unknown>), name: i.sortName, className: i.className, code: i.photoNo, photoKey: i.photoKey, _kind: i.kind })));
    const orderForms = await prisma.orderForm.findMany({ where: { batchId: b.id }, select: { id: true, fileName: true, createdAt: true } });
    return {
      ...serializeBatch(b),
      items: await Promise.all(sorted.map(async (r) => ({ ...r, photoKey: undefined, photoUrl: await fileUrl(r.photoKey as string | null) }))),
      orderForms,
      nextStatuses: NEXT[b.status],
    };
  });

  app.patch("/:id", async (req) => {
    const p = principal(req);
    const b = await loadBatch(p, (req.params as { id: string }).id);
    const body = z.object({ status: z.enum(["SUBMITTED", "IN_PROGRESS", "PRINTED", "DELIVERED", "CANCELLED"]).optional(), carrier: z.string().max(80).optional().nullable(), tracking: z.string().max(80).optional().nullable(), name: z.string().max(120).optional() }).parse(req.body);
    const fulfils = isSuper(p) || (isPremium(p) && b.fulfillerAgentId === p.agentId);
    if (body.status && body.status !== b.status) {
      if (!NEXT[b.status].includes(body.status)) throw badRequest(`A ${b.status.toLowerCase().replace("_", " ")} batch cannot move to ${body.status.toLowerCase().replace("_", " ")}.`);
      if (body.status === "CANCELLED") require(isSuper(p) || isSchool(p) || b.createdById === p.userId, "Only the school, the creator or a super admin can cancel a batch.");
      else require(fulfils, "Only the printer of this batch can update production.");
    } else if (body.carrier !== undefined || body.tracking !== undefined) require(fulfils);
    const data: Prisma.PrintBatchUpdateInput = { carrier: body.carrier, tracking: body.tracking, name: body.name, status: body.status };
    if (body.status === "PRINTED") data.printedAt = new Date();
    if (body.status === "DELIVERED") data.deliveredAt = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      if (body.status === "CANCELLED") {
        const items = await tx.printBatchItem.findMany({ where: { batchId: b.id }, select: { studentId: true, staffId: true } });
        await tx.student.updateMany({ where: { id: { in: items.map((i) => i.studentId!).filter(Boolean) }, status: "SUBMITTED_FOR_PRINT" }, data: { status: "APPROVED" } });
        await tx.staff.updateMany({ where: { id: { in: items.map((i) => i.staffId!).filter(Boolean) } }, data: { reviewStatus: "APPROVED" } });
      }
      return tx.printBatch.update({ where: { id: b.id }, data, include: { school: { select: { name: true, code: true } }, fulfillerAgent: { select: { name: true, company: true } } } });
    });
    if (body.status) {
      await audit(req, { action: "batch.status", summary: `${p.name} moved ${b.code} to ${body.status.toLowerCase().replace("_", " ")}${body.tracking ? ` (${body.carrier ?? ""} ${body.tracking})` : ""}`, entityType: "batch", entityId: b.id, schoolId: b.schoolId });
      await notifySchool(b.schoolId, `Batch ${b.code}: ${body.status.toLowerCase().replace("_", " ")}`, body.tracking ? `${body.carrier ?? "Tracking"} ${body.tracking}` : undefined, "printing", true);
    }
    return serializeBatch(updated);
  });

  // ---- Downloads: spreadsheet, ZIP with photos (change sheet #5) and proof checklist (#15) ----
  async function batchRecords(batchId: string) {
    const items = await prisma.printBatchItem.findMany({ where: { batchId } });
    return {
      students: items.filter((i) => i.kind === "STUDENT").map((i) => ({ ...(i.snapshot as Record<string, unknown>), photoKey: i.photoKey, name: i.sortName, className: i.className }) as PrintRecord),
      staff: items.filter((i) => i.kind === "STAFF").map((i) => ({ ...(i.snapshot as Record<string, unknown>), photoKey: i.photoKey, name: i.sortName, className: "STAFF" }) as PrintRecord),
    };
  }

  app.get("/:id/export.xlsx", async (req, reply) => {
    const p = principal(req);
    require(can.download(p), "Your plan does not include downloads.");
    const b = await loadBatch(p, (req.params as { id: string }).id);
    const { students, staff } = await batchRecords(b.id);
    const { buffer } = staff.length && !students.length ? await buildWorkbook(staff, await schoolFields(b.schoolId, "STAFF"), "Staff") : await buildWorkbook(students, await schoolFields(b.schoolId), "Students");
    await audit(req, { action: "batch.downloaded", summary: `${p.name} downloaded ${b.code} spreadsheet`, schoolId: b.schoolId, entityType: "batch", entityId: b.id });
    return reply.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").header("Content-Disposition", `attachment; filename="${b.code}.xlsx"`).send(buffer);
  });

  app.get("/:id/download.zip", async (req, reply) => {
    const p = principal(req);
    require(can.download(p), "Your plan does not include downloads.");
    const b = await loadBatch(p, (req.params as { id: string }).id);
    const { students, staff } = await batchRecords(b.id);
    const studentFields = await schoolFields(b.schoolId);
    const main = await buildWorkbook(students, studentFields, "Students");
    const extra: { name: string; buffer: Buffer }[] = [];
    let named = main.named;
    if (staff.length) {
      const staffBook = await buildWorkbook(staff, await schoolFields(b.schoolId, "STAFF"), "Staff");
      extra.push({ name: `${b.code}-staff.xlsx`, buffer: staffBook.buffer });
      named = [...named, ...staffBook.named];
    }
    extra.push({ name: `${b.code}-checklist.pdf`, buffer: await buildChecklist([...students, ...staff], studentFields, { title: b.school?.name ?? b.name, subtitle: `Batch ${b.code}` }) });
    await audit(req, { action: "batch.downloaded", summary: `${p.name} downloaded ${b.code} with photos`, schoolId: b.schoolId, entityType: "batch", entityId: b.id });
    return reply.header("Content-Type", "application/zip").header("Content-Disposition", `attachment; filename="${b.code}.zip"`).send(zipWithPhotos(main.buffer, `${b.code}.xlsx`, named, extra));
  });

  app.get("/:id/proof.pdf", async (req, reply) => {
    const p = principal(req);
    require(can.download(p), "Your plan does not include downloads.");
    const b = await loadBatch(p, (req.params as { id: string }).id);
    const q = z.object({ perPage: z.coerce.number().refine((n) => n === 10 || n === 12).default(12) }).parse(req.query);
    const { students, staff } = await batchRecords(b.id);
    const pdf = await buildChecklist([...students, ...staff], await schoolFields(b.schoolId), { title: b.school?.name ?? b.name, subtitle: `Batch ${b.code} proof`, perPage: q.perPage as 10 | 12 });
    return reply.header("Content-Type", "application/pdf").header("Content-Disposition", `attachment; filename="${b.code}-proof.pdf"`).send(pdf);
  });
}
