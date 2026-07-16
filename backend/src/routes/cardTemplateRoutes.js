const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const ctrl = require('../controllers/cardTemplateController');

// Employee Card Designer templates — company-scoped, isolated module.
// view = SA/Company Head/HR/Manager/Finance; create/edit/delete/set-default =
// Company Head/HR; share-across-companies = Super Admin only.
router.use(protect);
router.use(require('../middleware/readOnlyMiddleware'));

router.get('/', ctrl.list);
router.post('/', ctrl.save);
// Active template — declared before '/:id' so the literal segment wins the match.
router.get('/active', ctrl.getActive);
router.post('/active', ctrl.setActive);
router.get('/:id', ctrl.get);
router.delete('/:id', ctrl.remove);
router.post('/:id/default', ctrl.setDefault);
router.post('/:id/share', ctrl.setShared);

module.exports = router;
