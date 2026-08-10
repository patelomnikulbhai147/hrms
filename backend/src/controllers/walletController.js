const WalletService = require('../services/walletService');
const { targetCompanyId } = require('../utils/workspaceScope');

/**
 * Resolve the company ID for the current request.
 * Handles branch workspaces (resolves to parent company).
 * Non-Super-Admin callers are always locked to their own company.
 */
function resolveCompanyId(req) {
  return targetCompanyId(req, null) || req.user?.companyId;
}

class WalletController {

  static async getSummary(req, res) {
    try {
      const companyId = resolveCompanyId(req);
      if (!companyId) return res.status(400).json({ success: false, message: 'Company ID required' });
      const summary = await WalletService.getSummary(companyId);
      res.json({ success: true, data: summary });
    } catch (error) {
      console.error('[WalletController] getSummary error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getTransactions(req, res) {
    try {
      const companyId = resolveCompanyId(req);
      if (!companyId) return res.status(400).json({ success: false, message: 'Company ID required' });

      const {
        type,
        status,
        startDate,
        endDate,
        search,
        page = 1,
        limit = 50,
        sortBy = 'createdAt',
        sortOrder = 'desc',
      } = req.query;

      const filters = {};
      if (type && type !== 'All') filters.type = type;
      if (status && status !== 'All') filters.status = status;
      if (startDate) filters.startDate = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filters.endDate = end;
      }
      if (search) filters.search = search;

      const transactions = await WalletService.getTransactions(companyId, {
        ...filters,
        page: parseInt(page, 10),
        limit: Math.min(parseInt(limit, 10), 200),
        sortBy,
        sortOrder,
      });

      res.json({ success: true, data: transactions });
    } catch (error) {
      console.error('[WalletController] getTransactions error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getEstimate(req, res) {
    try {
      const companyId = resolveCompanyId(req);
      if (!companyId) return res.status(400).json({ success: false, message: 'Company ID required' });
      const estimate = await WalletService.estimatePayrollCost(companyId);
      res.json({ success: true, data: estimate });
    } catch (error) {
      console.error('[WalletController] getEstimate error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }
}

module.exports = WalletController;
