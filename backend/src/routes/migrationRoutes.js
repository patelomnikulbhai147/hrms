const express = require('express');
const router = express.Router();
const migrationController = require('../controllers/migrationController');
const { protect } = require('../middleware/authMiddleware');
const { requireSuperAdmin } = require('../middleware/rbacMiddleware');

// SECURITY: a system migration mutates the whole database, so it must never be
// callable anonymously. It is now gated to an authenticated Super Admin. (It was
// previously left unprotected "so the browser console could hit it during
// transition" — a critical hole that allowed any unauthenticated caller to
// trigger a system-wide migration.)
router.post('/system', protect, requireSuperAdmin, migrationController.migrateSystem);

module.exports = router;
