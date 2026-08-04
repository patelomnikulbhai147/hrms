const express = require('express');
const router = express.Router();
const documentController = require('../controllers/mobileDocumentController');
const { protectMobileEmployee } = require('../middleware/mobileAuthMiddleware');

// Secure all document endpoints with Employee Mobile Auth Middleware
router.use(protectMobileEmployee);

router.get('/', documentController.getAll);
router.get('/types', documentController.getTypes);
router.get('/:id', documentController.getById);
router.post('/upload', documentController.upload);
router.delete('/:id', documentController.delete);

module.exports = router;
