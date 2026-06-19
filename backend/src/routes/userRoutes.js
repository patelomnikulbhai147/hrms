const { requirePermission } = require('../middleware/rbacMiddleware');
const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');
router.use(protect, require('../middleware/readOnlyMiddleware')); // archived company → read-only (Super Admin bypass inside)

// Using protect middleware if we want only authenticated users (admins) to reset passwords
// Assuming `req.user` gets populated by `protect`.
router.put('/:id/reset-password', protect, requirePermission('users', 'edit'), userController.resetPassword);
router.put('/:id', protect, requirePermission('users', 'edit'), userController.updateUser);
// User CRUD routes
router.get('/', protect, userController.getAllUsers);
// Management users assignable in Task Manager (scoped to caller's permissions).
router.get('/assignable', protect, userController.getAssignableUsers);
// Company-level permission management (Super Admin all; Company Admin own company;
// HR if granted — branch only). Authorization is enforced inside the controller.
router.get('/manageable', protect, userController.getManageableUsers);
router.put('/:id/permissions', protect, userController.updatePermissions);
router.get('/audit', protect, requirePermission('users', 'view'), userController.getAuditLogs);
router.post('/', protect, requirePermission('users', 'create'), userController.createUser);
router.delete('/:id', protect, requirePermission('users', 'delete'), userController.deleteUser);

module.exports = router;
