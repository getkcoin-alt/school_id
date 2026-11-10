import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { isAgent, isSchool, isSuper, principal } from "../lib/access.js";

/**
 * Activity logs (proposal section D). Super admin: everything. Agents: their own
 * actions plus their schools'. School admins: their school. Filters: user, school, date.
 */
export async function activityRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const p = principal(req);
    const q = z
      .object({
        userId: z.string().optional(),
        schoolId: z.string().optional(),
        agentId: z.string().optional(),
        action: z.string().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        search: z.string().optional(),
        cursor: z.string().optional(),
        size: z.coerce.number().min(1).max(200).default(50),
      })
      .parse(req.query);
    const scope: Prisma.ActivityLogWhereInput = isSuper(p)
      ? {}
      : isAgent(p)
        ? { OR: [{ actorId: p.userId }, { agentId: p.agentId }] }
        : isSchool(p)
          ? { schoolId: p.schoolId }
          : { id: "__none__" };
    const createdAt: Prisma.DateTimeFilter = {};
    if (q.from) createdAt.gte = new Date(q.from);
    if (q.to) createdAt.lte = new Date(/^\d{4}-\d{2}-\d{2}$/.test(q.to) ? `${q.to}T23:59:59.999Z` : q.to);
    const where: Prisma.ActivityLogWhereInput = {
      AND: [
        scope,
        q.userId ? { OR: [{ actorId: q.userId }, { impersonatorId: q.userId }] } : {},
        q.schoolId ? { schoolId: q.schoolId } : {},
        q.agentId && isSuper(p) ? { agentId: q.agentId } : {},
        q.action ? { action: { startsWith: q.action } } : {},
        q.from || q.to ? { createdAt } : {},
        q.search ? { summary: { contains: q.search, mode: "insensitive" } } : {},
      ],
    };
    const rows = await prisma.activityLog.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: q.size + 1, ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}) });
    const more = rows.length > q.size;
    const items = rows.slice(0, q.size);
    const impersonators = await prisma.user.findMany({ where: { id: { in: items.map((r) => r.impersonatorId!).filter(Boolean) } }, select: { id: true, name: true } });
    return {
      items: items.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        actorId: r.actorId,
        actorName: r.actorName,
        actorRole: r.actorRole,
        impersonatedBy: r.impersonatorId ? (impersonators.find((u) => u.id === r.impersonatorId)?.name ?? "Super admin") : null,
        schoolId: r.schoolId,
        agentId: r.agentId,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        summary: r.summary,
        ip: isSuper(p) ? r.ip : undefined,
      })),
      nextCursor: more ? items[items.length - 1].id : null,
    };
  });
}
