const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const ctrl = require('../controllers/tenderController');

// Reads are workspace-scoped in the controller; mutations are restricted to
// management roles (Super Admin / Company Head / HR) inside the controller.
router.use(protect);
router.use(require('../middleware/readOnlyMiddleware')); // archived company → read-only (Super Admin bypass inside)

router.get('/', ctrl.getAll);
router.post('/', ctrl.create);
router.post('/:id/convert', ctrl.convertToContract); // Won tender → Contract
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);

module.exports = router;
