const express = require('express');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.get('/policy', async (req, res) => {
  try {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ error: 'companyId is required' });

    let policy = await prisma.securityPolicy.findUnique({
      where: { companyId: Number(companyId) }
    });

    if (!policy) {
      policy = await prisma.securityPolicy.create({
        data: { companyId: Number(companyId) }
      });
    }

    res.json(policy);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch security policy' });
  }
});

router.put('/policy', async (req, res) => {
  try {
    const { companyId, require2FA, ssoProvider, ipWhitelist } = req.body;
    
    const policy = await prisma.securityPolicy.upsert({
      where: { companyId: Number(companyId) },
      update: { require2FA, ssoProvider, ipWhitelist },
      create: { companyId: Number(companyId), require2FA, ssoProvider, ipWhitelist }
    });

    // Log the security change
    await prisma.systemAuditLog.create({
      data: {
        companyId: Number(companyId),
        action: 'UPDATE_SECURITY_POLICY',
        metadata: { require2FA, ssoProvider }
      }
    });

    res.json(policy);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update security policy' });
  }
});

router.get('/audit-logs', async (req, res) => {
  try {
    const { companyId } = req.query;
    const logs = await prisma.systemAuditLog.findMany({
      where: { companyId: Number(companyId) },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

module.exports = router;
