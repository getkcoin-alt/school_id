import { prisma } from "./db.js";

/** In-app notification for every active login of a school (and optionally its agent). */
export async function notifySchool(schoolId: string, title: string, body?: string, link?: string, includeAgent = false) {
  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { agentId: true } });
  const users = await prisma.user.findMany({
    where: { status: "ACTIVE", OR: [{ schoolId }, ...(includeAgent && school?.agentId ? [{ agentId: school.agentId }] : [])] },
    select: { id: true },
  });
  if (users.length) await prisma.notification.createMany({ data: users.map((u) => ({ userId: u.id, title, body, link })) });
}

export async function notifySuperAdmins(title: string, body?: string, link?: string) {
  const users = await prisma.user.findMany({ where: { role: "SUPER_ADMIN", status: "ACTIVE" }, select: { id: true } });
  if (users.length) await prisma.notification.createMany({ data: users.map((u) => ({ userId: u.id, title, body, link })) });
}

export async function notifyAgent(agentId: string, title: string, body?: string, link?: string) {
  const users = await prisma.user.findMany({ where: { agentId, status: "ACTIVE" }, select: { id: true } });
  if (users.length) await prisma.notification.createMany({ data: users.map((u) => ({ userId: u.id, title, body, link })) });
}
