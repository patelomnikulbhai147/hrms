/**
 * Subscription Purchase — tenant routes (/api/subscription-purchase).
 * Role gates live in the controller: purchasing is Company Head only, viewing
 * excludes Employees, and every handler resolves the company from the
 * authenticated session (never the request body).
 */
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const controller = require('../controllers/subscriptionPurchaseController');

router.use(protect);

router.get('/context', controller.getContext);
router.post('/quote', controller.quote);
router.post('/orders', controller.createOrder);
router.post('/orders/:orderId/verify', controller.verifyOrder);
router.get('/history', controller.getHistory);

module.exports = router;
