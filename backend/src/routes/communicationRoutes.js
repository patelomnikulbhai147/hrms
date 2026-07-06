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

// ── Enterprise Workflow: Company Library + Event → Template Mapping ────────────
const wf = require('../controllers/communicationWorkflowController');
// Company Template Library management
router.post('/templates/copy-from-master/:masterId', canWrite, readOnly, wf.copyTemplateFromMaster);
router.put('/templates/:id/library-state', canWrite, readOnly, wf.setTemplateLibraryState);
// Event → Template Mapping (the workflow spine)
router.get('/event-mappings', wf.listEventMappings);
router.get('/event-mappings/validation', wf.getEventMappingValidation);
router.put('/event-mappings/:eventKey', canWrite, readOnly, wf.saveEventMapping);
// Communication Health card
router.get('/health', wf.getCommunicationHealth);

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

// ── WhatsApp integration foundation (Phase 1 — NO messages sent) ──────────────
// Sub-routes of Communication Center, inheriting the same canRead/canWrite gate
// (Super Admin blocked; Company Head full; HR per matrix). Reads need VIEW;
// saving settings / running the test need EDIT.
router.get('/whatsapp/settings', ctrl.getWhatsAppSettings);
router.put('/whatsapp/settings', canWrite, readOnly, ctrl.updateWhatsAppSettings);
router.get('/whatsapp/placeholders', ctrl.getWhatsAppPlaceholders);
router.get('/whatsapp/templates', ctrl.listWhatsAppTemplates);
router.get('/whatsapp/queue', ctrl.listWhatsAppQueue);
router.get('/whatsapp/logs', ctrl.listWhatsAppLogs);
router.get('/whatsapp/diagnostics', ctrl.getWhatsAppDiagnostics);
router.get('/whatsapp/request-history', ctrl.getWhatsAppRequestHistory);
router.get('/whatsapp/scheduler-preview', ctrl.getWhatsAppSchedulerPreview);
router.post('/whatsapp/test', canWrite, readOnly, ctrl.testWhatsAppConfiguration); // Phase 1 simulated full-flow (kept)
// Phase 2 — REAL Meta Cloud API:
router.post('/whatsapp/connection-test', canWrite, readOnly, ctrl.testWhatsAppConnection);
router.post('/whatsapp/send-test', canWrite, readOnly, ctrl.sendWhatsAppTestMessage);
// Phase 3 — WhatsApp Template Management:
router.get('/whatsapp/templates/meta', ctrl.listWhatsAppMetaTemplates);
router.post('/whatsapp/templates/sync', canWrite, readOnly, ctrl.syncWhatsAppTemplates);
router.get('/whatsapp/templates/mappings', ctrl.listWhatsAppMappings);
router.post('/whatsapp/templates/mappings', canWrite, readOnly, ctrl.saveWhatsAppMapping);
router.delete('/whatsapp/templates/mappings/:id', canWrite, readOnly, ctrl.deleteWhatsAppMapping);
router.post('/whatsapp/templates/mappings/:id/test', canWrite, readOnly, ctrl.testWhatsAppTemplate);
router.get('/whatsapp/templates/events', ctrl.listWhatsAppTemplateEvents);

// ── WhatsApp Image-Template Integration (render HRMate designs → image template) ─
router.post('/whatsapp/image/preview', ctrl.previewWhatsAppCard);   // render-only (VIEW)
router.post('/whatsapp/image/send', canWrite, readOnly, ctrl.sendWhatsAppImage);
router.post('/whatsapp/image/test', canWrite, readOnly, ctrl.sendWhatsAppTestImage);

// ── Phase 4 — Communication Automation Engine ─────────────────────────────────
router.get('/automation/meta', ctrl.getAutomationMeta);
router.get('/automation/rules', ctrl.listAutomationRules);
router.post('/automation/rules', canWrite, readOnly, ctrl.createAutomationRule);
router.put('/automation/rules/:id', canWrite, readOnly, ctrl.updateAutomationRule);
router.delete('/automation/rules/:id', canWrite, readOnly, ctrl.deleteAutomationRule);
router.post('/automation/rules/:id/execute', canWrite, readOnly, ctrl.executeAutomationRule);
router.get('/automation/runs', ctrl.listAutomationRuns);
router.get('/automation/scheduler', ctrl.getAutomationScheduler);

// ── Communication Audit Trail (reuses AuditLog; company-scoped) ────────────────
// Read needs VIEW (baseline). Logging an action (Preview/Manual Send/Retry/etc.)
// is allowed for any view-capable user so the trail is complete — it is an
// internal activity log, not a business mutation.
router.get('/audit', ctrl.listCommunicationAudit);
router.post('/audit', ctrl.createCommunicationAudit);

// ── Phase 5 — Enterprise WhatsApp completion (reads = VIEW; retry = EDIT) ──────
router.get('/whatsapp/analytics', ctrl.getWhatsAppAnalytics);
router.get('/whatsapp/messages/search', ctrl.searchWhatsAppMessages);
router.get('/whatsapp/messages/:id', ctrl.getWhatsAppMessageDetail);
router.get('/whatsapp/conversation', ctrl.getWhatsAppConversation);
router.get('/whatsapp/webhook-health', ctrl.getWhatsAppWebhookHealth);
router.get('/whatsapp/queue-monitor', ctrl.getWhatsAppQueueMonitor);
router.get('/whatsapp/retry-policy', ctrl.getWhatsAppRetryPolicy);
router.post('/whatsapp/retry', canWrite, readOnly, ctrl.retryWhatsAppFailed);

module.exports = router;
