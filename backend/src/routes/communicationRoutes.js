const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { requireCompanyModuleAccess } = require('../middleware/rbacMiddleware');
const readOnly = require('../middleware/readOnlyMiddleware');
const ctrl = require('../controllers/communicationController');

// Communication Center (Phase 1) — a COMPANY-INTERNAL HR module:
//   • Company Head → full access.
//   • HR (and other company roles) → per the permission matrix (view to read,
//     edit/create to write).
//   • Super Admin → BLOCKED entirely (not a platform feature; this also blocks a
//     masquerading Super Admin, whose backend role stays 'Super Admin').
//   • Employees → no grant → blocked.
// Every read/write is additionally company-scoped in the controller (Company ID
// isolation). There are NO message-sending endpoints — Phase 1 is storage only.
// Role-default fallback for users with no explicit `communication` matrix row
// (e.g. created before this module existed): HR may VIEW/EXPORT by default; only
// Company Head writes by default. Explicit matrix grants always take precedence,
// so a company can grant HR create/edit. Mirrors the frontend role defaults.
const COMM_DEFAULTS = { label: 'Communication Center', defaults: { view: ['HR'], edit: [], export: ['HR'] } };
const canRead = requireCompanyModuleAccess('communication', 'view', COMM_DEFAULTS);
const canWrite = requireCompanyModuleAccess('communication', 'edit', COMM_DEFAULTS);

router.use(protect);
// Baseline gate on every route: blocks Super Admin / Employees, requires at least
// VIEW for non-Company-Head roles. Writes are additionally gated by `canWrite`.
router.use(canRead);

// Libraries + dashboard (reads)
router.get('/categories', ctrl.getCategories);
router.get('/placeholders', ctrl.getPlaceholders);
router.get('/sample-templates', ctrl.getSampleTemplates);
router.get('/sample-holidays', ctrl.getSampleHolidays);
router.get('/dashboard', ctrl.getDashboard);

// Holiday Calendar
router.get('/holidays', ctrl.listHolidays);
router.post('/holidays', canWrite, readOnly, ctrl.createHoliday);
router.post('/holidays/import', canWrite, readOnly, ctrl.importHolidays);
router.put('/holidays/:id', canWrite, readOnly, ctrl.updateHoliday);
router.delete('/holidays/:id', canWrite, readOnly, ctrl.deleteHoliday);

// Templates
router.get('/templates', ctrl.listTemplates);
router.post('/templates', canWrite, readOnly, ctrl.createTemplate);
router.put('/templates/:id', canWrite, readOnly, ctrl.updateTemplate);
router.delete('/templates/:id', canWrite, readOnly, ctrl.deleteTemplate);

// Scheduled messages (stored only)
router.get('/schedules', ctrl.listSchedules);
router.post('/schedules', canWrite, readOnly, ctrl.createSchedule);
router.put('/schedules/:id', canWrite, readOnly, ctrl.updateSchedule);
router.delete('/schedules/:id', canWrite, readOnly, ctrl.deleteSchedule);

// Announcements (stored only)
router.get('/announcements', ctrl.listAnnouncements);
router.post('/announcements', canWrite, readOnly, ctrl.createAnnouncement);
router.put('/announcements/:id', canWrite, readOnly, ctrl.updateAnnouncement);
router.delete('/announcements/:id', canWrite, readOnly, ctrl.deleteAnnouncement);

// Delivery logs (read-only; empty in Phase 1)
router.get('/delivery-logs', ctrl.listDeliveryLogs);

// Settings
router.get('/settings', ctrl.getSettings);
router.put('/settings', canWrite, readOnly, ctrl.updateSettings);

module.exports = router;
