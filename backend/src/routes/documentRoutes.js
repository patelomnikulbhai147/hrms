const { requirePermission } = require('../middleware/rbacMiddleware');
const express = require('express');
const router = express.Router();
const controller = require('../controllers/documentController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/', requirePermission('documents', 'view'), controller.getAll);
router.post('/', requirePermission('documents', 'create'), controller.create);
router.put('/:id', requirePermission('documents', 'edit'), controller.update);
router.delete('/:id', requirePermission('documents', 'delete'), controller.delete);

module.exports = router;
