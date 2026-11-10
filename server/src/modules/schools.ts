import type { FastifyInstance } from "fastify";
import type { School } from "@prisma/client";
import { z } from "zod";
import { prisma, nextCode } from "../lib/db.js";
import { badRequest, conflict, notFound } from "../lib/errors.js";
import { accessSchool, can, isAgent, isSchool, isSuper, principal, require, schoolWhere } from "../lib/access.js";
import { audit } from "../lib/audit.js";
import { normaliseEmail, sendOnboardingInvite } from "../lib/onboarding.js";
import { keep, normalizePhone, validPhone } from "../lib/normalize.js";
import { schoolFields, seedSchoolFields } from "../lib/fields.js";
import { academicYear } from "../lib/session.js";
import { fileUrl } from "../lib/storage.js";

export async function serializeSchool(s: School & { agent?: { id: string; code: string; name: string; tier: string } | null }) {
  return {
    id: s.id,
    code: s.code,
    name: s.name,
    shortName: s.shortName,
    email: s.email,
    phone: s.phone,
    principal: s.principal,
    address: s.address,
    city: s.city,
    state: s.state,
    country: s.country,
    pin: s.pin,
    color: s.color,
    status: s.status,
    agentId: s.agentId,
    agent: s.agent ? { id: s.agent.id, code: s.agent.code, name: s.agent.name, tier: s.agent.tier } : null,
    studentRounds: s.studentRounds,
    staffRounds: s.staffRounds,
    studentPermit: s.studentPermit,
    staffPermit: s.staffPermit,
    studentDesignId: s.studentDesignId,
    staffDesignId: s.staffDesignId,
    lanyardDesignId: s.lanyardDesignId,
    currentSession: s.currentSession,
    logoUrl: await fileUrl(s.logoKey),
    createdAt: s.createdAt,
  };
}

const contact = {
  name: z.string().trim().min(2, "Enter the school name."),
  shortName: z.string().trim().max(12).optional().nullable(),
  email: z.string().email("Enter a valid school email.").optional().nullable().or(z.literal("")),
  phone: z.string().optional().nullable().transform(keep((v) => normalizePhone(v ?? undefined) ?? null)).refine((v) => validPhone(v ?? undefined), "Enter a valid 10-digit mobile number."),
  principal: z.string().trim().optional().nullable(),
  address: z.string().trim().optional().nullable(),
  city: z.string().trim().optional().nullable(),
  state: z.string().trim().optional().nullable(),
  country: z.string().trim().optional().nullable(),
  pin: z.string().trim().optional().nullable(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
};
const adminFields = {
  agentId: z.string().optional().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE"]),
  studentRounds: z.number().int().min(0).max(50),
  staffRounds: z.number().int().min(0).max(50),
  studentPermit: z.boolean(),
  staffPermit: z.boolean(),
};
const designFields = {
  studentDesignId: z.string().optional().nullable(),
  staffDesignId: z.string().optional().nullable(),
  lanyardDesignId: z.string().optional().nullable(),
};

const DEFAULT_CLASSES = ["Nursery", "LKG", "UKG", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

export async function schoolRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const p = principal(req);
    const q = z.object({ search: z.string().optional(), status: z.enum(["ACTIVE", "INACTIVE"]).optional(), agentId: z.string().optional() }).parse(req.query);
    const schools = await prisma.school.findMany({
      where: {
        AND: [
          schoolWhere(p),
          q.status ? { status: q.status } : {},
          q.agentId && isSuper(p) ? { agentId: q.agentId === "none" ? null : q.agentId } : {},
          q.search ? { OR: [{ name: { contains: q.search, mode: "insensitive" } }, { code: { contains: q.search, mode: "insensitive" } }, { city: { contains: q.search, mode: "insensitive" } }] } : {},
        ],
      },
      include: { agent: true },
      orderBy: { name: "asc" },
    });
    return { items: await Promise.all(schools.map(serializeSchool)) };
  });

  // Change sheet #10: batch creation/review lists only schools that have cards ready.
  app.get("/print-queue", async (req) => {
    const p = principal(req);
    const schools = await prisma.school.findMany({ where: schoolWhere(p), select: { id: true, code: true, name: true, agentId: true } });
    const ids = schools.map((s) => s.id);
    const [approved, staffApproved, submitted] = await Promise.all([
      prisma.student.groupBy({ by: ["schoolId"], where: { schoolId: { in: ids }, status: "APPROVED", active: true, deletedAt: null }, _count: true }),
      prisma.staff.groupBy({ by: ["schoolId"], where: { schoolId: { in: ids }, reviewStatus: "APPROVED", deletedAt: null }, _count: true }),
      prisma.printBatch.groupBy({ by: ["schoolId"], where: { schoolId: { in: ids }, status: "SUBMITTED" }, _count: true }),
    ]);
    const count = (rows: { schoolId: string; _count: number }[], id: string) => rows.find((r) => r.schoolId === id)?._count ?? 0;
    const items = schools
      .map((s) => ({ ...s, approvedStudents: count(approved, s.id), approvedStaff: count(staffApproved, s.id), submittedBatches: count(submitted, s.id) }))
      .filter((s) => s.approvedStudents + s.approvedStaff + s.submittedBatches > 0);
    return { items };
  });

  app.post("/", async (req) => {
    const p = principal(req);
    require(can.manageSchools(p));
    const body = z
      .object({
        ...contact,
        ...adminFields,
        status: adminFields.status.default("ACTIVE"),
        studentRounds: adminFields.studentRounds.default(1),
        staffRounds: adminFields.staffRounds.default(1),
        studentPermit: adminFields.studentPermit.default(true),
        staffPermit: adminFields.staffPermit.default(true),
        admin: z.object({ name: z.string().trim().min(2, "Enter the school admin's name."), email: z.string().email("Enter a valid admin email."), phone: z.string().optional() }).optional(),
        createDefaultClasses: z.boolean().default(true),
      })
      .parse(req.body);
    const { admin, createDefaultClasses, ...data } = body;
    if (data.agentId && !(await prisma.agent.findFirst({ where: { id: data.agentId, deletedAt: null } }))) throw badRequest("Choose a valid agent.");
    const adminEmail = admin ? normaliseEmail(admin.email) : null;
    if (adminEmail && (await prisma.user.findUnique({ where: { email: adminEmail } }))) throw conflict("A login with the admin email already exists.");
    const session = academicYear();
    const { school, user } = await prisma.$transaction(async (tx) => {
      const school = await tx.school.create({
        data: { ...data, email: data.email || null, code: await nextCode(tx, "school", "SCH"), currentSession: session },
        include: { agent: true },
      });
      await seedSchoolFields(tx, school.id);
      await tx.academicSession.create({ data: { schoolId: school.id, name: session, isCurrent: true } });
      if (createDefaultClasses) {
        for (const [i, name] of DEFAULT_CLASSES.entries()) {
          await tx.schoolClass.create({ data: { schoolId: school.id, name, sortOrder: i, sections: { create: [{ name: "A" }] } } });
        }
      }
      await tx.staffRole.createMany({ data: ["Principal", "Teacher", "Office staff", "Driver", "Support staff"].map((name) => ({ schoolId: school.id, name })) });
      const user = admin
        ? await tx.user.create({ data: { email: adminEmail!, name: admin.name, phone: normalizePhone(admin.phone), role: "SCHOOL_ADMIN", schoolId: school.id } })
        : null;
      return { school, user };
    });
    if (user) await sendOnboardingInvite(user, p.name);
    await audit(req, { action: "school.created", summary: `${p.name} added school ${school.name}`, entityType: "school", entityId: school.id, schoolId: school.id });
    return serializeSchool(school);
  });

  app.get("/:id", async (req) => {
    const p = principal(req);
    const school = await accessSchool(p, (req.params as { id: string }).id);
    const full = await prisma.school.findUniqueOrThrow({ where: { id: school.id }, include: { agent: true } });
    const logins = can.manageSchools(p) || isSchool(p)
      ? await prisma.user.findMany({ where: { schoolId: school.id }, select: { id: true, email: true, name: true, status: true, lastLoginAt: true } })
      : [];
    return { ...(await serializeSchool(full)), logins };
  });

  app.patch("/:id", async (req) => {
    const p = principal(req);
    const school = await accessSchool(p, (req.params as { id: string }).id);
    const shape = isSuper(p)
      ? z.object({ ...contact, ...adminFields, ...designFields }).partial()
      : isSchool(p)
        ? z.object({ ...contact, ...designFields }).partial()
        : z.object({ ...contact, ...designFields }).partial(); // agents keep contacts and designs current
    const body = shape.parse(req.body) as Record<string, unknown>;
    if (body.email === "") body.email = null;
    if (body.agentId && !(await prisma.agent.findFirst({ where: { id: String(body.agentId), deletedAt: null } }))) throw badRequest("Choose a valid agent.");
    for (const key of ["studentDesignId", "staffDesignId", "lanyardDesignId"]) {
      if (body[key] && !(await prisma.design.findFirst({ where: { id: String(body[key]), deletedAt: null } }))) throw badRequest("Choose a valid design.");
    }
    const updated = await prisma.school.update({ where: { id: school.id }, data: body, include: { agent: true } });
    await audit(req, { action: "school.updated", summary: `${p.name} updated ${school.name}`, entityType: "school", entityId: school.id, schoolId: school.id, meta: { fields: Object.keys(body) } });
    return serializeSchool(updated);
  });

  app.delete("/:id", async (req) => {
    const p = principal(req);
    require(can.manageSchools(p));
    const school = await accessSchool(p, (req.params as { id: string }).id);
    await prisma.$transaction([
      prisma.school.update({ where: { id: school.id }, data: { deletedAt: new Date(), status: "INACTIVE" } }),
      prisma.user.updateMany({ where: { schoolId: school.id }, data: { status: "DISABLED", tokenVersion: { increment: 1 } } }),
    ]);
    await audit(req, { action: "school.deleted", summary: `${p.name} removed ${school.name}`, entityType: "school", entityId: school.id, schoolId: school.id });
    return { ok: true };
  });

  // Copies field settings, classes, sections and staff roles (old "copyData").
  app.post("/:id/copy-setup", async (req) => {
    const p = principal(req);
    require(isSuper(p) || isAgent(p));
    const target = await accessSchool(p, (req.params as { id: string }).id);
    const { fromSchoolId } = z.object({ fromSchoolId: z.string() }).parse(req.body);
    const source = await accessSchool(p, fromSchoolId);
    if (source.id === target.id) throw badRequest("Choose a different school to copy from.");
    await prisma.$transaction(async (tx) => {
      const fields = await tx.schoolField.findMany({ where: { schoolId: source.id } });
      await tx.schoolField.deleteMany({ where: { schoolId: target.id } });
      await tx.schoolField.createMany({ data: fields.map(({ id: _id, schoolId: _s, ...f }) => ({ ...f, schoolId: target.id })) });
      const classes = await tx.schoolClass.findMany({ where: { schoolId: source.id }, include: { sections: true } });
      for (const c of classes) {
        const cls = await tx.schoolClass.upsert({ where: { schoolId_name: { schoolId: target.id, name: c.name } }, create: { schoolId: target.id, name: c.name, sortOrder: c.sortOrder }, update: {} });
        await tx.section.createMany({ data: c.sections.map((s) => ({ classId: cls.id, name: s.name })), skipDuplicates: true });
      }
      const roles = await tx.staffRole.findMany({ where: { schoolId: source.id } });
      await tx.staffRole.createMany({ data: roles.map((r) => ({ schoolId: target.id, name: r.name })), skipDuplicates: true });
      await tx.school.update({ where: { id: target.id }, data: { studentDesignId: source.studentDesignId, staffDesignId: source.staffDesignId, lanyardDesignId: source.lanyardDesignId } });
    });
    await audit(req, { action: "school.setup_copied", summary: `${p.name} copied setup from ${source.name} to ${target.name}`, entityType: "school", entityId: target.id, schoolId: target.id });
    return { ok: true };
  });

  // ---- ID card fields (change sheet #11: on/off plus compulsory/optional) ----
  app.get("/:id/fields", async (req) => {
    const p = principal(req);
    const school = await accessSchool(p, (req.params as { id: string }).id);
    const [student, staff] = await Promise.all([schoolFields(school.id, "STUDENT"), schoolFields(school.id, "STAFF")]);
    return { student, staff };
  });

  app.put("/:id/fields", async (req) => {
    const p = principal(req);
    require(isSuper(p) || isSchool(p) || isAgent(p));
    const school = await accessSchool(p, (req.params as { id: string }).id);
    const item = z.object({
      key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,40}$/).optional(),
      label: z.string().trim().min(1).max(60),
      enabled: z.boolean(),
      required: z.boolean(),
      custom: z.boolean().default(false),
      type: z.string().default("text"),
    });
    const body = z.object({ audience: z.enum(["STUDENT", "STAFF"]), fields: z.array(item).max(60) }).parse(req.body);
    const current = await schoolFields(school.id, body.audience);
    const builtInKeys = new Set(current.filter((f) => !f.custom).map((f) => f.key));
    await prisma.$transaction(async (tx) => {
      await tx.schoolField.deleteMany({ where: { schoolId: school.id, audience: body.audience } });
      await tx.schoolField.createMany({
        data: body.fields.map((f, i) => {
          const key = f.key ?? `x_${f.label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30)}`;
          const locked = current.find((c) => c.key === key)?.locked;
          return {
            schoolId: school.id,
            audience: body.audience,
            key,
            label: f.label,
            type: builtInKeys.has(key) ? current.find((c) => c.key === key)!.type : f.type,
            enabled: locked ? true : f.enabled,
            required: locked ? true : f.enabled && f.required,
            custom: !builtInKeys.has(key),
            sortOrder: i,
          };
        }),
        skipDuplicates: true,
      });
    });
    await audit(req, { action: "school.fields_updated", summary: `${p.name} updated ${body.audience.toLowerCase()} ID card fields for ${school.name}`, entityType: "school", entityId: school.id, schoolId: school.id });
    return { fields: await schoolFields(school.id, body.audience) };
  });
}
