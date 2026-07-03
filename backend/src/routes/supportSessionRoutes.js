const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { requireSuperAdmin } = require('../middleware/rbacMiddleware');
const ctrl = require('../controllers/supportSessionController');

// Support Sessions are a PLATFORM-admin feature — Super Admin only.
router.use(protect);
router.use(requireSuperAdmin);

router.get('/active', ctrl.getActive);
router.get('/', ctrl.listSessions);
router.post('/', ctrl.startSession);
router.post('/end', ctrl.endSession);
router.post('/:id/end', ctrl.endSession);

module.exports = router;
