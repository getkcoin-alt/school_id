import { PrismaClient, Prisma } from "@prisma/client";

export const prisma = new PrismaClient({
  log: process.env.PRISMA_LOG ? ["query", "warn", "error"] : ["warn", "error"],
});
export type Tx = Prisma.TransactionClient;
export { Prisma };

/** Next value of a named counter, used for human-readable codes. */
export async function nextCode(tx: Tx | PrismaClient, name: string, prefix: string, pad = 3, start = 0) {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "Counter" (name, value) VALUES (${name}, ${start + 1})
    ON CONFLICT (name) DO UPDATE SET value = "Counter".value + 1
    RETURNING value`;
  return `${prefix}-${String(rows[0].value).padStart(pad, "0")}`;
}

/** Reserves `count` consecutive codes in one statement (bulk imports). */
export async function nextCodes(tx: Tx | PrismaClient, name: string, prefix: string, count: number, pad = 6) {
  if (count <= 0) return [];
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "Counter" (name, value) VALUES (${name}, ${count})
    ON CONFLICT (name) DO UPDATE SET value = "Counter".value + ${count}
    RETURNING value`;
  const last = rows[0].value;
  return Array.from({ length: count }, (_, i) => `${prefix}-${String(last - count + 1 + i).padStart(pad, "0")}`);
}
