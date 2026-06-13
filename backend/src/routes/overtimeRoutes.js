const express = require('express');
const router = express.Router();
const overtimeController = require('../controllers/overtimeController');
const { protect } = require('../middleware/authMiddleware');

router.get('/', protect, overtimeController.getAll);
router.post('/', protect, overtimeController.create);
router.put('/:id', protect, overtimeController.update);
router.delete('/:id', protect, overtimeController.delete);

module.exports = router;
