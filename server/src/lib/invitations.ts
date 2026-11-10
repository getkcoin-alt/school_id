import type { Student, School } from "@prisma/client";
import { config } from "../config.js";
import { prisma } from "./db.js";
import { randomToken, sha256 } from "./crypto.js";
import { layout, queueEmail } from "./mail.js";

export const portalLink = (token: string) => `${config.APP_URL}/?panel=student&invite=${token}`;

/**
 * Issues a fresh personal link. Older unused links for the student are revoked so
 * only the newest link works. Tokens are stored hashed; the raw link is returned once.
 */
export async function issueInvitation(student: Student, opts: { channel: "EMAIL" | "LINK"; createdById?: string; message?: string }) {
  const token = randomToken(24);
  await prisma.invitation.updateMany({ where: { studentId: student.id, revokedAt: null, submittedAt: null }, data: { revokedAt: new Date() } });
  const invitation = await prisma.invitation.create({
    data: {
      studentId: student.id,
      tokenHash: sha256(token),
      channel: opts.channel,
      sentTo: opts.channel === "EMAIL" ? student.email : null,
      createdById: opts.createdById,
      expiresAt: new Date(Date.now() + config.INVITE_TTL_DAYS * 86400_000),
      sentAt: opts.channel === "EMAIL" ? new Date() : null,
    },
  });
  if (["DRAFT", "CHANGES_REQUESTED"].includes(student.status) || student.status === "INVITED") {
    await prisma.student.update({
      where: { id: student.id },
      data: { status: student.status === "CHANGES_REQUESTED" ? "CHANGES_REQUESTED" : "INVITED", invitedAt: new Date() },
    });
  }
  return { invitation, token, url: portalLink(token) };
}

export async function emailInvitation(student: Student, school: School, url: string, opts: { message?: string; correction?: string } = {}) {
  if (!student.email) return false;
  const lines = opts.correction
    ? [`Dear ${student.name},`, `${school.name} has asked for a correction to your ID card details:`, opts.correction, "Open your personal link to update the details and photo."]
    : [
        `Dear ${student.name},`,
        `${school.name} is preparing student ID cards. Please check your details and add a clear, recent photo.`,
        ...(opts.message ? [opts.message] : []),
        `The link is personal to you and expires in ${config.INVITE_TTL_DAYS} days.`,
      ];
  await queueEmail(student.email, opts.correction ? `Correction needed: ${school.name} ID card` : `${school.name}: complete your ID card details`, layout(opts.correction ? "Please update your ID card details" : "Complete your ID card details", lines, { label: "Open my ID card form", url }), "student-invite");
  return true;
}
