import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { config } from "../config.js";
import { logger } from "./logger.js";

// Background work goes through BullMQ when Redis is configured so API nodes stay
// fast and stateless. Without Redis (tests, tiny installs) jobs run in-process.
export const redis = config.REDIS_URL && config.NODE_ENV !== "test"
  ? new Redis(config.REDIS_URL, { maxRetriesPerRequest: null })
  : null;

const queues = new Map<string, Queue>();
export const QUEUE_NAMES = ["email"] as const;

export function getQueue(name: string) {
  if (!redis) return null;
  let q = queues.get(name);
  if (!q) {
    q = new Queue(name, { connection: redis, defaultJobOptions: { attempts: 5, backoff: { type: "exponential", delay: 5000 }, removeOnComplete: 1000, removeOnFail: 5000 } });
    queues.set(name, q);
  }
  return q;
}

export async function enqueue(name: string, data: Record<string, unknown>, inline: () => Promise<unknown>) {
  const q = getQueue(name);
  if (q) {
    await q.add(name, data);
    return;
  }
  // Fire and forget in-process; failures stay PENDING in the outbox for a retry sweep.
  inline().catch((err) => logger.warn({ err, name }, "inline job failed"));
}

export async function closeQueues() {
  await Promise.all([...queues.values()].map((q) => q.close()));
  await redis?.quit();
}
