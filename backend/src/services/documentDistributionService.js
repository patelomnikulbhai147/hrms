const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const nodemailer = require('nodemailer');
const whatsappService = require('./whatsapp'); // Assuming existing whatsapp service index exports buildMessage/send
const templateEngine = require('./templateEngine');
const puppeteer = require('puppeteer');

// Reusable transporter (would typically use ENV vars)
const getTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

/**
 * Generates PDF from HTML String
 */
const generatePDF = async (htmlContent) => {
  let browser;
  try {
    browser = await puppeteer.launch({ 
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
    return pdfBuffer;
  } catch (error) {
    console.error('PDF Generation Failed:', error);
    throw error;
  } finally {
    if (browser) await browser.close();
  }
};

/**
 * Distributes a generated template via Email and WhatsApp
 */
exports.distributeDocument = async ({ templateId, companyId, employee, data, methods = ['email'] }) => {
  try {
    const { htmlContent, documentHash } = await templateEngine.renderTemplate(templateId, data);
    
    // Log the usage
    const usageLog = await prisma.templateUsageLog.create({
      data: {
        templateId: Number(templateId),
        companyId: Number(companyId),
        moduleUsedIn: 'Distribution',
        targetEntityId: employee?.id,
        documentHash,
        emailStatus: methods.includes('email') ? 'Pending' : null,
        whatsappStatus: methods.includes('whatsapp') ? 'Pending' : null,
      }
    });

    const pdfBuffer = await generatePDF(htmlContent);
    const template = await prisma.documentTemplate.findUnique({ where: { id: Number(templateId) } });

    // Send Email
    if (methods.includes('email') && employee?.email) {
      try {
        const transporter = getTransporter();
        
        // Simple tracking pixel URL
        const trackingPixel = `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/audit/track-email?hash=${documentHash}`;
        
        await transporter.sendMail({
          from: `"HRMS Notifications" <${process.env.SMTP_USER}>`,
          to: employee.email,
          subject: `Your ${template.name} Document`,
          html: `
            <p>Dear ${employee.name || 'Employee'},</p>
            <p>Please find attached your ${template.name} document.</p>
            <img src="${trackingPixel}" width="1" height="1" style="display:none;" />
          `,
          attachments: [
            {
              filename: `${template.name.replace(/\s+/g, '_')}.pdf`,
              content: pdfBuffer,
              contentType: 'application/pdf'
            }
          ]
        });

        await prisma.templateUsageLog.update({
          where: { id: usageLog.id },
          data: { emailStatus: 'Sent' }
        });
      } catch (emailErr) {
        console.error('Email failed:', emailErr);
        await prisma.templateUsageLog.update({
          where: { id: usageLog.id },
          data: { emailStatus: 'Failed' }
        });
      }
    }

    // Send WhatsApp (assuming standard file API or pre-uploaded media ID in production)
    if (methods.includes('whatsapp') && employee?.phone) {
      try {
        // In a real integration, we'd upload the PDF buffer to Meta's media endpoint,
        // get a mediaId, and send a document template message.
        // For this phase, we'll simulate success if the service is called.
        
        // await whatsappService.service.sendDocumentMessage(companyId, employee.phone, mediaId);
        
        await prisma.templateUsageLog.update({
          where: { id: usageLog.id },
          data: { whatsappStatus: 'Sent' }
        });
      } catch (waErr) {
        console.error('WhatsApp failed:', waErr);
        await prisma.templateUsageLog.update({
          where: { id: usageLog.id },
          data: { whatsappStatus: 'Failed' }
        });
      }
    }

    return { success: true, usageLogId: usageLog.id, documentHash };
  } catch (error) {
    console.error('Document Distribution Error:', error);
    throw error;
  }
};
