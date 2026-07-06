const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const docs = require('../controllers/complianceDocumentController');

// Finance & Compliance → Documents. Company-scoped statutory document repository.
// view = SA/Company Head/HR/Finance/Manager/Auditor; upload/edit = CH/HR/Finance;
// delete = CH/Finance. Writes blocked on archived company by readOnlyMiddleware.
router.use(protect);
router.use(require('../middleware/readOnlyMiddleware'));

// Specific routes before the /:id catch-all.
router.get('/summary', docs.summary);
router.get('/categories', docs.categories);

router.get('/', docs.list);
router.post('/', docs.create);
router.get('/:id', docs.get);
router.put('/:id', docs.update);
router.delete('/:id', docs.remove);

module.exports = router;
