const { requirePermission } = require('../middleware/rbacMiddleware');
const express = require('express');
const router = express.Router();
const branchController = require('../controllers/branchController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/', branchController.getBranches);
router.post('/', requirePermission('companies', 'create'), branchController.createBranch);
router.put('/:id', requirePermission('companies', 'edit'), branchController.updateBranch);
router.delete('/:id', requirePermission('companies', 'delete'), branchController.deleteBranch);

module.exports = router;
