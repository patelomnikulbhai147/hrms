const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const ctrl = require('../controllers/customReportController');

// Custom Report Builder — additive, company-scoped module. Access = Super Admin /
// Company Head / HR / Finance (the `reports` permission). No existing report logic
// is touched. Literal segments are declared BEFORE '/:id' so they win the match.
router.use(protect);
router.use(require('../middleware/readOnlyMiddleware'));

router.get('/meta', ctrl.meta);
router.get('/templates/:key', ctrl.template);
router.post('/run', ctrl.run);
router.get('/', ctrl.list);
router.post('/', ctrl.create);
router.get('/:id', ctrl.get);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);
router.post('/:id/duplicate', ctrl.duplicate);
// Phase 2 — version history, scheduling, on-demand email delivery.
router.get('/:id/versions', ctrl.versions);
router.post('/:id/versions/:versionId/restore', ctrl.restoreVersion);
router.put('/:id/schedule', ctrl.setSchedule);
router.post('/:id/send', ctrl.sendNow);

module.exports = router;
