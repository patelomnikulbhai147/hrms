const express = require('express');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.get('/', async (req, res) => {
  try {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ error: 'companyId is required' });

    const integrations = await prisma.integrationConnection.findMany({
      where: { companyId: Number(companyId) },
      orderBy: { createdAt: 'desc' }
    });
    res.json(integrations);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch integrations' });
  }
});

router.post('/connect', async (req, res) => {
  try {
    const { companyId, provider } = req.body;
    
    // In a real app, this would trigger an OAuth flow or save API keys securely.
    const connection = await prisma.integrationConnection.create({
      data: {
        companyId: Number(companyId),
        provider,
        status: 'Connected',
        credentials: { mockToken: 'xyz123' }
      }
    });
    res.status(201).json(connection);
  } catch (error) {
    res.status(500).json({ error: 'Failed to connect integration' });
  }
});

module.exports = router;
