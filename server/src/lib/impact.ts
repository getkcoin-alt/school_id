import { prisma } from "./db.js";

/**
 * Plain-language summary of what a delete will do, shown before the user confirms.
 * `lines` describe what is removed or changed; `warnings` call out things that
 * need attention (open print batches, active links).
 */
export type Impact = { lines: string[]; warnings: string[] };

const n = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
const OPEN = ["SUBMITTED", "IN_PROGRESS"] as const;
/** "2 batches, 3 photos and 1 PDF", leaving out anything with a zero count. */
const list = (parts: [number, string, string?][]) => {
  const items = parts.filter(([c]) => c > 0).map(([c, one, many]) => n(c, one, many));
  return items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items.at(-1)}` : (items[0] ?? "");
};

export async function schoolImpact(schoolId: string): Promise<Impact> {
  const now = new Date();
  const [students, withPhoto, staff, batches, openBatches, photos, pdfs, orderForms, logins, links] = await Promise.all([
    prisma.student.count({ where: { schoolId, deletedAt: null } }),
    prisma.student.count({ where: { schoolId, deletedAt: null, photoKey: { not: null } } }),
    prisma.staff.count({ where: { schoolId, deletedAt: null } }),
    prisma.printBatch.count({ where: { schoolId } }),
    prisma.printBatch.count({ where: { schoolId, status: { in: [...OPEN] } } }),
    prisma.photoAsset.count({ where: { schoolId } }),
    prisma.pdfUpload.count({ where: { schoolId } }),
    prisma.orderForm.count({ where: { schoolId } }),
    prisma.user.count({ where: { schoolId, status: { not: "DISABLED" } } }),
    prisma.invitation.count({ where: { student: { schoolId, deletedAt: null }, revokedAt: null, submittedAt: null, expiresAt: { gt: now } } }),
  ]);
  const files = list([[batches, "print batch", "print batches"], [photos, "library photo"], [pdfs, "photo PDF"], [orderForms, "order form"]]);
  const lines = [
    students ? `${n(students, "student record")} (all sessions, ${withPhoto} with photos) will be removed.` : "The school has no student records.",
    ...(staff ? [`${n(staff, "staff record")} will be removed.`] : []),
    ...(files ? [`${files} will no longer be available.`] : []),
    ...(logins ? [`${n(logins, "school login")} will be disabled and can no longer sign in.`] : []),
  ];
  const warnings: string[] = [];
  if (openBatches) warnings.push(`${n(openBatches, "print batch is", "print batches are")} still open and will be cancelled, so those cards will not be printed.`);
  if (links) warnings.push(`${n(links, "student link")} that students have not used yet will stop working.`);
  return { lines, warnings };
}

export async function agentImpact(agentId: string): Promise<Impact> {
  const [schools, logins, printing, designs] = await Promise.all([
    prisma.school.findMany({ where: { agentId, deletedAt: null }, select: { name: true } }),
    prisma.user.count({ where: { agentId, status: { not: "DISABLED" } } }),
    prisma.printBatch.count({ where: { fulfillerAgentId: agentId, status: { in: [...OPEN] } } }),
    prisma.design.count({ where: { agentId, deletedAt: null } }),
  ]);
  const lines = [
    schools.length
      ? `${n(schools.length, "school")} (${schools.slice(0, 5).map((s) => s.name).join(", ")}${schools.length > 5 ? ", …" : ""}) will move to ID Studio with no agent. The schools, their students and batches are kept.`
      : "This agent has no schools.",
    ...(logins ? [`${n(logins, "agent login")} will be disabled and can no longer sign in.`] : []),
    ...(designs ? [`${n(designs, "card design")} made by this agent will be removed.`] : []),
  ];
  const warnings: string[] = [];
  if (printing) warnings.push(`${n(printing, "open print batch", "open print batches")} this agent was printing will move to ID Studio printing.`);
  return { lines, warnings };
}

export async function studentImpact(studentId: string): Promise<Impact> {
  const now = new Date();
  const [s, links, items] = await Promise.all([
    prisma.student.findUnique({ where: { id: studentId }, select: { name: true, photoKey: true } }),
    prisma.invitation.count({ where: { studentId, revokedAt: null, submittedAt: null, expiresAt: { gt: now } } }),
    prisma.printBatchItem.findMany({ where: { studentId }, select: { batch: { select: { code: true, status: true } } } }),
  ]);
  const lines = [`${s?.name ?? "This student"}'s details${s?.photoKey ? " and photo" : ""} will be removed from the school list.`];
  if (links) lines.push(`Their student link will stop working.`);
  const open = items.filter((i) => (OPEN as readonly string[]).includes(i.batch.status));
  const done = items.length - open.length;
  if (done) lines.push(`Records in ${n(done, "printed or closed batch", "printed or closed batches")} stay in batch history.`);
  const warnings = open.map((i) => `Already in open print batch ${i.batch.code}: the card will still be printed unless that batch is cancelled or deleted.`);
  return { lines, warnings };
}

export async function batchImpact(batch: { id: string; code: string; status: string; studentCount: number; staffCount: number }): Promise<Impact> {
  const forms = await prisma.orderForm.count({ where: { batchId: batch.id } });
  const open = (OPEN as readonly string[]).includes(batch.status);
  const cards = list([[batch.studentCount, "student card"], [batch.staffCount, "staff card"]]) || "No cards";
  const lines = [
    open || batch.status === "CANCELLED"
      ? `${cards} will go back to Approved, so they can be added to a new batch.`
      : `${cards} were already ${batch.status === "DELIVERED" ? "delivered" : "printed"}; they stay marked as sent for print.`,
    `The batch, its print list and its downloads (Excel, ZIP, checklist) will be removed.`,
  ];
  if (forms) lines.push(`${n(forms, "order form")} linked to this batch will be kept, but no longer linked to it.`);
  const warnings: string[] = [];
  if (batch.status === "IN_PROGRESS") warnings.push(`${batch.code} is being printed right now. Tell the printer before deleting it.`);
  return { lines, warnings };
}
