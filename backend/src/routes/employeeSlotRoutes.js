/**
 * Employee Slot Management — tenant routes (/api/employee-slots).
 * Role gates live in the controller: purchasing/requesting is Company Head
 * only, viewing excludes Employees, and every handler resolves the company
 * from the authenticated session (never the request body).
 */
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const controller = require('../controllers/employeeSlotController');

router.use(protect);

router.get('/overview', controller.getOverview);
router.post('/quote', controller.quote);
router.post('/orders', controller.createOrder);
router.post('/orders/:orderId/verify', controller.verifyOrder);
router.post('/request', controller.requestManual);
router.get('/history', controller.getHistory);

module.exports = router;
