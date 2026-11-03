import { config } from "../config.js";
import { logger } from "./logger.js";

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Mail that was not sent because no provider is configured. Tests read it; it is capped so it cannot grow forever. */
export const outbox: Mail[] = [];

/**
 * Sends one email through the Resend HTTP API when RESEND_API_KEY is set.
 * Without a key (local development, tests) the mail is logged and kept in
 * `outbox` instead, so sign-in flows still work end to end.
 */
export const mailer = {
  async send(m: Mail): Promise<void> {
    if (!config.RESEND_API_KEY) {
      outbox.push(m);
      if (outbox.length > 50) outbox.shift();
      logger.info({ to: m.to, subject: m.subject, text: m.text }, "email not sent: RESEND_API_KEY is not set");
      return;
    }
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${config.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: config.MAIL_FROM, to: [m.to], subject: m.subject, text: m.text, html: m.html }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) throw new Error(`Email provider answered ${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}`);
  },
};

const escHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** A plain, branded email with one button. */
export function buttonMail(o: { to: string; subject: string; greeting: string; lines: string[]; button: string; url: string; footer: string }): Mail {
  const text = [o.greeting, "", ...o.lines, "", `${o.button}: ${o.url}`, "", o.footer, "", "VoroniX"].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#f4f5fb;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#141833">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;padding:32px">
<tr><td style="font-size:20px;font-weight:700;padding-bottom:20px"><span style="display:inline-block;width:28px;height:28px;border-radius:8px;background:linear-gradient(135deg,#6d5dfc,#22c3e6);color:#fff;text-align:center;line-height:28px;font-size:16px;margin-right:8px">V</span>VoroniX</td></tr>
<tr><td style="font-size:15px;line-height:1.6"><p style="margin:0 0 12px">${escHtml(o.greeting)}</p>${o.lines.map((l) => `<p style="margin:0 0 12px">${escHtml(l)}</p>`).join("")}</td></tr>
<tr><td style="padding:12px 0 20px"><a href="${escHtml(o.url)}" style="display:inline-block;background:#6d5dfc;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:10px">${escHtml(o.button)}</a></td></tr>
<tr><td style="font-size:13px;line-height:1.5;color:#646b85">${escHtml(o.footer)}<br><br>If the button does not work, open this address:<br><span style="word-break:break-all">${escHtml(o.url)}</span></td></tr>
</table></td></tr></table></body></html>`;
  return { to: o.to, subject: o.subject, text, html };
}
