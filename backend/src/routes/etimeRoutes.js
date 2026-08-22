const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const ctrl = require('../controllers/etimeController');

// E-TimeOffice Attendance API Integration (Phase 5 — live pull sync).
// View = Super Admin / Company Head / HR; manage (save/test/sync) = Super Admin /
// Company Head. All reads/writes are company-scoped (RULE 5). Writes are blocked
// on an archived company by the read-only guard (Super Admin bypass inside).
router.use(protect);
router.use(require('../middleware/readOnlyMiddleware'));

router.get('/connection', ctrl.getConnection);
router.put('/connection', ctrl.saveConnection);
router.post('/connection/test', ctrl.testConnection);
router.post('/sync', ctrl.syncNow);
router.get('/sync-logs', ctrl.getSyncLogs);
router.get('/dashboard', ctrl.getDashboard);
// Live device connectivity + raw punch viewer (read-only diagnostics). View = SA/CH/HR.
router.get('/device-status', ctrl.deviceStatus);
router.get('/raw-punches', ctrl.rawPunches);
// Integration-console data: paginated attendance list + Overview analytics series.
router.get('/attendance', ctrl.attendanceList);
router.get('/analytics', ctrl.analytics);

// Unmatched Queue + biometric mapping (map a device code → employee, then replay
// all historical punches for that code). View = SA/CH/HR; resolve/ignore = SA/CH.
router.get('/unmatched', ctrl.getUnmatched);
router.get('/employees', ctrl.getMappingEmployees);
router.post('/unmatched/resolve', ctrl.resolveUnmatched);
router.post('/unmatched/ignore', ctrl.ignoreUnmatched);

module.exports = router;
