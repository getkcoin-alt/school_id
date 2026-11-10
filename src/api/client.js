// HTTP client for the ID Studio API. The access token lives in memory only; the
// refresh token is an httpOnly cookie scoped to /api/v1/auth.
export const API_URL = (import.meta.env?.VITE_API_URL || "").replace(/\/$/, "");
export const apiMode = Boolean(API_URL);

let accessToken = null;
let impersonation = null; // { accessToken, refreshToken, user }
let refreshing = null;
const listeners = new Set();

export const onAuthChange = (fn) => (listeners.add(fn), () => listeners.delete(fn));
const emit = () => listeners.forEach((fn) => fn());

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message || `Request failed (${status})`);
    this.status = status;
    this.code = body?.error?.code;
    this.details = body?.error?.details;
  }
}

const currentToken = () => impersonation?.accessToken || accessToken;

async function refresh() {
  if (impersonation) {
    const r = await fetch(`${API_URL}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: impersonation.refreshToken }),
    });
    if (!r.ok) {
      impersonation = null;
      emit();
      return false;
    }
    const b = await r.json();
    impersonation = { ...impersonation, accessToken: b.accessToken, refreshToken: b.refreshToken };
    return true;
  }
  const r = await fetch(`${API_URL}/api/v1/auth/refresh`, { method: "POST", credentials: "include" });
  if (!r.ok) {
    accessToken = null;
    emit();
    return false;
  }
  accessToken = (await r.json()).accessToken;
  return true;
}

/** fetch wrapper: JSON in/out, one silent token refresh on 401. */
export async function request(path, { method = "GET", body, form, raw, token, retry = true } = {}) {
  const headers = {};
  const auth = token ?? currentToken();
  if (auth) headers.authorization = `Bearer ${auth}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`${API_URL}/api/v1${path}`, {
    method,
    headers,
    credentials: "include",
    body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  if (res.status === 401 && retry && token === undefined && !path.startsWith("/auth/")) {
    refreshing ??= refresh().finally(() => (refreshing = null));
    if (await refreshing) return request(path, { method, body, form, raw, retry: false });
  }
  if (!res.ok) {
    let payload = null;
    try {
      payload = await res.json();
    } catch {}
    throw new ApiError(res.status, payload);
  }
  if (raw) return res;
  return res.status === 204 ? null : res.json();
}

export const api = {
  get: (p, o) => request(p, o),
  post: (p, body, o) => request(p, { ...o, method: "POST", body }),
  patch: (p, body) => request(p, { method: "PATCH", body }),
  put: (p, body) => request(p, { method: "PUT", body }),
  del: (p) => request(p, { method: "DELETE" }),
  upload: (p, fields) => {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined || v === null) continue;
      if (Array.isArray(v)) v.forEach((x) => form.append(k, x, x.name));
      else form.append(k, v, v instanceof Blob ? v.name || "file" : undefined);
    }
    return request(p, { method: "POST", form });
  },
};

/** Downloads a protected file (Excel, ZIP, PDF) with the current session. */
export async function downloadFile(path, fallbackName) {
  const res = await request(path, { raw: true });
  const name = res.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] || fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export const auth = {
  isSignedIn: () => Boolean(currentToken()),
  impersonating: () => impersonation?.user || null,
  async restore() {
    return accessToken ? true : refresh();
  },
  async login(email, password) {
    const b = await request("/auth/login", { method: "POST", body: { email, password } });
    accessToken = b.accessToken;
    emit();
    return b;
  },
  async onboard(token, password, extra = {}) {
    const b = await request("/auth/onboard", { method: "POST", body: { token, password, ...extra } });
    accessToken = b.accessToken;
    emit();
    return b;
  },
  async logout() {
    if (impersonation) return auth.stopImpersonating();
    await request("/auth/logout", { method: "POST", body: {} }).catch(() => {});
    accessToken = null;
    emit();
  },
  async impersonate(userId) {
    const b = await request("/auth/impersonate", { method: "POST", body: { userId }, token: accessToken });
    impersonation = { accessToken: b.accessToken, refreshToken: b.refreshToken, user: b.user };
    emit();
  },
  async stopImpersonating() {
    if (!impersonation) return;
    const rt = impersonation.refreshToken;
    impersonation = null;
    await request("/auth/logout", { method: "POST", body: { refreshToken: rt }, token: accessToken }).catch(() => {});
    emit();
  },
};

/** Converts a data: URL (camera capture, FileReader) into an uploadable file. */
export async function dataUrlToFile(dataUrl, name = "photo.jpg") {
  const blob = await (await fetch(dataUrl)).blob();
  return new File([blob], name, { type: blob.type || "image/jpeg" });
}
