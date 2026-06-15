const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { requireSuperAdmin } = require('../middleware/rbacMiddleware');
const ctrl = require('../controllers/auditController');

// Global audit trail — restricted to Super Admin (platform-wide visibility).
router.use(protect);
router.get('/', requireSuperAdmin, ctrl.getAll);

module.exports = router;
