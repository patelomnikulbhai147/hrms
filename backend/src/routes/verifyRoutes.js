const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Public endpoint for QR verification
router.get('/:hash', async (req, res) => {
  try {
    const { hash } = req.params;
    
    const usageLog = await prisma.templateUsageLog.findUnique({
      where: { documentHash: hash },
      include: {
        template: { select: { name: true, type: true, version: true } },
        company: { select: { name: true, logo: true, domain: true } }
      }
    });

    if (!usageLog) {
      return res.status(404).json({ 
        success: false, 
        message: 'Invalid or expired document verification code.' 
      });
    }

    res.status(200).json({
      success: true,
      verified: true,
      data: {
        documentName: usageLog.template.name,
        documentType: usageLog.template.type,
        version: usageLog.template.version,
        generatedAt: usageLog.createdAt,
        companyName: usageLog.company.name,
        companyLogo: usageLog.company.logo,
        companyDomain: usageLog.company.domain,
        module: usageLog.moduleUsedIn
      }
    });
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({ success: false, message: 'Server error during verification.' });
  }
});

module.exports = router;
