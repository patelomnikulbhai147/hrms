const { requirePermission } = require('../middleware/rbacMiddleware');
const express = require('express');
const router = express.Router();
const subscriptionPlanController = require('../controllers/subscriptionPlanController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/', subscriptionPlanController.getAll);
router.post('/', subscriptionPlanController.create);
router.put('/:id', subscriptionPlanController.update);
router.delete('/:id', subscriptionPlanController.delete);

module.exports = router;
