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
// Shared page-window + metadata contract (utils/pagination.js) — the same helper
// the audit-log endpoint uses, so both lists page identically.
const { pageWindow, pageMeta } = require('../utils/pagination');

/**
 * ONE verification credit buys exactly ONE successful API verification.
 *
 * This is the whole pricing model, and it is deliberately a constant rather than
 * tenant configuration: there is no per-tenant cost, no conversion, and nothing
 * anywhere in this module divides credits by anything. `remaining` IS the number
 * of verifications left.
 *
 * The `verification_settings.costPerVerification` column still exists so no
 * historical row is destroyed, but the verification flow no longer reads it.
 * The value is still echoed back in API payloads (always 1) so existing clients
 * keep parsing the same shape.
 */
const CREDITS_PER_VERIFICATION = 1;

// Verification credits granted to a tenant on first use — with 1 credit = 1
// verification this is 8 free verifications.
const FREE_STARTER_CREDITS = 8;

// Modes that mean "use the verification API" (several spellings exist in data).
const API_MODES = ['API', 'API Verification', 'Fetch by API'];
const isApiMode = (mode) => API_MODES.includes(mode);

class VerificationCreditService {
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
          // Provider label follows the PLATFORM configuration (Production when
          // CASHFREE_PROD_* credentials are set) — never a hardcoded sandbox tag.
          provider: byo?.provider || BankVerificationService.globalProviderConfig().provider || 'Cashfree',
          status: 'Connected',
          // Persisted for schema compatibility only — 1 credit = 1 verification.
          costPerVerification: CREDITS_PER_VERIFICATION
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
        // Deliberately NOT writable from a caller any more. A per-tenant cost
        // would reintroduce the credits ÷ cost conversion; every tenant is
        // 1 credit = 1 verification.
        costPerVerification: CREDITS_PER_VERIFICATION
      },
      create: {
        companyId: cid,
        verificationMode: data.verificationMode || 'Manual',
        provider: data.provider || 'ZeniaHR Verification Gateway',
        status: data.status || 'Connected',
        costPerVerification: CREDITS_PER_VERIFICATION
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
        // Environment follows where the platform credentials actually live
        // (Production when CASHFREE_PROD_* is configured), not a sandbox default.
        environment: BankVerificationService.globalProviderConfig().environment || 'Sandbox'
      }
    }).catch(() => {});

    return settings;
  }

  /**
   * Check remaining credits and availability status for verification.
   *
   * One verification consumes exactly one credit, so `remainingCredits` IS the
   * number of verifications left — there is no conversion and nothing to divide.
   * The gate is simply `remaining >= 1`.
   *
   * Each blocking condition reports its own code so the UI can say what is
   * actually wrong instead of labelling everything "credits exhausted".
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

    const remaining = wallet.remainingCredits || 0;
    // 1 credit = 1 verification, so these are the same number. `remainingVerifications`
    // is still returned for API compatibility; it is not a separate quantity.
    const remainingVerifications = remaining;

    const apiMode = isApiMode(settings.verificationMode);
    const isSuspended = wallet.status === 'Suspended' || settings.status === 'Suspended';
    const hasCredits = remaining >= CREDITS_PER_VERIFICATION;

    let code = 'OK';
    let reason = 'OK';
    if (!apiMode) {
      code = 'MANUAL_MODE';
      reason = 'Automated verification is turned off for this workspace (Settings → Bank Verification).';
    } else if (isSuspended) {
      code = 'SUSPENDED';
      reason = 'Verification API is suspended for this workspace. Please contact support.';
    } else if (!hasCredits) {
      code = 'INSUFFICIENT_CREDITS';
      reason = 'No verification credits remaining. Please ask your administrator to add verification credits.';
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
      costPerVerification: CREDITS_PER_VERIFICATION,
      remainingVerifications,
      verificationMode: settings.verificationMode,
      isAvailable: code === 'OK',
      unavailableCode: code === 'OK' ? null : code,
      reason
    };
  }

  /**
   * Deduct EXACTLY ONE verification credit upon SUCCESSFUL verification, inside
   * an atomic transaction. If verification fails or is incomplete, this is NEVER
   * called.
   *
   * The amount is the constant 1 — not a parameter, not tenant configuration —
   * so no call site can ever deduct more than one credit for one verification.
   * The conditional write below (`remainingCredits: { gte: 1 }` matched against
   * exactly one row) is what stops a double deduction under concurrency.
   */
  static async deductCreditOnSuccess({
    companyId,
    employeeId = null,
    verificationId = null,
    provider = 'ZeniaHR Verification Gateway',
    referenceId = null,
    verifiedBy = 'System',
    serviceType = 'BANK_VERIFICATION',
    remarks = 'Bank Account Verification'
  }) {
    const cid = parseInt(companyId, 10);
    if (!cid) throw new Error('Valid companyId is required.');

    // One verification, one credit. Always.
    const cost = CREDITS_PER_VERIFICATION;

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
        throw new Error('No verification credits remaining.');
      }

      if (wallet.status === 'Suspended') {
        throw new Error('Verification API is currently suspended for this company. Please contact support.');
      }

      // 2. Deduct the single credit as a RELATIVE decrement guarded on there
      //    still being one to take.
      //
      //    This must not be an absolute write. Computing `remaining - 1` from the
      //    row read above and storing that value loses updates under concurrency:
      //    several verifications read the same figure, all compute the same
      //    result, and all store it — so N verifications consumed one credit
      //    between them. `{ decrement }` makes the database do the arithmetic on
      //    the currently committed row, and because the UPDATE takes a row lock,
      //    racing transactions queue and re-evaluate the guard against the value
      //    their predecessor actually committed.
      const debited = await tx.verificationCreditWallet.updateMany({
        where: { id: wallet.id, remainingCredits: { gte: cost } },
        data: {
          remainingCredits: { decrement: cost },
          usedCredits: { increment: cost }
        }
      });

      if (debited.count !== 1) {
        throw new Error('No verification credits remaining.');
      }

      // The authoritative figures come from the row as it now stands, never from
      // the pre-update read.
      const updatedWallet = await tx.verificationCreditWallet.findUnique({ where: { id: wallet.id } });
      const closingBalance = updatedWallet.remainingCredits;
      const openingBalance = closingBalance + cost;

      // "Exhausted" once no credit remains. Never overrides a deliberate suspension.
      if (closingBalance < CREDITS_PER_VERIFICATION && updatedWallet.status !== 'Suspended') {
        await tx.verificationCreditWallet.update({
          where: { id: wallet.id },
          data: { status: 'Exhausted' }
        });
      }

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
          remarks: remarks || 'Bank Account Verification — credit usage',
          verifiedBy: String(verifiedBy || 'System')
        }
      });

      // 4. Running out of credits must NEVER rewrite the tenant's configuration.
      //    This previously forced verificationMode to 'Manual' and status to
      //    'Disconnected'; adding credits restored the figure but not the mode, so
      //    a funded tenant stayed permanently locked out of API verification and
      //    every attempt came back "credits exhausted". The credit check alone
      //    gates API use, and it recovers on its own the moment credits arrive.

      return {
        success: true,
        wallet: updatedWallet,
        transaction: txRecord,
        costPerVerification: CREDITS_PER_VERIFICATION,
        // 1 credit = 1 verification — the same number, not a derived one.
        remainingCredits: closingBalance,
        remainingVerifications: closingBalance,
        lowCreditAlert: closingBalance >= 1 && closingBalance < 5,
        exhaustedAlert: closingBalance < CREDITS_PER_VERIFICATION
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

      // Every branch keeps the reporting identity exact:
      //     Credits Remaining = Total Credits Allocated − Credits Used
      // so the Companies table, the ledger and the usage report can never
      // disagree. n credits in means n verifications available — the amount is
      // applied verbatim, with no conversion anywhere.
      const act = String(action).toUpperCase();
      if (act === 'ALLOCATE' || act === 'ADD') {
        closingBalance = openingBalance + amount;
        newTotal = wallet.totalCredits + amount;
        txType = act === 'ALLOCATE' ? 'Allocation' : 'Addition';
      } else if (act === 'DEDUCT') {
        closingBalance = Math.max(0, openingBalance - amount);
        // Withdrawing credits lowers what was allocated by the amount actually
        // taken back (the request is floored at zero). Leaving totalCredits
        // untouched here would strand the identity above: allocated 100 − used
        // 35 would keep claiming 65 remaining after 5 were withdrawn.
        newTotal = Math.max(0, wallet.totalCredits - (openingBalance - closingBalance));
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
          // Usable as soon as at least one credit remains. A Suspended wallet
          // stays suspended — adding credits does not lift a block a Super Admin
          // put there deliberately.
          status: wallet.status === 'Suspended'
            ? 'Suspended'
            : (closingBalance >= CREDITS_PER_VERIFICATION ? 'Active' : 'Exhausted')
        }
      });

      // Adding credits clears a connection that was dropped for lack of them,
      // but never overrides a deliberate suspension.
      if (closingBalance >= CREDITS_PER_VERIFICATION) {
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
   * Self-service recharge settlement: add PURCHASED credits inside the
   * caller's already-open transaction (`tx`), so the wallet update, the ledger
   * row and the payment-order settlement flag commit or roll back together.
   *
   * Uses RELATIVE increments (never an absolute write) so a concurrent
   * verification debit between read and write cannot be lost. The ledger's
   * opening balance is derived from the authoritative post-update row.
   *
   * `referenceId` is the payment orderId — the caller guarantees single
   * invocation per order via its conditional settlement-flag update.
   */
  static async purchaseCredits(
    { companyId, credits, referenceId, remarks = '', createdBy = 'Online Recharge', provider = 'Cashfree Payment Gateway', serviceType = 'BANK_VERIFICATION' },
    tx
  ) {
    if (!tx) throw new Error('purchaseCredits must run inside a transaction.');
    const cid = parseInt(companyId, 10);
    const amount = parseInt(credits, 10) || 0;
    if (!cid) throw new Error('Valid companyId is required.');
    if (amount < 1) throw new Error('Purchased credits must be at least 1.');

    let wallet = await tx.verificationCreditWallet.findUnique({
      where: { companyId_serviceType: { companyId: cid, serviceType } }
    });
    if (!wallet) {
      wallet = await tx.verificationCreditWallet.create({
        data: { companyId: cid, serviceType, totalCredits: 0, usedCredits: 0, remainingCredits: 0, expiredCredits: 0, status: 'Active' }
      });
    }

    const updatedWallet = await tx.verificationCreditWallet.update({
      where: { id: wallet.id },
      data: {
        totalCredits: { increment: amount },
        remainingCredits: { increment: amount },
        // A purchase reactivates an Exhausted wallet but never lifts a
        // deliberate Super Admin suspension.
        ...(wallet.status !== 'Suspended' ? { status: 'Active' } : {})
      }
    });

    // Purchased credits restore a connection dropped for lack of them —
    // same rule as manual allocation.
    if (updatedWallet.status !== 'Suspended') {
      await tx.verificationSettings.updateMany({
        where: { companyId: cid, status: 'Disconnected' },
        data: { status: 'Connected' }
      });
    }

    const closingBalance = updatedWallet.remainingCredits;
    const txRecord = await tx.verificationCreditTransaction.create({
      data: {
        transactionId: VerificationCreditService.generateTxId(),
        companyId: cid,
        serviceType,
        transactionType: 'Credit', // renders as "Credits Added" in the tenant ledger
        credits: amount,
        openingBalance: closingBalance - amount,
        closingBalance,
        provider,
        referenceId: referenceId || null,
        remarks: remarks || `Online recharge: ${amount} credits`,
        createdBy: String(createdBy || 'Online Recharge')
      }
    });

    return { success: true, wallet: updatedWallet, transaction: txRecord };
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
        message: `Company #${cid} requested ${requestedAmount} verification credits. Remarks: ${remarks || 'None'}`,
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
        remarks: remarks || `Request for ${requestedAmount} verification credits by ${requestedBy}`,
        createdBy: String(requestedBy)
      }
    }).catch(() => {});

    return {
      success: true,
      companyId: cid,
      requestedAmount,
      message: `Request for ${requestedAmount} verification credits submitted successfully.`
    };
  }

  /**
   * Retrieve transaction ledger with filtering and SERVER-SIDE pagination.
   *
   * Only the requested page is ever read out of the database — the ledger is
   * append-only and grows without bound, so `findMany` is never issued without a
   * `take`. Ordering is `id desc` (newest first) and is fixed: paging must not
   * change it, or a row could appear on two pages while another is skipped.
   */
  static async getLedger({
    companyId = null,
    serviceType = null,
    transactionType = null,
    createdBy = null,
    search = null,
    startDate = null,
    endDate = null,
    page = 1,
    limit = 50
  } = {}) {
    const where = {};
    if (companyId) where.companyId = parseInt(companyId, 10);
    if (serviceType && serviceType !== 'All') where.serviceType = serviceType;
    if (transactionType && transactionType !== 'All') where.transactionType = transactionType;
    if (createdBy && createdBy !== 'All') where.createdBy = createdBy;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }
    // Free-text search across the human-readable columns of a ledger row.
    const term = String(search || '').trim();
    if (term) {
      where.OR = [
        { transactionId: { contains: term } },
        { referenceId: { contains: term } },
        { remarks: { contains: term } },
        { createdBy: { contains: term } },
        { verifiedBy: { contains: term } }
      ];
    }

    const { page: pageNo, take, skip } = pageWindow(page, limit, 50);

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

    return { ...pageMeta(total, pageNo, take), transactions: enriched };
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

    // 5. Legacy estimated-revenue figure (credits × a fixed multiplier). It is no
    //    longer rendered anywhere: verification credits are a quota of API
    //    requests, not money, so the UI shows no monetary column. The field is
    //    still returned so no API consumer breaks.
    const revenue = totalCreditsSold * 10;

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
      // Exhausted = no credits left, which is the same thing as no verifications left.
      const stat = w.status === 'Suspended' ? 'Suspended' : s.status === 'Suspended' ? 'Suspended' : w.remainingCredits < CREDITS_PER_VERIFICATION ? 'Exhausted' : 'Active';

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
        remainingVerifications: w.remainingCredits || 0,
        expiryDate: w.expiryDate,
        status: stat,
        costPerVerification: CREDITS_PER_VERIFICATION
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
    const stat = wallet.status === 'Suspended' ? 'Suspended' : (s && s.status === 'Suspended') ? 'Suspended' : wallet.remainingCredits < CREDITS_PER_VERIFICATION ? 'Exhausted' : 'Active';

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
      remainingVerifications: wallet.remainingCredits || 0,
      expiryDate: wallet.expiryDate,
      status: stat,
      costPerVerification: CREDITS_PER_VERIFICATION
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

    // Default Group by company.
    //
    // Credits added / removed / used are ledger activity WITHIN the selected
    // timeframe. Credits remaining is the company's live figure, which is a
    // lifetime position — the two are labelled distinctly in the UI so they are
    // never read as parts of one sum.
    //
    // With 1 credit = 1 verification, `creditsConsumed` and
    // `verificationsSuccess` describe the same events from two tables (ledger
    // Debit rows and VERIFIED audit rows) and should agree exactly.
    const liveWallets = await prisma.verificationCreditWallet.findMany({
      where: serviceType ? { serviceType } : undefined,
      select: { companyId: true, remainingCredits: true },
    }).catch(() => []);
    const remainingMap = new Map(liveWallets.map((w) => [w.companyId, w.remainingCredits || 0]));

    const blankRow = (companyId, companyName, plan) => ({
      companyId,
      companyName,
      plan: plan || 'Standard',
      allocatedCredits: 0,
      creditsRemoved: 0,
      creditsConsumed: 0,
      creditsRemaining: remainingMap.get(companyId) || 0,
      verificationsTotal: 0,
      verificationsSuccess: 0,
      verificationsFailed: 0,
      successRate: 100.0,
    });

    const reportMap = new Map();
    for (const comp of companies) {
      reportMap.set(comp.id, blankRow(comp.id, comp.name, comp.plan));
    }

    for (const tx of transactions) {
      if (!reportMap.has(tx.companyId)) {
        reportMap.set(tx.companyId, blankRow(tx.companyId, `Company #${tx.companyId}`, 'Standard'));
      }
      const item = reportMap.get(tx.companyId);
      if (['Allocation', 'Addition', 'Reset'].includes(tx.transactionType)) {
        item.allocatedCredits += tx.credits;
      } else if (tx.transactionType === 'Deduction') {
        item.creditsRemoved += tx.credits;
      } else if (tx.transactionType === 'Debit') {
        item.creditsConsumed += tx.credits;
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
