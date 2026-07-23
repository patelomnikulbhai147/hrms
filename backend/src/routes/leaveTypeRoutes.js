const express = require('express');
const router = express.Router();
const controller = require('../controllers/leaveTypeController');
const { protect } = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/rbacMiddleware');

router.use(protect);
router.use(require('../middleware/readOnlyMiddleware')); // offboarded company → read-only

// Reading the master (and an employee's eligible list) is part of viewing leave.
router.get('/', requirePermission('leaves', 'view'), controller.list);
router.get('/eligible', requirePermission('leaves', 'view'), controller.eligible);

// Changing WHO may take a leave type is a policy change, not a leave entry.
router.put('/:code', requirePermission('leaves', 'edit'), controller.upsert);

module.exports = router;
