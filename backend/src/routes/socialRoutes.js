const express = require('express');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.get('/posts', async (req, res) => {
  try {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ error: 'companyId is required' });

    const posts = await prisma.socialPost.findMany({
      where: { companyId: Number(companyId) },
      orderBy: { createdAt: 'desc' }
    });

    res.json(posts);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

router.post('/posts', async (req, res) => {
  try {
    const { companyId, authorId, content, type } = req.body;
    
    const post = await prisma.socialPost.create({
      data: {
        companyId: Number(companyId),
        authorId: Number(authorId),
        content,
        type: type || 'Post'
      }
    });
    res.status(201).json(post);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create post' });
  }
});

router.post('/posts/:id/like', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const post = await prisma.socialPost.update({
      where: { id },
      data: {
        likesCount: { increment: 1 }
      }
    });
    res.json(post);
  } catch (error) {
    res.status(500).json({ error: 'Failed to like post' });
  }
});

module.exports = router;
