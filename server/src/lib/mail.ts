import nodemailer from "nodemailer";
import { config } from "../config.js";
import { prisma } from "./db.js";
import { enqueue } from "./queue.js";
import { logger } from "./logger.js";

const transport =
  config.MAIL_DRIVER === "smtp"
    ? nodemailer.createTransport({
        host: config.SMTP_HOST,
        port: config.SMTP_PORT,
        secure: config.SMTP_SECURE,
        auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined,
        pool: true,
      })
    : null;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Branded, minimal email layout. `lines` are plain text paragraphs. */
export function layout(title: string, lines: string[], action?: { label: string; url: string }) {
  const html = `<!doctype html><html><body style="margin:0;background:#f6f4f2;font-family:Arial,sans-serif;color:#1f2430">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:14px;overflow:hidden">
<tr><td style="background:#F05656;color:#fff;padding:18px 28px;font-weight:bold;font-size:18px">ID Card Studio</td></tr>
<tr><td style="padding:28px">
<h1 style="font-size:20px;margin:0 0 16px">${esc(title)}</h1>
${lines.map((l) => `<p style="font-size:15px;line-height:1.55;margin:0 0 12px">${esc(l)}</p>`).join("")}
${action ? `<p style="margin:24px 0"><a href="${esc(action.url)}" style="background:#F05656;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold;display:inline-block">${esc(action.label)}</a></p>
<p style="font-size:12px;color:#6b7280;word-break:break-all">If the button does not work, open this link: ${esc(action.url)}</p>` : ""}
</td></tr></table></td></tr></table></body></html>`;
  const text = [title, "", ...lines, ...(action ? ["", `${action.label}: ${action.url}`] : [])].join("\n");
  return { html, text };
}

/** Durable send: the row is written first, delivery happens in the worker (or inline without Redis). */
export async function queueEmail(to: string, subject: string, body: { html: string; text: string }, kind: string) {
  const row = await prisma.emailOutbox.create({ data: { to, subject, html: body.html, text: body.text, kind } });
  await enqueue("email", { outboxId: row.id }, () => deliverEmail(row.id));
  return row.id;
}

export async function deliverEmail(outboxId: string) {
  const row = await prisma.emailOutbox.findUnique({ where: { id: outboxId } });
  if (!row || row.status === "SENT") return;
  try {
    if (transport) {
      await transport.sendMail({ from: config.MAIL_FROM, to: row.to, subject: row.subject, html: row.html, text: row.text });
    } else {
      logger.info({ to: row.to, subject: row.subject, text: row.text }, "email (log driver)");
    }
    await prisma.emailOutbox.update({ where: { id: row.id }, data: { status: "SENT", sentAt: new Date(), attempts: { increment: 1 } } });
  } catch (err) {
    const attempts = row.attempts + 1;
    await prisma.emailOutbox.update({
      where: { id: row.id },
      data: { attempts, lastError: String(err).slice(0, 500), status: attempts >= 5 ? "FAILED" : "PENDING" },
    });
    throw err;
  }
}
