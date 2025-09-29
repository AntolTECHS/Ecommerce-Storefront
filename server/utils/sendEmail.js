// server/utils/sendEmail.js
'use strict';

const nodemailer = require('nodemailer');
const sgMail = require('@sendgrid/mail');

const USE_SENDGRID = Boolean(process.env.SENDGRID_API_KEY);

// If SendGrid API key is present use the HTTP API (recommended on some hosts)
if (USE_SENDGRID) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  console.info('[sendEmail] SendGrid enabled via SENDGRID_API_KEY');
}

/**
 * Build and return a Nodemailer transporter configured from env vars.
 * Reused across calls to avoid repeated connection overhead and allow verify().
 */
function buildTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  // If SMTP_SECURE is explicitly set, use it; otherwise treat 465 as secure
  const secure = (() => {
    if (typeof process.env.SMTP_SECURE !== 'undefined') {
      return String(process.env.SMTP_SECURE).toLowerCase() === 'true';
    }
    return port === 465;
  })();

  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.warn('[sendEmail] Missing SMTP env vars (SMTP_HOST/SMTP_USER/SMTP_PASS). SMTP may fail unless SENDGRID_API_KEY is set.');
  }

  const opts = {
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
    connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT || 10000),
    greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT || 10000),
    socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT || 10000),
  };

  // Optional: for some hosts with strict TLS you can tune tls options via env
  if (process.env.SMTP_ALLOW_SELF_SIGNED === 'true') {
    opts.tls = { rejectUnauthorized: false };
  }

  return nodemailer.createTransport(opts);
}

// create transporter once (unless using SendGrid-only)
const transporter = !USE_SENDGRID ? buildTransporter() : null;

// verify transporter at startup so you see immediate errors in logs
(async function verifyTransporter() {
  if (USE_SENDGRID) return;
  if (!transporter) return;
  try {
    await transporter.verify();
    console.info('[sendEmail] Nodemailer transporter verified (SMTP ready).');
  } catch (err) {
    console.error('[sendEmail] Nodemailer verify failed:', err && err.message ? err.message : err);
    // Do not throw — we want server to start. But this log tells you SMTP is misconfigured.
  }
})();

/**
 * sendEmail - exports a single function that controllers can await.
 * - Supports SendGrid if SENDGRID_API_KEY is set.
 * - Returns the provider response on success.
 * - On failure it throws an Error with `original` field containing provider error.
 *
 * @param {Object} options { to, subject, text, html, from }
 */
async function sendEmail({ to, subject, text, html, from }) {
  if (!to || !subject || (!text && !html)) {
    throw new Error('sendEmail requires { to, subject, text|html }');
  }

  const fromAddr = from || process.env.FROM_EMAIL || `no-reply@${process.env.EMAIL_DOMAIN || 'example.com'}`;
  const payload = { to, from: fromAddr, subject, text: text || undefined, html: html || undefined };

  // Use SendGrid HTTP API if configured (helps on hosts that block SMTP ports)
  if (USE_SENDGRID) {
    try {
      const res = await sgMail.send(payload);
      console.info('[sendEmail] SendGrid send OK', (res && res[0] && res[0].statusCode) || 'ok');
      return res;
    } catch (err) {
      console.error('[sendEmail] SendGrid send failed:', err && err.message ? err.message : err);
      const e = new Error('SendGrid send failed: ' + (err && err.message ? err.message : String(err)));
      e.original = err;
      throw e;
    }
  }

  // SMTP via Nodemailer
  try {
    const info = await transporter.sendMail(payload);
    console.info('[sendEmail] SMTP send OK messageId=', info && info.messageId);
    return info;
  } catch (err) {
    console.error('[sendEmail] SMTP send failed:', err && (err.message || err.code) ? `${err.message || err.code}` : err);
    const e = new Error('SMTP send failed: ' + (err && err.message ? err.message : String(err)));
    e.original = err;
    throw e;
  }
}

module.exports = sendEmail;
