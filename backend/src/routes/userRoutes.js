const { requirePermission } = require('../middleware/rbacMiddleware');
const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');

// Using protect middleware if we want only authenticated users (admins) to reset passwords
// Assuming `req.user` gets populated by `protect`.
router.put('/:id/reset-password', protect, requirePermission('users', 'edit'), userController.resetPassword);
router.put('/:id', protect, requirePermission('users', 'edit'), userController.updateUser);
// User CRUD routes
router.get('/', protect, requirePermission('users', 'view'), userController.getAllUsers);
router.post('/', protect, requirePermission('users', 'create'), userController.createUser);
router.delete('/:id', protect, requirePermission('users', 'delete'), userController.deleteUser);

module.exports = router;
