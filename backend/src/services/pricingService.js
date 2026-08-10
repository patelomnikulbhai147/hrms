const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class PricingService {

  /**
   * Determine the active employee count for the parent company.
   * Branches must use the parent company employee count because they share one wallet.
   */
  static async getActiveEmployeeCount(companyId) {
    const company = await prisma.company.findUnique({ 
      where: { id: Number(companyId) },
      select: { id: true, parentCompanyId: true }
    });
    if (!company) return 0;
    
    const parentId = company.parentCompanyId ? company.parentCompanyId : company.id;
    
    const companiesInGroup = await prisma.company.findMany({
      where: {
        OR: [
          { id: parentId },
          { parentCompanyId: parentId }
        ]
      },
      select: { id: true }
    });
    
    const companyIds = companiesInGroup.map(c => c.id);

    const activeEmployees = await prisma.employee.count({
      where: {
        companyId: { in: companyIds },
        status: 'Active',
        OR: [
          { exitDate: null },
          { exitDate: { gte: new Date() } }
        ]
      }
    });

    return activeEmployees;
  }

  /**
   * Match employeeCount against PricingMaster table
   */
  static async getPricingTier(employeeCount) {
    const tiers = await prisma.pricingMaster.findMany({
      orderBy: { minEmployees: 'asc' }
    });

    for (const tier of tiers) {
      if (tier.maxEmployees === null) {
        if (employeeCount >= tier.minEmployees) return tier;
      } else {
        if (employeeCount >= tier.minEmployees && employeeCount <= tier.maxEmployees) {
          return tier;
        }
      }
    }
    return { tierName: 'Free', quarterlyPrice: 0, yearlyPrice: 0 };
  }

  /**
   * Estimate Payroll Cost based on active employees and unified pricing logic
   */
  static async estimatePayrollCost(companyId) {
    const activeEmployees = await this.getActiveEmployeeCount(companyId);
    
    const company = await prisma.company.findUnique({ 
      where: { id: Number(companyId) },
      select: { plan: true, priceMonthly: true, parentCompanyId: true }
    });
    
    if (!company) {
      throw new Error(`Company with ID ${companyId} not found`);
    }

    let parentCompany = company;
    if (company.parentCompanyId) {
      parentCompany = await prisma.company.findUnique({
        where: { id: company.parentCompanyId },
        select: { plan: true, priceMonthly: true }
      });
    }

    let costPerEmployee = 0;
    let usedCustomPricing = false;
    let tier = null;

    // Use the custom amount stored for that company if applicable
    if (parentCompany.plan === 'Custom' || (parentCompany.priceMonthly && parentCompany.priceMonthly > 0)) {
      usedCustomPricing = true;
      costPerEmployee = parentCompany.priceMonthly || 0;
      tier = { tierName: 'Custom', quarterlyPrice: costPerEmployee, yearlyPrice: costPerEmployee * 12 };
    } else {
      tier = await this.getPricingTier(activeEmployees);
      // Based on the approved pricing matrix, the monthly rate is mapped to the 'quarterlyPrice' column in the database seed.
      // 0-100 = 25
      // 100-500 = 20
      // 500+ = 15
      costPerEmployee = tier.quarterlyPrice || 0;
    }
    
    // Strict deduction formula. No rounding division errors.
    const totalCost = activeEmployees * costPerEmployee;

    return { 
      activeEmployees, 
      costPerEmployee, 
      totalCost, 
      tier,
      usedCustomPricing
    };
  }
}

module.exports = PricingService;
