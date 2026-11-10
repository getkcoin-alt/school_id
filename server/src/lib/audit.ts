import type { FastifyRequest } from "fastify";
import { prisma, type Tx } from "./db.js";

export interface AuditEntry {
  action: string;
  summary: string;
  entityType?: string;
  entityId?: string;
  schoolId?: string | null;
  agentId?: string | null;
  meta?: Record<string, unknown>;
}

/** Records who did what. Agent scope is derived from the school when not given. */
export async function audit(req: FastifyRequest | null, entry: AuditEntry, tx?: Tx) {
  const db = tx ?? prisma;
  let agentId = entry.agentId ?? null;
  if (!agentId && entry.schoolId) {
    agentId = (await db.school.findUnique({ where: { id: entry.schoolId }, select: { agentId: true } }))?.agentId ?? null;
  }
  const p = req?.principal;
  await db.activityLog.create({
    data: {
      actorId: p?.userId,
      actorName: p?.name,
      actorRole: p?.role,
      impersonatorId: p?.impersonatorId,
      schoolId: entry.schoolId ?? null,
      agentId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      summary: entry.summary,
      meta: (entry.meta ?? {}) as object,
      ip: req?.ip,
    },
  });
}
