// Demo data for local development. Never run against production.
// Logins (password Demo@1234): admin@idstudio.test, premium@idstudio.test,
// regular@idstudio.test, school@greenwood.test
import { prisma, nextCode, nextCodes } from "../src/lib/db.js";
import { hashPassword } from "../src/lib/crypto.js";
import { seedSchoolFields } from "../src/lib/fields.js";
import { academicYear } from "../src/lib/session.js";

if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed a production database.");
const password = await hashPassword("Demo@1234");
const session = academicYear();

const user = (email: string, name: string, role: "SUPER_ADMIN" | "AGENT" | "SCHOOL_ADMIN", extra: object = {}) =>
  prisma.user.upsert({ where: { email }, create: { email, name, role, status: "ACTIVE", passwordHash: password, ...extra }, update: {} });

await user("admin@idstudio.test", "Platform Admin", "SUPER_ADMIN");

async function agent(email: string, name: string, company: string, tier: "PREMIUM" | "REGULAR") {
  const existing = await prisma.agent.findFirst({ where: { email } });
  const a = existing ?? (await prisma.agent.create({ data: { code: await nextCode(prisma, "agent", "AG"), email, name, company, tier, city: "Sonipat", state: "Haryana", printBySelf: tier === "PREMIUM", subscriptionStart: new Date("2026-04-01"), subscriptionEnd: new Date("2027-03-31") } }));
  await user(email, name, "AGENT", { agentId: a.id });
  return a;
}
const premium = await agent("premium@idstudio.test", "Rohan Malhotra", "Northstar Print Co.", "PREMIUM");
const regular = await agent("regular@idstudio.test", "Neha Bansal", "Papertrail Studio", "REGULAR");

async function school(name: string, short: string, agentId: string, adminEmail: string) {
  let s = await prisma.school.findFirst({ where: { name } });
  if (!s) {
    s = await prisma.school.create({ data: { code: await nextCode(prisma, "school", "SCH"), name, shortName: short, city: "Sonipat", state: "Haryana", agentId, currentSession: session, studentRounds: 3 } });
    await seedSchoolFields(prisma, s.id);
    await prisma.academicSession.create({ data: { schoolId: s.id, name: session, isCurrent: true } });
    for (const [i, c] of ["VI", "VII", "VIII"].entries()) await prisma.schoolClass.create({ data: { schoolId: s.id, name: c, sortOrder: i, sections: { create: [{ name: "A" }, { name: "B" }] } } });
    await prisma.staffRole.createMany({ data: ["Principal", "Teacher", "Office staff"].map((n) => ({ schoolId: s!.id, name: n })) });
  }
  await user(adminEmail, `${short} Admin`, "SCHOOL_ADMIN", { schoolId: s.id });
  return s;
}
const gps = await school("Greenwood Public School", "GPS", premium.id, "school@greenwood.test");
await school("Delhi Valley Academy", "DVA", regular.id, "school@dva.test");

if (!(await prisma.student.count({ where: { schoolId: gps.id } }))) {
  const rows = [
    ["DSC_0101", "ADITYA", "SUNIL", "POONAM", "9196", "2002510881"],
    ["DSC_0108", "ANKITA", "AJAY", "PREETI", "9189", "2002496961"],
    ["DSC_0104", "ANKUSH", "SATBIR", "SITA", "9191", "1900330821"],
    ["DSC_0106", "HIMANSHU", "SURESH", "PINKI", "9195", "1900329678"],
    ["DSC_0107", "JANVI", "VIKAS", "PINKI", "9190", "1906454543"],
    ["DSC_0109", "KARTIK", "DINESH", "SONIYA", "9193", "1801557961"],
  ];
  const codes = await nextCodes(prisma, "student", "ST", rows.length);
  await prisma.student.createMany({
    data: rows.map(([photoNo, name, father, mother, adm, srn], i) => ({
      code: codes[i], schoolId: gps.id, session, className: "VII", section: "A", name, photoNo, fatherPrefix: "Mr.", fatherName: father, motherPrefix: "Mrs.", motherName: mother,
      dob: new Date("2015-12-09"), phone: "9494949494", address: "SONIPAT", admissionNo: adm, srn, status: "DRAFT" as const,
    })),
  });
}
console.log("Seeded. Password for every demo login: Demo@1234");
await prisma.$disconnect();
