import { afterAll, beforeAll, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { prisma } from "../src/lib/db.js";
import { api, jpeg, lastEmail, login, makeApp, PASSWORD, superAdmin, type App } from "./helpers.js";

let app: App;
let root: string; // super admin token
const ctx: Record<string, string> = {};

const tokenFrom = (text: string, param: string) => new URL(text.match(/https?:\/\/\S+/)![0]).searchParams.get(param)!;

beforeAll(async () => {
  app = await makeApp();
  const admin = await superAdmin("root@test.in");
  root = await login(app, admin.email);
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("authentication", () => {
  it("rejects a wrong password and locks after repeated failures", async () => {
    await superAdmin("lock@test.in");
    for (let i = 0; i < 5; i++) {
      const r = await api(app).post("/auth/login", { email: "lock@test.in", password: "wrong-pass1" });
      expect(r.statusCode).toBe(401);
    }
    const locked = await api(app).post("/auth/login", { email: "lock@test.in", password: PASSWORD });
    expect(locked.statusCode).toBe(403);
  });

  it("rotates refresh tokens and ends the family on reuse", async () => {
    const r = await app.inject({ method: "POST", url: "/api/v1/auth/login", headers: { "x-client": "mobile" }, payload: { email: "root@test.in", password: PASSWORD } });
    const first = r.json().refreshToken;
    const r2 = await api(app).post("/auth/refresh", { refreshToken: first });
    expect(r2.statusCode).toBe(200);
    const reuse = await api(app).post("/auth/refresh", { refreshToken: first });
    expect(reuse.statusCode).toBe(401);
  });

  it("lets the web app send every method across origins", async () => {
    for (const method of ["PATCH", "PUT", "DELETE"]) {
      const r = await app.inject({ method: "OPTIONS", url: "/api/v1/students/x", headers: { origin: "http://app.test", "access-control-request-method": method, "access-control-request-headers": "authorization,content-type" } });
      expect(r.headers["access-control-allow-methods"]).toContain(method);
      expect(r.headers["access-control-allow-origin"]).toBe("http://app.test");
    }
    const other = await app.inject({ method: "OPTIONS", url: "/api/v1/students/x", headers: { origin: "http://evil.test", "access-control-request-method": "PATCH" } });
    expect(other.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("requires a token for protected routes", async () => {
    expect((await api(app).get("/workspace")).statusCode).toBe(401);
  });
});

describe("onboarding by email", () => {
  it("creates agents and a school whose people set their own passwords", async () => {
    const prem = await api(app, root).post("/agents", { name: "Premium Prints", email: "prem@test.in", phone: "9876543210", tier: "PREMIUM", printBySelf: true, subscriptionEnd: "2099-03-31" });
    expect(prem.statusCode).toBe(200);
    ctx.premiumAgentId = prem.json().id;
    const reg = await api(app, root).post("/agents", { name: "Regular Ravi", email: "reg@test.in", tier: "REGULAR" });
    ctx.regularAgentId = reg.json().id;

    for (const email of ["prem@test.in", "reg@test.in"]) {
      const mail = await lastEmail(email);
      const token = tokenFrom(mail.text, "onboard");
      const info = await api(app).get(`/auth/onboard/${token}`);
      expect(info.json().email).toBe(email);
      expect((await api(app).post("/auth/onboard", { token, password: "short" })).statusCode).toBe(400);
      expect((await api(app).post("/auth/onboard", { token, password: PASSWORD })).statusCode).toBe(200);
      expect((await api(app).post("/auth/onboard", { token, password: PASSWORD })).statusCode).toBe(400); // single use
    }

    const school = await api(app, root).post("/schools", { name: "Govt Sr Sec School", shortName: "GSSS", city: "Sonipat", agentId: ctx.premiumAgentId, studentRounds: 5, admin: { name: "Sunita", email: "head@gsss.test" } });
    expect(school.statusCode).toBe(200);
    ctx.schoolId = school.json().id;
    const other = await api(app, root).post("/schools", { name: "Other School", agentId: ctx.regularAgentId, admin: { name: "Other", email: "head@other.test" } });
    ctx.otherSchoolId = other.json().id;
    for (const email of ["head@gsss.test", "head@other.test"]) {
      const token = tokenFrom((await lastEmail(email)).text, "onboard");
      await api(app).post("/auth/onboard", { token, password: PASSWORD });
    }
    ctx.school = await login(app, "head@gsss.test");
    ctx.other = await login(app, "head@other.test");
    ctx.premium = await login(app, "prem@test.in");
    ctx.regular = await login(app, "reg@test.in");
  });
});

describe("student data (sample sheet)", () => {
  const sheet = [
    { SRNO: 1, PHOTO: "DSC_0101", NAME: "ADITYA", PREFIXF: "MR.", FATHER: "SUNIL", PREFIXM: "MRS.", MOTHER: "POONAM", DOB: 42348, CLASS: "VII", SECTION: "A", MOBILE: 9494949494, ADDRESS: "SONIPAT", ADMNO: 9196, SRN: 2002510881 },
    { SRNO: 2, PHOTO: "DSC_0108", NAME: "ANKITA", PREFIXF: "MR.", FATHER: "AJAY", PREFIXM: "MRS.", MOTHER: "PREETI", DOB: 42348, CLASS: "VII", SECTION: "A", MOBILE: 9494949494, ADDRESS: "SONIPAT", ADMNO: 9189, SRN: 2002496961 },
    { SRNO: 3, PHOTO: "DSC_0074", NAME: "amit", PREFIXF: "sh", FATHER: "DILBAGH", PREFIXM: "smt", MOTHER: "GEETA", DOB: "09/12/2015", CLASS: "VIII", SECTION: "a", MOBILE: "+91 94949 49494", ADDRESS: "SONIPAT", ADMNO: 9167, SRN: 1800659623 },
    { SRNO: 4, PHOTO: "DSC_0101", NAME: "ADITYA", FATHER: "SUNIL", DOB: 42348, CLASS: "VII", ADMNO: 9196 }, // duplicate admission no
    { SRNO: 5, NAME: "", CLASS: "VII" }, // invalid: no name
  ];

  it("imports, normalises and skips duplicates", async () => {
    const r = await api(app, ctx.school).post("/students/import", { rows: sheet });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.created).toBe(3);
    expect(body.skipped).toHaveLength(1);
    expect(body.invalid).toHaveLength(1);
    const amit = await prisma.student.findFirstOrThrow({ where: { name: "amit" } });
    expect(amit.fatherPrefix).toBe("Sh.");
    expect(amit.motherPrefix).toBe("Smt.");
    expect(amit.phone).toBe("9494949494");
    expect(amit.dob?.toISOString().slice(0, 10)).toBe("2015-12-09");
    const aditya = await prisma.student.findFirstOrThrow({ where: { name: "ADITYA" } });
    expect(aditya.dob?.toISOString().slice(0, 10)).toBe("2015-12-10"); // Excel serial 42348
    expect(aditya.admissionNo).toBe("9196");
    ctx.aditya = aditya.id;
    ctx.amit = amit.id;
  });

  it("refuses a manual duplicate entry", async () => {
    const r = await api(app, ctx.school).post("/students", { name: "Aditya", className: "VII", admissionNo: "9196" });
    expect(r.statusCode).toBe(409);
  });

  it("validates prefixes, phone and dates on manual entry", async () => {
    expect((await api(app, ctx.school).post("/students", { name: "Bad Phone", className: "VII", phone: "12345" })).statusCode).toBe(400);
    const ok = await api(app, ctx.school).post("/students", { name: "Riya Sharma", className: "VI", section: "b", fatherPrefix: "late sh", fatherName: "Mohan", email: "riya@student.test" });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().fatherPrefix).toBe("Late Sh.");
    ctx.riya = ok.json().id;
  });

  it("keeps schools isolated from each other", async () => {
    expect((await api(app, ctx.other).get(`/students/${ctx.aditya}`)).statusCode).toBe(404);
    expect((await api(app, ctx.regular).get(`/students/${ctx.aditya}`)).statusCode).toBe(404);
    expect((await api(app, ctx.premium).get(`/students/${ctx.aditya}`)).statusCode).toBe(200);
  });

  it("makes fields optional or hidden and exports in the agreed order, in capitals", async () => {
    const fields = (await api(app, ctx.school).get(`/schools/${ctx.schoolId}/fields`)).json().student as { key: string; label: string; enabled: boolean; required: boolean; custom: boolean }[];
    const next = fields.map((f) => ({ ...f, enabled: f.key === "email" ? false : f.enabled, required: f.key === "motherName" ? true : f.required }));
    const put = await api(app, ctx.school).put(`/schools/${ctx.schoolId}/fields`, { audience: "STUDENT", fields: [...next, { label: "House", enabled: true, required: false }] });
    expect(put.statusCode).toBe(200);

    const r = await api(app, ctx.school).get("/students/export.xlsx");
    expect(r.statusCode).toBe(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(r.rawPayload as never);
    const ws = wb.worksheets[0];
    const headers = (ws.getRow(1).values as string[]).slice(1);
    expect(headers).toEqual(["SRNO", "PHOTO", "NAME", "PREFIXF", "FATHER", "PREFIXM", "MOTHER", "DOB", "CLASS", "SECTION", "MOBILE", "ADDRESS", "ADMNO", "SRN", "HOUSE"]);
    const first = (ws.getRow(2).values as string[]).slice(1);
    expect(first[2]).toBe("RIYA SHARMA"); // class VI sorts before VII, names upper-cased
    expect(first[3]).toBe("LATE SH.");
    const amitRow = (ws.getRow(5).values as string[]).slice(1);
    expect(amitRow[1]).toBe("DSC_0074");
    expect(amitRow[7]).toBe("09-12-2015");
  });

  it("denies downloads to regular agents", async () => {
    expect((await api(app, ctx.regular).get(`/students/export.xlsx?schoolId=${ctx.otherSchoolId}`)).statusCode).toBe(403);
    expect((await api(app, ctx.premium).get(`/students/export.xlsx?schoolId=${ctx.schoolId}`)).statusCode).toBe(200);
  });
});

describe("photos, approval and review", () => {
  it("approves without an invitation once required fields and photo exist", async () => {
    const before = await api(app, ctx.school).post("/students/approve", { ids: [ctx.aditya] });
    expect(before.json().approved).toBe(0);
    expect(before.json().failed[0].reason).toContain("Photo");

    const up = await api(app, ctx.school).multipart("/media/photos", [
      { name: "files", filename: "DSC_0101.jpg", type: "image/jpeg", data: await jpeg() },
      { name: "files", filename: "dsc_0074.JPG", type: "image/jpeg", data: await jpeg("#335577") },
      { name: "files", filename: "notes.txt", type: "text/plain", data: "x" },
    ]);
    expect(up.statusCode).toBe(200);
    expect(up.json().matched).toBe(2);
    expect(up.json().results.find((r: { fileName: string }) => r.fileName === "notes.txt").status).toBe("failed");

    const after = await api(app, ctx.school).post("/students/approve", { ids: [ctx.aditya, ctx.amit] });
    expect(after.json().approved).toBe(2);
  });

  it("does not let agents approve", async () => {
    expect((await api(app, ctx.premium).post("/students/approve", { ids: [ctx.riya] })).statusCode).toBe(403);
  });
});

describe("student link (flow 2)", () => {
  it("lets a student verify by email code, fill details, add a photo and submit for review", async () => {
    const sent = await api(app, ctx.school).post("/invitations/email", { studentIds: [ctx.riya, ctx.aditya] });
    expect(sent.json().sent).toBe(1); // Aditya has no email and is approved
    const mail = await lastEmail("riya@student.test");
    const token = tokenFrom(mail.text, "invite");
    const info = await api(app).get(`/portal/invite/${token}`);
    expect(info.json().verification).toBe("EMAIL_OTP");

    await api(app).post(`/portal/invite/${token}/otp`);
    const otp = (await lastEmail("riya@student.test")).text.match(/\b(\d{6})\b/)![1];
    expect((await api(app).post(`/portal/invite/${token}/verify`, { otp: "000000" === otp ? "111111" : "000000" })).statusCode).toBe(400);
    const v = await api(app).post(`/portal/invite/${token}/verify`, { otp });
    expect(v.statusCode).toBe(200);
    const portal = v.json().token;

    const me = await api(app, portal).get("/portal/me");
    expect(me.json().missing).toEqual(expect.arrayContaining(["Mother Name", "Photo"]));
    const saved = await api(app, portal).put("/portal/me", { motherPrefix: "Mrs.", motherName: "Kavita", admissionNo: "HACK" });
    expect(saved.json().student.admissionNo).toBeNull(); // school-only field ignored
    expect((await api(app, portal).post("/portal/me/submit", { consent: true })).statusCode).toBe(400);
    await api(app, portal).multipart("/portal/me/photo", [{ name: "photo", filename: "cam.jpg", type: "image/jpeg", data: await jpeg() }, { name: "source", data: "CAMERA" }]);
    const sub = await api(app, portal).post("/portal/me/submit", { consent: true });
    expect(sub.statusCode, sub.body).toBe(200);
    const s = await prisma.student.findUniqueOrThrow({ where: { id: ctx.riya } });
    expect(s.status).toBe("IN_REVIEW");
    expect(s.photoSource).toBe("CAMERA");
    const notes = (await api(app, ctx.school).get("/notifications")).json();
    expect(notes.items[0].title).toContain("submitted");
  });

  it("verifies students without email by admission number", async () => {
    const st = await api(app, ctx.school).post("/students", { name: "No Mail", className: "VI", admissionNo: "A-77" });
    const link = await api(app, ctx.school).post("/invitations/link", { studentId: st.json().id });
    const token = new URL(link.json().url).searchParams.get("invite")!;
    expect((await api(app).get(`/portal/invite/${token}`)).json().verification).toBe("ADMISSION_NO");
    expect((await api(app).post(`/portal/invite/${token}/verify`, { admissionNo: "nope" })).statusCode).toBe(400);
    expect((await api(app).post(`/portal/invite/${token}/verify`, { admissionNo: "a-77" })).statusCode).toBe(200);
    // A new link revokes the old one.
    await api(app, ctx.school).post("/invitations/link", { studentId: st.json().id });
    expect((await api(app).get(`/portal/invite/${token}`)).statusCode).toBe(400);
  });

  it("keeps WhatsApp for phase 2", async () => {
    expect((await api(app, ctx.school).post("/invitations/whatsapp", {})).statusCode).toBe(501);
  });
});

describe("printing", () => {
  it("lists only schools with cards ready for print", async () => {
    const q = (await api(app, root).get("/schools/print-queue")).json().items;
    expect(q.map((s: { id: string }) => s.id)).toEqual([ctx.schoolId]);
  });

  it("creates a batch from approved records, routed to the premium agent", async () => {
    const r = await api(app, ctx.school).post("/batches", { studentIds: [ctx.aditya, ctx.amit, ctx.riya] });
    expect(r.statusCode).toBe(200);
    expect(r.json().studentCount).toBe(2); // Riya is still in review
    expect(r.json().fulfilledBy).toBe("AGENT");
    ctx.batch = r.json().id;
    const again = await api(app, ctx.school).post("/batches", { studentIds: [ctx.aditya] });
    expect(again.statusCode).toBe(400);
    const byAgent = (await api(app, root).get("/batches?fulfilledBy=AGENT")).json();
    expect(byAgent.items).toHaveLength(1);
    expect((await api(app, root).get("/batches?fulfilledBy=CENTRAL")).json().items).toHaveLength(0);
  });

  it("downloads the batch as Excel plus photos with matching names", async () => {
    const r = await api(app, ctx.premium).get(`/batches/${ctx.batch}/download.zip`);
    expect(r.statusCode).toBe(200);
    const zip = r.rawPayload.toString("latin1");
    expect(zip).toContain("photos/DSC_0101.jpg");
    expect(zip).toContain("photos/DSC_0074.jpg");
    expect(zip).toMatch(/B-\d+\.xlsx/);
    expect(zip).toContain("-checklist.pdf");
    const proof = await api(app, ctx.school).get(`/batches/${ctx.batch}/proof.pdf?perPage=10`);
    expect(proof.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
    const checklist = await api(app, ctx.school).get("/students/checklist.pdf");
    expect(checklist.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("moves production forward only for the printer", async () => {
    expect((await api(app, ctx.school).patch(`/batches/${ctx.batch}`, { status: "IN_PROGRESS" })).statusCode).toBe(403);
    expect((await api(app, ctx.premium).patch(`/batches/${ctx.batch}`, { status: "DELIVERED" })).statusCode).toBe(400);
    for (const status of ["IN_PROGRESS", "PRINTED"]) expect((await api(app, ctx.premium).patch(`/batches/${ctx.batch}`, { status })).statusCode).toBe(200);
    const done = await api(app, root).patch(`/batches/${ctx.batch}`, { status: "DELIVERED", carrier: "DTDC", tracking: "D123" });
    expect(done.json().status).toBe("DELIVERED");
  });

  it("accepts order forms from every panel", async () => {
    const pdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type /Page>>endobj\n%%EOF");
    for (const t of [ctx.school, ctx.premium, root]) {
      const r = await api(app, t).multipart("/media/order-forms", [{ name: "schoolId", data: ctx.schoolId }, { name: "file", filename: "order.pdf", type: "application/pdf", data: pdf }]);
      expect(r.statusCode).toBe(200);
    }
    expect((await api(app, ctx.school).get("/media/order-forms")).json().items).toHaveLength(3);
  });
});

describe("classes and sections", () => {
  it("deletes empty classes and protects classes with students", async () => {
    const classes = (await api(app, ctx.school).get(`/schools/${ctx.schoolId}/classes`)).json().items as { id: string; name: string; students: number; sections: { id: string; name: string; students: number }[] }[];
    const vii = classes.find((c) => c.name === "VII")!;
    expect((await api(app, ctx.school).del(`/schools/${ctx.schoolId}/classes/${vii.id}`)).statusCode).toBe(409);
    const empty = classes.find((c) => c.students === 0)!;
    expect((await api(app, ctx.school).del(`/schools/${ctx.schoolId}/classes/${empty.id}/sections/${empty.sections[0].id}`)).statusCode).toBe(200);
    expect((await api(app, ctx.school).del(`/schools/${ctx.schoolId}/classes/${empty.id}`)).statusCode).toBe(200);
  });
});

describe("super admin access and activity logs", () => {
  it("opens any school or agent account, and every action records who really did it", async () => {
    const users = (await api(app, root).get(`/users?schoolId=${ctx.schoolId}`)).json().items;
    const imp = await api(app, root).post("/auth/impersonate", { userId: users[0].id });
    expect(imp.statusCode).toBe(200);
    const asSchool = imp.json().accessToken;
    expect((await api(app, asSchool).get("/auth/me")).json().impersonatedBy.name).toBe("Root Admin");
    await api(app, asSchool).post("/students", { name: "Added By Root", className: "VI" });
    const log = await prisma.activityLog.findFirstOrThrow({ where: { action: "student.created", summary: { contains: "Added By Root" } } });
    expect(log.impersonatorId).not.toBeNull();
    expect((await api(app, ctx.school).post("/auth/impersonate", { userId: users[0].id })).statusCode).toBe(403);
    expect((await api(app, asSchool).post("/auth/password/change", { currentPassword: PASSWORD, newPassword: "Another123" })).statusCode).toBe(403);
    // Ending the impersonation session stops the token from working.
    const ended = await api(app).post("/auth/logout", { refreshToken: imp.json().refreshToken });
    expect(ended.headers["set-cookie"]).toBeUndefined(); // the super admin stays signed in
    expect((await api(app, asSchool).get("/auth/me")).statusCode).toBe(401);
  });

  it("scopes logs: admin sees all, agents their schools, schools their own", async () => {
    const all = (await api(app, root).get("/activity?size=200")).json().items;
    expect(all.some((l: { schoolId: string }) => l.schoolId === ctx.otherSchoolId)).toBe(true);
    const prem = (await api(app, ctx.premium).get("/activity?size=200")).json().items;
    expect(prem.length).toBeGreaterThan(0);
    expect(prem.every((l: { schoolId: string | null }) => l.schoolId !== ctx.otherSchoolId)).toBe(true);
    const school = (await api(app, ctx.other).get("/activity?size=200")).json().items;
    expect(school.every((l: { schoolId: string | null }) => l.schoolId === ctx.otherSchoolId)).toBe(true);
    const filtered = (await api(app, root).get(`/activity?schoolId=${ctx.schoolId}&from=2000-01-01&to=2999-01-01&action=batch`)).json().items;
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every((l: { action: string }) => l.action.startsWith("batch"))).toBe(true);
  });
});

describe("partial updates", () => {
  it("leaves fields that were not sent untouched", async () => {
    const st = await api(app, ctx.school).post("/students", { name: "Partial Kid", className: "VI", fatherPrefix: "Mr.", fatherName: "Ram", phone: "9876501234", email: "pk@test.in" });
    const r = await api(app, ctx.school).patch(`/students/${st.json().id}`, { section: "B" });
    expect(r.json()).toMatchObject({ section: "B", fatherPrefix: "Mr.", fatherName: "Ram", phone: "9876501234", email: "pk@test.in" });
    const cleared = await api(app, ctx.school).patch(`/students/${st.json().id}`, { email: "" });
    expect(cleared.json().email).toBeNull();
  });
});
