const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const readOnly = require('../middleware/readOnlyMiddleware');
const ctrl = require('../controllers/companyProfileController');

// Company Profile — the company's master repository. COMPANY HEAD ONLY, for ALL
// actions (view/edit). HR, Manager, Employee are blocked at the API regardless of
// any stored permission grant — this is a HARD role gate (not the permission
// matrix), so the module cannot be reached via direct API/URL calls. Super Admin
// is allowed (covers masquerade / platform-admin support; they are still role
// 'Super Admin' on the backend even while masquerading). Reads are further scoped
// to the caller's OWN company inside the controller.
const COMPANY_PROFILE_ROLES = ['Super Admin', 'Company Head'];
const requireProfileAccess = () => (req, res, next) => {
  const role = req.user?.role;
  if (!role) return res.status(401).json({ error: 'Unauthorized: authentication required.' });
  if (COMPANY_PROFILE_ROLES.includes(role)) return next();
  return res.status(403).json({
    error: 'Access Denied: Company Profile is restricted to the Company Head.',
    requiredRole: 'Company Head',
    yourRole: role,
  });
};

router.use(protect);

// Reads
router.get('/', requireProfileAccess('view'), ctrl.getProfile);
router.get('/document-health', requireProfileAccess('view'), ctrl.getDocumentHealth);
router.get('/contacts', requireProfileAccess('view'), ctrl.listContacts);
router.get('/documents', requireProfileAccess('view'), ctrl.listDocuments);
router.get('/audit', requireProfileAccess('view'), ctrl.getAuditTimeline);
router.get('/compliance', requireProfileAccess('view'), ctrl.listCompliance);

// Writes (archived-company read-only guard applies)
router.post('/contacts', requireProfileAccess('edit'), readOnly, ctrl.createContact);
router.put('/contacts/:id', requireProfileAccess('edit'), readOnly, ctrl.updateContact);
router.delete('/contacts/:id', requireProfileAccess('edit'), readOnly, ctrl.deleteContact);

router.post('/documents', requireProfileAccess('edit'), readOnly, ctrl.createDocument);
router.put('/documents/:id', requireProfileAccess('edit'), readOnly, ctrl.updateDocument);
router.delete('/documents/:id', requireProfileAccess('edit'), readOnly, ctrl.deleteDocument);

router.post('/compliance', requireProfileAccess('edit'), readOnly, ctrl.createCompliance);
router.put('/compliance/:id', requireProfileAccess('edit'), readOnly, ctrl.updateCompliance);
router.delete('/compliance/:id', requireProfileAccess('edit'), readOnly, ctrl.deleteCompliance);

module.exports = router;
