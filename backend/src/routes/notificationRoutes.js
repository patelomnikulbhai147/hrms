const { requirePermission } = require('../middleware/rbacMiddleware');
const express = require('express');
const router = express.Router();
const controller = require('../controllers/notificationController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/', controller.getAll);
router.post('/', controller.create);
router.put('/read-all', controller.markAllRead);
router.delete('/clear-all', controller.clearAll);
router.post('/delete-many', controller.deleteMany);
router.put('/:id', controller.update);
router.delete('/:id', controller.delete);

module.exports = router;
