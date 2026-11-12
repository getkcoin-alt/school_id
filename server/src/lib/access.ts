import type { FastifyRequest } from "fastify";
import type { AgentTier, Role } from "@prisma/client";
import { prisma } from "./db.js";
import { forbidden, notFound, unauthorized } from "./errors.js";

export interface Principal {
  userId: string;
  name: string;
  email: string;
  role: Role;
  agentId: string | null;
  agentTier: AgentTier | null;
  schoolId: string | null;
  impersonatorId: string | null;
  familyId: string;
}

export function principal(req: FastifyRequest): Principal {
  if (!req.principal) throw unauthorized();
  return req.principal;
}

export const isSuper = (p: Principal) => p.role === "SUPER_ADMIN";
export const isAgent = (p: Principal) => p.role === "AGENT";
export const isPremium = (p: Principal) => p.role === "AGENT" && p.agentTier === "PREMIUM";
export const isSchool = (p: Principal) => p.role === "SCHOOL_ADMIN";

/** Capability matrix from the proposal (section 01) and the change sheet. */
export const can = {
  manageAgents: (p: Principal) => isSuper(p),
  manageSchools: (p: Principal) => isSuper(p),
  deleteSchools: (p: Principal) => isSuper(p) || isAgent(p),
  editSchoolProfile: (p: Principal) => isSuper(p) || isSchool(p),
  // Premium agents and schools may export; regular agents may not.
  download: (p: Principal) => isSuper(p) || isSchool(p) || isPremium(p),
  approve: (p: Principal) => isSuper(p) || isSchool(p),
  editStudents: (p: Principal) => isSuper(p) || isSchool(p) || isAgent(p),
  createBatch: (p: Principal) => isSuper(p) || isSchool(p) || isAgent(p),
  fulfilBatch: (p: Principal) => isSuper(p) || isPremium(p),
  manageDesigns: (p: Principal) => isSuper(p) || isPremium(p),
  uploadPdf: (p: Principal) => isSuper(p) || isAgent(p),
  impersonate: (p: Principal) => isSuper(p) && !p.impersonatorId,
  viewLogs: (_p: Principal) => true,
};

export function require(ok: boolean, message?: string) {
  if (!ok) throw forbidden(message);
}

/** Prisma `where` limiting schools to those the principal may see. */
export function schoolWhere(p: Principal) {
  if (isSuper(p)) return { deletedAt: null };
  if (isAgent(p)) return { deletedAt: null, agentId: p.agentId ?? "__none__" };
  return { deletedAt: null, id: p.schoolId ?? "__none__" };
}

/** Loads a school by id or code and asserts the principal may act on it. */
export async function accessSchool(p: Principal, idOrCode: string) {
  const school = await prisma.school.findFirst({
    where: { AND: [schoolWhere(p), { OR: [{ id: idOrCode }, { code: idOrCode }] }] },
  });
  if (!school) throw notFound("School");
  return school;
}

/** Resolves the school a request targets: school admins are pinned to their own. */
export async function targetSchool(p: Principal, requested?: string | null) {
  if (isSchool(p)) return accessSchool(p, p.schoolId!);
  if (!requested) throw forbidden("Choose a school first.");
  return accessSchool(p, requested);
}
