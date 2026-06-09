const { requireSuperAdmin } = require('../middleware/rbacMiddleware');
const express = require('express');
const router = express.Router();
const subscriptionPlanController = require('../controllers/subscriptionPlanController');
const { protect } = require('../middleware/authMiddleware');

// Subscription plan CRUD — Super Admin only (platform-level pricing tiers)
router.use(protect);
router.use(requireSuperAdmin);

router.get('/', subscriptionPlanController.getAll);
router.post('/', subscriptionPlanController.create);
router.put('/:id', subscriptionPlanController.update);
router.delete('/:id', subscriptionPlanController.delete);

module.exports = router;
