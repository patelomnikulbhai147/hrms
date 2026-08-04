/**
 * White Label & Custom Domain (Beta) — tenant routes (/api/custom-domain).
 * Plan-gated: requirePlanModule('custom-domain') → 403 PLAN_UPGRADE_REQUIRED
 * on plans without the module (drives the Upgrade Required dialog). Writes
 * are Company Head only (controller); HR is read-only.
 */
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { requirePlanModule } = require('../middleware/subscriptionMiddleware');
const controller = require('../controllers/customDomainController');

router.use(protect, requirePlanModule('custom-domain'));

router.get('/overview', controller.getOverview);
router.post('/domains', controller.addDomain);
router.post('/domains/verify', controller.verifyDomain);
router.post('/domains/refresh', controller.refreshStatus);
router.delete('/domains', controller.removeDomain);
router.put('/white-label', controller.saveWhiteLabel);

// RESTful aliases (spec §15): GET/POST/PUT/DELETE /custom-domain + verify /
// activate / status / health. Same handlers, same gates.
router.get('/', controller.getOverview);
router.post('/', controller.addDomain);
router.put('/', controller.saveWhiteLabel);
router.delete('/', controller.removeDomain);
router.post('/verify', controller.verifyDomain);
router.post('/activate', controller.verifyDomain); // activation IS a successful verify (DNS→SSL→ACTIVE)
router.get('/status', controller.getStatus);
router.get('/health', controller.getHealth);

module.exports = router;
