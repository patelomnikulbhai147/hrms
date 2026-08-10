const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

exports.createShareLink = async ({ documentId, companyId, expiresAt, maxDownloads, password, requireOtp, watermark, disablePrint }) => {
  try {
    const token = crypto.randomBytes(32).toString('hex');
    let passwordHash = null;

    if (password) {
      passwordHash = await bcrypt.hash(password, 10);
    }

    const link = await prisma.documentShareLink.create({
      data: {
        documentId: parseInt(documentId),
        companyId,
        token,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        maxDownloads: maxDownloads ? parseInt(maxDownloads) : null,
        passwordHash,
        requireOtp: requireOtp || false,
        watermark: watermark || false,
        disablePrint: disablePrint || false,
      }
    });

    return { token: link.token, id: link.id };
  } catch (error) {
    throw new Error('Failed to create share link: ' + error.message);
  }
};

exports.accessDocument = async (token, password, otp) => {
  try {
    const link = await prisma.documentShareLink.findUnique({ where: { token } });
    if (!link) {
      throw new Error('Invalid or expired link');
    }

    if (link.expiresAt && new Date() > link.expiresAt) {
      throw new Error('Link has expired');
    }

    if (link.maxDownloads && link.downloadCount >= link.maxDownloads) {
      throw new Error('Maximum download limit reached');
    }

    if (link.passwordHash) {
      if (!password) {
        return { requirePassword: true }; // Signal UI to ask for password
      }
      const isMatch = await bcrypt.compare(password, link.passwordHash);
      if (!isMatch) {
        throw new Error('Incorrect password');
      }
    }

    if (link.requireOtp) {
      if (!otp) {
        // Mock sending OTP logic here
        return { requireOtp: true, message: 'OTP sent to registered email/phone' };
      }
      if (otp !== '123456') { // Mock OTP check
        throw new Error('Invalid OTP');
      }
    }

    // Access granted
    const document = await prisma.documentVault.findUnique({ where: { id: link.documentId } });
    
    if (!document || document.isArchived) {
      throw new Error('Document no longer available');
    }

    // Increment download count
    await prisma.documentShareLink.update({
      where: { id: link.id },
      data: { downloadCount: link.downloadCount + 1 }
    });

    // Log the access
    await prisma.documentAuditLog.create({
      data: {
        companyId: link.companyId,
        documentId: link.documentId,
        action: 'Secure Share Access',
        performedBy: 'External Link Viewer'
      }
    });

    return { 
      document,
      securityParams: {
        watermark: link.watermark,
        disablePrint: link.disablePrint
      }
    };
  } catch (error) {
    throw error; // Let router catch it
  }
};
