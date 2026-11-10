import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import { prisma } from "../lib/db.js";
import { notImplemented } from "../lib/errors.js";
import { can, principal, require, schoolWhere } from "../lib/access.js";
import { audit } from "../lib/audit.js";
import { emailInvitation, issueInvitation } from "../lib/invitations.js";

/**
 * Flow 2 · link sharing. A link can be copied (any student) or emailed in bulk to
 * selected students who have an email address. WhatsApp is phase 2.
 */
export async function invitationRoutes(app: FastifyInstance) {
  app.post("/link", async (req) => {
    const p = principal(req);
    require(can.editStudents(p));
    const { studentId } = z.object({ studentId: z.string() }).parse(req.body);
    const student = await prisma.student.findFirst({ where: { id: studentId, deletedAt: null, school: schoolWhere(p) } });
    if (!student) throw Object.assign(new Error("Student was not found."), { statusCode: 404 });
    const { url, invitation } = await issueInvitation(student, { channel: "LINK", createdById: p.userId });
    await audit(req, { action: "invitation.link_created", summary: `${p.name} created a personal link for ${student.name}`, entityType: "student", entityId: student.id, schoolId: student.schoolId });
    return { url, expiresAt: invitation.expiresAt };
  });

  app.post("/email", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req) => {
    const p = principal(req);
    require(can.editStudents(p));
    const body = z.object({ studentIds: z.array(z.string()).min(1).max(2000), message: z.string().max(500).optional() }).parse(req.body);
    const students = await prisma.student.findMany({ where: { id: { in: body.studentIds }, deletedAt: null, school: schoolWhere(p) }, include: { school: true } });
    const sent: string[] = [], skipped: { id: string; name: string; reason: string }[] = [];
    for (const s of students) {
      if (!s.email) {
        skipped.push({ id: s.id, name: s.name, reason: "No email address. Copy the link instead." });
        continue;
      }
      if (["APPROVED", "SUBMITTED_FOR_PRINT"].includes(s.status)) {
        skipped.push({ id: s.id, name: s.name, reason: "Already approved." });
        continue;
      }
      const { url } = await issueInvitation(s, { channel: "EMAIL", createdById: p.userId });
      await emailInvitation(s, s.school, url, { message: body.message });
      sent.push(s.id);
    }
    if (students[0]) await audit(req, { action: "invitation.emailed", summary: `${p.name} emailed ID form links to ${sent.length} student${sent.length === 1 ? "" : "s"}`, schoolId: students[0].schoolId, meta: { sent: sent.length, skipped: skipped.length } });
    return { sent: sent.length, sentIds: sent, skipped };
  });

  app.post("/whatsapp", async () => {
    if (!config.WHATSAPP_ENABLED) throw notImplemented("WhatsApp invitations arrive in phase 2. Copy the link or send by email for now.");
    throw notImplemented("WhatsApp provider is not configured.");
  });

  app.post("/revoke", async (req) => {
    const p = principal(req);
    require(can.editStudents(p));
    const { studentId } = z.object({ studentId: z.string() }).parse(req.body);
    const res = await prisma.invitation.updateMany({ where: { studentId, revokedAt: null, student: { school: schoolWhere(p) } }, data: { revokedAt: new Date() } });
    return { revoked: res.count };
  });
}
