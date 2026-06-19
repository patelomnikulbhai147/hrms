const { requireSuperAdmin } = require('../middleware/rbacMiddleware');
const express = require('express');
const router = express.Router();
const companyController = require('../controllers/companyController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);
router.use(require('../middleware/readOnlyMiddleware')); // archived company → read-only (Super Admin bypass lets SA edit/reactivate)

router.get('/export', requireSuperAdmin, companyController.exportCompanies);
router.get('/', companyController.getCompanies);
router.post('/', requireSuperAdmin, companyController.createCompany);
// Branding is permission-gated INSIDE the controller (Super Admin any company,
// Company Head own company, HR if granted, Employee denied) — not Super-Admin-only.
router.put('/:id/branding', companyController.updateBranding);
router.put('/:id', requireSuperAdmin, companyController.updateCompany);
router.get('/:id/dependencies', requireSuperAdmin, companyController.getCompanyDependencies);
router.delete('/:id', requireSuperAdmin, companyController.deleteCompany);
router.put('/:id/archive', requireSuperAdmin, companyController.archiveCompany);

module.exports = router;
