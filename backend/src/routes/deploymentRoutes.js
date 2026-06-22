const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const ctrl = require('../controllers/deploymentController');

// Deployment management (assign / transfer / release) is allowed for HR as well
// as Company Head / Super Admin — enforced inside the controller.
router.use(protect);
router.use(require('../middleware/readOnlyMiddleware'));

router.get('/', ctrl.getAll);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);

module.exports = router;
