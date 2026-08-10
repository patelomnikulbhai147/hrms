const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class WalletService {

  /**
   * Get wallet for a company, create if not exists
   */
  static async getWallet(companyId) {
    let wallet = await prisma.wallet.findUnique({
      where: { companyId: Number(companyId) }
    });
    if (!wallet) {
      wallet = await prisma.wallet.create({
        data: { companyId: Number(companyId), balance: 0.0, status: 'Active' }
      });
    }
    return wallet;
  }

  /**
   * Get Wallet Summary
   */
  static async getSummary(companyId) {
    const wallet = await this.getWallet(companyId);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const txs = await prisma.walletTransaction.findMany({
      where: { walletId: wallet.id }
    });

    const todaysUsage = txs
      .filter(t => t.type === 'Payroll' && new Date(t.createdAt) >= today)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    const thisMonthUsage = txs
      .filter(t => t.type === 'Payroll' && new Date(t.createdAt) >= startOfMonth)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    const totalRecharge = txs
      .filter(t => t.type === 'Recharge')
      .reduce((sum, t) => sum + t.amount, 0);

    const totalDeduction = txs
      .filter(t => t.type === 'Payroll' || t.type === 'Adjustment')
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    return {
      ...wallet,
      todaysUsage,
      thisMonthUsage,
      totalRecharge,
      totalDeduction
    };
  }

  /**
   * Get Transactions with filters and pagination
   */
  static async getTransactions(companyId, filters = {}) {
    const wallet = await this.getWallet(companyId);

    let whereClause = { walletId: wallet.id };

    if (filters.type) whereClause.type = filters.type;

    if (filters.startDate || filters.endDate) {
      whereClause.createdAt = {};
      if (filters.startDate) whereClause.createdAt.gte = filters.startDate;
      if (filters.endDate) whereClause.createdAt.lte = filters.endDate;
    }

    if (filters.search) {
      whereClause.OR = [
        { referenceNumber: { contains: filters.search } },
        { createdBy: { contains: filters.search } },
        { type: { contains: filters.search } },
        { paymentGateway: { contains: filters.search } },
      ];
    }

    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(filters.limit || 50, 200);
    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      prisma.walletTransaction.findMany({
        where: whereClause,
        orderBy: { [filters.sortBy || 'createdAt']: filters.sortOrder || 'desc' },
        skip,
        take: limit,
      }),
      prisma.walletTransaction.count({ where: whereClause }),
    ]);

    return {
      transactions,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Estimate Payroll Cost based on active employees (forwarded to unified PricingService)
   */
  static async estimatePayrollCost(companyId) {
    const PricingService = require('./pricingService');
    return await PricingService.estimatePayrollCost(companyId);
  }

  /**
   * Deduct Wallet Balance
   */
  static async deductBalance(companyId, amount, type, referenceNumber, createdBy, payrollId = null) {
    return await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({
        where: { companyId: Number(companyId) }
      });

      if (!wallet) throw new Error('Wallet not found');
      if (wallet.balance < amount) throw new Error('Insufficient wallet balance');

      const balanceBefore = wallet.balance;
      const balanceAfter = wallet.balance - amount;

      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: balanceAfter }
      });

      const transaction = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type,
          amount: -amount,
          balanceBefore,
          balanceAfter,
          referenceNumber,
          createdBy,
          payrollId
        }
      });

      return { wallet: updatedWallet, transaction };
    });
  }

  /**
   * Add Wallet Balance (Recharge / Refund / Adjustment)
   * Built-in duplicate protection via referenceNumber uniqueness check.
   */
  static async addBalance(companyId, amount, type, referenceNumber, paymentGateway, createdBy) {
    return await prisma.$transaction(async (tx) => {
      let wallet = await tx.wallet.findUnique({
        where: { companyId: Number(companyId) }
      });

      if (!wallet) {
        wallet = await tx.wallet.create({
          data: { companyId: Number(companyId), balance: 0.0, status: 'Active' }
        });
      }

      // Prevent duplicate credit if a transaction with this reference number already exists
      if (referenceNumber) {
        const existingTx = await tx.walletTransaction.findFirst({
          where: {
            walletId: wallet.id,
            type: type,
            referenceNumber: referenceNumber,
          }
        });
        if (existingTx) {
          return { wallet, transaction: existingTx };
        }
      }

      const balanceBefore = wallet.balance;
      const balanceAfter = wallet.balance + amount;

      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: balanceAfter, lastRechargeAt: new Date() }
      });

      const transaction = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type,
          amount,
          balanceBefore,
          balanceAfter,
          referenceNumber,
          paymentGateway,
          createdBy
        }
      });

      return { wallet: updatedWallet, transaction };
    });
  }
}

module.exports = WalletService;
