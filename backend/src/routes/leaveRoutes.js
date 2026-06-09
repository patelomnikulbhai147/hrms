const { requirePermission } = require('../middleware/rbacMiddleware');
const express = require('express');
const router = express.Router();
const controller = require('../controllers/leaveController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/', requirePermission('leaves', 'view'), controller.getAll);
router.post('/', requirePermission('leaves', 'create'), controller.create);
router.put('/:id', requirePermission('leaves', 'edit'), controller.update);
router.delete('/:id', requirePermission('leaves', 'delete'), controller.delete);

module.exports = router;
