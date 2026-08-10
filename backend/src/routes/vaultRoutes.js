const express = require('express');
const router = express.Router();
const { protect, portalProtect } = require('../middleware/authMiddleware');
const documentVaultService = require('../services/documentVaultService');

// ==========================================
// HR ADMIN ROUTES (Uses protect)
// ==========================================

// Get Vault Hierarchy (Folders & Documents)
router.get('/', protect, async (req, res) => {
  try {
    const { folderId } = req.query;
    const companyId = req.user.companyId || req.user.accessibleCompanyIds[0];
    
    const hierarchy = await documentVaultService.getVaultHierarchy(companyId, folderId ? parseInt(folderId) : null);
    res.json({ success: true, ...hierarchy });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create Folder
router.post('/folders', protect, async (req, res) => {
  try {
    const { name, parentId } = req.body;
    const companyId = req.user.companyId || req.user.accessibleCompanyIds[0];
    
    const folder = await documentVaultService.createFolder(companyId, name, parentId);
    res.json({ success: true, folder });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Upload Document (Stub for actual multer upload)
router.post('/upload', protect, async (req, res) => {
  try {
    const companyId = req.user.companyId || req.user.accessibleCompanyIds[0];
    // In production, use multer to upload to S3/Local and get URL
    const { name, originalName, fileType, size, url, folderId, tags, category } = req.body;
    
    const document = await documentVaultService.uploadDocument({
      companyId,
      folderId,
      name,
      originalName,
      fileType,
      size,
      url,
      uploadedBy: req.user.id,
      tags,
      category
    });
    
    res.json({ success: true, document });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Storage Metrics
router.get('/metrics', protect, async (req, res) => {
  try {
    const companyId = req.user.companyId || req.user.accessibleCompanyIds[0];
    const metrics = await documentVaultService.getStorageMetrics(companyId);
    res.json({ success: true, metrics });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// CLIENT PORTAL ROUTES (Uses portalProtect)
// ==========================================

router.get('/portal', portalProtect, async (req, res) => {
  try {
    // Clients might only see specific folders or documents assigned to them
    // For now, return a flat list of accessible documents
    const documents = await documentVaultService.getPortalDocuments(req.portalUser.companyId, req.portalUser.id);
    res.json({ success: true, documents });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
