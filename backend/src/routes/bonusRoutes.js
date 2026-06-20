const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const config = require('../controllers/bonusConfigController');
const cycle = require('../controllers/bonusCycleController');

// Bonus Management. View = SA/CH/HR/Finance; manage/generate = SA/CH/HR;
// approve = SA/CH; release = SA/CH/Finance (enforced in controllers,
// company-scoped). Archived company → read-only.
router.use(protect);
router.use(require('../middleware/readOnlyMiddleware'));

// Phase 1 — Bonus Configuration
router.get('/configurations', config.getAll);
router.post('/configurations', config.create);
router.put('/configurations/:id', config.update);
router.delete('/configurations/:id', config.remove);

// Employee self-service + dashboard (place BEFORE /cycles/:id paths)
router.get('/my', cycle.mine);
router.get('/dashboard', cycle.dashboard);
router.get('/payments', cycle.payments);

// Phases 2-5 — Cycles, eligibility, calculation, approval workflow
router.get('/cycles', cycle.listCycles);
router.post('/cycles', cycle.createCycle);
router.get('/cycles/:id/lines', cycle.lines);
router.post('/cycles/:id/generate', cycle.generate);
router.put('/cycles/:id/line/:employeeId', cycle.override);
router.post('/cycles/:id/approve', cycle.approve);
router.post('/cycles/:id/release', cycle.release);
router.post('/cycles/:id/cancel', cycle.cancel);

module.exports = router;
