const { requirePermission } = require('../middleware/rbacMiddleware');
const express = require('express');
const router = express.Router();
const branchController = require('../controllers/branchController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/', branchController.getBranches);
router.post('/', branchController.createBranch);
router.put('/:id', branchController.updateBranch);
router.delete('/:id', branchController.deleteBranch);

module.exports = router;
