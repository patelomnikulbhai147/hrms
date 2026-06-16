const express = require('express');
const router = express.Router();
const shiftController = require('../controllers/shiftController');
const { protect } = require('../middleware/authMiddleware');

router.get('/', protect, shiftController.getAll);
router.post('/', protect, shiftController.create);
router.put('/:id', protect, shiftController.update);
router.patch('/:id/archive', protect, shiftController.archive);
router.post('/:id/assign', protect, shiftController.assignEmployees);
router.delete('/:id', protect, shiftController.delete);

module.exports = router;
