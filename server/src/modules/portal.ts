import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { badRequest, conflict, forbidden, unauthorized } from "../lib/errors.js";
import { otpCode, sha256 } from "../lib/crypto.js";
import { signPortal, verifyPortal } from "../lib/tokens.js";
import { layout, queueEmail } from "../lib/mail.js";
import { schoolFields } from "../lib/fields.js";
import { missingFields, PREFIXES, serializeStudent, studentInput, toData } from "../lib/students.js";
import { normalisePhoto } from "../lib/images.js";
import { fileUrl, storage } from "../lib/storage.js";
import { readMultipart } from "../lib/upload.js";
import { notifySchool } from "../lib/notify.js";
import { normalizePhone } from "../lib/normalize.js";

const EDITABLE = new Set(["DRAFT", "INVITED", "CHANGES_REQUESTED", "IN_REVIEW"]);
// Identifiers that only the school may change.
const SCHOOL_ONLY = ["admissionNo", "srn", "photoNo", "rollNo", "session", "active", "version"] as const;

const mask = (email: string) => email.replace(/^(.)(.*)(@.*)$/, (_m, a: string, b: string, c: string) => a + "*".repeat(Math.min(6, b.length)) + c);

async function loadInvitation(token: string) {
  const inv = await prisma.invitation.findUnique({ where: { tokenHash: sha256(token) }, include: { student: { include: { school: true } } } });
  if (!inv || inv.revokedAt || inv.student.deletedAt) throw badRequest("This link is no longer active. Ask your school for a new link.");
  if (inv.expiresAt < new Date()) throw badRequest("This link has expired. Ask your school for a new link.");
  if (inv.student.school.deletedAt || inv.student.school.status !== "ACTIVE") throw forbidden("This school is not accepting submissions right now.");
  return inv;
}

async function portalStudent(req: FastifyRequest) {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) throw unauthorized("Open your personal link again to continue.");
  let claims;
  try {
    claims = await verifyPortal(h.slice(7));
  } catch {
    throw unauthorized("Your session has ended. Open your personal link again.");
  }
  const inv = await prisma.invitation.findUnique({ where: { id: claims.invitationId }, include: { student: { include: { school: true } } } });
  if (!inv || inv.revokedAt || inv.studentId !== claims.studentId || inv.student.deletedAt) throw unauthorized("This link is no longer active. Ask your school for a new link.");
  return inv;
}

export async function portalRoutes(app: FastifyInstance) {
  const limited = { config: { rateLimit: { max: 8, timeWindow: "10 minutes" } } };

  app.get("/invite/:token", async (req) => {
    const inv = await loadInvitation((req.params as { token: string }).token);
    if (!inv.openedAt) await prisma.invitation.update({ where: { id: inv.id }, data: { openedAt: new Date() } });
    const s = inv.student;
    return {
      school: { name: s.school.name, shortName: s.school.shortName, color: s.school.color, logoUrl: await fileUrl(s.school.logoKey) },
      studentFirstName: s.name.split(" ")[0],
      verification: s.email ? "EMAIL_OTP" : "ADMISSION_NO",
      emailHint: s.email ? mask(s.email) : null,
      expiresAt: inv.expiresAt,
    };
  });

  app.post("/invite/:token/otp", limited, async (req) => {
    const inv = await loadInvitation((req.params as { token: string }).token);
    if (!inv.student.email) throw badRequest("Verify with your admission number instead.");
    const code = otpCode();
    await prisma.invitation.update({ where: { id: inv.id }, data: { otpHash: sha256(code), otpExpiresAt: new Date(Date.now() + 10 * 60_000), otpAttempts: 0 } });
    await queueEmail(inv.student.email, `${code} is your ID card form code`, layout("Your verification code", [`Use ${code} to open the ID card form for ${inv.student.school.name}.`, "The code expires in 10 minutes."]), "portal-otp");
    return { ok: true, emailHint: mask(inv.student.email) };
  });

  app.post("/invite/:token/verify", limited, async (req) => {
    const inv = await loadInvitation((req.params as { token: string }).token);
    const body = z.object({ otp: z.string().optional(), admissionNo: z.string().optional(), phone: z.string().optional() }).parse(req.body);
    const s = inv.student;
    if (inv.otpAttempts >= 5) throw forbidden("Too many attempts. Ask your school for a new link.");
    if (s.email) {
      if (!inv.otpHash || !inv.otpExpiresAt || inv.otpExpiresAt < new Date()) throw badRequest("Request a new code.");
      if (sha256(String(body.otp ?? "")) !== inv.otpHash) {
        await prisma.invitation.update({ where: { id: inv.id }, data: { otpAttempts: { increment: 1 } } });
        throw badRequest("The code is incorrect.");
      }
    } else {
      // No email on file: the student proves possession with a school-held identifier.
      const ok =
        (s.admissionNo && body.admissionNo && s.admissionNo.trim().toLowerCase() === body.admissionNo.trim().toLowerCase()) ||
        (s.phone && body.phone && s.phone === normalizePhone(body.phone)) ||
        (!s.admissionNo && !s.phone);
      if (!ok) {
        await prisma.invitation.update({ where: { id: inv.id }, data: { otpAttempts: { increment: 1 } } });
        throw badRequest("These details do not match the school's records.");
      }
    }
    await prisma.invitation.update({ where: { id: inv.id }, data: { verifiedAt: new Date(), otpHash: null } });
    return { token: await signPortal(inv.id, s.id) };
  });

  app.get("/me", async (req) => {
    const inv = await portalStudent(req);
    const s = inv.student;
    const [fields, classes] = await Promise.all([
      schoolFields(s.schoolId),
      prisma.schoolClass.findMany({ where: { schoolId: s.schoolId }, include: { sections: true }, orderBy: { sortOrder: "asc" } }),
    ]);
    const data = await serializeStudent(s);
    return {
      school: { name: s.school.name, color: s.school.color, logoUrl: await fileUrl(s.school.logoKey) },
      student: data,
      editable: EDITABLE.has(s.status),
      fields: fields.filter((f) => f.enabled).map((f) => ({ ...f, readOnly: (SCHOOL_ONLY as readonly string[]).includes(f.key) })),
      prefixes: PREFIXES,
      classes: classes.map((c) => ({ name: c.name, sections: c.sections.map((x) => x.name) })),
      missing: missingFields(s, fields),
    };
  });

  app.put("/me", async (req) => {
    const inv = await portalStudent(req);
    const s = inv.student;
    if (!EDITABLE.has(s.status)) throw conflict("Your details have already been approved by the school.");
    const fields = await schoolFields(s.schoolId);
    const enabled = new Set(fields.filter((f) => f.enabled).map((f) => f.key));
    const body = studentInput.parse(req.body) as Record<string, unknown>;
    for (const k of Object.keys(body)) if ((SCHOOL_ONLY as readonly string[]).includes(k) || (!enabled.has(k) && k !== "extra")) delete body[k];
    if (body.extra) body.extra = Object.fromEntries(Object.entries(body.extra as Record<string, string>).filter(([k]) => fields.some((f) => f.custom && f.enabled && f.key === k)));
    if (body.className && !(await prisma.schoolClass.findFirst({ where: { schoolId: s.schoolId, name: String(body.className) } }))) throw badRequest("Choose your class from the list.");
    const data = toData(body as never);
    const updated = await prisma.student.update({
      where: { id: s.id },
      data: { ...(data as object), extra: body.extra ? ({ ...(s.extra as object), ...(body.extra as object) } as object) : undefined, version: { increment: 1 } },
    });
    return { student: await serializeStudent(updated), missing: missingFields(updated, fields) };
  });

  app.post("/me/photo", async (req) => {
    const inv = await portalStudent(req);
    const s = inv.student;
    if (!EDITABLE.has(s.status)) throw conflict("Your details have already been approved by the school.");
    const { files, fields } = await readMultipart(req);
    if (!files[0]) throw badRequest("Take or choose a photo.");
    const photo = await normalisePhoto(files[0].buffer, files[0].mimetype);
    const key = `schools/${s.schoolId}/students/${s.id}-${photo.checksum.slice(0, 12)}.jpg`;
    await storage.put(key, photo.buffer, photo.mime);
    const updated = await prisma.student.update({ where: { id: s.id }, data: { photoKey: key, photoSource: fields.source === "UPLOAD" ? "UPLOAD" : "CAMERA", photoCapturedAt: new Date(), version: { increment: 1 } } });
    return { student: await serializeStudent(updated) };
  });

  app.post("/me/submit", async (req) => {
    const inv = await portalStudent(req);
    const s = inv.student;
    if (!EDITABLE.has(s.status)) throw conflict("Your details have already been approved by the school.");
    const { consent } = z.object({ consent: z.literal(true, { message: "Confirm that the details and photo are correct." }) }).parse(req.body);
    const missing = missingFields(s, await schoolFields(s.schoolId));
    if (missing.length) throw badRequest(`Complete these before submitting: ${missing.join(", ")}.`, { missing });
    await prisma.$transaction([
      prisma.student.update({ where: { id: s.id }, data: { status: "IN_REVIEW", submittedAt: new Date(), version: { increment: 1 } } }),
      prisma.invitation.update({ where: { id: inv.id }, data: { submittedAt: new Date() } }),
      prisma.activityLog.create({ data: { actorName: `${s.name} (student link)`, schoolId: s.schoolId, agentId: s.school.agentId, action: "student.submitted", entityType: "student", entityId: s.id, summary: `${s.name} submitted ID card details for review`, meta: { consent }, ip: req.ip } }),
    ]);
    await notifySchool(s.schoolId, `${s.name} submitted ID card details`, `Class ${s.className}${s.section ? "-" + s.section : ""} · ready to review`, "review");
    return { ok: true, status: "IN_REVIEW" };
  });
}
