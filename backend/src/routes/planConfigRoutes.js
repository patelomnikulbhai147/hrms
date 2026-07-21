const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/planConfigController');
const { protect } = require('../middleware/authMiddleware');
const { requireSuperAdmin } = require('../middleware/rbacMiddleware');

// Plan master configuration — the editable source of truth for what each plan
// unlocks (modules / reports / limits / features / pricing) + global settings.
// Super Admin only.
router.use(protect);
router.use(requireSuperAdmin);

router.get('/metadata', ctrl.metadata);          // module/report/feature/limit catalogs
router.get('/settings', ctrl.getSettings);       // global platform settings
router.put('/settings', ctrl.updateSettings);
router.get('/', ctrl.list);                       // all plans (+ live company counts)
router.post('/', ctrl.create);                    // create a custom plan
router.put('/:key', ctrl.update);                 // edit a plan's config (master edit)
router.delete('/:key', ctrl.remove);              // delete a non-system, unused plan

module.exports = router;
