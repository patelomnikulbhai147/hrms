const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const PricingService = require('../src/services/pricingService');
const fs = require('fs');
const path = require('path');

async function verify() {
  let report = `# Payroll Pricing Verification Report\n\n`;

  // We will create temporary companies with different employee counts to test the PricingService
  const testCases = [
    { count: 50, expectedCost: 1250 },
    { count: 200, expectedCost: 4000 },
    { count: 832, expectedCost: 12480 },
    { count: 1000, expectedCost: 15000 }
  ];

  for (const tc of testCases) {
    // Create a temporary company
    const tempCompany = await prisma.company.create({
      data: {
        name: `Test Company ${tc.count}`,
        contactEmail: `test${tc.count}@test.com`,
        status: 'Active',
        plan: 'Free'
      }
    });

    // Create active employees for this company
    // Using createMany for efficiency
    const employeesData = Array.from({ length: tc.count }).map((_, i) => ({
      companyId: tempCompany.id,
      employeeId: `EMP-${tempCompany.id}-${i}`,
      name: `Emp${i} Test`,
      firstName: `Emp${i}`,
      lastName: `Test`,
      email: `emp${i}_${tc.count}@test.com`,
      status: 'Active',
      department: 'IT',
      designation: 'Engineer',
      joinDate: new Date()
    }));

    await prisma.employee.createMany({ data: employeesData });

    // Run the Pricing Service estimate
    const estimate = await PricingService.estimatePayrollCost(tempCompany.id);

    // Assert the exact match
    const passed = estimate.totalCost === tc.expectedCost;

    report += `## Test Case: ${tc.count} Employees\n`;
    report += `- **Employee Count**: ${estimate.activeEmployees}\n`;
    report += `- **Selected Tier**: ${estimate.tier?.tierName}\n`;
    report += `- **Price Per Employee**: ₹${estimate.costPerEmployee}\n`;
    report += `- **Estimated Cost**: ₹${estimate.totalCost}\n`;
    report += `- **Database Record Used**: PricingMaster [minEmployees: ${estimate.tier?.minEmployees}, quarterlyPrice mapped to Monthly: ${estimate.tier?.quarterlyPrice}]\n`;
    report += `- **Final Deduction Amount**: ₹${estimate.totalCost}\n`;
    report += `- **Verification Status**: ${passed ? '✅ PASSED' : `❌ FAILED (Expected ₹${tc.expectedCost}, Got ₹${estimate.totalCost})`}\n\n`;

    // Cleanup
    await prisma.employee.deleteMany({ where: { companyId: tempCompany.id } });
    await prisma.company.delete({ where: { id: tempCompany.id } });
  }

  // Also test custom pricing
  const customCompany = await prisma.company.create({
    data: {
      name: `Test Custom Company`,
      contactEmail: `custom@test.com`,
      status: 'Active',
      plan: 'Custom',
      priceMonthly: 12.50
    }
  });

  const customEmployeesData = Array.from({ length: 100 }).map((_, i) => ({
    companyId: customCompany.id,
    employeeId: `EMP-${customCompany.id}-${i}`,
    name: `Emp${i} Test`,
    firstName: `Emp${i}`,
    lastName: `Test`,
    email: `emp${i}_custom@test.com`,
    status: 'Active',
    department: 'IT',
    designation: 'Engineer',
    joinDate: new Date()
  }));

  await prisma.employee.createMany({ data: customEmployeesData });

  const customEstimate = await PricingService.estimatePayrollCost(customCompany.id);
  const customPassed = customEstimate.totalCost === 1250;

  report += `## Test Case: Custom Pricing (100 Employees @ ₹12.50)\n`;
  report += `- **Employee Count**: ${customEstimate.activeEmployees}\n`;
  report += `- **Selected Tier**: ${customEstimate.tier?.tierName}\n`;
  report += `- **Price Per Employee**: ₹${customEstimate.costPerEmployee}\n`;
  report += `- **Estimated Cost**: ₹${customEstimate.totalCost}\n`;
  report += `- **Database Record Used**: Company [id: ${customCompany.id}, priceMonthly: ${customCompany.priceMonthly}]\n`;
  report += `- **Final Deduction Amount**: ₹${customEstimate.totalCost}\n`;
  report += `- **Verification Status**: ${customPassed ? '✅ PASSED' : `❌ FAILED (Expected ₹1250, Got ₹${customEstimate.totalCost})`}\n\n`;

  // Cleanup
  await prisma.employee.deleteMany({ where: { companyId: customCompany.id } });
  await prisma.company.delete({ where: { id: customCompany.id } });

  console.log("Pricing Verification Completed.");
  console.log(report);
}

verify().catch(console.error).finally(() => prisma.$disconnect());
