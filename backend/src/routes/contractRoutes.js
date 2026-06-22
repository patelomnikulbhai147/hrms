const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const ctrl = require('../controllers/contractController');

// Reads are workspace-scoped; commercial mutations are Company-Head/Super-Admin
// only — enforced inside the controller.
router.use(protect);
router.use(require('../middleware/readOnlyMiddleware'));

router.get('/', ctrl.getAll);
router.get('/:id', ctrl.getOne);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);

module.exports = router;
