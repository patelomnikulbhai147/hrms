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

/**
 * Send an email. Returns { delivered: boolean, devMode: boolean }.
 * Never throws to the caller — email problems must not break the auth flow.
 */
const sendMail = async ({ to, subject, text, html, attachments }) => {
  const transporter = getTransporter();
  const from = process.env.SMTP_FROM || 'HRMS Security <no-reply@hrms.local>';

  if (!transporter) {
    // Dev fallback — surface the message in the server logs.
    console.log('\n========== [EMAIL — DEV MODE, not actually sent] ==========');
    console.log(`To:      ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`Body:    ${text}`);
    if (attachments && attachments.length) console.log(`Attachments: ${attachments.map((a) => a.filename).join(', ')}`);
    console.log('===========================================================\n');
    return { delivered: false, devMode: true };
  }

  try {
    await transporter.sendMail({ from, to, subject, text, html, attachments });
    return { delivered: true, devMode: false };
  } catch (err) {
    console.error('Email send failed, falling back to console:', err.message);
    console.log(`[EMAIL FALLBACK] To: ${to} | ${subject} | ${text}`);
    return { delivered: false, devMode: true };
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
 * Send a password-reset OTP email.
 */
const sendOtpEmail = async (to, otp, name) => {
  const subject = 'Your HRMS password reset code';
  const text =
    `Hi ${name || ''},\n\n` +
    `Your password reset verification code is: ${otp}\n\n` +
    `This code expires in 10 minutes. If you did not request a password reset, ` +
    `you can safely ignore this email.\n\n— HRMS Security`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto">
      <h2 style="color:#0F172A">Password reset code</h2>
      <p>Hi ${name || ''},</p>
      <p>Use the verification code below to reset your password:</p>
      <p style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#4F7CFF">${otp}</p>
      <p style="color:#64748B">This code expires in <b>10 minutes</b>. If you did not request this,
      you can safely ignore this email.</p>
      <p style="color:#94A3B8;font-size:12px">— HRMS Security</p>
    </div>`;
  return sendMail({ to, subject, text, html });
};

module.exports = { sendMail, sendOtpEmail, sendPayslipEmail, isSmtpConfigured };
