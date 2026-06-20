const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const ctrl = require('../controllers/locationMasterController');

// Country → State → City masters for the creatable location & nationality dropdowns.
router.use(protect);
router.get('/', ctrl.getAll);
router.post('/', ctrl.add);            // legacy { type, name }
router.post('/city', ctrl.addCity);    // { state, name } — custom city linked to its state
router.post('/country', ctrl.addCountry); // { name } — Super Admin only

module.exports = router;
