const nodemailer = require('nodemailer');

/**
 * Pluggable email transport.
 *
 * In production, set SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS (and
 * optionally SMTP_FROM) in the environment and real emails are sent.
 *
 * When SMTP is not configured (typical for local development) the service
 * falls back to "dev mode": the message is logged to the server console and
 * the caller is told delivery was simulated, so the OTP flow remains fully
 * testable without an email provider.
 */
let cachedTransporter;

const isSmtpConfigured = () =>
  Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

const getTransporter = () => {
  if (!isSmtpConfigured()) return null;
  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: String(process.env.SMTP_SECURE) === 'true' || Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return cachedTransporter;
};

// The "From" address. MAIL_FROM is the documented variable; SMTP_FROM is kept as
// a backward-compatible fallback. Swapping the sender later means changing only
// this env var — no code change.
const mailFrom = () =>
  process.env.MAIL_FROM || process.env.SMTP_FROM || 'HRMate Security <no-reply@hrmate.local>';

/**
 * Send an email. Returns { delivered, devMode, configured, error }.
 *   delivered  — true only when the provider accepted the message.
 *   configured — whether SMTP env vars are present (false = local dev fallback).
 *   devMode    — true when SMTP is NOT configured (message logged, not sent).
 * Never throws to the caller — email problems must not crash the auth flow; the
 * caller decides how to surface a real (configured-but-failed) delivery error.
 */
const sendMail = async ({ to, subject, text, html, attachments }) => {
  const transporter = getTransporter();
  const from = mailFrom();

  if (!transporter) {
    // Dev fallback — SMTP not configured. Surface the message in the server logs
    // so the OTP flow stays testable without an email provider.
    console.log('\n========== [EMAIL — DEV MODE, not actually sent] ==========');
    console.log(`To:      ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`Body:    ${text}`);
    if (attachments && attachments.length) console.log(`Attachments: ${attachments.map((a) => a.filename).join(', ')}`);
    console.log('===========================================================\n');
    return { delivered: false, devMode: true, configured: false };
  }

  try {
    await transporter.sendMail({ from, to, subject, text, html, attachments });
    return { delivered: true, devMode: false, configured: true };
  } catch (err) {
    // SMTP IS configured but the send failed — report it so the caller can tell
    // the user honestly instead of pretending the email went out.
    console.error('Email send failed:', err.message);
    return { delivered: false, devMode: false, configured: true, error: err.message };
  }
};

/**
 * Send a salary-slip email with the PDF attached (base64 from the client).
 */
const sendPayslipEmail = async ({ to, employeeName, period, companyName, pdfBase64, fileName }) => {
  const subject = `Salary Slip — ${period} — ${companyName || 'HRMS'}`;
  const text =
    `Dear ${employeeName || 'Employee'},\n\n` +
    `Please find attached your salary slip for ${period}.\n\n` +
    `This is a system-generated document from ${companyName || 'the HR department'}.\n\n— HR / Payroll`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto">
      <h2 style="color:#0F172A">Salary Slip — ${period}</h2>
      <p>Dear ${employeeName || 'Employee'},</p>
      <p>Please find attached your salary slip for <b>${period}</b>.</p>
      <p style="color:#64748B">This is a system-generated document from ${companyName || 'the HR department'}.</p>
      <p style="color:#94A3B8;font-size:12px">— HR / Payroll</p>
    </div>`;
  const attachments = pdfBase64
    ? [{ filename: fileName || `Salary_Slip_${period}.pdf`, content: Buffer.from(String(pdfBase64).replace(/^data:.*;base64,/, ''), 'base64'), contentType: 'application/pdf' }]
    : [];
  return sendMail({ to, subject, text, html, attachments });
};

/**
 * Send a password-reset OTP email — HRMate-branded, responsive HTML.
 * Branding/sender/logo/support are all env-configurable; no code change is
 * needed to switch to the official HRMate mailbox later.
 */
const sendOtpEmail = async (to, otp, name, expiryMinutes = 10) => {
  const brand = process.env.MAIL_BRAND || 'HRMate';
  const logoUrl = process.env.MAIL_LOGO_URL || ''; // optional hosted logo
  const support = process.env.SUPPORT_EMAIL || 'support@hrmate.com';
  const subject = `${brand} Password Reset Verification Code`;
  const greetingName = name ? ` ${name}` : '';

  const text =
    `${brand} — Password Reset Request\n\n` +
    `Hi${greetingName},\n\n` +
    `Your verification code is: ${otp}\n\n` +
    `This code is valid for ${expiryMinutes} minutes.\n\n` +
    `If you didn't request this, you can safely ignore this email — your password ` +
    `will remain unchanged.\n\n` +
    `Need help? Contact ${support}\n\n— The ${brand} Team`;

  // Header: hosted logo image if MAIL_LOGO_URL is set, else a styled wordmark
  // (reliable across email clients that block images by default).
  const header = logoUrl
    ? `<img src="${logoUrl}" alt="${brand}" height="40" style="display:block;border:0;outline:none;text-decoration:none;height:40px;" />`
    : `<span style="font-size:26px;font-weight:800;color:#ffffff;letter-spacing:0.5px;">${brand}</span>`;

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;font-family:Arial,Helvetica,sans-serif;">
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#4F7CFF 0%,#6AA8FF 100%);padding:24px 28px;text-align:center;">
          ${header}
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px 28px 8px 28px;">
          <h1 style="margin:0 0 8px 0;font-size:18px;color:#0f172a;">Password Reset Request</h1>
          <p style="margin:0 0 18px 0;font-size:14px;line-height:1.6;color:#475569;">
            Hi${greetingName}, we received a request to reset your ${brand} password. Use the verification code below to continue.
          </p>
          <!-- Code -->
          <div style="text-align:center;margin:8px 0 18px 0;">
            <div style="display:inline-block;background:#EEF4FF;border:1px solid #DBEAFE;border-radius:12px;padding:16px 28px;">
              <span style="font-size:34px;font-weight:800;letter-spacing:10px;color:#4F7CFF;font-family:'Courier New',monospace;">${otp}</span>
            </div>
          </div>
          <p style="margin:0 0 18px 0;font-size:13px;color:#64748b;text-align:center;">
            This code is valid for <b>${expiryMinutes} minutes</b>.
          </p>
          <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:12px 14px;margin:0 0 8px 0;">
            <p style="margin:0;font-size:12px;line-height:1.5;color:#9a3412;">
              🔒 If you didn't request this, you can safely ignore this email — your password will remain unchanged. Never share this code with anyone.
            </p>
          </div>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:18px 28px 26px 28px;border-top:1px solid #f1f5f9;">
          <p style="margin:0 0 4px 0;font-size:12px;color:#94a3b8;">
            Need help? Contact <a href="mailto:${support}" style="color:#4F7CFF;text-decoration:none;">${support}</a>
          </p>
          <p style="margin:0;font-size:11px;color:#cbd5e1;">© ${brand}. This is an automated message — please do not reply.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return sendMail({ to, subject, text, html });
};

module.exports = { sendMail, sendOtpEmail, sendPayslipEmail, isSmtpConfigured };
