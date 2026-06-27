const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { requireLeadershipAccess } = require('../middleware/rbacMiddleware');
const readOnly = require('../middleware/readOnlyMiddleware');
const ctrl = require('../controllers/communicationController');

// Communication Center (Phase 1) — Super Admin + Company Head only (HR/Employees
// blocked at the API, not just the UI; HR can be added later via permissions).
// There are NO message-sending endpoints here — Phase 1 is storage only.
router.use(protect);
router.use(requireLeadershipAccess('Communication Center'));

// Libraries + dashboard (reads)
router.get('/categories', ctrl.getCategories);
router.get('/placeholders', ctrl.getPlaceholders);
router.get('/sample-templates', ctrl.getSampleTemplates);
router.get('/sample-holidays', ctrl.getSampleHolidays);
router.get('/dashboard', ctrl.getDashboard);

// Holiday Calendar
router.get('/holidays', ctrl.listHolidays);
router.post('/holidays', readOnly, ctrl.createHoliday);
router.post('/holidays/import', readOnly, ctrl.importHolidays);
router.put('/holidays/:id', readOnly, ctrl.updateHoliday);
router.delete('/holidays/:id', readOnly, ctrl.deleteHoliday);

// Templates
router.get('/templates', ctrl.listTemplates);
router.post('/templates', readOnly, ctrl.createTemplate);
router.put('/templates/:id', readOnly, ctrl.updateTemplate);
router.delete('/templates/:id', readOnly, ctrl.deleteTemplate);

// Scheduled messages (stored only)
router.get('/schedules', ctrl.listSchedules);
router.post('/schedules', readOnly, ctrl.createSchedule);
router.put('/schedules/:id', readOnly, ctrl.updateSchedule);
router.delete('/schedules/:id', readOnly, ctrl.deleteSchedule);

// Announcements (stored only)
router.get('/announcements', ctrl.listAnnouncements);
router.post('/announcements', readOnly, ctrl.createAnnouncement);
router.put('/announcements/:id', readOnly, ctrl.updateAnnouncement);
router.delete('/announcements/:id', readOnly, ctrl.deleteAnnouncement);

// Delivery logs (read-only; empty in Phase 1)
router.get('/delivery-logs', ctrl.listDeliveryLogs);

// Settings
router.get('/settings', ctrl.getSettings);
router.put('/settings', readOnly, ctrl.updateSettings);

module.exports = router;
