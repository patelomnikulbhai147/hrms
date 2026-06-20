const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const ctrl = require('../controllers/biometricMappingController');

// Biometric Code mappings (Phase 4 — mapping only, no attendance sync).
// View = any authenticated employee-module user; manage = Super Admin / Company
// Head (enforced in the controller, company-scoped). No schema migration needed
// (operates on the existing Employee.biometricId column).
router.use(protect);
router.use(require('../middleware/readOnlyMiddleware')); // archived company → read-only (Super Admin bypass inside)

router.get('/', ctrl.list);
router.post('/bulk', ctrl.bulk);
router.put('/:id', ctrl.setOne);

module.exports = router;
