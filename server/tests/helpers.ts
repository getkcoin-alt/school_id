import sharp from "sharp";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/db.js";
import { hashPassword } from "../src/lib/crypto.js";

export type App = Awaited<ReturnType<typeof buildApp>>;
export const PASSWORD = "Secret123";

export async function makeApp() {
  const app = await buildApp();
  await app.ready();
  return app;
}

export async function superAdmin(email = `root-${Date.now()}@test.in`) {
  return prisma.user.create({ data: { email, name: "Root Admin", role: "SUPER_ADMIN", status: "ACTIVE", passwordHash: await hashPassword(PASSWORD) } });
}

export async function login(app: App, email: string, password = PASSWORD) {
  const res = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email, password } });
  if (res.statusCode !== 200) throw new Error(`login failed ${res.statusCode} ${res.body}`);
  return res.json().accessToken as string;
}

/** Reads the most recent onboarding/OTP token out of the outbox email text. */
export async function lastEmail(to: string) {
  return prisma.emailOutbox.findFirstOrThrow({ where: { to }, orderBy: { createdAt: "desc" } });
}

export const api = (app: App, token?: string) => {
  const headers = token ? { authorization: `Bearer ${token}` } : {};
  return {
    get: (url: string) => app.inject({ method: "GET", url: `/api/v1${url}`, headers }),
    post: (url: string, payload?: unknown) => app.inject({ method: "POST", url: `/api/v1${url}`, headers, payload: payload as object }),
    patch: (url: string, payload?: unknown) => app.inject({ method: "PATCH", url: `/api/v1${url}`, headers, payload: payload as object }),
    put: (url: string, payload?: unknown) => app.inject({ method: "PUT", url: `/api/v1${url}`, headers, payload: payload as object }),
    del: (url: string) => app.inject({ method: "DELETE", url: `/api/v1${url}`, headers }),
    multipart: (url: string, parts: { name: string; filename?: string; type?: string; data: Buffer | string }[]) => {
      const boundary = "----idstudio" + Math.random().toString(16).slice(2);
      const chunks: Buffer[] = [];
      for (const p of parts) {
        chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${p.name}"${p.filename ? `; filename="${p.filename}"` : ""}\r\n${p.type ? `Content-Type: ${p.type}\r\n` : ""}\r\n`));
        chunks.push(Buffer.isBuffer(p.data) ? p.data : Buffer.from(p.data));
        chunks.push(Buffer.from("\r\n"));
      }
      chunks.push(Buffer.from(`--${boundary}--\r\n`));
      return app.inject({ method: "POST", url: `/api/v1${url}`, headers: { ...headers, "content-type": `multipart/form-data; boundary=${boundary}` }, payload: Buffer.concat(chunks) });
    },
  };
};

export const jpeg = (color = "#c08060") => sharp({ create: { width: 400, height: 480, channels: 3, background: color } }).jpeg().toBuffer();
