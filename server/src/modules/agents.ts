import type { FastifyInstance } from "fastify";
import type { Agent } from "@prisma/client";
import { z } from "zod";
import { prisma, nextCode } from "../lib/db.js";
import { conflict, notFound } from "../lib/errors.js";
import { can, isAgent, isSuper, principal, require } from "../lib/access.js";
import { audit } from "../lib/audit.js";
import { normaliseEmail, sendOnboardingInvite } from "../lib/onboarding.js";
import { keep, normalizePhone, parseDate, isoDate, validPhone } from "../lib/normalize.js";
import { fileUrl } from "../lib/storage.js";
import { agentImpact } from "../lib/impact.js";

export async function serializeAgent(a: Agent & { _count?: { schools: number } }) {
  return {
    id: a.id,
    code: a.code,
    name: a.name,
    company: a.company,
    email: a.email,
    phone: a.phone,
    tier: a.tier,
    address: a.address,
    city: a.city,
    state: a.state,
    country: a.country,
    pin: a.pin,
    subscriptionStart: isoDate(a.subscriptionStart),
    subscriptionEnd: isoDate(a.subscriptionEnd),
    status: a.status,
    printBySelf: a.printBySelf,
    photoUrl: await fileUrl(a.photoKey),
    schoolCount: a._count?.schools,
    createdAt: a.createdAt,
  };
}

const profile = {
  name: z.string().trim().min(2, "Enter the agent's name."),
  company: z.string().trim().optional().nullable(),
  phone: z.string().optional().nullable().transform(keep((v) => normalizePhone(v ?? undefined) ?? null)).refine((v) => validPhone(v ?? undefined), "Enter a valid 10-digit mobile number."),
  address: z.string().trim().optional().nullable(),
  city: z.string().trim().optional().nullable(),
  state: z.string().trim().optional().nullable(),
  country: z.string().trim().optional().nullable(),
  pin: z.string().trim().optional().nullable(),
};
const adminOnly = {
  tier: z.enum(["PREMIUM", "REGULAR"]),
  subscriptionStart: z.string().optional().nullable(),
  subscriptionEnd: z.string().optional().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE"]),
  printBySelf: z.boolean(),
};

export async function agentRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const p = principal(req);
    require(isSuper(p));
    const q = z.object({ tier: z.enum(["PREMIUM", "REGULAR"]).optional(), status: z.enum(["ACTIVE", "INACTIVE"]).optional(), search: z.string().optional() }).parse(req.query);
    const agents = await prisma.agent.findMany({
      where: {
        deletedAt: null,
        tier: q.tier,
        status: q.status,
        ...(q.search ? { OR: [{ name: { contains: q.search, mode: "insensitive" } }, { email: { contains: q.search, mode: "insensitive" } }, { code: { contains: q.search, mode: "insensitive" } }] } : {}),
      },
      include: { _count: { select: { schools: { where: { deletedAt: null } } } } },
      orderBy: { name: "asc" },
    });
    return { items: await Promise.all(agents.map(serializeAgent)) };
  });

  app.post("/", async (req) => {
    const p = principal(req);
    require(can.manageAgents(p));
    const body = z.object({ ...profile, email: z.string().email("Enter a valid email address."), ...adminOnly, status: adminOnly.status.default("ACTIVE"), printBySelf: z.boolean().default(false) }).parse(req.body);
    const email = normaliseEmail(body.email);
    if (await prisma.user.findUnique({ where: { email } })) throw conflict("A login with this email already exists.");
    const { agent, user } = await prisma.$transaction(async (tx) => {
      const agent = await tx.agent.create({
        data: {
          ...body,
          email,
          code: await nextCode(tx, "agent", "AG"),
          subscriptionStart: parseDate(body.subscriptionStart),
          subscriptionEnd: parseDate(body.subscriptionEnd),
          printBySelf: body.tier === "PREMIUM" && body.printBySelf,
        },
      });
      const user = await tx.user.create({ data: { email, name: body.name, phone: body.phone, role: "AGENT", agentId: agent.id } });
      return { agent, user };
    });
    await sendOnboardingInvite(user, p.name);
    await audit(req, { action: "agent.created", summary: `${p.name} added ${body.tier.toLowerCase()} agent ${agent.name}`, entityType: "agent", entityId: agent.id, agentId: agent.id });
    return serializeAgent(agent);
  });

  app.get("/:id", async (req) => {
    const p = principal(req);
    const { id } = req.params as { id: string };
    require(isSuper(p) || (isAgent(p) && p.agentId === id));
    const agent = await prisma.agent.findFirst({ where: { id, deletedAt: null }, include: { _count: { select: { schools: { where: { deletedAt: null } } } } } });
    if (!agent) throw notFound("Agent");
    const logins = await prisma.user.findMany({ where: { agentId: id }, select: { id: true, email: true, name: true, status: true, lastLoginAt: true } });
    return { ...(await serializeAgent(agent)), logins };
  });

  app.patch("/:id", async (req) => {
    const p = principal(req);
    const { id } = req.params as { id: string };
    require(isSuper(p) || (isAgent(p) && p.agentId === id));
    const shape = isSuper(p) ? z.object({ ...profile, ...adminOnly }).partial() : z.object(profile).partial();
    const body = shape.parse(req.body) as Record<string, unknown>;
    const existing = await prisma.agent.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw notFound("Agent");
    const data: Record<string, unknown> = { ...body };
    if ("subscriptionStart" in body) data.subscriptionStart = parseDate(body.subscriptionStart) ?? null;
    if ("subscriptionEnd" in body) {
      data.subscriptionEnd = parseDate(body.subscriptionEnd) ?? null;
      data.expiryNotified = false;
    }
    if ((body.tier ?? existing.tier) === "REGULAR") data.printBySelf = false;
    const agent = await prisma.agent.update({ where: { id }, data });
    if (body.status === "INACTIVE") await prisma.user.updateMany({ where: { agentId: id }, data: { tokenVersion: { increment: 1 } } });
    await audit(req, { action: "agent.updated", summary: `${p.name} updated agent ${agent.name}`, entityType: "agent", entityId: id, agentId: id, meta: { fields: Object.keys(body) } });
    return serializeAgent(agent);
  });

  app.get("/:id/impact", async (req) => {
    const p = principal(req);
    require(can.manageAgents(p));
    const { id } = req.params as { id: string };
    const agent = await prisma.agent.findFirst({ where: { id, deletedAt: null } });
    if (!agent) throw notFound("Agent");
    return agentImpact(id);
  });

  app.delete("/:id", async (req) => {
    const p = principal(req);
    require(can.manageAgents(p));
    const { id } = req.params as { id: string };
    const agent = await prisma.agent.findFirst({ where: { id, deletedAt: null } });
    if (!agent) throw notFound("Agent");
    await prisma.$transaction([
      prisma.school.updateMany({ where: { agentId: id }, data: { agentId: null } }),
      prisma.user.updateMany({ where: { agentId: id }, data: { status: "DISABLED", tokenVersion: { increment: 1 } } }),
      prisma.refreshToken.updateMany({ where: { user: { agentId: id }, revokedAt: null }, data: { revokedAt: new Date() } }),
      prisma.printBatch.updateMany({ where: { fulfillerAgentId: id, status: { in: ["SUBMITTED", "IN_PROGRESS"] } }, data: { fulfillerAgentId: null, fulfilledBy: "CENTRAL" } }),
      prisma.design.updateMany({ where: { agentId: id, deletedAt: null }, data: { deletedAt: new Date() } }),
      prisma.agent.update({ where: { id }, data: { deletedAt: new Date(), status: "INACTIVE" } }),
    ]);
    await audit(req, { action: "agent.deleted", summary: `${p.name} removed agent ${agent.name}; their schools are now unassigned`, entityType: "agent", entityId: id, agentId: id });
    return { ok: true };
  });
}
