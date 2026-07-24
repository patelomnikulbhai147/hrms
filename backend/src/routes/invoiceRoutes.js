const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const inv = require('../controllers/invoiceController');
const master = require('../controllers/invoiceMasterController');
const layout = require('../controllers/invoiceLayoutController');

// Invoice Management — isolated financial module. View = SA/Company Head/Finance/HR;
// create+edit = Company Head/Finance/HR; delete/cancel/settings = Company Head/Finance.
// Company-scoped (x-workspace-id / user company). Writes blocked on archived company.
router.use(protect);
router.use(require('../middleware/readOnlyMiddleware'));

const profile = require('../controllers/invoiceCustomerProfileController');

// Dashboard
router.get('/dashboard', inv.dashboard);

// Customers
router.get('/customers', master.listCustomers);
router.get('/customers/:id/profile', profile.getCustomerProfile);
router.post('/customers', master.saveCustomer);
router.put('/customers/:id', master.saveCustomer);
router.delete('/customers/:id', master.deleteCustomer);

// Products / services
router.get('/products', master.listProducts);
router.post('/products', master.saveProduct);
router.put('/products/:id', master.saveProduct);
router.delete('/products/:id', master.deleteProduct);

// Settings
router.get('/settings', master.getSettings);
router.put('/settings', master.saveSettings);

// Visual Invoice Designer — per-company named canvas layouts (additive/opt-in).
router.get('/layouts', layout.list);
router.get('/layouts/:id', layout.get);
router.post('/layouts', layout.save);
router.put('/layouts/:id', layout.save);
router.post('/layouts/:id/default', layout.setDefault);
router.delete('/layouts/:id', layout.remove);

// Invoices
router.get('/invoices', inv.list);
router.get('/invoices/:id', inv.getOne);
router.post('/invoices', inv.create);
router.put('/invoices/:id', inv.update);
router.post('/invoices/:id/duplicate', inv.duplicate);
router.patch('/invoices/:id/status', inv.setStatus);
router.post('/invoices/:id/log', inv.logAction);
router.post('/invoices/:id/email', inv.emailInvoice); // additive — email the invoice with its PDF attached
router.delete('/invoices/:id', inv.remove);

// Payments
router.post('/invoices/:id/payments', inv.recordPayment);
router.delete('/payments/:paymentId', inv.deletePayment);

module.exports = router;
