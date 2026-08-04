const { requirePermission } = require('../middleware/rbacMiddleware');
const express = require('express');
const router = express.Router();
const controller = require('../controllers/documentController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);
router.use(require('../middleware/readOnlyMiddleware')); // offboarded company → read-only

router.get('/', requirePermission('documents', 'view'), controller.getAll);
// File CONTENTS on demand — the list deliberately omits them (see getAll).
router.get('/:id/file', requirePermission('documents', 'view'), controller.getFile);
router.post('/', requirePermission('documents', 'create'), controller.create);
router.put('/:id', requirePermission('documents', 'edit'), controller.update);
router.delete('/:id', requirePermission('documents', 'delete'), controller.delete);

module.exports = router;
