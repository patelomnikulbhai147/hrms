const express = require('express');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

// Get all vendors for the active company
router.get('/', async (req, res) => {
  try {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ error: 'companyId is required' });

    const vendors = await prisma.vendor.findMany({
      where: { companyId: Number(companyId) },
      include: {
        documents: true,
        invoices: true
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(vendors);
  } catch (error) {
    console.error('Error fetching vendors:', error);
    res.status(500).json({ error: 'Failed to fetch vendors' });
  }
});

// Create a new vendor
router.post('/', async (req, res) => {
  try {
    const { companyId, name, contactName, email, phone, serviceType, status } = req.body;
    if (!companyId || !name) {
      return res.status(400).json({ error: 'companyId and name are required' });
    }

    const vendor = await prisma.vendor.create({
      data: {
        companyId: Number(companyId),
        name,
        contactName,
        email,
        phone,
        serviceType,
        status: status || 'Active'
      }
    });

    res.status(201).json(vendor);
  } catch (error) {
    console.error('Error creating vendor:', error);
    res.status(500).json({ error: 'Failed to create vendor' });
  }
});

// Delete a vendor
router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    await prisma.vendor.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting vendor:', error);
    res.status(500).json({ error: 'Failed to delete vendor' });
  }
});

module.exports = router;
