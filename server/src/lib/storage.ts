import { createHmac } from "node:crypto";
import { mkdir, readFile, rm, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "../config.js";
import { safeEqual } from "./crypto.js";

export interface Storage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
  url(key: string, ttlSeconds?: number, downloadName?: string): Promise<string>;
}

const sign = (key: string, exp: number, name = "") =>
  createHmac("sha256", config.JWT_SECRET).update(`${key}:${exp}:${name}`).digest("base64url");

export function verifyLocalSignature(key: string, exp: number, sig: string, name = "") {
  return exp > Date.now() / 1000 && safeEqual(sign(key, exp, name), sig);
}

function safeKey(key: string) {
  if (!/^[a-zA-Z0-9/_.-]+$/.test(key) || key.includes("..")) throw new Error("Invalid storage key");
  return key;
}

class LocalStorage implements Storage {
  private root = path.resolve(config.STORAGE_DIR);
  private file = (key: string) => path.join(this.root, safeKey(key));
  async put(key: string, body: Buffer) {
    await mkdir(path.dirname(this.file(key)), { recursive: true });
    await writeFile(this.file(key), body);
  }
  get(key: string) {
    return readFile(this.file(key));
  }
  async exists(key: string) {
    return stat(this.file(key)).then(() => true, () => false);
  }
  async remove(key: string) {
    await rm(this.file(key), { force: true });
  }
  async url(key: string, ttl = 3600, downloadName = "") {
    const exp = Math.floor(Date.now() / 1000) + ttl;
    const q = new URLSearchParams({ exp: String(exp), sig: sign(key, exp, downloadName) });
    if (downloadName) q.set("name", downloadName);
    return `${config.API_PUBLIC_URL}/api/v1/files/${safeKey(key)}?${q}`;
  }
}

class S3Storage implements Storage {
  private client = new S3Client({
    region: config.S3_REGION,
    endpoint: config.S3_ENDPOINT,
    forcePathStyle: Boolean(config.S3_ENDPOINT),
    credentials: config.S3_ACCESS_KEY_ID
      ? { accessKeyId: config.S3_ACCESS_KEY_ID, secretAccessKey: config.S3_SECRET_ACCESS_KEY ?? "" }
      : undefined,
  });
  private bucket = config.S3_BUCKET ?? "";
  async put(key: string, body: Buffer, contentType: string) {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: safeKey(key), Body: body, ContentType: contentType }));
  }
  async get(key: string) {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: safeKey(key) }));
    return Buffer.from(await res.Body!.transformToByteArray());
  }
  async remove(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: safeKey(key) }));
  }
  url(key: string, ttl = 3600, downloadName = "") {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: safeKey(key),
        ResponseContentDisposition: downloadName ? `attachment; filename="${downloadName}"` : undefined,
      }),
      { expiresIn: ttl },
    );
  }
}

export const storage: Storage = config.STORAGE_DRIVER === "s3" ? new S3Storage() : new LocalStorage();

/** Signed URL or null; used when serialising records that reference files. */
export const fileUrl = (key?: string | null, ttl = 6 * 3600) => (key ? storage.url(key, ttl) : Promise.resolve(null));
