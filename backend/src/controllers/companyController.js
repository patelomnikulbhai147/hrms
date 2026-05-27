const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Get all companies
exports.getCompanies = async (req, res) => {
  try {
    const companies = await prisma.company.findMany({
      include: {
        branches: true
      }
    });
    res.json(companies);
  } catch (error) {
    console.error('Error fetching companies:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Create a new company
exports.createCompany = async (req, res) => {
  try {
    const company = await prisma.company.create({
      data: req.body
    });
    res.status(201).json(company);
  } catch (error) {
    console.error('Error creating company:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Update a company
exports.updateCompany = async (req, res) => {
  try {
    const { id } = req.params;
    const company = await prisma.company.update({
      where: { id },
      data: req.body
    });
    res.json(company);
  } catch (error) {
    console.error('Error updating company:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Delete/Archive a company
exports.deleteCompany = async (req, res) => {
  try {
    const { id } = req.params;
    // We typically want to soft delete / archive in ERP
    const company = await prisma.company.update({
      where: { id },
      data: { status: 'Archived' }
    });
    res.json({ message: 'Company archived successfully', company });
  } catch (error) {
    console.error('Error deleting company:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
