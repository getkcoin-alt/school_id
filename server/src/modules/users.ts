import type { FastifyInstance } from "fastify";
import type { Agent, School, User } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors.js";
import { isSchool, isSuper, principal, require } from "../lib/access.js";
import { audit } from "../lib/audit.js";
import { normaliseEmail, sendOnboardingInvite } from "../lib/onboarding.js";
import { normalizePhone } from "../lib/normalize.js";

export function serializeUser(u: User & { agent?: Agent | null; school?: School | null }) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    phone: u.phone,
    role: u.role,
    status: u.status,
    agentId: u.agentId,
    agentCode: u.agent?.code ?? null,
    agentTier: u.agent?.tier ?? null,
    schoolId: u.schoolId,
    schoolCode: u.school?.code ?? null,
    schoolName: u.school?.name ?? null,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
  };
}

export async function userRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const p = principal(req);
    const q = z.object({ role: z.enum(["SUPER_ADMIN", "AGENT", "SCHOOL_ADMIN"]).optional(), schoolId: z.string().optional(), agentId: z.string().optional(), search: z.string().optional() }).parse(req.query);
    const where: Record<string, unknown> = {};
    if (isSuper(p)) {
      if (q.role) where.role = q.role;
      if (q.schoolId) where.schoolId = q.schoolId;
      if (q.agentId) where.agentId = q.agentId;
    } else if (isSchool(p)) where.schoolId = p.schoolId;
    else where.agentId = p.agentId;
    if (q.search) where.OR = [{ name: { contains: q.search, mode: "insensitive" } }, { email: { contains: q.search, mode: "insensitive" } }];
    const users = await prisma.user.findMany({ where, include: { agent: true, school: true }, orderBy: { name: "asc" }, take: 500 });
    return { items: users.map(serializeUser) };
  });

  // Super admin adds a login for a school or an agent; a school admin may add colleagues.
  app.post("/", async (req) => {
    const p = principal(req);
    const body = z
      .object({
        email: z.string().email("Enter a valid email address."),
        name: z.string().trim().min(2, "Enter the person's name."),
        phone: z.string().optional(),
        role: z.enum(["SUPER_ADMIN", "AGENT", "SCHOOL_ADMIN"]),
        schoolId: z.string().optional(),
        agentId: z.string().optional(),
      })
      .parse(req.body);
    if (!isSuper(p)) {
      require(isSchool(p) && body.role === "SCHOOL_ADMIN", "Only a super admin can add this login.");
      body.schoolId = p.schoolId!;
    }
    if (body.role === "SCHOOL_ADMIN" && !body.schoolId) throw badRequest("Choose the school for this login.");
    if (body.role === "AGENT" && !body.agentId) throw badRequest("Choose the agent for this login.");
    const email = normaliseEmail(body.email);
    if (await prisma.user.findUnique({ where: { email } })) throw conflict("A login with this email already exists.");
    const user = await prisma.user.create({
      data: {
        email,
        name: body.name,
        phone: normalizePhone(body.phone),
        role: body.role,
        schoolId: body.role === "SCHOOL_ADMIN" ? body.schoolId : null,
        agentId: body.role === "AGENT" ? body.agentId : null,
      },
      include: { agent: true, school: true },
    });
    await sendOnboardingInvite(user, p.name);
    await audit(req, { action: "user.created", summary: `${p.name} invited ${user.name} (${user.email})`, entityType: "user", entityId: user.id, schoolId: user.schoolId, agentId: user.agentId });
    return serializeUser(user);
  });

  app.post("/:id/resend-invite", async (req) => {
    const p = principal(req);
    const { id } = req.params as { id: string };
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw notFound("User");
    require(isSuper(p) || (isSchool(p) && user.schoolId === p.schoolId));
    if (user.status === "DISABLED") throw badRequest("Enable the account before sending a new invitation.");
    await sendOnboardingInvite(user, p.name);
    await audit(req, { action: "user.invite_resent", summary: `Setup email re-sent to ${user.email}`, entityType: "user", entityId: user.id, schoolId: user.schoolId, agentId: user.agentId });
    return { ok: true };
  });

  app.patch("/:id", async (req) => {
    const p = principal(req);
    const { id } = req.params as { id: string };
    const body = z.object({ name: z.string().trim().min(2).optional(), phone: z.string().optional(), status: z.enum(["ACTIVE", "DISABLED"]).optional() }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw notFound("User");
    require(isSuper(p) || (isSchool(p) && user.schoolId === p.schoolId));
    if (user.id === p.userId && body.status === "DISABLED") throw forbidden("You cannot disable your own account.");
    const updated = await prisma.user.update({
      where: { id },
      data: {
        name: body.name,
        phone: body.phone !== undefined ? normalizePhone(body.phone) : undefined,
        status: body.status === "ACTIVE" && !user.passwordHash ? "INVITED" : body.status,
        tokenVersion: body.status === "DISABLED" ? { increment: 1 } : undefined,
      },
      include: { agent: true, school: true },
    });
    if (body.status === "DISABLED") await prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit(req, { action: "user.updated", summary: `${p.name} updated login ${updated.email}${body.status ? ` (${body.status.toLowerCase()})` : ""}`, entityType: "user", entityId: id, schoolId: updated.schoolId, agentId: updated.agentId });
    return serializeUser(updated);
  });

  app.patch("/me", async (req) => {
    const p = principal(req);
    const body = z.object({ name: z.string().trim().min(2).optional(), phone: z.string().optional() }).parse(req.body);
    const user = await prisma.user.update({
      where: { id: p.userId },
      data: { name: body.name, phone: body.phone !== undefined ? normalizePhone(body.phone) : undefined },
      include: { agent: true, school: true },
    });
    return serializeUser(user);
  });
}
