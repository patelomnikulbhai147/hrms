const fs = require('fs');
const path = require('path');

const controllersDir = path.join(__dirname, '..', 'backend', 'src', 'controllers');
const routesDir = path.join(__dirname, '..', 'backend', 'src', 'routes');

const createController = (modelName, variableName) => `const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getAll = async (req, res) => {
  try {
    const data = await prisma.${modelName}.findMany();
    res.json(data);
  } catch (error) {
    console.error('Error fetching', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

exports.create = async (req, res) => {
  try {
    const data = await prisma.${modelName}.create({
      data: req.body
    });
    res.status(201).json(data);
  } catch (error) {
    console.error('Error creating', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const data = await prisma.${modelName}.update({
      where: { id },
      data: req.body
    });
    res.json(data);
  } catch (error) {
    console.error('Error updating', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

exports.delete = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.${modelName}.delete({
      where: { id }
    });
    res.json({ message: 'Deleted successfully' });
  } catch (error) {
    console.error('Error deleting', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};
`;

const createRoute = (variableName) => `const express = require('express');
const router = express.Router();
const controller = require('../controllers/${variableName}Controller');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/', controller.getAll);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.delete('/:id', controller.delete);

module.exports = router;
`;

const entities = [
  { modelName: 'leaveRequest', variableName: 'leave' },
  { modelName: 'document', variableName: 'document' },
  { modelName: 'paymentRecord', variableName: 'payment' },
  { modelName: 'notification', variableName: 'notification' },
  { modelName: 'payroll', variableName: 'payroll' },
  { modelName: 'attendance', variableName: 'attendance' },
];

entities.forEach(({ modelName, variableName }) => {
  fs.writeFileSync(path.join(controllersDir, variableName + 'Controller.js'), createController(modelName, variableName));
  fs.writeFileSync(path.join(routesDir, variableName + 'Routes.js'), createRoute(variableName));
});

console.log('Controllers and Routes created successfully.');
