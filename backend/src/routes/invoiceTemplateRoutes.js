const express = require('express');
const router = express.Router();
const controller = require('../controllers/invoiceTemplateController');

// All routes are implicitly scoped to the authenticated user's company via targetCompanyId
router.get('/', controller.list);
router.get('/active', controller.active);
router.post('/', controller.create);
router.post('/preview', controller.preview);
router.get('/:id', controller.getOne);
router.put('/:id', controller.update);
router.delete('/:id', controller.remove);
router.post('/activate-default', controller.activateDefault);
router.put('/:id/activate', controller.activate);
router.post('/:id/duplicate', controller.duplicate);

module.exports = router;
