const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const ctrl = require('../controllers/attendanceImportController');

// Pre-Phase 5 attendance import SAFETY validation (no attendance creation, no
// vendor API). View = Super Admin / Company Head / HR; validate & resolve =
// Super Admin / Company Head. All reads/writes are company-scoped (RULE 5).
router.use(protect);
router.use(require('../middleware/readOnlyMiddleware')); // archived company → read-only (Super Admin bypass inside)

router.post('/validate', ctrl.validate);        // dry-run safety validation (no attendance)
router.post('/process', ctrl.process);          // REAL import — creates/updates attendance
router.get('/logs', ctrl.getLogs);
router.get('/history', ctrl.getHistory);        // past Excel import runs (audit)
router.get('/unmatched', ctrl.getUnmatched);
router.put('/unmatched/:id/resolve', ctrl.resolveUnmatched);

module.exports = router;
