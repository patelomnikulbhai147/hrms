const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const ctrl = require('../controllers/complianceReportController');

// Government Compliance Reports. Access = Super Admin / Company Head / HR
// (Employee has no access; enforced in the controller). Company-scoped, audited.
router.use(protect);
router.use(require('../middleware/readOnlyMiddleware'));

router.get('/catalog', ctrl.catalog);
router.post('/generate', ctrl.generate);
router.post('/preview', ctrl.preview);   // sample preview using the demo company
router.post('/log-download', ctrl.logDownload);
router.get('/audit', ctrl.audit);

module.exports = router;
