import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { config, isProd } from "../config.js";
import { prisma } from "../lib/db.js";
import { badRequest, forbidden, notFound, unauthorized } from "../lib/errors.js";
import { hashPassword, otpCode, passwordRule, randomToken, sha256, strongPassword, verifyPassword } from "../lib/crypto.js";
import { signAccess } from "../lib/tokens.js";
import { can, principal } from "../lib/access.js";
import { audit } from "../lib/audit.js";
import { layout, queueEmail } from "../lib/mail.js";
import { normaliseEmail } from "../lib/onboarding.js";
import { serializeUser } from "./users.js";

const COOKIE = "ids_rt";
// Cookie path must match the browser-visible URL (e.g. /api/api/v1/auth behind an nginx /api/ prefix).
const COOKIE_PATH = `${new URL(config.API_PUBLIC_URL).pathname.replace(/\/$/, "")}/api/v1/auth`;
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

const password = z.string().refine(strongPassword, passwordRule);

const isMobile = (req: FastifyRequest) => req.headers["x-client"] === "mobile";

async function issueSession(
  req: FastifyRequest,
  reply: FastifyReply,
  userId: string,
  opts: { familyId?: string; impersonatorId?: string } = {},
) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { agent: true, school: true } });
  const refresh = randomToken(48);
  const familyId = opts.familyId ?? randomToken(12);
  const days = opts.impersonatorId ? 1 : config.REFRESH_TOKEN_DAYS;
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: sha256(refresh),
      familyId,
      impersonatorId: opts.impersonatorId,
      expiresAt: new Date(Date.now() + days * 86400_000),
      userAgent: req.headers["user-agent"]?.slice(0, 250),
      ip: req.ip,
    },
  });
  const accessToken = await signAccess({ sub: userId, tv: user.tokenVersion, fid: familyId, imp: opts.impersonatorId });
  const out: Record<string, unknown> = { accessToken, user: serializeUser(user), impersonatedBy: opts.impersonatorId ?? null };
  // Impersonation sessions never replace the super admin's own cookie.
  if (opts.impersonatorId || isMobile(req)) out.refreshToken = refresh;
  else
    reply.setCookie(COOKIE, refresh, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "none" : "lax",
      path: COOKIE_PATH,
      maxAge: days * 86400,
    });
  return out;
}

export async function authRoutes(app: FastifyInstance) {
  const strict = { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } };

  app.post("/login", strict, async (req, reply) => {
    const body = z.object({ email: z.string().email("Enter a valid email address."), password: z.string().min(1) }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: normaliseEmail(body.email) }, include: { agent: true } });
    const fail = unauthorized("Email or password is incorrect.");
    if (!user || !user.passwordHash) throw fail;
    if (user.lockedUntil && user.lockedUntil > new Date())
      throw forbidden(`Too many attempts. Try again after ${user.lockedUntil.toLocaleTimeString("en-IN")}, or reset your password.`);
    if (!(await verifyPassword(user.passwordHash, body.password))) {
      const failed = user.failedLogins + 1;
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLogins: failed >= MAX_FAILED ? 0 : failed, lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null },
      });
      throw fail;
    }
    if (user.status === "DISABLED") throw forbidden("This account is disabled. Contact ID Card Studio.");
    if (user.agent && (user.agent.status !== "ACTIVE" || user.agent.deletedAt)) throw forbidden("This agent account is inactive.");
    if (user.agent?.subscriptionEnd && user.agent.subscriptionEnd < new Date(new Date().toDateString()))
      throw forbidden("Your subscription has ended. Contact ID Card Studio to renew.");
    await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date(), status: "ACTIVE" } });
    const session = await issueSession(req, reply, user.id);
    req.principal = { userId: user.id, name: user.name, email: user.email, role: user.role, agentId: user.agentId, agentTier: user.agent?.tier ?? null, schoolId: user.schoolId, impersonatorId: null, familyId: "" };
    await audit(req, { action: "auth.login", summary: `${user.name} signed in`, schoolId: user.schoolId, agentId: user.agentId });
    return session;
  });

  app.post("/refresh", strict, async (req, reply) => {
    const body = (req.body ?? {}) as { refreshToken?: string };
    const raw = body.refreshToken ?? req.cookies[COOKIE];
    if (!raw) throw unauthorized();
    const row = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(raw) } });
    if (!row || row.expiresAt < new Date()) throw unauthorized("Your session has ended. Sign in again.");
    if (row.revokedAt) {
      // Reuse of a rotated token: assume theft and end the whole session family.
      await prisma.refreshToken.updateMany({ where: { familyId: row.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
      throw unauthorized("Your session has ended. Sign in again.");
    }
    const user = await prisma.user.findUnique({ where: { id: row.userId } });
    if (!user || user.status !== "ACTIVE") throw unauthorized();
    await prisma.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
    return issueSession(req, reply, row.userId, { familyId: row.familyId, impersonatorId: row.impersonatorId ?? undefined });
  });

  app.post("/logout", async (req, reply) => {
    const body = (req.body ?? {}) as { refreshToken?: string };
    const raw = body.refreshToken ?? req.cookies[COOKIE];
    if (raw) {
      const row = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(raw) } });
      if (row) await prisma.refreshToken.updateMany({ where: { familyId: row.familyId }, data: { revokedAt: new Date() } });
    } else if (req.principal) {
      await prisma.refreshToken.updateMany({ where: { familyId: req.principal.familyId }, data: { revokedAt: new Date() } });
    }
    // Ending an impersonation (token in the body) must not sign the super admin out.
    if (!body.refreshToken) reply.clearCookie(COOKIE, { path: COOKIE_PATH });
    return { ok: true };
  });

  app.get("/me", async (req) => {
    const p = principal(req);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: p.userId }, include: { agent: true, school: true } });
    const impersonator = p.impersonatorId ? await prisma.user.findUnique({ where: { id: p.impersonatorId }, select: { id: true, name: true } }) : null;
    return { user: serializeUser(user), impersonatedBy: impersonator };
  });

  // ---- Onboarding (set password from an emailed link) ----
  app.get("/onboard/:token", async (req) => {
    const { token } = req.params as { token: string };
    const row = await prisma.authToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
    if (!row || row.type !== "ONBOARD" || row.usedAt || row.expiresAt < new Date())
      throw badRequest("This setup link has expired or was already used. Ask for a new invitation.");
    return { email: row.user.email, name: row.user.name, phone: row.user.phone, role: row.user.role };
  });

  app.post("/onboard", strict, async (req, reply) => {
    const body = z
      .object({ token: z.string().min(10), password, name: z.string().trim().min(2).optional(), phone: z.string().trim().optional() })
      .parse(req.body);
    const row = await prisma.authToken.findUnique({ where: { tokenHash: sha256(body.token) } });
    if (!row || row.type !== "ONBOARD" || row.usedAt || row.expiresAt < new Date())
      throw badRequest("This setup link has expired or was already used. Ask for a new invitation.");
    const user = await prisma.$transaction(async (tx) => {
      await tx.authToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
      return tx.user.update({
        where: { id: row.userId },
        data: { passwordHash: await hashPassword(body.password), status: "ACTIVE", name: body.name ?? undefined, phone: body.phone ?? undefined, tokenVersion: { increment: 1 } },
      });
    });
    req.principal = { userId: user.id, name: user.name, email: user.email, role: user.role, agentId: user.agentId, agentTier: null, schoolId: user.schoolId, impersonatorId: null, familyId: "" };
    await audit(req, { action: "auth.onboarded", summary: `${user.name} completed account setup`, schoolId: user.schoolId, agentId: user.agentId });
    return issueSession(req, reply, user.id);
  });

  // ---- Forgot / reset password with an emailed 6-digit code ----
  app.post("/password/forgot", strict, async (req) => {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: normaliseEmail(email) } });
    if (user && user.status !== "DISABLED") {
      const otp = otpCode();
      await prisma.authToken.updateMany({ where: { userId: user.id, type: "RESET_PASSWORD", usedAt: null }, data: { usedAt: new Date() } });
      await prisma.authToken.create({
        data: { userId: user.id, type: "RESET_PASSWORD", tokenHash: sha256(randomToken()), otpHash: sha256(otp), expiresAt: new Date(Date.now() + 15 * 60_000) },
      });
      await queueEmail(user.email, "Your ID Card Studio password code", layout("Reset your password", [`Your code is ${otp}.`, "It expires in 15 minutes. If you did not ask for this, ignore this email."]), "reset");
    }
    // Same answer whether or not the account exists.
    return { ok: true, message: "If the email is registered, a code has been sent." };
  });

  app.post("/password/reset", strict, async (req) => {
    const body = z.object({ email: z.string().email(), otp: z.string().length(6), password }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: normaliseEmail(body.email) } });
    const invalid = badRequest("The code is incorrect or has expired.");
    if (!user) throw invalid;
    const row = await prisma.authToken.findFirst({
      where: { userId: user.id, type: "RESET_PASSWORD", usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    if (!row || row.attempts >= 5) throw invalid;
    if (row.otpHash !== sha256(body.otp)) {
      await prisma.authToken.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
      throw invalid;
    }
    await prisma.$transaction([
      prisma.authToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
      prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(body.password), status: user.status === "INVITED" ? "ACTIVE" : user.status, tokenVersion: { increment: 1 }, failedLogins: 0, lockedUntil: null },
      }),
      prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    return { ok: true };
  });

  app.post("/password/change", async (req) => {
    const p = principal(req);
    if (p.impersonatorId) throw forbidden("Password changes are not allowed while acting as another user.");
    const body = z.object({ currentPassword: z.string().min(1), newPassword: password }).parse(req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: p.userId } });
    if (!user.passwordHash || !(await verifyPassword(user.passwordHash, body.currentPassword))) throw badRequest("Current password is incorrect.");
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(body.newPassword), tokenVersion: { increment: 1 } } }),
      prisma.refreshToken.updateMany({ where: { userId: user.id, familyId: { not: p.familyId }, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await audit(req, { action: "auth.password_changed", summary: `${p.name} changed their password` });
    const accessToken = await signAccess({ sub: user.id, tv: user.tokenVersion + 1, fid: p.familyId });
    return { ok: true, accessToken };
  });

  // ---- Super admin: act as any school admin or agent ----
  app.post("/impersonate", async (req, reply) => {
    const p = principal(req);
    if (!can.impersonate(p)) throw forbidden("Only a super admin can open another account.");
    const { userId } = z.object({ userId: z.string() }).parse(req.body);
    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) throw notFound("User");
    if (target.role === "SUPER_ADMIN") throw forbidden("Super admin accounts cannot be opened this way.");
    if (target.status === "DISABLED") throw badRequest("This account is disabled.");
    await audit(req, {
      action: "auth.impersonate",
      summary: `${p.name} opened ${target.name}'s account`,
      entityType: "user",
      entityId: target.id,
      schoolId: target.schoolId,
      agentId: target.agentId,
    });
    // Invited users who have not set a password yet can still be opened.
    return issueSession(req, reply, target.id, { impersonatorId: p.userId });
  });

  app.get("/sessions", async (req) => {
    const p = principal(req);
    const rows = await prisma.refreshToken.findMany({
      where: { userId: p.userId, revokedAt: null, expiresAt: { gt: new Date() }, impersonatorId: null },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return { items: rows.map((r) => ({ id: r.familyId, userAgent: r.userAgent, ip: r.ip, createdAt: r.createdAt, current: r.familyId === p.familyId })) };
  });
}
