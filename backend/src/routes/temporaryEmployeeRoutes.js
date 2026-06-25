const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/rbacMiddleware');
const ctrl = require('../controllers/temporaryEmployeeController');

// Reuses the existing 'employees' RBAC module — no new permission needed.
router.use(protect);
router.use(require('../middleware/readOnlyMiddleware'));

router.get('/', requirePermission('employees', 'view'), ctrl.list);
// Live unique-mobile check (must precede '/:id' so it isn't matched as an id).
router.get('/check-mobile', requirePermission('employees', 'view'), ctrl.checkMobile);
router.get('/:id', requirePermission('employees', 'view'), ctrl.get);
router.post('/', requirePermission('employees', 'create'), ctrl.create);
router.put('/:id', requirePermission('employees', 'edit'), ctrl.updateProfile);
// Self-onboarding gate: validate mandatory + move to the approval queue.
router.post('/:id/submit', requirePermission('employees', 'edit'), ctrl.submit);
// Approval queue actions (HR / Company Head / Super Admin via 'create').
router.post('/:id/approve', requirePermission('employees', 'create'), ctrl.approve);
router.post('/:id/convert', requirePermission('employees', 'create'), ctrl.approve); // back-compat (now gated)
router.post('/:id/reject', requirePermission('employees', 'edit'), ctrl.reject);
router.post('/:id/request-changes', requirePermission('employees', 'edit'), ctrl.requestChanges);
router.delete('/:id', requirePermission('employees', 'delete'), ctrl.remove);

module.exports = router;
