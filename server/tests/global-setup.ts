import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

// Each run migrates a brand-new schema, so no existing data is ever reset.
const base = process.env.TEST_DATABASE_URL ?? "postgresql://idstudio:idstudio@localhost:5432/idstudio_test";
const schema = `test_${Date.now()}`;
const url = `${base}${base.includes("?") ? "&" : "?"}schema=${schema}`;

export default function setup() {
  process.env.TEST_SCHEMA_URL = url;
  execSync("npx prisma migrate deploy", { stdio: "pipe", env: { ...process.env, DATABASE_URL: url } });
  rmSync("./.test-storage", { recursive: true, force: true });
  return async () => {
    const db = new PrismaClient({ datasourceUrl: base });
    await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await db.$disconnect();
    rmSync("./.test-storage", { recursive: true, force: true });
  };
}
