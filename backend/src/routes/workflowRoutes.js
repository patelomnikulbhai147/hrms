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

    const workflows = await prisma.workflow.findMany({
      where: { companyId: Number(companyId) },
      include: { actions: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json(workflows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch workflows' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { companyId, name, triggerEvent, actions } = req.body;
    
    const workflow = await prisma.workflow.create({
      data: {
        companyId: Number(companyId),
        name,
        triggerEvent,
        actions: {
          create: actions?.map((a, i) => ({
            type: a.type,
            config: a.config || {},
            order: i
          })) || []
        }
      },
      include: { actions: true }
    });
    res.status(201).json(workflow);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create workflow' });
  }
});

module.exports = router;
