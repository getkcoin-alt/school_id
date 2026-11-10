import sharp from "sharp";
import { createHash } from "node:crypto";
import { badRequest } from "./errors.js";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

/** Normalises an ID photo: honours EXIF rotation, strips metadata, max 1200px JPEG. */
export async function normalisePhoto(input: Buffer, mime?: string) {
  if (mime && !IMAGE_TYPES.has(mime)) throw badRequest("Upload a JPG, PNG or WebP photo.");
  try {
    const img = sharp(input, { failOn: "error" }).rotate();
    const meta = await img.metadata();
    if ((meta.width ?? 0) < 120 || (meta.height ?? 0) < 120) throw badRequest("The photo is too small. Use at least 300 × 300 pixels.");
    const out = await img.resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
    return { buffer: out, mime: "image/jpeg", checksum: createHash("sha256").update(out).digest("hex") };
  } catch (e) {
    if ((e as { statusCode?: number }).statusCode) throw e;
    throw badRequest("This file is not a readable image.");
  }
}

export const isPdf = (buf: Buffer) => buf.subarray(0, 5).toString() === "%PDF-";

/** Page count without a full PDF parser; good enough for intake metadata. */
export function pdfPageCount(buf: Buffer) {
  const text = buf.toString("latin1");
  const m = text.match(/\/Type\s*\/Page[^s]/g);
  return m ? m.length : null;
}
