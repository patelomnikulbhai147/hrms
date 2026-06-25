const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { requireLeadershipAccess } = require('../middleware/rbacMiddleware');
const ctrl = require('../controllers/contractController');

// Governance module — restricted to Super Admin + Company Head for ALL actions
// (HR / Employees / Branch Managers blocked at the API, not just the UI). Reads
// are further workspace-scoped in the controller.
router.use(protect);
router.use(requireLeadershipAccess('Contract Management'));
router.use(require('../middleware/readOnlyMiddleware'));

router.get('/', ctrl.getAll);
router.get('/:id/cost', ctrl.getCost);
router.get('/:id', ctrl.getOne);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);

module.exports = router;
