const nodemailer = require('nodemailer');

function format12Hour(timeStr) {
  if (!timeStr) return '';
  try {
    const [h, m] = timeStr.split(':');
    let hours = parseInt(h, 10);
    const minutes = m || '00';
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${hours}:${minutes} ${ampm}`;
  } catch {
    return timeStr;
  }
}

function getTransporter() {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT, 10) || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD;

  if (!user || !pass) {
    console.warn('[RecruitmentMailer] SMTP credentials not set. Emails will be logged to console.');
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });
}

/**
 * Sends fixed interview schedule confirmation email to the candidate.
 */
async function sendFixedInterviewEmail({ candidateEmail, candidateName, jobTitle, scheduledDate, scheduledTime, scheduledEndTime, interviewer, location, meetingLink, interviewMode, companyName }) {
  const brandName = companyName || 'ZeniaHR Enterprise';
  const senderEmail = process.env.MAIL_FROM || process.env.SMTP_USER || 'no-reply@zeniahr.com';
  const formattedTime = scheduledEndTime
    ? `${format12Hour(scheduledTime)} – ${format12Hour(scheduledEndTime)}`
    : format12Hour(scheduledTime);

  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b; margin: 0; padding: 24px; background: #f8fafc; }
      .card { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
      .header { border-bottom: 2px solid #3b82f6; padding-bottom: 16px; margin-bottom: 20px; }
      .title { color: #1e40af; font-size: 20px; font-weight: 700; margin: 0; }
      .badge { display: inline-block; background: #eff6ff; color: #1d4ed8; font-size: 13px; font-weight: 600; padding: 4px 10px; border-radius: 6px; }
      .details-box { background: #f1f5f9; border-radius: 8px; padding: 18px; margin: 20px 0; border-left: 4px solid #3b82f6; }
      .detail-row { margin: 8px 0; font-size: 14px; }
      .detail-label { font-weight: 600; color: #475569; width: 110px; display: inline-block; }
      .footer { margin-top: 28px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="header">
        <h2 class="title">${brandName} — Interview Scheduled</h2>
      </div>
      <p>Dear <strong>${candidateName}</strong>,</p>
      <p>We are pleased to invite you for an interview for the position of <strong>${jobTitle}</strong>.</p>
      
      <div class="details-box">
        <div class="detail-row"><span class="detail-label">Date:</span> <strong>${scheduledDate}</strong></div>
        <div class="detail-row"><span class="detail-label">Time:</span> <strong>${formattedTime}</strong></div>
        ${interviewMode ? `<div class="detail-row"><span class="detail-label">Mode:</span> ${interviewMode}</div>` : ''}
        ${interviewer ? `<div class="detail-row"><span class="detail-label">Interviewer:</span> ${interviewer}</div>` : ''}
        ${meetingLink ? `<div class="detail-row"><span class="detail-label">Meeting Link:</span> <a href="${meetingLink}">${meetingLink}</a></div>` : ''}
        ${location ? `<div class="detail-row"><span class="detail-label">Location:</span> ${location}</div>` : ''}
      </div>

      <p>Please ensure you are available 5 minutes prior to the scheduled time. If you require any adjustments or need to reschedule, please contact our talent team immediately.</p>
      
      <p>Best regards,<br><strong>${brandName} Talent Acquisition Team</strong></p>
      
      <div class="footer">
        This is an automated recruitment communication from ${brandName}.
      </div>
    </div>
  </body>
  </html>
  `;

  const transporter = getTransporter();
  if (!transporter) {
    console.log(`[RecruitmentMailer] Mock email to ${candidateEmail}: Interview Scheduled on ${scheduledDate} at ${formattedTime}`);
    return true;
  }

  return transporter.sendMail({
    from: `"${brandName} Careers" <${senderEmail}>`,
    to: candidateEmail,
    subject: `Interview Scheduled — ${jobTitle} at ${brandName}`,
    html
  });
}

/**
 * Sends candidate self-scheduling invitation email with secure token link.
 */
async function sendCandidateScheduleInviteEmail({ candidateEmail, candidateName, jobTitle, token, duration, availableFrom, availableTo, startTime, endTime, interviewMode, publicBaseUrl, companyName, isReschedule }) {
  const brandName = companyName || 'ZeniaHR Enterprise';
  const senderEmail = process.env.MAIL_FROM || process.env.SMTP_USER || 'no-reply@zeniahr.com';
  const baseUrl = publicBaseUrl || process.env.PUBLIC_BASE_URL || 'http://localhost:5173';
  const scheduleUrl = `${baseUrl}/?schedule=${token}`;
  const windowLine = (availableFrom && availableTo)
    ? `• Available window: <strong>${availableFrom}</strong> to <strong>${availableTo}</strong>${startTime && endTime ? `, ${format12Hour(startTime)} – ${format12Hour(endTime)}` : ''}<br>`
    : '';
  const modeLine = interviewMode ? `• Interview mode: <strong>${interviewMode}</strong><br>` : '';

  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b; margin: 0; padding: 24px; background: #f8fafc; }
      .card { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
      .header { border-bottom: 2px solid #2563eb; padding-bottom: 16px; margin-bottom: 20px; }
      .title { color: #1d4ed8; font-size: 20px; font-weight: 700; margin: 0; }
      .btn { display: inline-block; background: #2563eb; color: #ffffff !important; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 15px; margin: 24px 0; text-align: center; }
      .footer { margin-top: 28px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="header">
        <h2 class="title">${brandName} — Interview Invitation</h2>
      </div>
      <p>Dear <strong>${candidateName}</strong>,</p>
      <p>Thank you for applying for the <strong>${jobTitle}</strong> role at ${brandName}. We were impressed by your background and would like to invite you to the interview round.</p>
      
      <p>Please select your preferred date and time slot by clicking the link below:</p>
      
      <div style="text-align: center;">
        <a href="${scheduleUrl}" class="btn" target="_blank">Select Interview Date & Time</a>
      </div>

      <p style="font-size: 13px; color: #64748b;">
        ${windowLine}
        ${modeLine}
        • Expected duration: <strong>${duration || 30} minutes</strong><br>
        • This link is valid for 48 hours.
      </p>
      
      <p>We look forward to speaking with you!</p>
      <p>Regards,<br><strong>${brandName} Talent Team</strong></p>
      
      <div class="footer">
        If the button above does not work, copy and paste this URL into your browser:<br>
        <a href="${scheduleUrl}" style="color: #2563eb;">${scheduleUrl}</a>
      </div>
    </div>
  </body>
  </html>
  `;

  const transporter = getTransporter();
  if (!transporter) {
    console.log(`[RecruitmentMailer] Mock self-schedule invite to ${candidateEmail}: ${scheduleUrl}`);
    return true;
  }

  return transporter.sendMail({
    from: `"${brandName} Careers" <${senderEmail}>`,
    to: candidateEmail,
    subject: isReschedule
      ? `Interview Rescheduling — Select a New Slot (${jobTitle})`
      : `Interview Invitation — Select Your Slot (${jobTitle})`,
    html
  });
}

/**
 * Sends the candidate a confirmation after they book a self-scheduled slot,
 * including mode, meeting link / location and joining instructions.
 */
async function sendInterviewBookingConfirmationEmail({ candidateEmail, candidateName, jobTitle, companyName, date, startTime, endTime, timezone, interviewer, interviewMode, meetingLink, location }) {
  const brandName = companyName || 'ZeniaHR Enterprise';
  const senderEmail = process.env.MAIL_FROM || process.env.SMTP_USER || 'no-reply@zeniahr.com';
  const timeRange = endTime ? `${format12Hour(startTime)} – ${format12Hour(endTime)}` : format12Hour(startTime);

  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b; margin: 0; padding: 24px; background: #f8fafc; }
      .card { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
      .header { border-bottom: 2px solid #10b981; padding-bottom: 16px; margin-bottom: 20px; }
      .title { color: #047857; font-size: 20px; font-weight: 700; margin: 0; }
      .details-box { background: #f0fdf4; border-radius: 8px; padding: 18px; margin: 20px 0; border-left: 4px solid #10b981; }
      .detail-row { margin: 8px 0; font-size: 14px; }
      .detail-label { font-weight: 600; color: #475569; width: 130px; display: inline-block; }
      .footer { margin-top: 28px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="header">
        <h2 class="title">${brandName} — Interview Confirmed</h2>
      </div>
      <p>Dear <strong>${candidateName}</strong>,</p>
      <p>Your interview for the position of <strong>${jobTitle}</strong> at <strong>${brandName}</strong> is confirmed. Here are your interview details:</p>

      <div class="details-box">
        <div class="detail-row"><span class="detail-label">Position:</span> <strong>${jobTitle}</strong></div>
        <div class="detail-row"><span class="detail-label">Company:</span> <strong>${brandName}</strong></div>
        <div class="detail-row"><span class="detail-label">Date:</span> <strong>${date}</strong></div>
        <div class="detail-row"><span class="detail-label">Time:</span> <strong>${timeRange}</strong> ${timezone ? `(${timezone})` : ''}</div>
        ${interviewMode ? `<div class="detail-row"><span class="detail-label">Mode:</span> ${interviewMode}</div>` : ''}
        ${interviewer ? `<div class="detail-row"><span class="detail-label">Interviewer:</span> ${interviewer}</div>` : ''}
        ${meetingLink ? `<div class="detail-row"><span class="detail-label">Meeting Link:</span> <a href="${meetingLink}">${meetingLink}</a></div>` : ''}
        ${location ? `<div class="detail-row"><span class="detail-label">Location:</span> ${location}</div>` : ''}
      </div>

      <p style="font-size:13px; color:#475569;">
        <strong>Instructions:</strong> Please join 5 minutes before the scheduled time and keep a copy of your resume handy.
        ${interviewMode === 'Online' || meetingLink ? 'Ensure a stable internet connection and a quiet environment.' : ''}
        ${interviewMode === 'Offline' ? 'Carry a government-issued photo ID for office entry.' : ''}
        If you need to make changes, reply to this email and our talent team will assist you.
      </p>

      <p>We look forward to speaking with you!</p>
      <p>Best regards,<br><strong>${brandName} Talent Acquisition Team</strong></p>

      <div class="footer">
        This is an automated recruitment communication from ${brandName}.
      </div>
    </div>
  </body>
  </html>
  `;

  const transporter = getTransporter();
  if (!transporter) {
    console.log(`[RecruitmentMailer] Mock booking confirmation to ${candidateEmail}: ${jobTitle} on ${date} ${timeRange}`);
    return true;
  }

  return transporter.sendMail({
    from: `"${brandName} Careers" <${senderEmail}>`,
    to: candidateEmail,
    subject: `Interview Confirmed — ${jobTitle} on ${date} (${timeRange})`,
    html
  });
}

/**
 * Sends formal offer letter email with secure Accept / Decline links.
 */
async function sendOfferLetterEmail({ candidateEmail, candidateName, jobTitle, offer, token, publicBaseUrl, companyName }) {
  const brandName = companyName || 'ZeniaHR Enterprise';
  const senderEmail = process.env.MAIL_FROM || process.env.SMTP_USER || 'no-reply@zeniahr.com';
  const baseUrl = publicBaseUrl || process.env.PUBLIC_BASE_URL || 'http://localhost:5173';
  const acceptUrl = `${baseUrl}/?offer=${token}&action=accept`;
  const declineUrl = `${baseUrl}/?offer=${token}&action=decline`;

  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b; margin: 0; padding: 24px; background: #f8fafc; }
      .card { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
      .header { border-bottom: 2px solid #10b981; padding-bottom: 16px; margin-bottom: 20px; }
      .title { color: #047857; font-size: 22px; font-weight: 700; margin: 0; }
      .offer-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #10b981; }
      .offer-row { margin: 8px 0; font-size: 14px; }
      .offer-label { font-weight: 600; color: #374151; width: 140px; display: inline-block; }
      .btn-accept { display: inline-block; background: #10b981; color: #ffffff !important; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 700; font-size: 14px; margin-right: 12px; }
      .btn-decline { display: inline-block; background: #ef4444; color: #ffffff !important; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 700; font-size: 14px; }
      .actions-container { margin: 28px 0; text-align: center; }
      .footer { margin-top: 28px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="header">
        <h2 class="title">Congratulations! Job Offer from ${brandName}</h2>
      </div>
      <p>Dear <strong>${candidateName}</strong>,</p>
      <p>We are thrilled to offer you the position of <strong>${jobTitle}</strong> at <strong>${brandName}</strong>! Following our interview process, we are confident that your skills and experience will make a valuable contribution to our team.</p>
      
      <div class="offer-box">
        <div class="offer-row"><span class="offer-label">Position:</span> <strong>${jobTitle}</strong></div>
        ${offer.salary ? `<div class="offer-row"><span class="offer-label">Offered CTC / Salary:</span> <strong>${offer.salary}</strong></div>` : ''}
        ${offer.joiningDate ? `<div class="offer-row"><span class="offer-label">Expected Joining:</span> <strong>${offer.joiningDate}</strong></div>` : ''}
        ${offer.location ? `<div class="offer-row"><span class="offer-label">Work Location:</span> ${offer.location}</div>` : ''}
        ${offer.employmentType ? `<div class="offer-row"><span class="offer-label">Employment Type:</span> ${offer.employmentType}</div>` : ''}
      </div>

      <p>Please review your offer details and let us know your decision by clicking one of the buttons below:</p>
      
      <div class="actions-container">
        <a href="${acceptUrl}" class="btn-accept" target="_blank">ACCEPT OFFER</a>
        <a href="${declineUrl}" class="btn-decline" target="_blank">DECLINE OFFER</a>
      </div>

      <p>We look forward to welcoming you aboard!</p>
      <p>Warm regards,<br><strong>${brandName} HR & Leadership</strong></p>
      
      <div class="footer">
        This offer link is secure and unique to you. Valid for 48 hours.
      </div>
    </div>
  </body>
  </html>
  `;

  const transporter = getTransporter();
  if (!transporter) {
    console.log(`[RecruitmentMailer] Mock Offer Email to ${candidateEmail}: Accept -> ${acceptUrl} | Decline -> ${declineUrl}`);
    return true;
  }

  return transporter.sendMail({
    from: `"${brandName} Offers" <${senderEmail}>`,
    to: candidateEmail,
    subject: `Job Offer: ${jobTitle} — ${brandName}`,
    html
  });
}

module.exports = {
  sendFixedInterviewEmail,
  sendCandidateScheduleInviteEmail,
  sendInterviewBookingConfirmationEmail,
  sendOfferLetterEmail
};
