const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/attendancePushController');

// Phase 6 — UNAUTHENTICATED push receiver (devices have no JWT). Capture only;
// never creates attendance. Raw body is captured verbatim by captureRaw.
router.use(ctrl.captureRaw);
router.all('/push', ctrl.receive);

module.exports = router;
