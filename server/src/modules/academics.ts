import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { conflict, notFound } from "../lib/errors.js";
import { accessSchool, isAgent, isSchool, isSuper, principal, require } from "../lib/access.js";
import { audit } from "../lib/audit.js";
import { isoDate, parseDate } from "../lib/normalize.js";

/** Sessions, classes, sections and staff roles, all nested under a school. */
export async function academicRoutes(app: FastifyInstance) {
  const canEdit = (p: ReturnType<typeof principal>) => isSuper(p) || isSchool(p) || isAgent(p);

  // ---- Academic sessions ----
  app.get("/:id/sessions", async (req) => {
    const school = await accessSchool(principal(req), (req.params as { id: string }).id);
    const rows = await prisma.academicSession.findMany({ where: { schoolId: school.id }, orderBy: { name: "desc" } });
    return { items: rows.map((r) => ({ id: r.id, name: r.name, startDate: isoDate(r.startDate), endDate: isoDate(r.endDate), isCurrent: r.isCurrent })) };
  });

  app.post("/:id/sessions", async (req) => {
    const p = principal(req);
    require(canEdit(p));
    const school = await accessSchool(p, (req.params as { id: string }).id);
    const body = z.object({ name: z.string().trim().min(4).max(20), startDate: z.string().optional(), endDate: z.string().optional(), isCurrent: z.boolean().default(false) }).parse(req.body);
    const row = await prisma.$transaction(async (tx) => {
      if (body.isCurrent) await tx.academicSession.updateMany({ where: { schoolId: school.id }, data: { isCurrent: false } });
      const row = await tx.academicSession.create({ data: { schoolId: school.id, name: body.name, startDate: parseDate(body.startDate), endDate: parseDate(body.endDate), isCurrent: body.isCurrent } });
      if (body.isCurrent) await tx.school.update({ where: { id: school.id }, data: { currentSession: body.name } });
      return row;
    });
    await audit(req, { action: "session.created", summary: `${p.name} added session ${body.name} for ${school.name}`, schoolId: school.id, entityType: "session", entityId: row.id });
    return row;
  });

  app.patch("/:id/sessions/:sessionId", async (req) => {
    const p = principal(req);
    require(canEdit(p));
    const { id, sessionId } = req.params as { id: string; sessionId: string };
    const school = await accessSchool(p, id);
    const body = z.object({ startDate: z.string().nullable().optional(), endDate: z.string().nullable().optional(), isCurrent: z.literal(true).optional() }).parse(req.body);
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
    const max = await prisma.schoolClass.aggregate({ where: { schoolId: school.id }, _max: { sortOrder: true } });
    const cls = await prisma.schoolClass.create({
      data: { schoolId: school.id, name: body.name, sortOrder: (max._max.sortOrder ?? 0) + 1, sections: { create: [...new Set(body.sections.map((s) => s.toUpperCase()))].map((name) => ({ name })) } },
      include: { sections: true },
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
    await prisma.$transaction(async (tx) => {
      await tx.schoolClass.update({ where: { id: cls.id }, data: body });
      if (body.name && body.name !== cls.name) {
        await tx.student.updateMany({ where: { schoolId: school.id, className: cls.name }, data: { className: body.name } });
        await tx.staff.updateMany({ where: { schoolId: school.id, className: cls.name }, data: { className: body.name } });
      }
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
