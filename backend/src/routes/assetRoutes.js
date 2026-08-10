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

    const assets = await prisma.asset.findMany({
      where: { companyId: Number(companyId) },
      include: {
        allocations: true
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(assets);
  } catch (error) {
    console.error('Error fetching assets:', error);
    res.status(500).json({ error: 'Failed to fetch assets' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { companyId, assetCode, name, category, purchaseDate, value, status } = req.body;
    if (!companyId || !assetCode || !name || !category) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const asset = await prisma.asset.create({
      data: {
        companyId: Number(companyId),
        assetCode,
        name,
        category,
        purchaseDate: purchaseDate ? new Date(purchaseDate) : null,
        value: value ? Number(value) : null,
        status: status || 'Available'
      }
    });

    res.status(201).json(asset);
  } catch (error) {
    console.error('Error creating asset:', error);
    res.status(500).json({ error: 'Failed to create asset' });
  }
});

router.post('/:id/allocate', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { employeeId } = req.body;
    if (!employeeId) return res.status(400).json({ error: 'employeeId is required' });

    const allocation = await prisma.assetAllocation.create({
      data: {
        assetId: id,
        employeeId: Number(employeeId)
      }
    });

    await prisma.asset.update({
      where: { id },
      data: { status: 'Allocated' }
    });

    res.status(201).json(allocation);
  } catch (error) {
    console.error('Error allocating asset:', error);
    res.status(500).json({ error: 'Failed to allocate asset' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    await prisma.asset.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting asset:', error);
    res.status(500).json({ error: 'Failed to delete asset' });
  }
});

module.exports = router;
