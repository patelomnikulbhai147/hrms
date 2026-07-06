const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const c = require('../controllers/complianceMgmtController');

// Compliance Management — statutory filing calendar / due-date tracker.
// View = SA/CH/HR/Finance/Manager/Auditor; create+edit = CH/HR/Finance;
// delete/waive = CH/Finance. Company-scoped; writes blocked on archived company.
router.use(protect);
router.use(require('../middleware/readOnlyMiddleware'));

router.get('/dashboard', c.dashboard);
router.get('/categories', c.categories);
router.post('/regenerate', c.regenerate);
router.post('/run-reminders', c.runReminders);
router.get('/filings', c.list);
router.post('/filings', c.save);
router.get('/filings/:id', c.get);
router.put('/filings/:id', c.save);
router.post('/filings/:id/status', c.setStatus);
router.post('/filings/:id/challan', c.uploadChallan);
router.delete('/filings/:id', c.remove);

module.exports = router;
