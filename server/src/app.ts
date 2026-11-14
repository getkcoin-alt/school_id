import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import cookie from "@fastify/cookie";
import { ZodError } from "zod";
import { config } from "./config.js";
import { prisma } from "./lib/db.js";
import { AppError } from "./lib/errors.js";
import { verifyAccess } from "./lib/tokens.js";
import type { Principal } from "./lib/access.js";
import { redis } from "./lib/queue.js";
import { logger } from "./lib/logger.js";
import { authRoutes } from "./modules/auth.js";
import { userRoutes } from "./modules/users.js";
import { agentRoutes } from "./modules/agents.js";
import { schoolRoutes } from "./modules/schools.js";
import { academicRoutes } from "./modules/academics.js";
import { studentRoutes } from "./modules/students.js";
import { staffRoutes } from "./modules/staff.js";
import { invitationRoutes } from "./modules/invitations.js";
import { portalRoutes } from "./modules/portal.js";
import { photoRoutes } from "./modules/photos.js";
import { batchRoutes } from "./modules/batches.js";
import { designRoutes } from "./modules/designs.js";
import { activityRoutes } from "./modules/activity.js";
import { notificationRoutes } from "./modules/notifications.js";
import { workspaceRoutes } from "./modules/workspace.js";
import { searchRoutes } from "./modules/search.js";
import { fileRoutes } from "./modules/files.js";

declare module "fastify" {
  interface FastifyRequest {
    principal?: Principal;
  }
}

export async function buildApp() {
  const app = Fastify({
    // Behind nginx the public path may be /api/api/v1/... or /api/v1/...; route both to /api/v1.
    rewriteUrl: (req) => {
      const url = req.url ?? "/";
      const i = url.indexOf("/v1/");
      return i >= 0 && url.slice(0, i).replace(/\/api/g, "") === "" ? `/api${url.slice(i)}` : url;
    },
    loggerInstance: logger,
    trustProxy: true,
    bodyLimit: 2 * 1024 * 1024,
    disableRequestLogging: config.NODE_ENV === "test",
  });

  await app.register(helmet, { crossOriginResourcePolicy: { policy: "cross-origin" } });
  await app.register(cors, {
    origin: config.CORS_ORIGINS.split(",").map((s) => s.trim()),
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Authorization", "Content-Type", "X-Client"],
    exposedHeaders: ["Content-Disposition"],
    maxAge: 600,
  });
  await app.register(cookie);
  // Shared through Redis so limits hold across API instances.
  if (config.NODE_ENV !== "test") {
    await app.register(rateLimit, { global: true, max: 600, timeWindow: "1 minute", ...(redis ? { redis } : {}) });
  }
  await app.register(multipart, {
    limits: { fileSize: config.MAX_UPLOAD_MB * 1024 * 1024, files: 200, fields: 50 },
  });

  // Authentication: every /api/v1 request may carry a bearer access token.
  app.addHook("onRequest", async (req) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) return;
    try {
      const claims = await verifyAccess(header.slice(7));
      const user = await prisma.user.findUnique({ where: { id: claims.sub }, include: { agent: true, school: true } });
      if (!user || user.tokenVersion !== claims.tv) return;
      if (user.status !== "ACTIVE" && !(claims.imp && user.status === "INVITED")) return;
      if (claims.imp) {
        // Impersonation ends as soon as its session is revoked.
        const live = await prisma.refreshToken.findFirst({ where: { familyId: claims.fid, revokedAt: null, expiresAt: { gt: new Date() } }, select: { id: true } });
        if (!live) return;
      }
      // Inactive schools and agents are signed out; a super admin may still open them.
      if (!claims.imp && user.agent && (user.agent.status !== "ACTIVE" || user.agent.deletedAt)) return;
      if (!claims.imp && user.school && (user.school.status !== "ACTIVE" || user.school.deletedAt)) return;
      req.principal = {
        userId: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        agentId: user.agentId,
        agentTier: user.agent?.tier ?? null,
        schoolId: user.schoolId,
        impersonatorId: claims.imp ?? null,
        familyId: claims.fid,
      };
    } catch {
      /* invalid or expired token: treated as anonymous */
    }
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message, details: err.details } });
    }
    if (err instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION",
          message: err.issues[0]?.message ?? "Check the highlighted fields.",
          details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
      });
    }
    const e = err as { statusCode?: number; code?: string; message: string };
    if (e.code === "P2002") {
      return reply.status(409).send({ error: { code: "CONFLICT", message: "A record with these details already exists." } });
    }
    if (e.statusCode && e.statusCode < 500) {
      return reply.status(e.statusCode).send({ error: { code: e.code ?? "REQUEST", message: e.message } });
    }
    req.log.error({ err }, "unhandled error");
    return reply.status(500).send({ error: { code: "INTERNAL", message: "Something went wrong. Please try again." } });
  });

  app.get("/health", async () => ({ ok: true }));
  app.get("/ready", async () => {
    await prisma.$queryRaw`SELECT 1`;
    if (redis) await redis.ping();
    return { ok: true };
  });

  await app.register(
    async (api) => {
      await api.register(authRoutes, { prefix: "/auth" });
      await api.register(userRoutes, { prefix: "/users" });
      await api.register(agentRoutes, { prefix: "/agents" });
      await api.register(schoolRoutes, { prefix: "/schools" });
      await api.register(academicRoutes, { prefix: "/schools" });
      await api.register(studentRoutes, { prefix: "/students" });
      await api.register(staffRoutes, { prefix: "/staff" });
      await api.register(invitationRoutes, { prefix: "/invitations" });
      await api.register(portalRoutes, { prefix: "/portal" });
      await api.register(photoRoutes, { prefix: "/media" });
      await api.register(batchRoutes, { prefix: "/batches" });
      await api.register(designRoutes, { prefix: "/designs" });
      await api.register(activityRoutes, { prefix: "/activity" });
      await api.register(notificationRoutes, { prefix: "/notifications" });
      await api.register(workspaceRoutes, { prefix: "/workspace" });
      await api.register(searchRoutes, { prefix: "/search" });
      await api.register(fileRoutes, { prefix: "/files" });
    },
    { prefix: "/api/v1" },
  );

  return app;
}
