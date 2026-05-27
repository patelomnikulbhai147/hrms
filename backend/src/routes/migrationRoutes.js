const express = require('express');
const router = express.Router();
const migrationController = require('../controllers/migrationController');

// UNPROTECTED deliberately so browser console can hit it easily during transition
router.post('/system', migrationController.migrateSystem);

module.exports = router;
