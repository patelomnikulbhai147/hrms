const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const ctrl = require('../controllers/nomineeController');

// Employee nominee management. Auth required; write actions are role-gated in the
// controller (Super Admin / Company Head / HR). Read is company-scoped.
router.use(protect);
router.use(require('../middleware/readOnlyMiddleware'));

router.get('/', ctrl.list);                       // ?employeeId=
router.get('/audit', ctrl.audit);                 // ?employeeId=
router.get('/documents/:docId', ctrl.getDocument);
router.delete('/documents/:docId', ctrl.removeDocument);
router.post('/', ctrl.create);
router.post('/bulk', ctrl.bulkCreate);   // transactional batch (registration wizard)
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);
router.post('/:id/archive', ctrl.archive);
router.post('/:id/documents', ctrl.addDocument);

module.exports = router;
