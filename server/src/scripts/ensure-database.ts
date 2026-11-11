// Creates the database named in DATABASE_URL if it does not exist yet (first deploy).
import { PrismaClient } from "@prisma/client";

const url = new URL(process.env.DATABASE_URL ?? "");
const name = decodeURIComponent(url.pathname.slice(1));
if (!/^[A-Za-z0-9_]+$/.test(name)) throw new Error(`Unsafe database name: ${name}`);
const admin = new URL(url);
admin.pathname = "/postgres";
admin.search = "";
const db = new PrismaClient({ datasourceUrl: admin.toString() });
const rows = await db.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM pg_database WHERE datname = ${name}`;
if (!rows[0].n) {
  await db.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  console.log(`Created database ${name}`);
} else console.log(`Database ${name} exists`);
await db.$disconnect();
process.exit(0);
