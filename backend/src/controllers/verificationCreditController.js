/**
 * verificationCreditController.js
 * 
 * Express controller handlers for tenant-scoped credit wallet endpoints and Super Admin credit management.
 */

const VerificationCreditService = require('../services/verificationCreditService');
const { resolveWalletCompany } = require('../utils/verificationScope');
const prisma = require('../config/prisma');
// Shared page-window + metadata contract (utils/pagination.js).
const { pageWindow, pageMeta } = require('../utils/pagination');

// Resolve the tenant whose wallet this request targets, or answer with the
// reason it cannot be resolved. Every handler below routes through this, and so
// does bankController's verification path — the balance shown and the balance
// debited are guaranteed to be the same row.
//
// It replaces a resolver that preferred the raw x-workspace-id header (a BRANCH
// id in a branch workspace, which addressed a different wallet) and fell back to
// a literal company 1 when nothing resolved (one tenant seeing another's money).
const resolveTenant = (req, res) => {
  const { companyId, error, status } = resolveWalletCompany(req);
  if (error) {
    res.status(status || 400).json({ error });
    return null;
  }
  return companyId;
};

// ── Tenant Handlers (Company Head & HR) ────────────────────────────────────────

exports.getWallet = async (req, res) => {
  try {
    const cid = resolveTenant(req, res);
    if (cid === null) return;
    const serviceType = req.query.serviceType || 'BANK_VERIFICATION';
    const status = await VerificationCreditService.checkCredits(cid, serviceType);
    res.json(status);
  } catch (err) {
    console.error('getWallet error:', err);
    res.status(500).json({ error: err.message || 'Failed to retrieve verification credit wallet.' });
  }
};

exports.getSettings = async (req, res) => {
  try {
    const cid = resolveTenant(req, res);
    if (cid === null) return;
    const settings = await VerificationCreditService.getSettings(cid);
    const wallet = await VerificationCreditService.checkCredits(cid, 'BANK_VERIFICATION');
    res.json({
      ...settings,
      remainingCredits: wallet.remainingCredits,
      remainingVerifications: wallet.remainingVerifications,
      costPerVerification: wallet.costPerVerification,
      isAvailable: wallet.isAvailable,
      unavailableCode: wallet.unavailableCode,
      reason: wallet.reason
    });
  } catch (err) {
    console.error('getSettings error:', err);
    res.status(500).json({ error: err.message || 'Failed to retrieve verification settings.' });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const cid = resolveTenant(req, res);
    if (cid === null) return;
    // RBAC: Only Company Head or Super Admin can switch between Manual and API modes
    if (req.user && req.user.role !== 'Super Admin' && req.user.role !== 'Company Head') {
      return res.status(403).json({ error: 'Only Company Head or Super Admin can change verification settings.' });
    }
    const updated = await VerificationCreditService.saveSettings(cid, req.body);
    const wallet = await VerificationCreditService.checkCredits(cid, 'BANK_VERIFICATION');
    res.json({
      ...updated,
      remainingCredits: wallet.remainingCredits,
      remainingVerifications: wallet.remainingVerifications,
      costPerVerification: wallet.costPerVerification,
      isAvailable: wallet.isAvailable,
      unavailableCode: wallet.unavailableCode,
      reason: wallet.reason
    });
  } catch (err) {
    console.error('updateSettings error:', err);
    res.status(400).json({ error: err.message || 'Failed to update verification settings.' });
  }
};

exports.requestCredits = async (req, res) => {
  try {
    const cid = resolveTenant(req, res);
    if (cid === null) return;
    const requestedAmount = parseInt(req.body.credits || 50, 10);
    const remarks = req.body.remarks || 'Requested by Company Head via onboarding / settings UI';
    
    const result = await VerificationCreditService.requestCredits({
      companyId: cid,
      credits: requestedAmount,
      remarks,
      requestedBy: req.user?.name || 'Company Head'
    });

    res.json(result);
  } catch (err) {
    console.error('requestCredits error:', err);
    res.status(500).json({ error: err.message || 'Failed to submit credit request.' });
  }
};

exports.getTransactions = async (req, res) => {
  try {
    const cid = resolveTenant(req, res);
    if (cid === null) return;
    const ledger = await VerificationCreditService.getLedger({
      companyId: cid,
      serviceType: req.query.serviceType,
      transactionType: req.query.transactionType,
      createdBy: req.query.createdBy,
      search: req.query.search,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      page: req.query.page || 1,
      limit: req.query.pageSize || req.query.limit || 20
    });
    res.json(ledger);
  } catch (err) {
    console.error('getTransactions error:', err);
    res.status(500).json({ error: err.message || 'Failed to retrieve transaction ledger.' });
  }
};

exports.getAuditLogs = async (req, res) => {
  try {
    const cid = resolveTenant(req, res);
    if (cid === null) return;
    const logs = await prisma.bankVerificationAuditLog.findMany({
      where: { companyId: cid },
      orderBy: { id: 'desc' },
      take: parseInt(req.query.limit || 50, 10)
    });
    res.json(logs);
  } catch (err) {
    console.error('getAuditLogs error:', err);
    res.status(500).json({ error: err.message || 'Failed to retrieve verification audit logs.' });
  }
};

// ── Super Admin Handlers ───────────────────────────────────────────────────────

exports.getSuperAdminDashboard = async (req, res) => {
  try {
    const metrics = await VerificationCreditService.getSuperAdminMetrics(req.query.serviceType);
    res.json(metrics);
  } catch (err) {
    console.error('getSuperAdminDashboard error:', err);
    res.status(500).json({ error: err.message || 'Failed to retrieve Super Admin dashboard metrics.' });
  }
};

exports.getCompanyList = async (req, res) => {
  try {
    const serviceType = req.query.serviceType || 'BANK_VERIFICATION';
    const list = await VerificationCreditService.getCompanyList(serviceType);
    res.json(list);
  } catch (err) {
    console.error('getCompanyList error:', err);
    res.status(500).json({ error: err.message || 'Failed to retrieve company credit list.' });
  }
};

exports.getCompanyDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const serviceType = req.query.serviceType || 'BANK_VERIFICATION';
    const details = await VerificationCreditService.getCompanyDetails(id, serviceType);
    res.json(details);
  } catch (err) {
    console.error('getCompanyDetails error:', err);
    res.status(err.message === 'Company not found' ? 404 : 500).json({ error: err.message || 'Failed to retrieve company details.' });
  }
};

exports.allocateCredits = async (req, res) => {
  try {
    const { companyId, action, credits, expiryDate, remarks, provider, serviceType } = req.body;
    if (!companyId) return res.status(400).json({ error: 'companyId is required.' });

    const result = await VerificationCreditService.allocateCredits({
      companyId,
      action: action || 'ALLOCATE',
      credits: parseInt(credits, 10) || 0,
      expiryDate,
      remarks,
      createdBy: req.user?.name || req.user?.email || 'Super Admin',
      provider,
      serviceType
    });

    res.json(result);
  } catch (err) {
    console.error('allocateCredits error:', err);
    res.status(400).json({ error: err.message || 'Failed to allocate credits.' });
  }
};

exports.suspendResumeCompany = async (req, res) => {
  try {
    const { companyId, status, serviceType } = req.body;
    if (!companyId) return res.status(400).json({ error: 'companyId is required.' });

    const result = await VerificationCreditService.suspendResumeCompany(companyId, status, serviceType);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('suspendResumeCompany error:', err);
    res.status(400).json({ error: err.message || 'Failed to update company status.' });
  }
};

/**
 * GET /super-admin/verification-credits/transactions
 *
 * Server-side paginated by getLedger(); the ledger is append-only, so only the
 * requested page is read. `pageSize` is the preferred spelling, `limit` is kept
 * for existing callers — both mean the same thing.
 */
exports.getGlobalLedger = async (req, res) => {
  try {
    const ledger = await VerificationCreditService.getLedger({
      companyId: req.query.companyId,
      serviceType: req.query.serviceType,
      transactionType: req.query.transactionType,
      createdBy: req.query.createdBy,
      search: req.query.search,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      page: req.query.page || 1,
      limit: req.query.pageSize || req.query.limit || 20
    });
    res.json(ledger);
  } catch (err) {
    console.error('getGlobalLedger error:', err);
    res.status(500).json({ error: err.message || 'Failed to retrieve global transaction ledger.' });
  }
};

/**
 * GET /super-admin/verification-credits/audit-logs
 *
 * Server-side paginated. This table is append-only and grows with every
 * verification attempt on the platform, so only the requested page is read —
 * the count and the rows come from two indexed queries, never from loading the
 * table and slicing it.
 *
 * Ordering is `id desc` (newest first) and is not client-controllable: a stable
 * order is what makes page boundaries meaningful.
 */
exports.getGlobalAuditLogs = async (req, res) => {
  try {
    const where = {};
    if (req.query.companyId) where.companyId = parseInt(req.query.companyId, 10);
    if (req.query.status && req.query.status !== 'All') where.status = req.query.status;
    // "Verification Type" — API Verification / Manual on the audit row.
    if (req.query.verificationMode && req.query.verificationMode !== 'All') {
      where.verificationMode = req.query.verificationMode;
    }
    if (req.query.provider && req.query.provider !== 'All') where.provider = req.query.provider;
    // "User" — who triggered the verification.
    if (req.query.verifiedByName) where.verifiedByName = req.query.verifiedByName;
    if (req.query.startDate || req.query.endDate) {
      where.requestTime = {};
      if (req.query.startDate) where.requestTime.gte = new Date(req.query.startDate);
      if (req.query.endDate) where.requestTime.lte = new Date(req.query.endDate);
    }
    const term = String(req.query.search || '').trim();
    if (term) {
      where.OR = [
        { employeeName: { contains: term } },
        { employeeCode: { contains: term } },
        { referenceId: { contains: term } },
        { ifsc: { contains: term } },
        { accountNumberMasked: { contains: term } },
        { verifiedByName: { contains: term } },
        { branchName: { contains: term } }
      ];
    }

    const { page, take, skip } = pageWindow(req.query.page, req.query.pageSize || req.query.limit, 20);

    const [total, logs] = await Promise.all([
      prisma.bankVerificationAuditLog.count({ where }),
      prisma.bankVerificationAuditLog.findMany({
        where,
        orderBy: { id: 'desc' },
        skip,
        take
      })
    ]);

    // Enrich with company names — only for the companies on THIS page.
    const companyIds = [...new Set(logs.map(l => l.companyId))];
    const companies = await prisma.company.findMany({
      where: { id: { in: companyIds } },
      select: { id: true, name: true }
    }).catch(() => []);
    const compMap = new Map(companies.map(c => [c.id, c.name]));

    const enriched = logs.map(l => ({
      ...l,
      companyName: compMap.get(l.companyId) || `Company #${l.companyId}`
    }));

    res.json({ ...pageMeta(total, page, take), records: enriched });
  } catch (err) {
    console.error('getGlobalAuditLogs error:', err);
    res.status(500).json({ error: err.message || 'Failed to retrieve global audit logs.' });
  }
};

exports.getReports = async (req, res) => {
  try {
    const report = await VerificationCreditService.getUsageReports({
      timeframe: req.query.timeframe || 'monthly',
      groupBy: req.query.groupBy || 'company',
      serviceType: req.query.serviceType,
      startDate: req.query.startDate,
      endDate: req.query.endDate
    });
    res.json(report);
  } catch (err) {
    console.error('getReports error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate verification reports.' });
  }
};

exports.exportReports = async (req, res) => {
  try {
    const groupBy = req.query.groupBy || 'company';
    const report = await VerificationCreditService.getUsageReports({
      timeframe: req.query.timeframe || 'monthly',
      groupBy,
      serviceType: req.query.serviceType,
      startDate: req.query.startDate,
      endDate: req.query.endDate
    });

    if (req.query.format === 'json') {
      return res.json(report);
    }

    // Build CSV string
    let csv = '';
    if (groupBy === 'employee') {
      csv = 'Employee / User,Company ID,Company Name,Verifications Executed,Credits Consumed\n';
      report.forEach(row => {
        csv += `"${row.employeeName}",${row.companyId},"${row.companyName}",${row.verifications},${row.creditsConsumed}\n`;
      });
    } else {
      csv = 'Company ID,Company Name,Plan,Allocated Credits,Credits Consumed,Total Verifications,Successful Verifications,Failed Verifications,Success Rate (%),Estimated Revenue (INR)\n';
      report.forEach(row => {
        csv += `${row.companyId},"${row.companyName}","${row.plan}",${row.allocatedCredits},${row.creditsConsumed},${row.verificationsTotal},${row.verificationsSuccess},${row.verificationsFailed},${row.successRate},${row.revenue}\n`;
      });
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=verification_report_${groupBy}_${Date.now()}.csv`);
    res.send(csv);
  } catch (err) {
    console.error('exportReports error:', err);
    res.status(500).json({ error: err.message || 'Failed to export verification report.' });
  }
};
