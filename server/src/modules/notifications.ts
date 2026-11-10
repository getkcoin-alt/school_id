import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { principal } from "../lib/access.js";

export async function notificationRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const p = principal(req);
    const rows = await prisma.notification.findMany({ where: { userId: p.userId }, orderBy: { createdAt: "desc" }, take: 50 });
    const unread = await prisma.notification.count({ where: { userId: p.userId, readAt: null } });
    return { items: rows, unread };
  });

  app.post("/read", async (req) => {
    const p = principal(req);
    const { ids } = z.object({ ids: z.array(z.string()).optional() }).parse(req.body ?? {});
    await prisma.notification.updateMany({ where: { userId: p.userId, readAt: null, ...(ids ? { id: { in: ids } } : {}) }, data: { readAt: new Date() } });
    return { ok: true };
  });
}
