const express = require('express');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { protect } = require('../middleware/authMiddleware');
const crypto = require('crypto');

const router = express.Router();

router.use(protect);

router.get('/', async (req, res) => {
  try {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ error: 'companyId is required' });

    const visitors = await prisma.visitor.findMany({
      where: { companyId: Number(companyId) },
      orderBy: { createdAt: 'desc' }
    });

    res.json(visitors);
  } catch (error) {
    console.error('Error fetching visitors:', error);
    res.status(500).json({ error: 'Failed to fetch visitors' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { companyId, name, phone, purpose, expectedAt, hostId } = req.body;
    if (!companyId || !name || !phone || !purpose) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const qrToken = crypto.randomBytes(16).toString('hex');

    const visitor = await prisma.visitor.create({
      data: {
        companyId: Number(companyId),
        name,
        phone,
        purpose,
        expectedAt: expectedAt ? new Date(expectedAt) : null,
        hostId: hostId ? Number(hostId) : null,
        qrCodeToken: qrToken,
        status: 'Pending'
      }
    });

    res.status(201).json(visitor);
  } catch (error) {
    console.error('Error creating visitor:', error);
    res.status(500).json({ error: 'Failed to create visitor' });
  }
});

router.post('/:id/status', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { status } = req.body;
    
    const updateData = { status };
    if (status === 'Entered') updateData.enteredAt = new Date();
    if (status === 'Exited') updateData.exitedAt = new Date();

    const visitor = await prisma.visitor.update({
      where: { id },
      data: updateData
    });

    res.json(visitor);
  } catch (error) {
    console.error('Error updating visitor status:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

module.exports = router;
