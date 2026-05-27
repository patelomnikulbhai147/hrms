const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getBranches = async (req, res) => {
  try {
    const branches = await prisma.branch.findMany();
    res.json(branches);
  } catch (error) {
    console.error('Error fetching branches:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.createBranch = async (req, res) => {
  try {
    const branch = await prisma.branch.create({
      data: req.body
    });
    res.status(201).json(branch);
  } catch (error) {
    console.error('Error creating branch:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.updateBranch = async (req, res) => {
  try {
    const { id } = req.params;
    const branch = await prisma.branch.update({
      where: { id },
      data: req.body
    });
    res.json(branch);
  } catch (error) {
    console.error('Error updating branch:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.deleteBranch = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.branch.delete({
      where: { id }
    });
    res.json({ message: 'Branch deleted successfully' });
  } catch (error) {
    console.error('Error deleting branch:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
