// Master Template Library routes — /api/communication-master.
// Browse: any authenticated user (company HR/Head copy from here).
// Manage (create/update/delete/seed): SUPER ADMIN ONLY.
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { requireSuperAdmin } = require('../middleware/rbacMiddleware');
const ctrl = require('../controllers/communicationMasterController');

router.use(protect);

// Reads — browse the catalog (for company copy + Super Admin management UI).
router.get('/', ctrl.list);
router.get('/categories', ctrl.categories);
router.get('/stats', ctrl.stats);

// Writes — Super Admin only.
router.post('/seed', requireSuperAdmin, ctrl.seed);
router.post('/', requireSuperAdmin, ctrl.create);
router.put('/:id', requireSuperAdmin, ctrl.update);
router.delete('/:id', requireSuperAdmin, ctrl.remove);

module.exports = router;
