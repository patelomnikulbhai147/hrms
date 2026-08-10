const express = require('express');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { protect } = require('../middleware/authMiddleware');
const crypto = require('crypto');

const router = express.Router();

router.use(protect);

router.get('/keys', async (req, res) => {
  try {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ error: 'companyId is required' });

    const keys = await prisma.apiCredential.findMany({
      where: { companyId: Number(companyId) },
      orderBy: { createdAt: 'desc' }
    });
    res.json(keys);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch API keys' });
  }
});

router.post('/keys', async (req, res) => {
  try {
    const { companyId, appName } = req.body;
    
    const key = await prisma.apiCredential.create({
      data: {
        companyId: Number(companyId),
        appName,
        apiKey: 'pk_' + crypto.randomBytes(16).toString('hex'),
        apiSecret: 'sk_' + crypto.randomBytes(32).toString('hex')
      }
    });
    res.status(201).json(key);
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate API key' });
  }
});

router.post('/webhooks', async (req, res) => {
  try {
    const { companyId, event, targetUrl } = req.body;
    
    const webhook = await prisma.webhookSubscription.create({
      data: {
        companyId: Number(companyId),
        event,
        targetUrl
      }
    });
    res.status(201).json(webhook);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create webhook' });
  }
});

module.exports = router;
