const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const ctrl = require('../controllers/attendanceSummaryController');

router.use(protect);
router.use(require('../middleware/readOnlyMiddleware')); // archived company → read-only (Super Admin bypass inside)
router.get('/', ctrl.getAll);
router.post('/recompute', ctrl.recompute);
router.put('/:id', ctrl.update);

module.exports = router;
