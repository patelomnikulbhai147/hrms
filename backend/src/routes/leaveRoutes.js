const { requirePermission } = require('../middleware/rbacMiddleware');
const express = require('express');
const router = express.Router();
const controller = require('../controllers/leaveController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);
router.use(require('../middleware/readOnlyMiddleware')); // offboarded company → read-only

router.get('/', requirePermission('leaves', 'view'), controller.getAll);
// Declared before '/:id' style routes so these are never read as an id.
router.get('/paginated', requirePermission('leaves', 'view'), controller.paginated);
router.get('/filter-options', requirePermission('leaves', 'view'), controller.filterOptions);
router.post('/', requirePermission('leaves', 'create'), controller.create);
router.put('/:id', requirePermission('leaves', 'edit'), controller.update);
router.delete('/:id', requirePermission('leaves', 'delete'), controller.delete);

module.exports = router;
