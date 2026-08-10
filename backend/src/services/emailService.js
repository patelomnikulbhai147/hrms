const nodemailer = require('nodemailer');
const { getEmailBranding, brandHeaderHtml, signOffHtml, signOffText, DEFAULT_BRAND } = require('./emailBranding');

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

// The "From" header.
//
// The ADDRESS comes from MAIL_FROM / SMTP_FROM (one mailbox for the platform —
// changing it is an env change, not a code change). The DISPLAY NAME is the
// tenant's own company name, so each company's staff see mail from *their*
// company rather than a hardcoded product name. With no company resolved it
// falls back to ZeniaHR.
const DEFAULT_FROM_ADDRESS = 'no-reply@zeniahr.com';

/** Strip any display name already present in the configured MAIL_FROM. */
const fromAddressOnly = () => {
  const raw = String(process.env.MAIL_FROM || process.env.SMTP_FROM || DEFAULT_FROM_ADDRESS).trim();
  const angled = raw.match(/<([^>]+)>/);
  return (angled ? angled[1] : raw).trim() || DEFAULT_FROM_ADDRESS;
};

/** `"Acme Industries" <no-reply@…>` — display name is always the company's. */
const mailFrom = (brandName) => {
  const name = String(brandName || DEFAULT_BRAND.name).replace(/"/g, '');
  return `"${name}" <${fromAddressOnly()}>`;
};

/**
 * Send an email. Returns { delivered, devMode, configured, error }.
 *   delivered  — true only when the provider accepted the message.
 *   configured — whether SMTP env vars are present (false = local dev fallback).
 *   devMode    — true when SMTP is NOT configured (message logged, not sent).
 * Never throws to the caller — email problems must not crash the auth flow; the
 * caller decides how to surface a real (configured-but-failed) delivery error.
 */
const sendMail = async ({ to, cc, subject, text, html, attachments, companyId, branding }) => {
  const transporter = getTransporter();
  // Sender identity: the caller's company (Company Profile), else ZeniaHR.
  // Passing `branding` avoids a second lookup when the caller already resolved it.
  const brand = branding || (companyId ? await getEmailBranding(companyId) : { ...DEFAULT_BRAND });
  const from = mailFrom(brand.name);
  // A base64 company logo travels as an inline cid: attachment (see emailBranding).
  const allAttachments = brand.logoAttachment && String(html || '').includes('cid:companylogo')
    ? [...(attachments || []), brand.logoAttachment]
    : attachments;

  if (!transporter) {
    // Dev fallback — SMTP not configured. Surface the message in the server logs
    // so the OTP flow stays testable without an email provider.
    console.log('\n========== [EMAIL — DEV MODE, not actually sent] ==========');
    console.log(`From:    ${from}`);
    console.log(`To:      ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`Body:    ${text}`);
    if (allAttachments && allAttachments.length) console.log(`Attachments: ${allAttachments.map((a) => a.filename).join(', ')}`);
    console.log('===========================================================\n');
    return { delivered: false, devMode: true, configured: false };
  }

  try {
    await transporter.sendMail({ from, to, cc, subject, text, html, attachments: allAttachments });
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
const sendPayslipEmail = async ({ to, employeeName, period, companyName, companyId, pdfBase64, fileName }) => {
  // Prefer live Company Profile branding; the caller-supplied companyName is a
  // fallback for callers that have the name but not the id.
  const branding = await getEmailBranding(companyId);
  const brand = companyId ? branding.name : (companyName || branding.name);
  const b = { ...branding, name: brand };
  const subject = `Salary Slip — ${period} — ${brand}`;
  const text =
    `Dear ${employeeName || 'Employee'},\n\n` +
    `Please find attached your salary slip for ${period}.\n\n` +
    `This is a system-generated document from ${brand}.\n\n${signOffText(b)}`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto">
      <div style="text-align:center;padding:8px 0 12px 0">${brandHeaderHtml(b, '#0F172A')}</div>
      <h2 style="color:#0F172A">Salary Slip — ${period}</h2>
      <p>Dear ${employeeName || 'Employee'},</p>
      <p>Please find attached your salary slip for <b>${period}</b>.</p>
      <p style="color:#64748B">This is a system-generated document from ${brand}.</p>
      <p style="color:#94A3B8;font-size:12px">${signOffHtml(b)}</p>
    </div>`;
  const attachments = pdfBase64
    ? [{ filename: fileName || `Salary_Slip_${period}.pdf`, content: Buffer.from(String(pdfBase64).replace(/^data:.*;base64,/, ''), 'base64'), contentType: 'application/pdf' }]
    : [];
  return sendMail({ to, subject, text, html, attachments, branding: b });
};

/**
 * Send a password-reset OTP email, branded for the requesting COMPANY.
 * `companyId` is optional: a reset for an address not yet attached to a company
 * (e.g. during self-registration) correctly falls back to ZeniaHR.
 */
const sendOtpEmail = async (to, otp, name, expiryMinutes = 10, companyId = null, purpose = 'reset') => {
  const branding = await getEmailBranding(companyId);
  const brand = branding.name;
  const support = branding.supportEmail;
  const greetingName = name ? ` ${name}` : '';

  const isReg = purpose === 'registration';
  const subject = isReg 
    ? `${brand} Email Verification Code`
    : `${brand} Password Reset Verification Code`;

  const title = isReg ? 'Verify Your Email' : 'Password Reset Request';
  const description = isReg
    ? `Hi${greetingName}, thank you for registering with ${brand}. Use the verification code below to verify your email address and complete your registration.`
    : `Hi${greetingName}, we received a request to reset your ${brand} password. Use the verification code below to continue.`;

  const text = isReg
    ? `${brand} — Email Verification\n\n` +
      `Hi${greetingName},\n\n` +
      `Your verification code is: ${otp}\n\n` +
      `This code is valid for ${expiryMinutes} minutes.\n\n` +
      `If you didn't request this, you can safely ignore this email.\n\n` +
      `Need help? Contact ${support}\n\n${signOffText(branding)}`
    : `${brand} — Password Reset Request\n\n` +
      `Hi${greetingName},\n\n` +
      `Your verification code is: ${otp}\n\n` +
      `This code is valid for ${expiryMinutes} minutes.\n\n` +
      `If you didn't request this, you can safely ignore this email — your password ` +
      `will remain unchanged.\n\n` +
      `Need help? Contact ${support}\n\n${signOffText(branding)}`;

  // Header: the company's own logo when it has one, else a styled wordmark of
  // its name (also what image-blocking clients fall back to).
  const header = brandHeaderHtml(branding);

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
          <h1 style="margin:0 0 8px 0;font-size:18px;color:#0f172a;">${title}</h1>
          <p style="margin:0 0 18px 0;font-size:14px;line-height:1.6;color:#475569;">
            ${description}
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
              🔒 If you didn't request this, you can safely ignore this email. Never share this code with anyone.
            </p>
          </div>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:18px 28px 26px 28px;border-top:1px solid #f1f5f9;">
          <p style="margin:0 0 4px 0;font-size:12px;color:#94a3b8;">
            Need help? Contact <a href="mailto:${support}" style="color:#4F7CFF;text-decoration:none;">${support}</a>
          </p>
          <p style="margin:0 0 6px 0;font-size:12px;color:#94a3b8;">${signOffHtml(branding)}</p>
          <p style="margin:0;font-size:11px;color:#cbd5e1;">© ${brand}. This is an automated message — please do not reply.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return sendMail({ to, subject, text, html, branding });
};

module.exports = { sendMail, sendOtpEmail, sendPayslipEmail, isSmtpConfigured };
