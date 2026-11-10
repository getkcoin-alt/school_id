import { SignJWT, jwtVerify } from "jose";
import { config } from "../config.js";

const key = new TextEncoder().encode(config.JWT_SECRET);

export interface AccessClaims {
  sub: string;
  tv: number;
  fid: string;
  imp?: string;
}

export async function signAccess(claims: AccessClaims) {
  return new SignJWT({ tv: claims.tv, fid: claims.fid, ...(claims.imp ? { imp: claims.imp } : {}) })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setIssuer("id-studio")
    .setAudience("id-studio-app")
    .setExpirationTime(config.ACCESS_TOKEN_TTL)
    .sign(key);
}

export async function verifyAccess(token: string): Promise<AccessClaims> {
  const { payload } = await jwtVerify(token, key, { issuer: "id-studio", audience: "id-studio-app" });
  return { sub: String(payload.sub), tv: Number(payload.tv), fid: String(payload.fid), imp: payload.imp ? String(payload.imp) : undefined };
}

/** Short-lived token issued to a student after verifying their invitation. */
export async function signPortal(invitationId: string, studentId: string) {
  return new SignJWT({ inv: invitationId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(studentId)
    .setIssuer("id-studio")
    .setAudience("id-studio-portal")
    .setExpirationTime("2h")
    .sign(key);
}

export async function verifyPortal(token: string) {
  const { payload } = await jwtVerify(token, key, { issuer: "id-studio", audience: "id-studio-portal" });
  return { studentId: String(payload.sub), invitationId: String(payload.inv) };
}
