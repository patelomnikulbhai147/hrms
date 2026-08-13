require('dotenv').config({ path: './.env' });
console.log({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_SECURE,
  user: process.env.SMTP_USER,
  mailFrom: process.env.MAIL_FROM || process.env.SMTP_FROM
});
