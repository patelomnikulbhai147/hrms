const { requirePermission } = require('../middleware/rbacMiddleware');
const express = require('express');
const router = express.Router();
const ArchiveService = require('../services/archiveService');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.post('/employee/:id', async (req, res) => {
  try {
    const archived = await ArchiveService.offboardEmployee(
      req.params.id, 
      req.body.reason || 'Requested by Admin',
      req.user?.id, 
      req.user?.name
    );
    res.json({ message: 'Employee offboarded successfully', data: archived });
  } catch (error) {
    console.error('Archive Employee Error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/company/:id', async (req, res) => {
  try {
    const archived = await ArchiveService.offboardCompany(
      req.params.id, 
      req.body.reason || 'Requested by Admin',
      req.user?.id, 
      req.user?.name
    );
    res.json({ message: 'Company offboarded successfully', data: archived });
  } catch (error) {
    console.error('Archive Company Error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/reactivate/company/:id', async (req, res) => {
  try {
    const company = await ArchiveService.reactivateCompany(
      req.params.id, 
      req.user?.id, 
      req.user?.name
    );
    res.json({ message: 'Company reactivated successfully', data: company });
  } catch (error) {
    console.error('Reactivate Company Error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
