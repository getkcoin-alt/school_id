import ExcelJS from "exceljs";
import { ZipArchive } from "archiver";
import PDFDocument from "pdfkit";
import { PassThrough, type Readable } from "node:stream";
import type { ResolvedField } from "./fields.js";
import { dmy, upper } from "./normalize.js";
import { storage } from "./storage.js";
import { logger } from "./logger.js";

/** A printable record: a live student/staff row or a batch snapshot. */
export interface PrintRecord {
  code: string;
  name: string;
  className?: string | null;
  section?: string | null;
  photoKey?: string | null;
  photoNo?: string | null;
  admissionNo?: string | null;
  extra?: Record<string, string> | null;
  [key: string]: unknown;
}

const CLASS_ORDER = ["PLAYGROUP", "PG", "NURSERY", "LKG", "UKG", "KG", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
export function classRank(c?: string | null) {
  const s = (c ?? "").toUpperCase().trim();
  const i = CLASS_ORDER.indexOf(s);
  if (i >= 0) return i;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? 6 + n : 100;
}

/** Class order, then section, then name A–Z (change sheet #7). */
export function sortForPrint<T extends PrintRecord>(rows: T[]) {
  return [...rows].sort(
    (a, b) =>
      classRank(a.className) - classRank(b.className) ||
      String(a.className ?? "").localeCompare(String(b.className ?? "")) ||
      String(a.section ?? "").localeCompare(String(b.section ?? "")) ||
      a.name.localeCompare(b.name, "en", { sensitivity: "base" }),
  );
}

/** Stable, unique photo file names that match the PHOTO column exactly (change sheet #5). */
export function assignPhotoNames<T extends PrintRecord>(rows: T[]) {
  const used = new Set<string>();
  return rows.map((r) => {
    const base = (r.photoNo || r.admissionNo || r.code).toString().replace(/[^A-Za-z0-9_.-]/g, "_").toUpperCase();
    let name = base, i = 2;
    while (used.has(name)) name = `${base}_${i++}`;
    used.add(name);
    return { record: r, photoName: name };
  });
}

function cellValue(r: PrintRecord, f: ResolvedField) {
  const v = f.custom ? r.extra?.[f.key] : r[f.key];
  if (v instanceof Date) return dmy(v);
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && f.type === "date") {
    const [y, m, d] = v.split("-");
    return `${d}-${m}-${y}`;
  }
  return f.key === "email" ? String(v ?? "").toLowerCase() : upper(v);
}

/**
 * Builds the agreed spreadsheet: SRNO, PHOTO, then the school's enabled fields in order.
 * Disabled fields (for example gender or admission date) are left out entirely.
 */
export async function buildWorkbook(rows: PrintRecord[], fields: ResolvedField[], sheetName = "Students") {
  const columns = fields.filter((f) => f.enabled && f.key !== "photoNo");
  const named = assignPhotoNames(sortForPrint(rows));
  const wb = new ExcelJS.Workbook();
  wb.creator = "ID Card Studio";
  const ws = wb.addWorksheet(sheetName, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { header: "SRNO", key: "SRNO", width: 7 },
    { header: "PHOTO", key: "PHOTO", width: 16 },
    ...columns.map((f) => ({ header: f.column, key: f.column, width: Math.min(40, Math.max(10, f.label.length + 4)) })),
  ];
  ws.getRow(1).font = { bold: true };
  named.forEach(({ record, photoName }, i) => {
    const row: Record<string, string | number> = { SRNO: i + 1, PHOTO: photoName };
    for (const f of columns) row[f.column] = cellValue(record, f);
    ws.addRow(row);
  });
  // Keep long numbers (mobile, SRN) as text so Excel does not mangle them.
  ws.eachRow((row, n) => n > 1 && row.eachCell((c) => { if (typeof c.value === "string") c.numFmt = "@"; }));
  return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), named };
}

/** Streams a ZIP holding the spreadsheet plus every photo named as in its PHOTO column. */
export function zipWithPhotos(xlsx: Buffer, xlsxName: string, named: { record: PrintRecord; photoName: string }[], extra: { name: string; buffer: Buffer }[] = []) {
  const archive = new ZipArchive({ zlib: { level: 6 } });
  const out = new PassThrough();
  archive.on("warning", (err) => logger.warn({ err }, "zip warning"));
  archive.on("error", (err) => out.destroy(err));
  archive.pipe(out);
  archive.append(xlsx, { name: xlsxName });
  for (const e of extra) archive.append(e.buffer, { name: e.name });
  (async () => {
    const missing: string[] = [];
    for (const { record, photoName } of named) {
      if (!record.photoKey) {
        missing.push(`${photoName}\t${record.name}`);
        continue;
      }
      try {
        archive.append(await storage.get(record.photoKey), { name: `photos/${photoName}.jpg` });
      } catch {
        missing.push(`${photoName}\t${record.name}`);
      }
    }
    if (missing.length) archive.append(`Records without a photo file:\n${missing.join("\n")}\n`, { name: "MISSING_PHOTOS.txt" });
    await archive.finalize();
  })().catch((err) => out.destroy(err));
  return out as Readable;
}

/**
 * Checklist / batch proof (change sheet #7 and #15): A4, 10 or 12 records per page with
 * photos, alphabetical within each class, and each class starting on a new page.
 */
export async function buildChecklist(
  rows: PrintRecord[],
  fields: ResolvedField[],
  opts: { title: string; subtitle?: string; perPage?: 10 | 12 },
): Promise<Buffer> {
  const perPage = opts.perPage ?? 12;
  const cols = 2, rowsPerPage = perPage / cols;
  const doc = new PDFDocument({ size: "A4", margin: 28, info: { Title: opts.title, Author: "ID Card Studio" } });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const printable = fields.filter((f) => f.enabled && !["name", "className", "section", "photoNo", "fatherPrefix", "motherPrefix"].includes(f.key)).slice(0, 7);
  const sorted = assignPhotoNames(sortForPrint(rows));
  const groups = new Map<string, typeof sorted>();
  for (const item of sorted) {
    const key = `${item.record.className ?? ""}${item.record.section ? ` - ${item.record.section}` : ""}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }

  const pageW = doc.page.width - 56, top = 82, footer = 40;
  const cellW = pageW / cols, cellH = (doc.page.height - top - footer - 28) / rowsPerPage;
  let first = true, pageNo = 0;
  const header = (group: string) => {
    if (!first) doc.addPage();
    first = false;
    pageNo++;
    doc.font("Helvetica-Bold").fontSize(14).fillColor("#111").text(opts.title.toUpperCase(), 28, 26, { width: pageW });
    doc.font("Helvetica").fontSize(9).fillColor("#555").text(`${opts.subtitle ? opts.subtitle.toUpperCase() + "   ·   " : ""}CLASS ${group.toUpperCase()}`, 28, 46, { width: pageW });
    doc.text(`Page ${pageNo}`, 28, 46, { width: pageW, align: "right" });
    doc.moveTo(28, 64).lineTo(28 + pageW, 64).strokeColor("#F05656").lineWidth(1.2).stroke();
    const fy = doc.page.height - footer;
    doc.fontSize(8).fillColor("#555").text("Checked by: ______________________     Signature & stamp: ______________________     Date: __________", 28, fy, { width: pageW });
  };

  for (const [group, items] of groups) {
    for (let i = 0; i < items.length; i++) {
      if (i % perPage === 0) header(group);
      const slot = i % perPage;
      const x = 28 + (slot % cols) * cellW, y = top + Math.floor(slot / cols) * cellH;
      const { record, photoName } = items[i];
      doc.rect(x + 2, y + 2, cellW - 4, cellH - 4).strokeColor("#d8d8d8").lineWidth(0.6).stroke();
      const photoW = Math.min(70, cellH * 0.62), photoH = photoW * 1.2;
      const px = x + 8, py = y + 8;
      let drew = false;
      if (record.photoKey) {
        try {
          doc.image(await storage.get(record.photoKey), px, py, { fit: [photoW, photoH], align: "center", valign: "center" });
          drew = true;
        } catch { /* fall through to placeholder */ }
      }
      if (!drew) {
        doc.rect(px, py, photoW, photoH).dash(2, { space: 2 }).strokeColor("#c33").stroke().undash();
        doc.fontSize(7).fillColor("#c33").text("NO PHOTO", px, py + photoH / 2 - 4, { width: photoW, align: "center" });
      }
      doc.fontSize(6.5).fillColor("#777").text(photoName, px, py + photoH + 2, { width: photoW, align: "center" });
      const tx = px + photoW + 8, tw = cellW - photoW - 26;
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#111").text(`${i + 1}. ${upper(record.name)}`, tx, py, { width: tw, ellipsis: true, height: 22 });
      doc.font("Helvetica").fontSize(7.5).fillColor("#222");
      let ty = doc.y + 2;
      for (const f of printable) {
        const v = cellValue(record, f);
        if (!v) continue;
        const label = f.key === "fatherName" ? `FATHER` : f.key === "motherName" ? "MOTHER" : f.label.toUpperCase();
        const prefix = f.key === "fatherName" ? record.fatherPrefix : f.key === "motherName" ? record.motherPrefix : null;
        doc.text(`${label}: ${prefix ? upper(prefix) + " " : ""}${v}`, tx, ty, { width: tw, ellipsis: true, height: 10, lineBreak: false });
        ty += 10;
        if (ty > y + cellH - 12) break;
      }
    }
  }
  if (first) {
    doc.font("Helvetica").fontSize(12).text("No records match this checklist.", 28, 80);
  }
  doc.end();
  return done;
}
