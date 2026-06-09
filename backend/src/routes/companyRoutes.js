const { requireSuperAdmin } = require('../middleware/rbacMiddleware');
const express = require('express');
const router = express.Router();
const companyController = require('../controllers/companyController');
const { protect } = require('../middleware/authMiddleware');

// All company routes are restricted to Super Admin ONLY.
// Apply both protect (JWT validation) and requireSuperAdmin (role check) as
// router-level middleware so every route in this file is automatically guarded.
router.use(protect);
router.use(requireSuperAdmin);

router.get('/export', companyController.exportCompanies);
router.get('/', companyController.getCompanies);
router.post('/', companyController.createCompany);
router.put('/:id', companyController.updateCompany);
router.get('/:id/dependencies', companyController.getCompanyDependencies);
router.delete('/:id', companyController.deleteCompany);
router.put('/:id/archive', companyController.archiveCompany);

module.exports = router;
