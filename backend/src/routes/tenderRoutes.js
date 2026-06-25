const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { requireLeadershipAccess } = require('../middleware/rbacMiddleware');
const ctrl = require('../controllers/tenderController');

// Governance module — restricted to Super Admin + Company Head for ALL actions
// (HR / Employees / Branch Managers blocked at the API, not just the UI). Reads
// are further workspace-scoped in the controller.
router.use(protect);
router.use(requireLeadershipAccess('Tender Management'));
router.use(require('../middleware/readOnlyMiddleware')); // archived company → read-only (Super Admin bypass inside)

router.get('/', ctrl.getAll);
router.post('/', ctrl.create);
router.post('/:id/convert', ctrl.convertToContract); // Won tender → Contract
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);

module.exports = router;
