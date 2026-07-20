const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/subscriptionInvoiceController');
const { protect } = require('../middleware/authMiddleware');
const { requireSuperAdmin } = require('../middleware/rbacMiddleware');

// Super Admin Subscription Billing — real GST invoices per company subscription.
router.use(protect);
router.use(requireSuperAdmin);

router.get('/dashboard', ctrl.dashboard);              // summary cards
router.get('/reports', ctrl.reports);                  // revenue / outstanding / GST / register
router.post('/preview', ctrl.preview);                 // compute totals without saving
router.get('/company/:companyId', ctrl.companyBilling); // per-company billing page
router.get('/', ctrl.list);                            // invoice table (search + filters)
router.post('/', ctrl.generate);                       // + Generate Invoice
router.get('/:id', ctrl.getOne);                       // invoice + payments
router.get('/:id/html', ctrl.html);                    // A4 invoice (print/email)
router.put('/:id', ctrl.update);                       // edit invoice (recompute)
router.delete('/:id', ctrl.remove);                    // delete (Draft/Cancelled)
router.post('/:id/status', ctrl.setStatus);            // mark paid/pending/cancel/refund
router.get('/:id/payments', ctrl.payments);            // payment history
router.post('/:id/payments', ctrl.addPayment);         // record a payment
router.post('/:id/duplicate', ctrl.duplicate);         // duplicate as Draft
router.post('/:id/regenerate', ctrl.regenerate);       // recompute from live company data
router.post('/:id/renew', ctrl.renew);                 // generate the next period's invoice
router.post('/:id/email', ctrl.email);                 // email the invoice

module.exports = router;
