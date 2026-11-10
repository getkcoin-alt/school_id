import type { User } from "@prisma/client";
import { config } from "../config.js";
import { prisma, type Tx } from "./db.js";
import { randomToken, sha256 } from "./crypto.js";
import { layout, queueEmail } from "./mail.js";

const ROLE_LABEL = { SUPER_ADMIN: "Super Admin", AGENT: "Agent", SCHOOL_ADMIN: "School Admin" } as const;

/**
 * Smart onboarding: the account exists in INVITED state and the person sets
 * their own password from a single-use emailed link (valid 7 days).
 */
export async function sendOnboardingInvite(user: User, invitedBy?: string, tx?: Tx) {
  const db = tx ?? prisma;
  const token = randomToken();
  await db.authToken.updateMany({ where: { userId: user.id, type: "ONBOARD", usedAt: null }, data: { usedAt: new Date() } });
  await db.authToken.create({
    data: { userId: user.id, type: "ONBOARD", tokenHash: sha256(token), expiresAt: new Date(Date.now() + 7 * 86400_000) },
  });
  const url = `${config.APP_URL}/?onboard=${token}`;
  const body = layout(
    `Welcome to ID Card Studio, ${user.name}`,
    [
      `${invitedBy ?? "ID Card Studio"} has created your ${ROLE_LABEL[user.role]} account (${user.email}).`,
      "Set your password to sign in. The link works once and expires in 7 days.",
    ],
    { label: "Set up my account", url },
  );
  await queueEmail(user.email, "Set up your ID Card Studio account", body, "onboard");
  return url;
}

export const normaliseEmail = (e: string) => e.trim().toLowerCase();
