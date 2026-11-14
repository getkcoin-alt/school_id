import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import type { Prisma } from "@prisma/client";
import { badRequest, conflict, notFound } from "../lib/errors.js";
import { accessSchool, isAgent, isSchool, isSuper, principal, require, schoolWhere } from "../lib/access.js";
import { audit } from "../lib/audit.js";
import { isoDate, parseDate } from "../lib/normalize.js";
import { classRank, nextSession, normaliseSession, sessionDates } from "../lib/session.js";

/** Keeps a school's classes in natural order (Nursery, LKG, UKG, I … XII), whatever order they were added in. */
async function reorderClasses(tx: Prisma.TransactionClient, schoolId: string) {
  const rows = await tx.schoolClass.findMany({ where: { schoolId }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  const sorted = rows.map((r, i) => ({ r, i })).sort((a, b) => classRank(a.r.name) - classRank(b.r.name) || a.i - b.i);
  for (const [i, { r }] of sorted.entries()) if (r.sortOrder !== i + 1) await tx.schoolClass.update({ where: { id: r.id }, data: { sortOrder: i + 1 } });
}

/** Sessions, classes, sections and staff roles, all nested under a school. */
export async function academicRoutes(app: FastifyInstance) {
  const canEdit = (p: ReturnType<typeof principal>) => isSuper(p) || isSchool(p) || isAgent(p);

  // ---- Academic sessions ----
  app.get("/:id/sessions", async (req) => {
    const school = await accessSchool(principal(req), (req.params as { id: string }).id);
    const [rows, counts] = await Promise.all([
      prisma.academicSession.findMany({ where: { schoolId: school.id }, orderBy: { name: "desc" } }),
      prisma.student.groupBy({ by: ["session"], where: { schoolId: school.id, deletedAt: null }, _count: true }),
    ]);
    return {
      next: nextSession(rows.map((r) => r.name)),
      items: rows.map((r) => ({ id: r.id, name: r.name, startDate: isoDate(r.startDate), endDate: isoDate(r.endDate), isCurrent: r.isCurrent, students: counts.find((c) => c.session === r.name)?._count ?? 0 })),
    };
  });

  /** Creates a session (name defaults to the one after the latest; dates to April–March). */
  async function createSession(tx: Prisma.TransactionClient, schoolId: string, input: { name?: string; startDate?: string; endDate?: string; isCurrent?: boolean }) {
    const existing = await tx.academicSession.findMany({ where: { schoolId }, select: { name: true } });
    const name = input.name ? normaliseSession(input.name) : nextSession(existing.map((e) => e.name));
    if (!name) throw badRequest("Write the session as a year, like 2027 or 2027–28.");
    if (existing.some((e) => e.name === name)) return null;
    const d = sessionDates(name);
    if (input.isCurrent) await tx.academicSession.updateMany({ where: { schoolId }, data: { isCurrent: false } });
    const row = await tx.academicSession.create({ data: { schoolId, name, startDate: parseDate(input.startDate || d.start), endDate: parseDate(input.endDate || d.end), isCurrent: Boolean(input.isCurrent) } });
    if (input.isCurrent) await tx.school.update({ where: { id: schoolId }, data: { currentSession: name } });
    return row;
  }
  const sessionBody = z.object({ name: z.string().trim().max(20).optional(), startDate: z.string().optional(), endDate: z.string().optional(), isCurrent: z.boolean().default(false) });

  app.post("/:id/sessions", async (req) => {
    const p = principal(req);
    require(canEdit(p));
    const school = await accessSchool(p, (req.params as { id: string }).id);
    const body = sessionBody.parse(req.body);
    const row = await prisma.$transaction((tx) => createSession(tx, school.id, body));
    if (!row) throw conflict("That session already exists for this school.");
    await audit(req, { action: "session.created", summary: `${p.name} added session ${row.name} for ${school.name}${row.isCurrent ? " (now current)" : ""}`, schoolId: school.id, entityType: "session", entityId: row.id });
    return { id: row.id, name: row.name, startDate: isoDate(row.startDate), endDate: isoDate(row.endDate), isCurrent: row.isCurrent };
  });

  // Super admins and agents: add the same session to several schools at once.
  app.post("/sessions/bulk", async (req) => {
    const p = principal(req);
    require(isSuper(p) || isAgent(p), "Only a super admin or an agent can add sessions to several schools.");
    const body = sessionBody.extend({ schoolIds: z.array(z.string()).max(1000).optional() }).parse(req.body);
    const name = body.name ? normaliseSession(body.name) : null;
    if (body.name && !name) throw badRequest("Write the session as a year, like 2027 or 2027–28.");
    const schools = await prisma.school.findMany({ where: { ...schoolWhere(p), ...(body.schoolIds ? { id: { in: body.schoolIds } } : {}) }, select: { id: true, name: true } });
    let created = 0;
    const skipped: string[] = [];
    for (const s of schools) {
      const row = await prisma.$transaction((tx) => createSession(tx, s.id, { ...body, name: name ?? undefined }));
      if (row) created++;
      else skipped.push(s.name);
    }
    await audit(req, { action: "session.bulk_created", summary: `${p.name} added session ${name ?? "(next)"} to ${created} school${created === 1 ? "" : "s"}${body.isCurrent ? " and made it current" : ""}` });
    return { created, skipped };
  });

  app.patch("/:id/sessions/:sessionId", async (req) => {
    const p = principal(req);
    require(canEdit(p));
    const { id, sessionId } = req.params as { id: string; sessionId: string };
    const school = await accessSchool(p, id);
    const body = z.object({ startDate: z.string().nullable().optional(), endDate: z.string().nullable().optional(), isCurrent: z.literal(true).optional() }).parse(req.body);
    if (body.startDate && body.endDate && body.endDate < body.startDate) throw badRequest("The end date must be after the start date.");
    const row = await prisma.academicSession.findFirst({ where: { id: sessionId, schoolId: school.id } });
    if (!row) throw notFound("Session");
    await prisma.$transaction(async (tx) => {
      if (body.isCurrent) {
        await tx.academicSession.updateMany({ where: { schoolId: school.id }, data: { isCurrent: false } });
        await tx.school.update({ where: { id: school.id }, data: { currentSession: row.name } });
      }
      await tx.academicSession.update({
        where: { id: row.id },
        data: {
          startDate: body.startDate !== undefined ? (parseDate(body.startDate) ?? null) : undefined,
          endDate: body.endDate !== undefined ? (parseDate(body.endDate) ?? null) : undefined,
          isCurrent: body.isCurrent,
        },
      });
    });
    await audit(req, { action: "session.updated", summary: `${p.name} updated session ${row.name}${body.isCurrent ? " (now current)" : ""}`, schoolId: school.id });
    return { ok: true };
  });

  // ---- Classes and sections ----
  app.get("/:id/classes", async (req) => {
    const school = await accessSchool(principal(req), (req.params as { id: string }).id);
    const classes = await prisma.schoolClass.findMany({ where: { schoolId: school.id }, include: { sections: { orderBy: { name: "asc" } } }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
    const counts = await prisma.student.groupBy({
      by: ["className", "section"],
      where: { schoolId: school.id, session: school.currentSession ?? undefined, deletedAt: null },
      _count: true,
    });
    return {
      items: classes.map((c) => ({
        id: c.id,
        name: c.name,
        sortOrder: c.sortOrder,
        sections: c.sections.map((s) => ({ id: s.id, name: s.name, students: counts.find((x) => x.className === c.name && x.section === s.name)?._count ?? 0 })),
        students: counts.filter((x) => x.className === c.name).reduce((n, x) => n + x._count, 0),
      })),
    };
  });

  app.post("/:id/classes", async (req) => {
    const p = principal(req);
    require(canEdit(p));
    const school = await accessSchool(p, (req.params as { id: string }).id);
    const body = z.object({ name: z.string().trim().min(1).max(30), sections: z.array(z.string().trim().min(1).max(10)).default(["A"]) }).parse(req.body);
    if (await prisma.schoolClass.findFirst({ where: { schoolId: school.id, name: { equals: body.name, mode: "insensitive" } } })) throw conflict(`Class ${body.name} already exists.`);
    const cls = await prisma.$transaction(async (tx) => {
      const created = await tx.schoolClass.create({
        data: { schoolId: school.id, name: body.name, sortOrder: 9999, sections: { create: [...new Set(body.sections.map((s) => s.toUpperCase()))].map((name) => ({ name })) } },
        include: { sections: true },
      });
      await reorderClasses(tx, school.id);
      return created;
    });
    await audit(req, { action: "class.created", summary: `${p.name} added class ${cls.name}`, schoolId: school.id, entityType: "class", entityId: cls.id });
    return cls;
  });

  // Rename a class; existing students move with it.
  app.patch("/:id/classes/:classId", async (req) => {
    const p = principal(req);
    require(canEdit(p));
    const { id, classId } = req.params as { id: string; classId: string };
    const school = await accessSchool(p, id);
    const body = z.object({ name: z.string().trim().min(1).max(30).optional(), sortOrder: z.number().int().optional() }).parse(req.body);
    const cls = await prisma.schoolClass.findFirst({ where: { id: classId, schoolId: school.id } });
    if (!cls) throw notFound("Class");
    if (body.name && body.name.toLowerCase() !== cls.name.toLowerCase() && (await prisma.schoolClass.findFirst({ where: { schoolId: school.id, name: { equals: body.name, mode: "insensitive" } } })))
      throw conflict(`Class ${body.name} already exists.`);
    await prisma.$transaction(async (tx) => {
      await tx.schoolClass.update({ where: { id: cls.id }, data: body });
      if (body.name && body.name !== cls.name) {
        await tx.student.updateMany({ where: { schoolId: school.id, className: cls.name }, data: { className: body.name } });
        await tx.staff.updateMany({ where: { schoolId: school.id, className: cls.name }, data: { className: body.name } });
      }
      if (body.name && body.sortOrder === undefined) await reorderClasses(tx, school.id);
    });
    await audit(req, { action: "class.updated", summary: `${p.name} renamed class ${cls.name}${body.name ? ` to ${body.name}` : ""}`, schoolId: school.id });
    return { ok: true };
  });

  // Change sheet #12: classes and sections can be deleted once they hold no students.
  app.delete("/:id/classes/:classId", async (req) => {
    const p = principal(req);
    require(canEdit(p));
    const { id, classId } = req.params as { id: string; classId: string };
    const school = await accessSchool(p, id);
    const cls = await prisma.schoolClass.findFirst({ where: { id: classId, schoolId: school.id } });
    if (!cls) throw notFound("Class");
    const n = await prisma.student.count({ where: { schoolId: school.id, className: cls.name, deletedAt: null } });
    if (n) throw conflict(`Class ${cls.name} still has ${n} student${n === 1 ? "" : "s"}. Move or delete them first.`, { students: n });
    await prisma.schoolClass.delete({ where: { id: cls.id } });
    await audit(req, { action: "class.deleted", summary: `${p.name} deleted class ${cls.name}`, schoolId: school.id });
    return { ok: true };
  });

  app.post("/:id/classes/:classId/sections", async (req) => {
    const p = principal(req);
    require(canEdit(p));
    const { id, classId } = req.params as { id: string; classId: string };
    const school = await accessSchool(p, id);
    const cls = await prisma.schoolClass.findFirst({ where: { id: classId, schoolId: school.id } });
    if (!cls) throw notFound("Class");
    const { name } = z.object({ name: z.string().trim().min(1).max(10) }).parse(req.body);
    const section = await prisma.section.create({ data: { classId: cls.id, name: name.toUpperCase() } });
    await audit(req, { action: "section.created", summary: `${p.name} added section ${cls.name}-${section.name}`, schoolId: school.id });
    return section;
  });

  app.delete("/:id/classes/:classId/sections/:sectionId", async (req) => {
    const p = principal(req);
    require(canEdit(p));
    const { id, classId, sectionId } = req.params as { id: string; classId: string; sectionId: string };
    const school = await accessSchool(p, id);
    const section = await prisma.section.findFirst({ where: { id: sectionId, classId, class: { schoolId: school.id } }, include: { class: true } });
    if (!section) throw notFound("Section");
    const n = await prisma.student.count({ where: { schoolId: school.id, className: section.class.name, section: section.name, deletedAt: null } });
    if (n) throw conflict(`Section ${section.class.name}-${section.name} still has ${n} student${n === 1 ? "" : "s"}. Move or delete them first.`, { students: n });
    await prisma.section.delete({ where: { id: section.id } });
    await audit(req, { action: "section.deleted", summary: `${p.name} deleted section ${section.class.name}-${section.name}`, schoolId: school.id });
    return { ok: true };
  });

  // ---- Staff roles ----
  app.get("/:id/staff-roles", async (req) => {
    const school = await accessSchool(principal(req), (req.params as { id: string }).id);
    return { items: (await prisma.staffRole.findMany({ where: { schoolId: school.id }, orderBy: { name: "asc" } })).map((r) => r.name) };
  });

  app.put("/:id/staff-roles", async (req) => {
    const p = principal(req);
    require(canEdit(p));
    const school = await accessSchool(p, (req.params as { id: string }).id);
    const { roles } = z.object({ roles: z.array(z.string().trim().min(1).max(40)).max(100) }).parse(req.body);
    await prisma.$transaction([
      prisma.staffRole.deleteMany({ where: { schoolId: school.id } }),
      prisma.staffRole.createMany({ data: [...new Set(roles)].map((name) => ({ schoolId: school.id, name })) }),
    ]);
    return { items: roles };
  });
}
