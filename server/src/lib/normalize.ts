import { FATHER_PREFIXES, MOTHER_PREFIXES } from "./fields.js";

export const clean = (v: unknown) => {
  if (v === null || v === undefined) return undefined;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s === "" ? undefined : s;
};

/** Spreadsheet cells sometimes hold numbers like 9494949494.0 or 9.49e9. */
export function cellText(v: unknown) {
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (v && typeof v === "object" && "text" in (v as Record<string, unknown>)) return String((v as { text: unknown }).text);
  if (v && typeof v === "object" && "result" in (v as Record<string, unknown>)) return cellText((v as { result: unknown }).result);
  return clean(v);
}

export function normalizePhone(v?: string) {
  if (!v) return undefined;
  const digits = v.replace(/\D/g, "");
  const local = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits.length === 11 && digits.startsWith("0") ? digits.slice(1) : digits;
  return local || undefined;
}

export const validPhone = (v?: string) => !v || /^[6-9]\d{9}$/.test(v);

/** Accepts ISO dates, DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY and Excel serial numbers. */
export function parseDate(v: unknown): Date | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  if (v instanceof Date) return isNaN(+v) ? undefined : new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()));
  if (typeof v === "number" || /^\d{4,5}(\.0+)?$/.test(String(v))) {
    const serial = Number(v);
    if (serial > 1000 && serial < 80000) return new Date(Date.UTC(1899, 11, 30) + serial * 86400_000);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return utc(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/);
  if (m) {
    const y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    return utc(y, +m[2], +m[1]);
  }
  return undefined;
}
function utc(y: number, mo: number, d: number) {
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? date : undefined;
}
export const isoDate = (d?: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
export const dmy = (d?: Date | null) => (d ? `${String(d.getUTCDate()).padStart(2, "0")}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${d.getUTCFullYear()}` : "");

function matchPrefix(v: string | undefined, list: string[]) {
  if (!v) return undefined;
  const k = v.toLowerCase().replace(/[^a-z]/g, "");
  return list.find((p) => p.toLowerCase().replace(/[^a-z]/g, "") === k) ?? v;
}
export const fatherPrefix = (v?: string) => matchPrefix(v, FATHER_PREFIXES);
export const motherPrefix = (v?: string) => matchPrefix(v, MOTHER_PREFIXES);

/** Key used to detect the same child entered twice. */
export function dedupeKey(s: { name?: string | null; fatherName?: string | null; dob?: Date | null }) {
  const n = (x?: string | null) => (x ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return `${n(s.name)}|${n(s.fatherName)}|${s.dob ? isoDate(s.dob) : ""}`;
}

export const upper = (v: unknown) => (v === null || v === undefined ? "" : String(v).toUpperCase());
export const headerKey = (h: unknown) => String(h ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Wraps a transform so an omitted field stays omitted (partial updates must not wipe data). */
export const keep =
  <T>(fn: (v: string | null) => T) =>
  (v: string | null | undefined) =>
    v === undefined ? undefined : fn(v);
