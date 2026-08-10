const express = require('express');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.get('/courses', async (req, res) => {
  try {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ error: 'companyId is required' });

    const courses = await prisma.course.findMany({
      where: { companyId: Number(companyId) },
      include: {
        modules: true
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(courses);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch courses' });
  }
});

router.post('/courses', async (req, res) => {
  try {
    const { companyId, title, description, category, isMandatory } = req.body;
    
    const course = await prisma.course.create({
      data: {
        companyId: Number(companyId),
        title,
        description,
        category,
        isMandatory: !!isMandatory,
        status: 'Published'
      }
    });
    res.status(201).json(course);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create course' });
  }
});

router.get('/progress/:employeeId', async (req, res) => {
  try {
    const employeeId = Number(req.params.employeeId);
    
    const progress = await prisma.courseProgress.findMany({
      where: { employeeId },
      include: { course: true }
    });
    res.json(progress);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch course progress' });
  }
});

module.exports = router;
