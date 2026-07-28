/**
 * verificationCreditService.js
 * 
 * Enterprise-grade multi-tenant credit wallet management for bank verification and future document verification.
 * Guarantees atomic balance adjustments via interactive Prisma transactions ($transaction).
 */

const prisma = require('../config/prisma');
// Owns the platform-level provider/environment resolution (no cycle: that module
// does not require this one).
const BankVerificationService = require('./bankVerificationService');

// Price of ONE verification, in wallet currency (₹). Used only when a tenant has
// no configured price yet — the live price always comes from
// verification_settings.costPerVerification for that tenant.
const FALLBACK_COST_PER_VERIFICATION = 4;

// Free credits granted to a tenant on first use: 8 = 2 free verifications at ₹4.
const FREE_STARTER_CREDITS = 8;

// Modes that mean "use the verification API" (several spellings exist in data).
const API_MODES = ['API', 'API Verification', 'Fetch by API'];
const isApiMode = (mode) => API_MODES.includes(mode);

class VerificationCreditService {
  /**
   * The tenant's price per verification. Never hardcoded at a call site: every
   * balance check, gate, and ledger entry reads this one value so the price the
   * UI shows is exactly the price that gets debited.
   */
  static costOf(settings) {
    const raw = parseInt(settings?.costPerVerification, 10);
    return Number.isFinite(raw) && raw > 0 ? raw : FALLBACK_COST_PER_VERIFICATION;
  }

  /**
   * Generate stable unique ledger transaction ID
   */
  static generateTxId() {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `TX-CR-${dateStr}-${Date.now().toString().slice(-4)}${rand}`;
  }

  /**
   * Get or initialize credit wallet for a tenant
   */
  static async getWallet(companyId, serviceType = 'BANK_VERIFICATION') {
    const cid = parseInt(companyId, 10);
    if (!cid) throw new Error('Valid companyId is required.');

    let wallet = await prisma.verificationCreditWallet.findUnique({
      where: {
        companyId_serviceType: {
          companyId: cid,
          serviceType: serviceType || 'BANK_VERIFICATION'
        }
      }
    });

    if (!wallet) {
      wallet = await prisma.verificationCreditWallet.create({
        data: {
          companyId: cid,
          serviceType: serviceType || 'BANK_VERIFICATION',
          totalCredits: FREE_STARTER_CREDITS,
          usedCredits: 0,
          remainingCredits: FREE_STARTER_CREDITS,
          expiredCredits: 0,
          status: 'Active'
        }
      });
    }

    return wallet;
  }

  /**
   * Get tenant verification settings (mode, provider, connection status)
   */
  static async getSettings(companyId) {
    const cid = parseInt(companyId, 10);
    if (!cid) throw new Error('Valid companyId is required.');

    let settings = await prisma.verificationSettings.findUnique({
      where: { companyId: cid }
    });

    if (!settings) {
      // Check existing BYO API settings for backwards compatibility
      const byo = await prisma.companyBankVerificationSettings.findUnique({
        where: { companyId: cid }
      }).catch(() => null);

      settings = await prisma.verificationSettings.create({
        data: {
          companyId: cid,
          verificationMode: byo?.verificationMode || 'Manual',
          provider: byo?.provider || 'Cashfree Sandbox API',
          status: 'Connected',
          costPerVerification: FALLBACK_COST_PER_VERIFICATION
        }
      });
    }

    return settings;
  }

  /**
   * Save or update tenant verification settings
   */
  static async saveSettings(companyId, data = {}) {
    const cid = parseInt(companyId, 10);
    if (!cid) throw new Error('Valid companyId is required.');

    const settings = await prisma.verificationSettings.upsert({
      where: { companyId: cid },
      update: {
        verificationMode: data.verificationMode || undefined,
        provider: data.provider || undefined,
        status: data.status || undefined,
        costPerVerification: data.costPerVerification !== undefined ? parseInt(data.costPerVerification, 10) : undefined
      },
      create: {
        companyId: cid,
        verificationMode: data.verificationMode || 'Manual',
        provider: data.provider || 'ZeniaHR Verification Gateway',
        status: data.status || 'Connected',
        // A tenant created without an explicit price is priced like every other
        // tenant; it must never disagree with what the debit actually charges.
        costPerVerification: data.costPerVerification !== undefined ? parseInt(data.costPerVerification, 10) : FALLBACK_COST_PER_VERIFICATION
      }
    });

    // Sync BYO API settings table if applicable
    await prisma.companyBankVerificationSettings.upsert({
      where: { companyId: cid },
      update: {
        verificationMode: settings.verificationMode,
        provider: settings.provider,
        isEnabled: isApiMode(settings.verificationMode)
      },
      create: {
        companyId: cid,
        verificationMode: settings.verificationMode,
        provider: settings.provider,
        isEnabled: isApiMode(settings.verificationMode),
        environment: 'Sandbox'
      }
    }).catch(() => {});

    return settings;
  }

  /**
   * Check remaining credits and availability status for verification.
   *
   * A verification costs `costPerVerification`, so the balance gate is
   * `remaining >= cost` — NOT `remaining > 0`. Testing against 0 let a wallet
   * holding less than one verification's worth (e.g. ₹2 of a ₹4 charge) pass the
   * gate, call the provider, and then fail the debit: a billable verification
   * nobody was charged for.
   *
   * Each blocking condition reports its own code so the UI can say what is
   * actually wrong instead of labelling everything "balance exhausted".
   */
  static async checkCredits(companyId, serviceType = 'BANK_VERIFICATION') {
    const cid = parseInt(companyId, 10);
    const wallet = await this.getWallet(cid, serviceType);
    const settings = await this.getSettings(cid);

    // Provider/environment come from the BYO API config when present, with the
    // PLATFORM configuration applied over it — so the screen names the gateway
    // that verification will actually call, not a stale row default.
    const byoRow = await prisma.companyBankVerificationSettings.findUnique({
      where: { companyId: cid }
    }).catch(() => null);
    const byo = byoRow ? BankVerificationService.applyGlobalProviderConfig(byoRow) : null;

    const cost = VerificationCreditService.costOf(settings);
    const remaining = wallet.remainingCredits || 0;
    const remainingVerifications = Math.floor(remaining / cost);

    const apiMode = isApiMode(settings.verificationMode);
    const isSuspended = wallet.status === 'Suspended' || settings.status === 'Suspended';
    const hasBalance = remaining >= cost;

    let code = 'OK';
    let reason = 'OK';
    if (!apiMode) {
      code = 'MANUAL_MODE';
      reason = 'Automated verification is turned off for this workspace (Settings → Bank Verification).';
    } else if (isSuspended) {
      code = 'SUSPENDED';
      reason = 'Verification API is suspended for this workspace. Please contact support.';
    } else if (!hasBalance) {
      code = 'INSUFFICIENT_CREDITS';
      reason = `Verification balance is ₹${remaining}, which is below the ₹${cost} charged per verification. Please recharge the wallet.`;
    }

    return {
      companyId: cid,
      serviceType: wallet.serviceType,
      remainingCredits: remaining,
      totalCredits: wallet.totalCredits,
      usedCredits: wallet.usedCredits,
      expiryDate: wallet.expiryDate,
      walletStatus: wallet.status,
      provider: byo?.provider || settings.provider,
      environment: byo?.environment || null,
      status: settings.status,
      costPerVerification: cost,
      remainingVerifications,
      verificationMode: settings.verificationMode,
      isAvailable: code === 'OK',
      unavailableCode: code === 'OK' ? null : code,
      reason
    };
  }

  /**
   * Deduct one verification's cost upon SUCCESSFUL verification, inside an atomic
   * transaction. If verification fails or is incomplete, this is NEVER called.
   */
  static async deductCreditOnSuccess({
    companyId,
    employeeId = null,
    verificationId = null,
    provider = 'ZeniaHR Verification Gateway',
    referenceId = null,
    verifiedBy = 'System',
    serviceType = 'BANK_VERIFICATION',
    remarks = 'Bank Account Verification Fee'
  }) {
    const cid = parseInt(companyId, 10);
    if (!cid) throw new Error('Valid companyId is required.');

    // The price is the tenant's configured price — the same value checkCredits
    // gated on and the UI displayed. Read outside the transaction so the debit
    // itself stays a single conditional write.
    const settings = await this.getSettings(cid);
    const cost = VerificationCreditService.costOf(settings);

    return await prisma.$transaction(async (tx) => {
      // 1. Retrieve current wallet
      const wallet = await tx.verificationCreditWallet.findUnique({
        where: {
          companyId_serviceType: {
            companyId: cid,
            serviceType: serviceType || 'BANK_VERIFICATION'
          }
        }
      });

      if (!wallet || wallet.remainingCredits < cost) {
        throw new Error(`Verification balance is below the ₹${cost} charged per verification.`);
      }

      if (wallet.status === 'Suspended') {
        throw new Error('Verification API is currently suspended for this company. Please contact support.');
      }

      const openingBalance = wallet.remainingCredits;
      const closingBalance = openingBalance - cost;

      // 2. Debit the wallet with the balance re-asserted in the WHERE clause, so
      //    two verifications racing on the same wallet can never both succeed on
      //    funds only one of them had.
      const debited = await tx.verificationCreditWallet.updateMany({
        where: { id: wallet.id, remainingCredits: { gte: cost } },
        data: {
          remainingCredits: closingBalance,
          usedCredits: wallet.usedCredits + cost,
          // "Exhausted" means the wallet can no longer fund a verification, not
          // merely that it hit exactly zero.
          status: closingBalance < cost ? 'Exhausted' : wallet.status
        }
      });

      if (debited.count !== 1) {
        throw new Error('Verification balance changed during this verification. Please retry.');
      }

      const updatedWallet = await tx.verificationCreditWallet.findUnique({ where: { id: wallet.id } });

      // 3. Create immutable transaction ledger record
      const txRecord = await tx.verificationCreditTransaction.create({
        data: {
          transactionId: VerificationCreditService.generateTxId(),
          companyId: cid,
          employeeId: employeeId ? parseInt(employeeId, 10) : null,
          verificationId: verificationId ? String(verificationId) : null,
          serviceType: serviceType || 'BANK_VERIFICATION',
          transactionType: 'Debit',
          credits: cost,
          openingBalance,
          closingBalance,
          provider: provider || 'ZeniaHR Verification Gateway',
          referenceId: referenceId ? String(referenceId) : null,
          remarks: remarks || 'Bank Account Verification Fee',
          verifiedBy: String(verifiedBy || 'System')
        }
      });

      // 4. Running out of balance must NEVER rewrite the tenant's configuration.
      //    This previously forced verificationMode to 'Manual' and status to
      //    'Disconnected'; recharging restored the balance but not the mode, so a
      //    funded wallet stayed permanently locked out of API verification and
      //    every attempt came back "credits exhausted". The balance check alone
      //    gates API use, and it recovers on its own the moment credits arrive.

      return {
        success: true,
        wallet: updatedWallet,
        transaction: txRecord,
        costPerVerification: cost,
        remainingCredits: closingBalance,
        remainingVerifications: Math.floor(closingBalance / cost),
        lowCreditAlert: closingBalance >= cost && closingBalance < cost * 5,
        exhaustedAlert: closingBalance < cost
      };
    });
  }

  /**
   * Super Admin operation: Allocate, Add, Deduct, or Reset verification credits.
   * Executes inside an atomic Prisma transaction and logs a ledger entry.
   */
  static async allocateCredits({
    companyId,
    action = 'ALLOCATE', // ALLOCATE / ADD / DEDUCT / RESET
    credits = 0,
    expiryDate = null,
    remarks = '',
    createdBy = 'Super Admin',
    provider = 'ZeniaHR Verification Gateway',
    serviceType = 'BANK_VERIFICATION'
  }) {
    const cid = parseInt(companyId, 10);
    const amount = parseInt(credits, 10) || 0;
    if (!cid) throw new Error('Valid companyId is required.');
    if (amount < 0) throw new Error('Credits amount must be non-negative.');

    const settings = await this.getSettings(cid);
    const cost = VerificationCreditService.costOf(settings);

    return await prisma.$transaction(async (tx) => {
      let wallet = await tx.verificationCreditWallet.findUnique({
        where: {
          companyId_serviceType: {
            companyId: cid,
            serviceType: serviceType || 'BANK_VERIFICATION'
          }
        }
      });

      if (!wallet) {
        wallet = await tx.verificationCreditWallet.create({
          data: {
            companyId: cid,
            serviceType: serviceType || 'BANK_VERIFICATION',
            totalCredits: 0,
            usedCredits: 0,
            remainingCredits: 0,
            expiredCredits: 0,
            status: 'Active'
          }
        });
      }

      const openingBalance = wallet.remainingCredits;
      let closingBalance = openingBalance;
      let newTotal = wallet.totalCredits;
      let newUsed = wallet.usedCredits;
      let txType = 'Allocation';

      const act = String(action).toUpperCase();
      if (act === 'ALLOCATE' || act === 'ADD') {
        closingBalance = openingBalance + amount;
        newTotal = wallet.totalCredits + amount;
        txType = act === 'ALLOCATE' ? 'Allocation' : 'Addition';
      } else if (act === 'DEDUCT') {
        closingBalance = Math.max(0, openingBalance - amount);
        txType = 'Deduction';
      } else if (act === 'RESET') {
        closingBalance = amount;
        newTotal = amount;
        newUsed = 0;
        txType = 'Reset';
      } else {
        throw new Error(`Unsupported allocation action: ${action}`);
      }

      const updatedWallet = await tx.verificationCreditWallet.update({
        where: { id: wallet.id },
        data: {
          totalCredits: newTotal,
          usedCredits: newUsed,
          remainingCredits: closingBalance,
          expiryDate: expiryDate ? new Date(expiryDate) : wallet.expiryDate,
          // A wallet is usable once it can fund at least one verification.
          // A Suspended wallet stays suspended — money does not lift a block a
          // Super Admin put there deliberately.
          status: wallet.status === 'Suspended'
            ? 'Suspended'
            : (closingBalance >= cost ? 'Active' : 'Exhausted')
        }
      });

      // A recharge clears a connection that was dropped for lack of funds, but
      // never overrides a deliberate suspension.
      if (closingBalance >= cost) {
        await tx.verificationSettings.updateMany({
          where: { companyId: cid, status: 'Disconnected' },
          data: { status: 'Connected' }
        });
      }

      const txRecord = await tx.verificationCreditTransaction.create({
        data: {
          transactionId: VerificationCreditService.generateTxId(),
          companyId: cid,
          serviceType: serviceType || 'BANK_VERIFICATION',
          transactionType: txType,
          credits: amount,
          openingBalance,
          closingBalance,
          provider: provider || 'ZeniaHR Verification Gateway',
          remarks: remarks || `Super Admin ${txType}: ${amount} credits`,
          createdBy: String(createdBy || 'Super Admin')
        }
      });

      return {
        success: true,
        wallet: updatedWallet,
        transaction: txRecord
      };
    });
  }

  /**
   * Super Admin operation: Suspend or Resume API verification for a company
   */
  static async suspendResumeCompany(companyId, status = 'Active', serviceType = 'BANK_VERIFICATION') {
    const cid = parseInt(companyId, 10);
    if (!cid) throw new Error('Valid companyId is required.');

    const isSuspended = status === 'Suspended' || status === 'Disconnected';
    const walletStatus = isSuspended ? 'Suspended' : 'Active';
    const settingsStatus = isSuspended ? 'Suspended' : 'Connected';

    await prisma.verificationCreditWallet.updateMany({
      where: { companyId: cid, serviceType: serviceType || 'BANK_VERIFICATION' },
      data: { status: walletStatus }
    });

    const settings = await prisma.verificationSettings.upsert({
      where: { companyId: cid },
      update: { status: settingsStatus },
      create: { companyId: cid, status: settingsStatus, verificationMode: 'Manual', provider: 'ZeniaHR Verification Gateway' }
    });

    return { companyId: cid, status: walletStatus, settingsStatus };
  }

  /**
   * Request verification credits (creates notification & ledger request entry for Super Admin review)
   */
  static async requestCredits({ companyId, credits = 50, remarks = '', requestedBy = 'Company Head' }) {
    const cid = parseInt(companyId, 10);
    if (!cid) throw new Error('Valid companyId is required.');
    const requestedAmount = parseInt(credits, 10) || 50;

    await prisma.notification.create({
      data: {
        companyId: cid,
        type: 'CREDIT_REQUEST',
        title: 'Verification Credits Requested',
        message: `Company #${cid} requested ${requestedAmount} verification tokens. Remarks: ${remarks || 'None'}`,
        timestamp: new Date().toISOString(),
        priority: 'high'
      }
    }).catch(() => {});

    await prisma.verificationCreditTransaction.create({
      data: {
        transactionId: VerificationCreditService.generateTxId(),
        companyId: cid,
        serviceType: 'BANK_VERIFICATION',
        transactionType: 'Request',
        credits: requestedAmount,
        openingBalance: 0,
        closingBalance: 0,
        provider: 'ZeniaHR Verification Gateway',
        remarks: remarks || `Credit request for ${requestedAmount} tokens by ${requestedBy}`,
        createdBy: String(requestedBy)
      }
    }).catch(() => {});

    return {
      success: true,
      companyId: cid,
      requestedAmount,
      message: `Credit request for ${requestedAmount} verification tokens submitted successfully.`
    };
  }

  /**
   * Retrieve transaction ledger with filtering and pagination
   */
  static async getLedger({
    companyId = null,
    serviceType = null,
    transactionType = null,
    startDate = null,
    endDate = null,
    page = 1,
    limit = 50
  } = {}) {
    const where = {};
    if (companyId) where.companyId = parseInt(companyId, 10);
    if (serviceType && serviceType !== 'All') where.serviceType = serviceType;
    if (transactionType && transactionType !== 'All') where.transactionType = transactionType;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const skip = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);
    const take = parseInt(limit, 10) || 50;

    const [total, transactions] = await Promise.all([
      prisma.verificationCreditTransaction.count({ where }),
      prisma.verificationCreditTransaction.findMany({
        where,
        orderBy: { id: 'desc' },
        skip,
        take
      })
    ]);

    // Enrich with company names if possible
    const companyIds = [...new Set(transactions.map(t => t.companyId))];
    const companies = await prisma.company.findMany({
      where: { id: { in: companyIds } },
      select: { id: true, name: true, plan: true }
    }).catch(() => []);
    const compMap = new Map(companies.map(c => [c.id, c]));

    const enriched = transactions.map(t => ({
      ...t,
      companyName: compMap.get(t.companyId)?.name || `Company #${t.companyId}`,
      companyPlan: compMap.get(t.companyId)?.plan || 'Standard'
    }));

    return {
      total,
      page: parseInt(page, 10),
      limit: take,
      totalPages: Math.ceil(total / take),
      transactions: enriched
    };
  }

  /**
   * Super Admin Dashboard Metrics
   */
  static async getSuperAdminMetrics(serviceType = 'BANK_VERIFICATION') {
    const whereService = serviceType && serviceType !== 'All' ? { serviceType } : {};

    // 1. Total companies
    const totalCompanies = await prisma.company.count().catch(() => 0);

    // 2. Companies using API vs Manual
    const apiSettingsCount = await prisma.verificationSettings.count({
      where: { verificationMode: { in: API_MODES } }
    }).catch(() => 0);
    const companiesUsingApi = apiSettingsCount;
    const companiesUsingManual = Math.max(0, totalCompanies - companiesUsingApi);

    // 3. Credits aggregations
    const aggregations = await prisma.verificationCreditWallet.aggregate({
      where: whereService,
      _sum: {
        totalCredits: true,
        usedCredits: true,
        remainingCredits: true
      }
    }).catch(() => ({ _sum: { totalCredits: 0, usedCredits: 0, remainingCredits: 0 } }));

    const totalCreditsSold = aggregations._sum.totalCredits || 0;
    const creditsRemaining = aggregations._sum.remainingCredits || 0;
    const totalUsedCredits = aggregations._sum.usedCredits || 0;

    // 4. Credits used today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayAgg = await prisma.verificationCreditTransaction.aggregate({
      where: {
        ...whereService,
        transactionType: 'Debit',
        createdAt: { gte: todayStart }
      },
      _sum: { credits: true }
    }).catch(() => ({ _sum: { credits: 0 } }));
    const creditsUsedToday = todayAgg._sum.credits || 0;

    // 5. Revenue estimation (assuming 10 INR / credit average or cost calculation)
    const revenue = totalCreditsSold * 10; // Can be configured or derived from billing

    // 6. API Success Rate from audit logs
    const [auditTotal, auditSuccess] = await Promise.all([
      prisma.bankVerificationAuditLog.count().catch(() => 0),
      prisma.bankVerificationAuditLog.count({ where: { status: 'VERIFIED' } }).catch(() => 0)
    ]);
    const apiSuccessRate = auditTotal > 0 ? parseFloat(((auditSuccess / auditTotal) * 100).toFixed(1)) : 100.0;

    return {
      totalCompanies,
      companiesUsingApi,
      companiesUsingManual,
      totalCreditsSold,
      creditsRemaining,
      creditsUsedToday,
      revenue,
      apiSuccessRate,
      totalVerifications: auditTotal,
      successfulVerifications: auditSuccess
    };
  }

  /**
   * Super Admin Companies List with usage stats & status badge calculation
   */
  static async getCompanyList(serviceType = 'BANK_VERIFICATION') {
    const [companies, wallets, settings, byoSettings] = await Promise.all([
      prisma.company.findMany({
        select: { id: true, name: true, plan: true, status: true, companyCode: true, gstNumber: true, registrationNumber: true },
        orderBy: { id: 'asc' }
      }),
      prisma.verificationCreditWallet.findMany({
        where: { serviceType }
      }).catch(() => []),
      prisma.verificationSettings.findMany().catch(() => []),
      prisma.companyBankVerificationSettings.findMany().catch(() => [])
    ]);

    const walletMap = new Map(wallets.map(w => [w.companyId, w]));
    const settingsMap = new Map(settings.map(s => [s.companyId, s]));
    const byoMap = new Map(byoSettings.map(b => [b.companyId, b]));

    return companies.map(comp => {
      const w = walletMap.get(comp.id) || { totalCredits: 0, usedCredits: 0, remainingCredits: 0, expiryDate: null, status: 'Active' };
      const s = settingsMap.get(comp.id) || {};
      const b = byoMap.get(comp.id) || {};

      const mode = s.verificationMode || b.verificationMode || 'Manual';
      const prov = s.provider || b.provider || 'ZeniaHR Verification Gateway';
      const cost = VerificationCreditService.costOf(s);
      // Exhausted = cannot fund one more verification (not merely "zero left").
      const stat = w.status === 'Suspended' ? 'Suspended' : s.status === 'Suspended' ? 'Suspended' : w.remainingCredits < cost ? 'Exhausted' : 'Active';

      return {
        companyId: comp.id,
        companyName: comp.name,
        companyCode: comp.companyCode || '',
        gstNumber: comp.gstNumber || '',
        registrationNumber: comp.registrationNumber || '',
        plan: comp.plan || 'Standard',
        provider: prov,
        verificationMode: mode,
        allocatedCredits: w.totalCredits,
        usedCredits: w.usedCredits,
        remainingCredits: w.remainingCredits,
        remainingVerifications: Math.floor((w.remainingCredits || 0) / cost),
        expiryDate: w.expiryDate,
        status: stat,
        costPerVerification: cost
      };
    });
  }

  /**
   * Fetch live instant balance and credit wallet details for a single company by ID
   */
  static async getCompanyDetails(companyId, serviceType = 'BANK_VERIFICATION') {
    const compId = parseInt(companyId, 10);
    if (!compId || isNaN(compId)) throw new Error('Invalid companyId');

    const [comp, w, s, b] = await Promise.all([
      prisma.company.findUnique({
        where: { id: compId },
        select: { id: true, name: true, plan: true, status: true, companyCode: true, gstNumber: true, registrationNumber: true }
      }),
      prisma.verificationCreditWallet.findFirst({
        where: { companyId: compId, serviceType }
      }).catch(() => null),
      prisma.verificationSettings.findFirst({
        where: { companyId: compId }
      }).catch(() => null),
      prisma.companyBankVerificationSettings.findFirst({
        where: { companyId: compId }
      }).catch(() => null)
    ]);

    if (!comp) throw new Error('Company not found');

    const wallet = w || { totalCredits: 0, usedCredits: 0, remainingCredits: 0, expiryDate: null, status: 'Active' };
    const mode = (s && s.verificationMode) || (b && b.verificationMode) || 'Manual';
    const prov = (s && s.provider) || (b && b.provider) || 'ZeniaHR Verification Gateway';
    const cost = VerificationCreditService.costOf(s);
    const stat = wallet.status === 'Suspended' ? 'Suspended' : (s && s.status === 'Suspended') ? 'Suspended' : wallet.remainingCredits < cost ? 'Exhausted' : 'Active';

    return {
      companyId: comp.id,
      companyName: comp.name,
      companyCode: comp.companyCode || '',
      gstNumber: comp.gstNumber || '',
      registrationNumber: comp.registrationNumber || '',
      plan: comp.plan || 'Standard',
      provider: prov,
      verificationMode: mode,
      allocatedCredits: wallet.totalCredits || 0,
      usedCredits: wallet.usedCredits || 0,
      remainingCredits: wallet.remainingCredits || 0,
      remainingVerifications: Math.floor((wallet.remainingCredits || 0) / cost),
      expiryDate: wallet.expiryDate,
      status: stat,
      costPerVerification: cost
    };
  }

  /**
   * Super Admin Usage Reports (Company-wise and Employee-wise)
   */
  static async getUsageReports({ timeframe = 'monthly', groupBy = 'company', serviceType = null, startDate = null, endDate = null } = {}) {
    const where = {};
    if (serviceType && serviceType !== 'All') where.serviceType = serviceType;

    const now = new Date();
    let start = startDate ? new Date(startDate) : new Date();
    if (!startDate) {
      if (timeframe === 'daily') start.setDate(now.getDate() - 1);
      else if (timeframe === 'weekly') start.setDate(now.getDate() - 7);
      else start.setMonth(now.getMonth() - 1); // default monthly
    }
    where.createdAt = { gte: start };
    if (endDate) where.createdAt.lte = new Date(endDate);

    const [transactions, audits, companies] = await Promise.all([
      prisma.verificationCreditTransaction.findMany({ where }),
      prisma.bankVerificationAuditLog.findMany({
        where: { requestTime: { gte: start, lte: endDate ? new Date(endDate) : now } }
      }).catch(() => []),
      prisma.company.findMany({ select: { id: true, name: true, plan: true } }).catch(() => [])
    ]);

    const compMap = new Map(companies.map(c => [c.id, c]));

    if (groupBy === 'employee') {
      // Group by employee
      const empMap = new Map();
      for (const tx of transactions) {
        if (tx.transactionType !== 'Debit') continue;
        const key = tx.verifiedBy || `Emp #${tx.employeeId || 'Unknown'}`;
        if (!empMap.has(key)) {
          empMap.set(key, {
            employeeName: key,
            companyId: tx.companyId,
            companyName: compMap.get(tx.companyId)?.name || `Company #${tx.companyId}`,
            creditsConsumed: 0,
            verifications: 0
          });
        }
        const item = empMap.get(key);
        item.creditsConsumed += tx.credits;
        item.verifications += 1;
      }
      return Array.from(empMap.values()).sort((a, b) => b.creditsConsumed - a.creditsConsumed);
    }

    // Default Group by company
    const reportMap = new Map();
    for (const comp of companies) {
      reportMap.set(comp.id, {
        companyId: comp.id,
        companyName: comp.name,
        plan: comp.plan || 'Standard',
        allocatedCredits: 0,
        creditsConsumed: 0,
        verificationsTotal: 0,
        verificationsSuccess: 0,
        verificationsFailed: 0,
        successRate: 100.0,
        revenue: 0
      });
    }

    for (const tx of transactions) {
      if (!reportMap.has(tx.companyId)) {
        reportMap.set(tx.companyId, {
          companyId: tx.companyId,
          companyName: `Company #${tx.companyId}`,
          plan: 'Standard',
          allocatedCredits: 0,
          creditsConsumed: 0,
          verificationsTotal: 0,
          verificationsSuccess: 0,
          verificationsFailed: 0,
          successRate: 100.0,
          revenue: 0
        });
      }
      const item = reportMap.get(tx.companyId);
      if (['Allocation', 'Addition', 'Reset'].includes(tx.transactionType)) {
        item.allocatedCredits += tx.credits;
      } else if (tx.transactionType === 'Debit') {
        item.creditsConsumed += tx.credits;
        item.revenue += tx.credits * 10; // estimated revenue
      }
    }

    for (const log of audits) {
      if (!reportMap.has(log.companyId)) continue;
      const item = reportMap.get(log.companyId);
      item.verificationsTotal += 1;
      if (log.status === 'VERIFIED') item.verificationsSuccess += 1;
      else item.verificationsFailed += 1;
    }

    for (const item of reportMap.values()) {
      if (item.verificationsTotal > 0) {
        item.successRate = parseFloat(((item.verificationsSuccess / item.verificationsTotal) * 100).toFixed(1));
      }
    }

    return Array.from(reportMap.values()).sort((a, b) => b.creditsConsumed - a.creditsConsumed);
  }
}

module.exports = VerificationCreditService;
