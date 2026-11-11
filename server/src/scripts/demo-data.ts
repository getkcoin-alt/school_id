// Loads a realistic demo workspace into the configured database and creates the
// super admin. Run once on the server (the pipeline does this when DEMO_ADMIN_HASH_B64
// is set):
//   DEMO_ADMIN_EMAIL=admin@idstudio.in DEMO_ADMIN_HASH_B64=<base64 argon2 hash> node dist/scripts/demo-data.js
// The password itself never reaches the server or the logs; only its argon2 hash.
// Demo agents, schools and admins have no password: open them from the super admin
// account ("Open a school or agent account"). Re-running is safe: existing demo data is kept.
import sharp from "sharp";
import PDFDocument from "pdfkit";
import { createHash } from "node:crypto";
import type { Agent, Prisma, StudentStatus } from "@prisma/client";
import { prisma, nextCode, nextCodes } from "../lib/db.js";
import { seedSchoolFields } from "../lib/fields.js";
import { academicYear } from "../lib/session.js";
import { storage } from "../lib/storage.js";

const ADMIN_EMAIL = (process.env.DEMO_ADMIN_EMAIL || "admin@idstudio.in").toLowerCase();
const hashB64 = process.env.DEMO_ADMIN_HASH_B64;
if (!hashB64) throw new Error("Set DEMO_ADMIN_HASH_B64 (base64 of an argon2 password hash).");
const passwordHash = Buffer.from(hashB64, "base64").toString("utf8");
if (!passwordHash.startsWith("$argon2")) throw new Error("DEMO_ADMIN_HASH_B64 is not an argon2 hash.");

const DOMAIN = "demo.idstudio.in";
const SESSION = academicYear();
const PREV_SESSION = academicYear(new Date(Date.now() - 365 * 864e5));
const now = Date.now();
const daysAgo = (d: number) => new Date(now - d * 864e5);
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

// ---------- super admin ----------
const admin = await prisma.user.upsert({
  where: { email: ADMIN_EMAIL },
  create: { email: ADMIN_EMAIL, name: "ID Studio Admin", role: "SUPER_ADMIN", status: "ACTIVE", passwordHash },
  update: { role: "SUPER_ADMIN", status: "ACTIVE", passwordHash, failedLogins: 0, lockedUntil: null, tokenVersion: { increment: 1 } },
});
console.log(`Super admin ready: ${ADMIN_EMAIL}`);

if (await prisma.agent.findFirst({ where: { email: { endsWith: `@${DOMAIN}` } } })) {
  console.log("Demo data already present; nothing else to do.");
  await prisma.$disconnect();
  process.exit(0);
}

// ---------- helpers ----------
const palette = ["#e8ede9", "#ece9e4", "#e8eaf2", "#f0e5e2", "#e6eef3", "#f3efe2"];
const shirts = ["#6f8a7f", "#8a7d6f", "#7884a0", "#a77e75", "#5f7d95", "#8f8a5c"];
const skins = ["#e7b58f", "#d9a17a", "#c98d66", "#f0c4a0", "#b97c55"];
async function portrait(seed: number, female: boolean) {
  const bg = palette[seed % palette.length], shirt = shirts[seed % shirts.length], skin = skins[seed % skins.length];
  const hair = female
    ? `<path d="M118 92c-70 0-78 70-70 150h28l6-90c20 8 50 8 72 0l6 90h28c8-80 0-150-70-150z" fill="#2f2a26"/>`
    : `<path d="M72 132c-14-70 34-92 76-76 44 2 46 50 30 78l-10-38c-28 12-52 10-74 4z" fill="#3f3a35"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="600" viewBox="0 0 240 300">
<rect width="240" height="300" fill="${bg}"/>${female ? hair : ""}
<path d="M30 300v-40c0-55 180-55 180 0v40" fill="${shirt}"/>
<path d="M95 210v-32h50v32l-25 26z" fill="${skin}"/>
<ellipse cx="120" cy="128" rx="50" ry="62" fill="${skin}"/>${female ? "" : hair}
<ellipse cx="100" cy="132" rx="4" ry="4" fill="#2f2a26"/><ellipse cx="140" cy="132" rx="4" ry="4" fill="#2f2a26"/>
<path d="M108 160q12 9 24 0" fill="none" stroke="#9a5e4c" stroke-width="3" stroke-linecap="round"/>
<path d="M92 212l28 24-18 18-20-34m66-8l-28 24 18 18 20-34" fill="#fff"/></svg>`;
  const buffer = await sharp(Buffer.from(svg)).jpeg({ quality: 84 }).toBuffer();
  return { buffer, checksum: createHash("sha256").update(buffer).digest("hex") };
}
function pdf(title: string, lines: string[]) {
  return new Promise<Buffer>((resolve) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const parts: Buffer[] = [];
    doc.on("data", (b: Buffer) => parts.push(b));
    doc.on("end", () => resolve(Buffer.concat(parts)));
    doc.fontSize(18).text(title).moveDown();
    doc.fontSize(11);
    for (const l of lines) doc.text(l);
    doc.end();
  });
}
const snapshotOf = (r: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(r)
      .filter(([k]) => !["deletedAt", "version", "createdAt", "updatedAt"].includes(k))
      .map(([k, v]) => [k, v instanceof Date ? v.toISOString().slice(0, 10) : v]),
  );
async function log(action: string, summary: string, at: Date, extra: Partial<Prisma.ActivityLogUncheckedCreateInput> = {}) {
  await prisma.activityLog.create({ data: { action, summary, createdAt: at, actorId: admin.id, actorName: admin.name, actorRole: "SUPER_ADMIN", ...extra } });
}

// ---------- designs ----------
const designs = {
  classic: await prisma.design.create({ data: { code: await nextCode(prisma, "design", "D"), name: "Classic", kind: "ID_CARD", audience: "STUDENT", color: "#326b5b", createdById: admin.id } }),
  campus: await prisma.design.create({ data: { code: await nextCode(prisma, "design", "D"), name: "Campus", kind: "ID_CARD", audience: "STAFF", color: "#2d4468", createdById: admin.id } }),
  lanyard: await prisma.design.create({ data: { code: await nextCode(prisma, "design", "D"), name: "School essentials", kind: "LANYARD", audience: "EVERYONE", color: "#f05656", createdById: admin.id } }),
};

// ---------- agents ----------
type AgentSpec = { name: string; company: string; tier: "PREMIUM" | "REGULAR"; city: string; state: string; printBySelf: boolean; start?: string; end?: string; status?: "ACTIVE" | "INACTIVE"; phone: string };
const agentSpecs: AgentSpec[] = [
  { name: "Rohan Malhotra", company: "Northstar Print Co.", tier: "PREMIUM", city: "Sonipat", state: "Haryana", printBySelf: true, start: "2026-04-01", end: "2027-03-31", phone: "9812345601" },
  { name: "Sanjay Gupta", company: "Shree Balaji Graphics", tier: "PREMIUM", city: "Panipat", state: "Haryana", printBySelf: false, start: "2025-12-01", end: new Date(now + 20 * 864e5).toISOString().slice(0, 10), phone: "9812345602" },
  { name: "Neha Bansal", company: "Papertrail Studio", tier: "REGULAR", city: "Rohtak", state: "Haryana", printBySelf: false, phone: "9812345603" },
  { name: "Imran Qureshi", company: "Kiran ID Services", tier: "REGULAR", city: "Karnal", state: "Haryana", printBySelf: false, status: "INACTIVE", phone: "9812345604" },
];
const agents: Agent[] = [];
for (const a of agentSpecs) {
  const email = `${a.name.split(" ")[0].toLowerCase()}@${DOMAIN}`;
  const agent: Agent = await prisma.agent.create({
    data: {
      code: await nextCode(prisma, "agent", "AG"), name: a.name, company: a.company, email, phone: a.phone, tier: a.tier, city: a.city, state: a.state, pin: "131001",
      address: `${10 + agents.length * 7}, Main Market`, printBySelf: a.printBySelf, status: a.status ?? "ACTIVE",
      subscriptionStart: a.start ? day(a.start) : null, subscriptionEnd: a.end ? day(a.end) : null, createdAt: daysAgo(200 - agents.length * 10),
    },
  });
  await prisma.user.create({ data: { email, name: a.name, phone: a.phone, role: "AGENT", status: a.status === "INACTIVE" ? "DISABLED" : "ACTIVE", agentId: agent.id, lastLoginAt: daysAgo(agents.length + 1) } });
  await log("agent.created", `${admin.name} added ${a.tier.toLowerCase()} agent ${a.name} (${a.company})`, agent.createdAt, { agentId: agent.id, entityType: "agent", entityId: agent.id });
  agents.push(agent);
}
const [northstar, balaji, papertrail, kiran] = agents;

// ---------- schools ----------
type SchoolSpec = { name: string; short: string; city: string; principal: string; agent: Agent | null; classes: string[]; students: number; color: string; tweak?: "house" | "noEmail" | "motherRequired" };
const schoolSpecs: SchoolSpec[] = [
  // Managed directly by the super admin (no agent).
  { name: "ID Studio Model School", short: "IMS", city: "Sonipat", principal: "Meera Joshi", agent: null, classes: ["I", "II", "III", "IV", "V"], students: 30, color: "#3b7767", tweak: "house" },
  { name: "Govt. Senior Secondary School, Murthal", short: "GSSS", city: "Murthal", principal: "Rajesh Kumar", agent: null, classes: ["VI", "VII", "VIII", "IX", "X"], students: 28, color: "#7187ac", tweak: "motherRequired" },
  // Premium agents.
  { name: "Greenwood Public School", short: "GPS", city: "Sonipat", principal: "Anita Sharma", agent: northstar, classes: ["VI", "VII", "VIII"], students: 30, color: "#3b7767" },
  { name: "Sunrise International School", short: "SIS", city: "Gohana", principal: "Vikas Malik", agent: northstar, classes: ["LKG", "UKG", "I", "II"], students: 24, color: "#bd8b42", tweak: "noEmail" },
  { name: "Delhi Valley Academy", short: "DVA", city: "Panipat", principal: "Sunita Rani", agent: balaji, classes: ["IX", "X", "XI", "XII"], students: 26, color: "#8a5c9e" },
  // Regular agents.
  { name: "Saraswati Vidya Mandir", short: "SVM", city: "Rohtak", principal: "Ram Niwas", agent: papertrail, classes: ["III", "IV", "V", "VI"], students: 24, color: "#c0634f" },
  { name: "Holy Angels Convent School", short: "HACS", city: "Rohtak", principal: "Sr. Mary Thomas", agent: papertrail, classes: ["VII", "VIII"], students: 18, color: "#2d6b8a" },
  { name: "Adarsh Bal Niketan", short: "ABN", city: "Karnal", principal: "Pawan Saini", agent: kiran, classes: ["I", "II", "III"], students: 12, color: "#6b7d3a" },
];

const boys = ["Aarav", "Vihaan", "Arjun", "Kabir", "Aditya", "Reyansh", "Ishaan", "Rudra", "Atharv", "Vivaan", "Shaurya", "Dhruv", "Kartik", "Himanshu", "Ankush", "Yash", "Harsh", "Mohit", "Sahil", "Tushar", "Nikhil", "Rohit", "Deepak", "Aman"];
const girls = ["Ananya", "Diya", "Ishita", "Myra", "Saanvi", "Anika", "Avni", "Kiara", "Aadhya", "Tara", "Sara", "Navya", "Janvi", "Ankita", "Pooja", "Riya", "Simran", "Kajal", "Muskan", "Priya", "Neha", "Khushi", "Tanvi", "Sneha"];
const surnames = ["Sharma", "Verma", "Malik", "Dahiya", "Kumar", "Singh", "Gupta", "Jain", "Saini", "Yadav", "Rathi", "Hooda", "Kaushik", "Bansal", "Chauhan", "Arora"];
const fathers = ["Sunil", "Ajay", "Satbir", "Suresh", "Vikas", "Dinesh", "Rajender", "Mahender", "Naresh", "Pradeep", "Sandeep", "Ramesh", "Anil", "Rakesh", "Joginder", "Krishan"];
const mothers = ["Poonam", "Preeti", "Sita", "Pinki", "Soniya", "Sunita", "Kavita", "Rekha", "Anju", "Seema", "Neelam", "Suman", "Meena", "Geeta", "Usha", "Babita"];
const fatherPrefixes = ["Mr.", "Mr.", "Sh.", "Sh.", "Dr.", "Late Sh.", "Md."];
const motherPrefixes = ["Mrs.", "Mrs.", "Smt.", "Smt.", "Dr.", "Ms.", "Late Smt."];
const bloods = ["O+", "B+", "A+", "AB+", "O-", "B-"];
const houses = ["Red", "Blue", "Green", "Yellow"];
// Status mix per school, cycled: covers every stage of the workflow.
const statusCycle: StudentStatus[] = ["APPROVED", "APPROVED", "IN_REVIEW", "INVITED", "DRAFT", "CHANGES_REQUESTED", "APPROVED", "IN_REVIEW", "SUBMITTED_FOR_PRINT", "SUBMITTED_FOR_PRINT", "DRAFT", "APPROVED"];
const corrections = ["Please retake the photo in even light; your face is in shadow.", "Date of birth does not match the school record.", "Father's name is misspelt. Please correct it.", "Photo has a cap on; please take it without headwear."];

let photoSeed = 0, rowNo = 0;
for (const [si, spec] of schoolSpecs.entries()) {
  const created = daysAgo(180 - si * 12);
  const school = await prisma.school.create({
    data: {
      code: await nextCode(prisma, "school", "SCH"), name: spec.name, shortName: spec.short, city: spec.city, state: "Haryana", pin: "131001",
      address: `${12 + si}, ${spec.city} Road`, phone: `98765${String(43210 + si)}`, email: `office.${spec.short.toLowerCase()}@${DOMAIN}`, principal: spec.principal,
      agentId: spec.agent?.id ?? null, color: spec.color, currentSession: SESSION, studentRounds: 1 + (si % 3), staffRounds: 1,
      status: spec.agent?.status === "INACTIVE" ? "INACTIVE" : "ACTIVE", studentDesignId: designs.classic.id, staffDesignId: designs.campus.id, lanyardDesignId: designs.lanyard.id, createdAt: created,
    },
  });
  await seedSchoolFields(prisma, school.id);
  if (spec.tweak === "house") {
    await prisma.schoolField.create({ data: { schoolId: school.id, audience: "STUDENT", key: "x_house", label: "House", custom: true, enabled: true, required: false, sortOrder: 50 } });
    await prisma.schoolField.updateMany({ where: { schoolId: school.id, audience: "STUDENT", key: { in: ["bloodGroup", "gender"] } }, data: { enabled: true } });
  }
  if (spec.tweak === "noEmail") await prisma.schoolField.updateMany({ where: { schoolId: school.id, audience: "STUDENT", key: { in: ["email", "srn"] } }, data: { enabled: false } });
  if (spec.tweak === "motherRequired") await prisma.schoolField.updateMany({ where: { schoolId: school.id, audience: "STUDENT", key: { in: ["motherName", "dob"] } }, data: { required: true } });

  await prisma.academicSession.create({ data: { schoolId: school.id, name: SESSION, isCurrent: true, startDate: day(`${SESSION.slice(0, 4)}-04-01`), endDate: day(`${+SESSION.slice(0, 4) + 1}-03-31`) } });
  if (si < 3) await prisma.academicSession.create({ data: { schoolId: school.id, name: PREV_SESSION, isCurrent: false, startDate: day(`${PREV_SESSION.slice(0, 4)}-04-01`), endDate: day(`${+PREV_SESSION.slice(0, 4) + 1}-03-31`) } });
  for (const [i, c] of spec.classes.entries())
    await prisma.schoolClass.create({ data: { schoolId: school.id, name: c, sortOrder: i, sections: { create: (i % 2 ? ["A", "B", "C"] : ["A", "B"]).map((name) => ({ name })) } } });
  await prisma.staffRole.createMany({ data: ["Principal", "Teacher", "Librarian", "Office staff", "Driver"].map((name) => ({ schoolId: school.id, name })) });

  const adminEmail = `admin.${spec.short.toLowerCase()}@${DOMAIN}`;
  await prisma.user.create({ data: { email: adminEmail, name: `${spec.principal}`, role: "SCHOOL_ADMIN", status: si === 7 ? "INVITED" : "ACTIVE", schoolId: school.id, lastLoginAt: si === 7 ? null : daysAgo(si % 4) } });
  await log("school.created", `${admin.name} created ${spec.name}${spec.agent ? ` for ${spec.agent.name}` : ""}`, created, { schoolId: school.id, agentId: spec.agent?.id, entityType: "school", entityId: school.id });

  // Staff
  const staffRows = [
    { name: spec.principal, role: "Principal" },
    { name: `${girls[si + 3]} ${surnames[si + 2]}`, role: "Teacher" },
    { name: `${boys[si + 5]} ${surnames[si + 4]}`, role: "Teacher" },
    { name: `${girls[si + 8]} ${surnames[si]}`, role: "Librarian" },
    { name: `${boys[si + 9]} ${surnames[si + 6]}`, role: "Office staff" },
  ];
  for (const [i, st] of staffRows.entries()) {
    const withPhoto = i < 4;
    const staff = await prisma.staff.create({
      data: {
        code: await nextCode(prisma, "staff", "SF", 5), schoolId: school.id, session: SESSION, name: st.name, role: st.role, phone: `98120${String(10000 + si * 10 + i)}`,
        email: `${st.name.split(" ")[0].toLowerCase()}.${spec.short.toLowerCase()}@${DOMAIN}`, address: `${spec.city}, Haryana`,
        reviewStatus: i < 2 ? "APPROVED" : i === 2 ? "IN_REVIEW" : "DRAFT", approvedAt: i < 2 ? daysAgo(30) : null,
      },
    });
    if (withPhoto) {
      const p = await portrait(photoSeed++, i % 2 === 1 || i === 3);
      const key = `schools/${school.id}/staff/${staff.id}-${p.checksum.slice(0, 12)}.jpg`;
      await storage.put(key, p.buffer, "image/jpeg");
      await prisma.staff.update({ where: { id: staff.id }, data: { photoKey: key, photoSource: "UPLOAD" } });
    }
  }

  // Students
  const codes = await nextCodes(prisma, "student", "ST", spec.students);
  const approvedForBatch: string[] = [];
  const printed: string[] = [];
  for (let i = 0; i < spec.students; i++) {
    const female = i % 2 === 1;
    const first = (female ? girls : boys)[(i + si * 3) % 24];
    const last = surnames[(i * 3 + si) % surnames.length];
    const status = spec.agent?.status === "INACTIVE" && i % 3 ? "DRAFT" : statusCycle[(i + si) % statusCycle.length];
    const className = spec.classes[i % spec.classes.length];
    const sections = spec.classes.indexOf(className) % 2 ? ["A", "B", "C"] : ["A", "B"];
    const hasPhoto = !["DRAFT", "INVITED"].includes(status) || (status === "DRAFT" && i % 4 === 0);
    const hasEmail = spec.tweak !== "noEmail" && i % 5 !== 2;
    const grade = ["LKG", "UKG", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"].indexOf(className);
    const baseYear = new Date().getFullYear() - 4 - grade;
    const photoNo = `DSC_${String(1000 + ++rowNo).padStart(4, "0")}`;
    const student = await prisma.student.create({
      data: {
        code: codes[i], schoolId: school.id, session: SESSION, className, section: sections[i % sections.length], name: `${first} ${last}`.toUpperCase(),
        admissionNo: String(9100 + si * 100 + i), srn: String(2002500000 + si * 1000 + i), photoNo, rollNo: String(i + 1),
        fatherPrefix: fatherPrefixes[(i + si) % fatherPrefixes.length], fatherName: `${fathers[(i + si) % fathers.length]} ${last}`.toUpperCase(),
        motherPrefix: motherPrefixes[(i * 2 + si) % motherPrefixes.length], motherName: status === "DRAFT" && i % 3 === 0 ? null : `${mothers[(i + 2 * si) % mothers.length]}`.toUpperCase(),
        dob: day(`${baseYear}-${String(1 + (i % 12)).padStart(2, "0")}-${String(1 + ((i * 7) % 27)).padStart(2, "0")}`), gender: female ? "Female" : "Male",
        email: hasEmail ? `${first.toLowerCase()}.${last.toLowerCase()}${i}@example.com` : null, phone: `9${String(494949494 - si * 1111 - i * 37).padStart(9, "0")}`,
        address: `${10 + i}, Ward ${1 + (i % 9)}, ${spec.city}`.toUpperCase(), bloodGroup: bloods[i % bloods.length], transport: i % 3 ? `Route ${1 + (i % 4)}` : null,
        admissionDate: day(`${2018 + (i % 6)}-04-0${1 + (i % 9)}`), extra: spec.tweak === "house" ? { x_house: houses[i % 4] } : {},
        status, active: !(i === spec.students - 1 && si % 2 === 0),
        invitedAt: ["INVITED", "IN_REVIEW", "CHANGES_REQUESTED"].includes(status) ? daysAgo(10 - (i % 5)) : null,
        submittedAt: ["IN_REVIEW", "APPROVED", "SUBMITTED_FOR_PRINT"].includes(status) ? daysAgo(6 - (i % 4)) : null,
        approvedAt: ["APPROVED", "SUBMITTED_FOR_PRINT"].includes(status) ? daysAgo(3 - (i % 3)) : null, approvedById: ["APPROVED", "SUBMITTED_FOR_PRINT"].includes(status) ? admin.id : null,
        reviewNote: status === "CHANGES_REQUESTED" ? corrections[(i + si) % corrections.length] : null, createdAt: daysAgo(40 - (i % 10)),
      },
    });
    if (hasPhoto) {
      const p = await portrait(photoSeed++, female);
      const key = `schools/${school.id}/students/${student.id}-${p.checksum.slice(0, 12)}.jpg`;
      await storage.put(key, p.buffer, "image/jpeg");
      const source = status === "IN_REVIEW" || status === "CHANGES_REQUESTED" ? "CAMERA" : i % 3 ? "UPLOAD" : "LIBRARY";
      await prisma.student.update({ where: { id: student.id }, data: { photoKey: key, photoSource: source, photoCapturedAt: daysAgo(5) } });
    }
    if (["INVITED", "IN_REVIEW", "CHANGES_REQUESTED"].includes(status)) {
      await prisma.invitation.create({
        data: {
          studentId: student.id, tokenHash: createHash("sha256").update(`demo-${student.id}`).digest("hex"), channel: student.email ? "EMAIL" : "LINK", sentTo: student.email,
          createdById: admin.id, expiresAt: new Date(now + 10 * 864e5), sentAt: student.invitedAt, openedAt: status !== "INVITED" ? daysAgo(6) : null,
          verifiedAt: status !== "INVITED" ? daysAgo(6) : null, submittedAt: status === "IN_REVIEW" ? daysAgo(5) : null,
        },
      });
    }
    if (status === "SUBMITTED_FOR_PRINT") printed.push(student.id);
    if (status === "APPROVED" && i % 4 === 0) approvedForBatch.push(student.id);
  }

  // Photo library: a few unmatched photos ready to be linked by Photo No.
  if (si === 2) {
    for (const n of ["DSC_2001", "DSC_2002", "DSC_2003"]) {
      const p = await portrait(photoSeed++, n.endsWith("2"));
      const key = `schools/${school.id}/library/${n}-${p.checksum.slice(0, 10)}.jpg`;
      await storage.put(key, p.buffer, "image/jpeg");
      await prisma.photoAsset.create({ data: { schoolId: school.id, fileName: `${n}.jpg`, storageKey: key, mime: "image/jpeg", size: p.buffer.length, checksum: p.checksum, uploadedById: admin.id } });
    }
  }

  // Print batches: delivered history plus the cards currently in production.
  const agentPrints = spec.agent?.tier === "PREMIUM" && spec.agent.printBySelf;
  const makeBatch = async (ids: string[], status: "SUBMITTED" | "IN_PROGRESS" | "PRINTED" | "DELIVERED", name: string, ageDays: number) => {
    if (!ids.length) return;
    const rows = await prisma.student.findMany({ where: { id: { in: ids } } });
    const batch = await prisma.printBatch.create({
      data: {
        code: await nextCode(prisma, "batch", "B", 4, 1000), name, schoolId: school.id, session: SESSION, status, fulfilledBy: agentPrints ? "AGENT" : "CENTRAL",
        fulfillerAgentId: agentPrints ? spec.agent!.id : null, designName: "Classic", studentCount: rows.length, createdById: admin.id, createdAt: daysAgo(ageDays),
        printedAt: ["PRINTED", "DELIVERED"].includes(status) ? daysAgo(ageDays - 3) : null, deliveredAt: status === "DELIVERED" ? daysAgo(ageDays - 6) : null,
        carrier: status === "DELIVERED" ? "DTDC" : status === "PRINTED" ? "School pickup" : null, tracking: status === "DELIVERED" ? `D${70000000 + si * 97}` : null,
        items: { create: rows.map((s) => ({ kind: "STUDENT" as const, studentId: s.id, snapshot: snapshotOf(s as never) as object, photoKey: s.photoKey, photoNo: s.photoNo || s.admissionNo || s.code, sortName: s.name, className: s.className })) },
      },
    });
    await prisma.student.updateMany({ where: { id: { in: ids } }, data: { status: "SUBMITTED_FOR_PRINT" } });
    await log(`batch.${status === "SUBMITTED" ? "created" : status.toLowerCase()}`, `${name} (${batch.code}) is ${status.toLowerCase().replace("_", " ")}`, daysAgo(ageDays - 1), { schoolId: school.id, agentId: spec.agent?.id, entityType: "batch", entityId: batch.id });
    return batch;
  };
  const half = Math.ceil(printed.length / 2);
  const delivered = await makeBatch(printed.slice(0, half), "DELIVERED", `${spec.short} first collection`, 25);
  await makeBatch(printed.slice(half), si % 2 ? "PRINTED" : "IN_PROGRESS", `${spec.short} second round`, 9);
  if (si % 3 === 0) await makeBatch(approvedForBatch.slice(0, 2), "SUBMITTED", `${spec.short} late admissions`, 2);

  // Order form and photo PDF uploads.
  if (delivered) {
    const form = await pdf(`Order form · ${spec.name}`, [`Batch ${delivered.code}`, `Cards: ${delivered.studentCount}`, "Signed by the principal (demo)."]);
    const key = `schools/${school.id}/order-forms/order-${delivered.code}.pdf`;
    await storage.put(key, form, "application/pdf");
    await prisma.orderForm.create({ data: { schoolId: school.id, batchId: delivered.id, fileName: `order-form-${delivered.code}.pdf`, storageKey: key, mime: "application/pdf", size: form.length, note: "Signed order form", uploadedById: admin.id } });
  }
  if (spec.agent) {
    const sheet = await pdf(`${spec.name} · photo collection`, spec.classes.map((c) => `Class ${c}: portraits labelled by Photo No.`));
    const key = `schools/${school.id}/pdfs/${spec.short.toLowerCase()}-photos.pdf`;
    await storage.put(key, sheet, "application/pdf");
    await prisma.pdfUpload.create({ data: { schoolId: school.id, agentId: spec.agent.id, fileName: `${spec.short.toLowerCase()}_class-photos.pdf`, storageKey: key, size: sheet.length, pages: 1, note: `Collected by ${spec.agent.name}`, status: (["READY_FOR_REVIEW", "REVIEWED", "REJECTED"] as const)[si % 3], createdAt: daysAgo(12 - si) } });
  }

  // Activity a school would generate.
  await log("student.imported", `${spec.principal} imported ${spec.students} students into ${spec.name}`, daysAgo(40), { schoolId: school.id, agentId: spec.agent?.id });
  await log("invitation.sent", `${spec.principal} emailed personal links to students of ${spec.name}`, daysAgo(10), { schoolId: school.id, agentId: spec.agent?.id });
  await log("student.approved", `${spec.principal} approved ID cards for ${spec.name}`, daysAgo(3), { schoolId: school.id, agentId: spec.agent?.id });
  console.log(`  ${spec.name}: ${spec.students} students`);
}

// Last year's records for the first school (promotion history).
const first = await prisma.school.findFirstOrThrow({ where: { name: schoolSpecs[0].name } });
const history = await prisma.student.findMany({ where: { schoolId: first.id, session: SESSION }, take: 8 });
const histCodes = await nextCodes(prisma, "student", "ST", history.length);
for (const [i, s] of history.entries()) {
  const { id: _id, code: _c, createdAt: _a, updatedAt: _u, version: _v, ...rest } = s;
  const prev = await prisma.student.create({ data: { ...rest, extra: s.extra as object, code: histCodes[i], session: PREV_SESSION, status: "SUBMITTED_FOR_PRINT", admissionNo: s.admissionNo } });
  await prisma.student.update({ where: { id: s.id }, data: { promotedFromId: prev.id } });
}

await prisma.notification.createMany({
  data: [
    { userId: admin.id, title: "Shree Balaji Graphics subscription ends soon", body: "Renew before it expires to keep downloads and own printing.", link: "/agents" },
    { userId: admin.id, title: "New cards are ready for print", body: "Several schools have approved cards waiting for a batch.", link: "/printing" },
    { userId: admin.id, title: "Photo PDF received", body: "Greenwood Public School · ready for review", link: "/photos" },
  ],
});
console.log("Demo data loaded.");
await prisma.$disconnect();
process.exit(0);
