const express = require('express');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.get('/jobs', async (req, res) => {
  try {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ error: 'companyId is required' });

    const jobs = await prisma.jobPosting.findMany({
      where: { companyId: Number(companyId) },
      include: { _count: { select: { candidates: true } } },
      orderBy: { createdAt: 'desc' }
    });
    res.json(jobs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

router.post('/jobs', async (req, res) => {
  try {
    const { companyId, title, department, location, type, description, vacancies } = req.body;
    
    const job = await prisma.jobPosting.create({
      data: {
        companyId: Number(companyId),
        title,
        department,
        location,
        type: type || 'Full-Time',
        description,
        vacancies: vacancies ? Number(vacancies) : 1
      }
    });
    res.status(201).json(job);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create job' });
  }
});

router.get('/candidates', async (req, res) => {
  try {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ error: 'companyId is required' });

    const candidates = await prisma.candidate.findMany({
      where: { companyId: Number(companyId) },
      include: { job: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json(candidates);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch candidates' });
  }
});

module.exports = router;
