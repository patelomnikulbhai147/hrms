const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const ctrl = require('../controllers/payrollComponentController');

// Payroll Component Builder — company-scoped CRUD. View = SA/CH/HR; mutate = SA/CH.
// Writes are blocked on an archived company by the read-only guard.
router.use(protect);
router.use(require('../middleware/readOnlyMiddleware'));

router.get('/meta', ctrl.meta);
router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);
router.post('/:id/clone', ctrl.clone);
router.patch('/:id/status', ctrl.setStatus);
router.post('/:id/archive', ctrl.archive);
router.delete('/:id', ctrl.remove);

module.exports = router;
