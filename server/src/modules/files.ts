import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { storage, verifyLocalSignature } from "../lib/storage.js";
import { forbidden, notFound } from "../lib/errors.js";

const TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", svg: "image/svg+xml", pdf: "application/pdf", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xls: "application/vnd.ms-excel" };

/** Serves files for the local storage driver through short-lived signed URLs. */
export async function fileRoutes(app: FastifyInstance) {
  app.get("/*", async (req, reply) => {
    const key = (req.params as { "*": string })["*"];
    const q = z.object({ exp: z.coerce.number(), sig: z.string(), name: z.string().optional() }).parse(req.query);
    if (!verifyLocalSignature(key, q.exp, q.sig, q.name ?? "")) throw forbidden("This file link has expired.");
    let body: Buffer;
    try {
      body = await storage.get(key);
    } catch {
      throw notFound("File");
    }
    const ext = key.split(".").pop()?.toLowerCase() ?? "";
    reply.header("Content-Type", TYPES[ext] ?? "application/octet-stream").header("Cache-Control", "private, max-age=3600").header("X-Content-Type-Options", "nosniff");
    if (ext === "svg") reply.header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'");
    if (q.name) reply.header("Content-Disposition", `attachment; filename="${q.name.replace(/"/g, "")}"`);
    return reply.send(body);
  });
}
