import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { isAgent, isSuper, principal, schoolWhere } from "../lib/access.js";

/**
 * Universal search (Cmd/Ctrl+K): students, staff, schools, agents and print
 * batches the signed-in person may see. Students match in any session; each
 * result carries what the app needs to open it.
 */
export async function searchRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const p = principal(req);
    const { q } = z.object({ q: z.string().trim().min(1).max(80) }).parse(req.query);
    const text = { contains: q, mode: "insensitive" as const };
    const school = schoolWhere(p);
    const [students, staff, schools, agents, batches] = await Promise.all([
      prisma.student.findMany({
        where: { deletedAt: null, school, OR: [{ name: text }, { admissionNo: text }, { code: text }, { photoNo: text }, { fatherName: text }, { phone: { contains: q } }] },
        select: { id: true, name: true, admissionNo: true, className: true, section: true, session: true, status: true, schoolId: true, school: { select: { name: true, currentSession: true } } },
        orderBy: [{ updatedAt: "desc" }],
        take: 8,
      }),
      prisma.staff.findMany({
        where: { deletedAt: null, school, OR: [{ name: text }, { code: text }, { role: text }] },
        select: { id: true, name: true, role: true, schoolId: true, school: { select: { name: true } } },
        take: 5,
      }),
      isSuper(p) || isAgent(p)
        ? prisma.school.findMany({ where: { ...school, OR: [{ name: text }, { code: text }, { city: text }, { email: text }] }, select: { id: true, name: true, city: true, code: true }, take: 5 })
        : [],
      isSuper(p)
        ? prisma.agent.findMany({ where: { deletedAt: null, OR: [{ name: text }, { company: text }, { email: text }, { code: text }] }, select: { id: true, name: true, company: true, tier: true }, take: 5 })
        : [],
      prisma.printBatch.findMany({
        where: {
          OR: [{ code: text }, { name: text }],
          ...(isAgent(p) ? { AND: [{ OR: [{ school }, { fulfillerAgentId: p.agentId }] }] } : { school }),
        },
        select: { id: true, code: true, name: true, status: true, schoolId: true, school: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);
    return {
      students: students.map(({ school: s, ...r }) => ({ ...r, schoolName: s.name, current: r.session === s.currentSession })),
      staff: staff.map(({ school: s, ...r }) => ({ ...r, schoolName: s.name })),
      schools,
      agents,
      batches: batches.map(({ school: s, ...r }) => ({ ...r, schoolName: s.name })),
    };
  });
}
