import type { FastifyRequest } from "fastify";
import { badRequest } from "./errors.js";

export interface UploadedFile {
  filename: string;
  mimetype: string;
  buffer: Buffer;
}

/** Reads a multipart request into memory: all files plus plain fields. */
export async function readMultipart(req: FastifyRequest) {
  if (!req.isMultipart()) throw badRequest("Send the file as multipart/form-data.");
  const files: UploadedFile[] = [];
  const fields: Record<string, string> = {};
  for await (const part of req.parts()) {
    if (part.type === "file") {
      const buffer = await part.toBuffer();
      if (part.file.truncated) throw badRequest(`${part.filename} is larger than the upload limit.`);
      files.push({ filename: part.filename, mimetype: part.mimetype, buffer });
    } else {
      fields[part.fieldname] = String(part.value ?? "");
    }
  }
  return { files, fields };
}
