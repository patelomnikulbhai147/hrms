const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const ctrl = require('../controllers/attendanceVendorController');

// Vendor registry. View is open to any authenticated user (the device form needs
// it); create/edit/delete are Super-Admin-only (enforced inside the controller).
router.use(protect);

router.get('/', ctrl.getAll);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);

module.exports = router;
