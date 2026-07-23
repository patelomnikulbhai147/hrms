const express = require('express');
const router = express.Router();
const overtimeController = require('../controllers/overtimeController');
const { protect } = require('../middleware/authMiddleware');
router.use(protect, require('../middleware/readOnlyMiddleware')); // archived company → read-only (Super Admin bypass inside)

router.get('/', protect, overtimeController.getAll);
// One row per employee, grouped on the server from the same records `/` returns.
router.get('/summary', protect, overtimeController.summary);
// Re-run the approval hook's sync for one employee (repairs pre-hook payroll).
router.post('/push-to-payroll', protect, overtimeController.pushToPayroll);
router.post('/', protect, overtimeController.create);
router.put('/:id', protect, overtimeController.update);
router.delete('/:id', protect, overtimeController.delete);

module.exports = router;
