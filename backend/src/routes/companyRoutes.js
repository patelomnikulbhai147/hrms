const { requirePermission } = require('../middleware/rbacMiddleware');
const express = require('express');
const router = express.Router();
const companyController = require('../controllers/companyController');
const { protect } = require('../middleware/authMiddleware');

// All company routes are protected
router.use(protect);

router.get('/', companyController.getCompanies);
router.post('/', companyController.createCompany);
router.put('/:id', companyController.updateCompany);
router.get('/:id/dependencies', companyController.getCompanyDependencies);
router.delete('/:id', companyController.deleteCompany);
router.put('/:id/archive', companyController.archiveCompany);

module.exports = router;
