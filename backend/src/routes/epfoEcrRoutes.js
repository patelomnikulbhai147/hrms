const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const ctrl = require('../controllers/epfoEcrController');

// EPFO ECR Generation — isolated report under Reports → PF Reports.
// Access = Super Admin / Company Head / HR (enforced in the controller).
// Company-scoped; reads employee + payroll data, writes only its own ecr_history.
router.use(protect);
router.use(require('../middleware/readOnlyMiddleware'));

router.post('/preview', ctrl.preview);
router.post('/generate', ctrl.generate);
router.get('/history', ctrl.history);
router.get('/history/:id/download', ctrl.download);

module.exports = router;
