import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { can, isAgent, isSuper, principal, schoolWhere } from "../lib/access.js";
import { serializeSchool, studentCounts } from "./schools.js";
import { serializeAgent } from "./agents.js";
import { schoolFields } from "../lib/fields.js";
import { PREFIXES } from "../lib/students.js";
import { isoDate } from "../lib/normalize.js";
import { classRank } from "../lib/session.js";
import { fileUrl } from "../lib/storage.js";

/**
 * One round trip to start a session in the web app: who I am, what I may do,
 * the schools I can see and the selected school's setup. Students are paged
 * separately through /students.
 */
export async function workspaceRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const p = principal(req);
    const q = z.object({ schoolId: z.string().optional(), session: z.string().optional() }).parse(req.query);
    const schools = await prisma.school.findMany({ where: schoolWhere(p), include: { agent: true }, orderBy: { name: "asc" } });
    const selected = schools.find((s) => s.id === q.schoolId || s.code === q.schoolId) ?? schools[0] ?? null;
    const agents = isSuper(p)
      ? await prisma.agent.findMany({ where: { deletedAt: null }, include: { _count: { select: { schools: { where: { deletedAt: null } } } } }, orderBy: { name: "asc" } })
      : isAgent(p)
        ? await prisma.agent.findMany({ where: { id: p.agentId! } })
        : [];
    const [designs, unread] = await Promise.all([
      prisma.design.findMany({ where: { deletedAt: null, ...(isSuper(p) ? {} : { OR: [{ agentId: null }, { agentId: p.agentId ?? selected?.agentId ?? "__none__" }] }) }, orderBy: { name: "asc" } }),
      prisma.notification.count({ where: { userId: p.userId, readAt: null } }),
    ]);
    const perSchool = await studentCounts(schools);
    let school = null;
    if (selected) {
      const [studentFields, staffFields, classes, sessions, staffRoles, counts] = await Promise.all([
        schoolFields(selected.id, "STUDENT"),
        schoolFields(selected.id, "STAFF"),
        prisma.schoolClass.findMany({ where: { schoolId: selected.id }, include: { sections: { orderBy: { name: "asc" } } }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
        prisma.academicSession.findMany({ where: { schoolId: selected.id }, orderBy: { name: "desc" } }),
        prisma.staffRole.findMany({ where: { schoolId: selected.id }, orderBy: { name: "asc" } }),
        prisma.student.groupBy({ by: ["status"], where: { schoolId: selected.id, session: q.session || selected.currentSession || undefined, deletedAt: null }, _count: true }),
      ]);
      school = {
        ...(await serializeSchool(selected)),
        fields: { student: studentFields, staff: staffFields },
        classes: classes
          .map((c, i) => ({ c, i }))
          .sort((a, b) => classRank(a.c.name) - classRank(b.c.name) || a.i - b.i)
          .map(({ c }) => ({ id: c.id, name: c.name, sections: c.sections.map((s) => ({ id: s.id, name: s.name })) })),
        sessions: sessions.map((s) => ({ id: s.id, name: s.name, startDate: isoDate(s.startDate), endDate: isoDate(s.endDate), isCurrent: s.isCurrent })),
        staffRoles: staffRoles.map((r) => r.name),
        counts: Object.fromEntries(counts.map((c) => [c.status, c._count])),
      };
    }
    return {
      me: { id: p.userId, name: p.name, email: p.email, role: p.role, agentId: p.agentId, agentTier: p.agentTier, schoolId: p.schoolId, impersonatorId: p.impersonatorId },
      permissions: Object.fromEntries(Object.entries(can).map(([k, fn]) => [k, fn(p)])),
      schools: await Promise.all(schools.map(async (s) => ({ ...(await serializeSchool(s)), studentCount: perSchool.get(s.id) ?? 0 }))),
      agents: await Promise.all(agents.map(serializeAgent)),
      designs: await Promise.all(designs.map(async (d) => ({ id: d.id, code: d.code, name: d.name, kind: d.kind, audience: d.audience, color: d.color, agentId: d.agentId, frontUrl: await fileUrl(d.frontKey) }))),
      school,
      prefixes: PREFIXES,
      unreadNotifications: unread,
      features: { whatsapp: false },
    };
  });
}
