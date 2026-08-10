const express = require('express');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

// Get Goals
router.get('/goals', async (req, res) => {
  try {
    const { companyId, employeeId } = req.query;
    if (!companyId) return res.status(400).json({ error: 'companyId is required' });

    const filter = { companyId: Number(companyId) };
    if (employeeId) filter.employeeId = Number(employeeId);

    const goals = await prisma.performanceGoal.findMany({
      where: filter,
      orderBy: { createdAt: 'desc' }
    });

    res.json(goals);
  } catch (error) {
    console.error('Error fetching goals:', error);
    res.status(500).json({ error: 'Failed to fetch goals' });
  }
});

// Create Goal
router.post('/goals', async (req, res) => {
  try {
    const { companyId, employeeId, title, description, type, target, dueDate } = req.body;
    
    const goal = await prisma.performanceGoal.create({
      data: {
        companyId: Number(companyId),
        employeeId: Number(employeeId),
        title,
        description,
        type: type || 'KPI',
        target,
        dueDate: dueDate ? new Date(dueDate) : null
      }
    });
    res.status(201).json(goal);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create goal' });
  }
});

// Get Reviews
router.get('/reviews', async (req, res) => {
  try {
    const { companyId, employeeId } = req.query;
    if (!companyId) return res.status(400).json({ error: 'companyId is required' });

    const filter = { companyId: Number(companyId) };
    if (employeeId) filter.employeeId = Number(employeeId);

    const reviews = await prisma.performanceReview.findMany({
      where: filter,
      orderBy: { createdAt: 'desc' }
    });

    res.json(reviews);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

// Submit Self Review
router.post('/reviews/:id/self', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { selfRating, selfComment } = req.body;

    const review = await prisma.performanceReview.update({
      where: { id },
      data: {
        selfRating: Number(selfRating),
        selfComment,
        status: 'Pending Manager'
      }
    });
    res.json(review);
  } catch (error) {
    res.status(500).json({ error: 'Failed to submit self review' });
  }
});

module.exports = router;
