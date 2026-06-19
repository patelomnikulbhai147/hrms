const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const ctrl = require('../controllers/ifscController');

// Read-only lookup; authenticated. No company read-only guard (it's a GET).
router.use(protect);
router.get('/:code', ctrl.lookup);

module.exports = router;
