const express = require('express');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.get('/articles', async (req, res) => {
  try {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ error: 'companyId is required' });

    const categories = await prisma.knowledgeCategory.findMany({
      where: { companyId: Number(companyId) },
      include: {
        articles: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch knowledge base' });
  }
});

router.post('/categories', async (req, res) => {
  try {
    const { companyId, name, description } = req.body;
    
    const category = await prisma.knowledgeCategory.create({
      data: {
        companyId: Number(companyId),
        name,
        description
      }
    });
    res.status(201).json(category);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create category' });
  }
});

router.post('/articles', async (req, res) => {
  try {
    const { categoryId, title, content } = req.body;
    
    const article = await prisma.knowledgeArticle.create({
      data: {
        categoryId: Number(categoryId),
        title,
        content
      }
    });
    res.status(201).json(article);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create article' });
  }
});

module.exports = router;
