const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const ctrl = require('../controllers/taskController');

// Authorization for this new module is enforced inside the controller by ROLE
// (Super Admin = all; Company Head/HR/Finance = their workspace; Employee = only
// own/assigned, cannot create/delete). We intentionally do NOT use the granular
// requirePermission gate here because existing users have no 'tasks' entry in
// their stored permissions JSON yet — that gate would wrongly 403 everyone but
// Super Admin. The controller's role checks are the real security boundary.
router.use(protect);

router.get('/', ctrl.getAll);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);
router.get('/:id/comments', ctrl.getComments);
router.post('/:id/comments', ctrl.addComment);

module.exports = router;
