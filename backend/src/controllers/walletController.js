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

      // With ?month=&year= the response also carries the period gate the
      // backend will enforce on generate — balance, what THIS period still
      // requires (0 if already charged), and the shortfall — so the UI can
      // disable Generate for the same reason the API would reject it.
      const { month, year } = req.query;
      if (month && year) {
        const { assessPayrollWallet } = require('../services/payrollWalletGuard');
        const a = await assessPayrollWallet(companyId, String(month), Number(year));
        return res.json({
          success: true,
          verified: true,
          data: {
            ...estimate,
            gate: {
              ok: a.ok,
              walletBalance: a.balance,
              requiredNow: a.requiredNow,
              shortfall: a.shortfall,
              alreadyCharged: a.alreadyCharged,
              // Delta billing: only NEW (never-billed) employees are charged.
              totalEmployees: a.totalEmployees,
              alreadyBilled: a.alreadyBilled,
              newEmployees: a.newEmployees,
              billableEmployees: a.newEmployees,
              chargeAmount: a.requiredNow,
              costPerEmployee: a.costPerEmployee,
              walletRequired: a.walletRequired,
              message: a.walletRequired
                ? `${a.newEmployees} new employee(s) to bill for ${month} ${year} — ₹${a.requiredNow} will be deducted.`
                : 'No new employees detected. No wallet deduction required.',
            },
          },
        });
      }

      res.json({ success: true, data: estimate });
    } catch (error) {
      console.error('[WalletController] getEstimate error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }
}

module.exports = WalletController;
