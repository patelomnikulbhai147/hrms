const { requirePermission, requireLeadershipAccess } = require('../middleware/rbacMiddleware');
const express = require('express');
const router = express.Router();
const branchController = require('../controllers/branchController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);
router.use(require('../middleware/readOnlyMiddleware')); // archived company → read-only (Super Admin bypass inside)

router.get('/', branchController.getBranches);
router.post('/', requirePermission('companies', 'create'), branchController.createBranch);
router.put('/:id', requirePermission('companies', 'edit'), branchController.updateBranch);

// Offboarding is a governance action: Company Head + Super Admin only. It is
// deliberately NOT behind requirePermission('companies','edit') — that folds
// create/delete/approve into a single `edit` flag, so an HR user granted edit
// could otherwise offboard a branch and archive its entire workforce.
router.post('/:id/offboard', requireLeadershipAccess('Branch Offboarding'), branchController.offboardBranch);
router.post('/:id/reactivate', requireLeadershipAccess('Branch Reactivation'), branchController.reactivateBranch);
router.post('/:id/archive', requirePermission('companies', 'delete'), branchController.archiveBranch);

router.delete('/:id', requirePermission('companies', 'delete'), branchController.deleteBranch);

module.exports = router;
