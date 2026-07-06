const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const loans = require('../controllers/loanController');
const types = require('../controllers/loanTypeController');

// Employee Loan Management — isolated module, deeply integrated with payroll.
// View = SA/Company Head/HR/Finance/Manager (+ Employee OWN via /portal);
// create+edit = Company Head/HR/Finance; approve = Company Head/Finance;
// delete/close = Company Head/Finance. Company-scoped; writes blocked on archived company.
router.use(protect);
router.use(require('../middleware/readOnlyMiddleware'));

// Dashboard + preview
router.get('/dashboard', loans.dashboard);
router.post('/preview', loans.previewEmi);

// Loan types (categories)
router.get('/types', types.list);
router.post('/types', types.create);
router.put('/types/:id', types.update);
router.delete('/types/:id', types.remove);

// Employee portal (own loans) — must precede /:id
router.get('/portal/me', loans.myLoans);

// Reports + reminders
router.get('/reports/:key', loans.report);
router.post('/run-reminders', loans.runReminders);

// Loans
router.get('/', loans.list);
router.post('/', loans.create);
router.get('/:id', loans.get);
router.put('/:id', loans.update);
router.post('/:id/status', loans.setStatus);
router.delete('/:id', loans.remove);

module.exports = router;
