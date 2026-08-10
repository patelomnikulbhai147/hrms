const express = require('express');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

// Admin Analytics
router.get('/analytics', async (req, res) => {
  try {
    const totalCompanies = await prisma.company.count();
    const activeCompanies = await prisma.company.count({ where: { status: 'Active' } });
    const mrr = 450000; // Mock calculation based on subscription plan rows
    const arr = mrr * 12;

    res.json({
      metrics: {
        totalCompanies,
        activeCompanies,
        mrr,
        arr,
        churnRate: 1.2
      },
      revenueTrend: [
        { month: 'Jan', revenue: 400000 },
        { month: 'Feb', revenue: 420000 },
        { month: 'Mar', revenue: 450000 }
      ]
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch SaaS analytics' });
  }
});

// Marketplace Items
router.get('/marketplace', async (req, res) => {
  try {
    const items = await prisma.saasMarketplaceItem.findMany();
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch marketplace items' });
  }
});

module.exports = router;
