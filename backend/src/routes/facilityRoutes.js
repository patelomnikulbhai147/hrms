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

    const facilities = await prisma.facility.findMany({
      where: { companyId: Number(companyId) },
      include: {
        bookings: true
      },
      orderBy: { name: 'asc' }
    });

    res.json(facilities);
  } catch (error) {
    console.error('Error fetching facilities:', error);
    res.status(500).json({ error: 'Failed to fetch facilities' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { companyId, name, type, capacity } = req.body;
    if (!companyId || !name || !type) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const facility = await prisma.facility.create({
      data: {
        companyId: Number(companyId),
        name,
        type,
        capacity: capacity ? Number(capacity) : null,
        status: 'Active'
      }
    });

    res.status(201).json(facility);
  } catch (error) {
    console.error('Error creating facility:', error);
    res.status(500).json({ error: 'Failed to create facility' });
  }
});

router.post('/:id/book', async (req, res) => {
  try {
    const facilityId = Number(req.params.id);
    const { employeeId, startTime, endTime, purpose } = req.body;

    if (!employeeId || !startTime || !endTime) {
      return res.status(400).json({ error: 'Missing booking required fields' });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    // Conflict detection
    const conflicts = await prisma.facilityBooking.findMany({
      where: {
        facilityId,
        status: 'Approved',
        OR: [
          { startTime: { lt: end, gte: start } },
          { endTime: { gt: start, lte: end } },
          { startTime: { lte: start }, endTime: { gte: end } }
        ]
      }
    });

    if (conflicts.length > 0) {
      return res.status(409).json({ error: 'Time slot is already booked', conflicts });
    }

    const booking = await prisma.facilityBooking.create({
      data: {
        facilityId,
        employeeId: Number(employeeId),
        startTime: start,
        endTime: end,
        purpose,
        status: 'Approved' // simplified for now
      }
    });

    res.status(201).json(booking);
  } catch (error) {
    console.error('Error booking facility:', error);
    res.status(500).json({ error: 'Failed to book facility' });
  }
});

module.exports = router;
