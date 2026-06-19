const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const ctrl = require('../controllers/attendanceDeviceController');

// Phase 1 — attendance device registry only (no biometric connectivity / sync).
// All routes require authentication. Reads are workspace-scoped and mutations
// are role-gated inside the controller (Super Admin: full incl. delete & company
// assignment; Company Head: create/edit within their company; HR: view only).
router.use(protect);
router.use(require('../middleware/readOnlyMiddleware')); // archived/offboarded company → read-only (Super Admin bypass inside)

router.get('/', ctrl.getAll);
router.get('/push-logs', ctrl.getPushLogs); // before /:id so it isn't treated as an id
router.get('/:id', ctrl.getOne);
router.post('/', ctrl.create);
// Phase 5 — read-only diagnostics (management-only, scoped in the controller).
router.post('/:id/test-connection', ctrl.testConnection);
router.post('/:id/discover', ctrl.discover);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);

module.exports = router;
