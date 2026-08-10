const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const secureSharingService = require('../services/secureSharingService');

// Create Share Link (HR Admin)
router.post('/generate', protect, async (req, res) => {
  try {
    const companyId = req.user.companyId || req.user.accessibleCompanyIds[0];
    const { documentId, expiresAt, maxDownloads, password, requireOtp, watermark, disablePrint } = req.body;
    
    const link = await secureSharingService.createShareLink({
      documentId,
      companyId,
      expiresAt,
      maxDownloads,
      password,
      requireOtp,
      watermark,
      disablePrint
    });
    
    res.json({ success: true, link });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Public Endpoint to Access Document via Token
router.post('/access/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { password, otp } = req.body;

    const accessData = await secureSharingService.accessDocument(token, password, otp);
    res.json({ success: true, ...accessData });
  } catch (error) {
    res.status(403).json({ success: false, message: error.message });
  }
});

module.exports = router;
