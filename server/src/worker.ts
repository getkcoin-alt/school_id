import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { config } from "./config.js";
import { prisma } from "./lib/db.js";
import { deliverEmail } from "./lib/mail.js";
import { logger } from "./lib/logger.js";
import { notifyAgent, notifySuperAdmins } from "./lib/notify.js";

if (!config.REDIS_URL) {
  logger.error("REDIS_URL is required for the worker");
  process.exit(1);
}
const connection = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });

const email = new Worker("email", async (job) => deliverEmail(job.data.outboxId as string), { connection, concurrency: 5, limiter: { max: 20, duration: 1000 } });
email.on("failed", (job, err) => logger.warn({ id: job?.id, err: err.message }, "email job failed"));

// Safety nets that do not depend on a job surviving in Redis.
async function sweep() {
  // 1. Re-send outbox rows that never left (e.g. Redis restarted).
  const stale = await prisma.emailOutbox.findMany({ where: { status: "PENDING", createdAt: { lt: new Date(Date.now() - 5 * 60_000) } }, take: 100 });
  for (const row of stale) await deliverEmail(row.id).catch(() => undefined);

  // 2. Subscription expiry reminders, 7 days ahead (old backend's expiryNotified).
  const soon = new Date(Date.now() + 7 * 86400_000);
  const expiring = await prisma.agent.findMany({ where: { deletedAt: null, status: "ACTIVE", expiryNotified: false, subscriptionEnd: { lte: soon } } });
  for (const a of expiring) {
    await notifyAgent(a.id, "Your subscription ends soon", `Your ID Card Studio subscription ends on ${a.subscriptionEnd?.toISOString().slice(0, 10)}.`);
    await notifySuperAdmins(`${a.name}'s subscription ends soon`, a.subscriptionEnd?.toISOString().slice(0, 10), "agents");
    await prisma.agent.update({ where: { id: a.id }, data: { expiryNotified: true } });
  }

  // 3. Housekeeping: expired refresh tokens.
  await prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 7 * 86400_000) } } });
}
const timer = setInterval(() => sweep().catch((err) => logger.error({ err }, "sweep failed")), 10 * 60_000);
sweep().catch((err) => logger.error({ err }, "sweep failed"));
logger.info("worker started");

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    clearInterval(timer);
    await email.close();
    await connection.quit();
    await prisma.$disconnect();
    process.exit(0);
  });
}
