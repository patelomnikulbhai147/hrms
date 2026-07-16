const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const c = require('../controllers/deductionPolicyController');

// Attendance & Salary Deduction Policy — the master calculation config.
// View = SA/CH/HR/Finance/Manager/Auditor; edit + recalculate = SA/CH.
// Company-scoped (branch override supported); writes blocked on archived company.
router.use(protect);
router.use(require('../middleware/readOnlyMiddleware'));

router.get('/', c.getEffective);
router.get('/versions', c.versions);
router.put('/', c.save);
router.post('/recalculate', c.recalculate);

module.exports = router;
