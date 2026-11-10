import type { FastifyInstance } from "fastify";
import type { Design } from "@prisma/client";
import { z } from "zod";
import { prisma, nextCode } from "../lib/db.js";
import { badRequest, notFound } from "../lib/errors.js";
import { can, isAgent, isSuper, principal, require } from "../lib/access.js";
import { audit } from "../lib/audit.js";
import { fileUrl, storage } from "../lib/storage.js";
import { readMultipart } from "../lib/upload.js";
import { randomToken } from "../lib/crypto.js";

async function serializeDesign(d: Design) {
  return { id: d.id, code: d.code, name: d.name, kind: d.kind, audience: d.audience, color: d.color, agentId: d.agentId, frontUrl: await fileUrl(d.frontKey), backUrl: await fileUrl(d.backKey), createdAt: d.createdAt };
}

const IMAGE = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml", "application/pdf"]);

/** Card and lanyard design gallery. Shared designs have no agent; premium agents may add their own. */
export async function designRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const p = principal(req);
    const q = z.object({ kind: z.enum(["ID_CARD", "LANYARD"]).optional(), audience: z.enum(["STUDENT", "STAFF", "EVERYONE"]).optional() }).parse(req.query);
    const rows = await prisma.design.findMany({
      where: { deletedAt: null, kind: q.kind, audience: q.audience, ...(isAgent(p) ? { OR: [{ agentId: null }, { agentId: p.agentId }] } : isSuper(p) ? {} : { OR: [{ agentId: null }, { agentId: (await prisma.school.findUnique({ where: { id: p.schoolId! } }))?.agentId ?? "__none__" }] }) },
      orderBy: { name: "asc" },
    });
    return { items: await Promise.all(rows.map(serializeDesign)) };
  });

  app.post("/", async (req) => {
    const p = principal(req);
    require(can.manageDesigns(p), "Only super admins and premium agents can add designs.");
    const { files, fields } = await readMultipart(req);
    const meta = z.object({ name: z.string().trim().min(2).max(60), kind: z.enum(["ID_CARD", "LANYARD"]).default("ID_CARD"), audience: z.enum(["STUDENT", "STAFF", "EVERYONE"]).default("STUDENT"), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional() }).parse(fields);
    const keys: Record<string, string> = {};
    for (const f of files) {
      if (!IMAGE.has(f.mimetype)) throw badRequest("Upload artwork as PNG, JPG, WebP, SVG or PDF.");
      const side = /back/i.test(f.filename) || keys.frontKey ? "backKey" : "frontKey";
      const key = `designs/${randomToken(8)}-${f.filename.replace(/[^A-Za-z0-9_.-]/g, "_")}`;
      await storage.put(key, f.buffer, f.mimetype);
      keys[side] = key;
    }
    const d = await prisma.design.create({ data: { ...meta, ...keys, code: await nextCode(prisma, "design", "D"), agentId: isAgent(p) ? p.agentId : null, createdById: p.userId } });
    await audit(req, { action: "design.created", summary: `${p.name} added design ${d.name}`, entityType: "design", entityId: d.id, agentId: d.agentId });
    return serializeDesign(d);
  });

  app.patch("/:id", async (req) => {
    const p = principal(req);
    const d = await prisma.design.findFirst({ where: { id: (req.params as { id: string }).id, deletedAt: null } });
    if (!d) throw notFound("Design");
    require(isSuper(p) || (isAgent(p) && d.agentId === p.agentId));
    const body = z.object({ name: z.string().trim().min(2).max(60).optional(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(), audience: z.enum(["STUDENT", "STAFF", "EVERYONE"]).optional() }).parse(req.body);
    return serializeDesign(await prisma.design.update({ where: { id: d.id }, data: body }));
  });

  app.delete("/:id", async (req) => {
    const p = principal(req);
    const d = await prisma.design.findFirst({ where: { id: (req.params as { id: string }).id, deletedAt: null } });
    if (!d) throw notFound("Design");
    require(isSuper(p) || (isAgent(p) && d.agentId === p.agentId));
    await prisma.design.update({ where: { id: d.id }, data: { deletedAt: new Date() } });
    await audit(req, { action: "design.deleted", summary: `${p.name} removed design ${d.name}`, agentId: d.agentId });
    return { ok: true };
  });
}
