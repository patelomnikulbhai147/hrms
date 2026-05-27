const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getEmployees = async (req, res) => {
  try {
    const employees = await prisma.employee.findMany();
    res.json(employees);
  } catch (error) {
    console.error('Error fetching employees:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.createEmployee = async (req, res) => {
  try {
    const employee = await prisma.employee.create({
      data: req.body
    });
    res.status(201).json(employee);
  } catch (error) {
    console.error('Error creating employee:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.updateEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    const employee = await prisma.employee.update({
      where: { id },
      data: req.body
    });
    res.json(employee);
  } catch (error) {
    console.error('Error updating employee:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.deleteEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    // Archive employee instead of hard delete
    const employee = await prisma.employee.update({
      where: { id },
      data: { 
        status: 'Archived', 
        exitDate: new Date(), 
        exitReason: 'Admin Archived' 
      }
    });
    res.json({ message: 'Employee archived successfully', employee });
  } catch (error) {
    console.error('Error deleting employee:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
