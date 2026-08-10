const express = require('express');
const router = express.Router();
const templateController = require('../controllers/templateController');

// In a real application, you would add authentication and authorization middleware here.
// e.g., router.use(authMiddleware);

router.get('/marketplace', templateController.getMarketplaceTemplates);
router.post('/import', templateController.importTemplate);
router.post('/ai-generate', templateController.generateTemplateFromAI);
router.get('/', templateController.getTemplates);
router.post('/', templateController.createTemplate);
router.get('/:id', templateController.getTemplateById);
router.put('/:id', templateController.updateTemplate);
router.get('/:id/export', templateController.exportTemplate);
router.post('/:templateId/assign', templateController.assignTemplate);
router.delete('/assignments/:assignmentId', templateController.removeAssignment);
router.post('/:templateId/restore/:versionId', templateController.restoreVersion);
router.post('/:templateId/duplicate', templateController.duplicateTemplate);

module.exports = router;
