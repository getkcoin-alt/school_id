// Usage: node dist/scripts/create-super-admin.js admin@example.com "Full Name"
// Creates (or re-invites) a super admin and emails a set-password link.
import { prisma } from "../lib/db.js";
import { normaliseEmail, sendOnboardingInvite } from "../lib/onboarding.js";
import { hashPassword, strongPassword } from "../lib/crypto.js";

const args = process.argv.slice(2).filter((a) => a !== "--if-none");
const [emailArg, name = "Super Admin"] = args;
// --if-none: used by deploys; does nothing once any super admin exists.
if (process.argv.includes("--if-none") && (await prisma.user.count({ where: { role: "SUPER_ADMIN" } }))) {
  console.log("A super admin already exists; nothing to do.");
  await prisma.$disconnect();
  process.exit(0);
}
if (!emailArg) {
  console.error('Usage: create-super-admin <email> "<name>"   (set SUPER_ADMIN_PASSWORD to skip the email link)');
  process.exit(1);
}
const email = normaliseEmail(emailArg);
const password = process.env.SUPER_ADMIN_PASSWORD;
if (password && !strongPassword(password)) {
  console.error("SUPER_ADMIN_PASSWORD needs 8+ characters with a letter and a number.");
  process.exit(1);
}
const user = await prisma.user.upsert({
  where: { email },
  create: { email, name, role: "SUPER_ADMIN", status: password ? "ACTIVE" : "INVITED", passwordHash: password ? await hashPassword(password) : null },
  update: { role: "SUPER_ADMIN", ...(password ? { passwordHash: await hashPassword(password), status: "ACTIVE" } : {}) },
});
if (!password) {
  const url = await sendOnboardingInvite(user);
  console.log(`Setup link emailed to ${email}. Link: ${url}`);
} else console.log(`Super admin ${email} is ready.`);
await new Promise((r) => setTimeout(r, 500));
await prisma.$disconnect();
process.exit(0);
