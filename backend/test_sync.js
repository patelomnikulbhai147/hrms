const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const syncPayrollForEmployees = async (companyWhere, month, year) => {
  const employeeWhere = { status: 'Active' };
  if (companyWhere) {
    if (typeof companyWhere === 'string') {
      employeeWhere.OR = [
        { companyId: companyWhere },
        { branchId: companyWhere }
      ];
    } else if (companyWhere.in) {
      employeeWhere.OR = [
        { companyId: { in: companyWhere.in } },
        { branchId: { in: companyWhere.in } }
      ];
    }
  }

  const employees = await prisma.employee.findMany({
    where: employeeWhere,
    include: { company: true }
  });

  if (!employees.length) return;

  const payrollRecords = await prisma.payroll.findMany({
    where: {
      month,
      year,
      employeeId: { in: employees.map(e => e.id) }
    },
    select: { employeeId: true }
  });

  const existingEmployeeIds = new Set(payrollRecords.map(p => p.employeeId));
  const missingEmployees = employees.filter(e => !existingEmployeeIds.has(e.id) && e.salary > 0);

  if (missingEmployees.length > 0) {
    const promises = missingEmployees.map(async emp => {
      const basicPercent = emp.company?.basicPercent || 50;
      const ctcMonthly = Math.round(emp.salary / 12);
      const basicSalary = Math.round(ctcMonthly * (basicPercent / 100));
      const hra = Math.round(basicSalary * 0.4);
      const special = Math.max(0, ctcMonthly - basicSalary - hra);
      const allowances = hra + special;
      
      const pfRate = emp.company?.pfRate || 12;
      const esicRate = emp.company?.esicRate || 0.75;
      const profTax = emp.company?.profTaxRate || 200;
      
      const pfDeduction = Math.round(basicSalary * (pfRate / 100));
      const esicDeduction = Math.round(basicSalary * (esicRate / 100));
      const deductions = pfDeduction + esicDeduction + profTax;
      const netSalary = Math.max(0, ctcMonthly - deductions);

      return prisma.payroll.create({
        data: {
          companyId: emp.companyId,
          employeeId: emp.id,
          employeeName: emp.name,
          department: emp.department,
          month,
          year,
          basicSalary,
          allowances,
          deductions,
          tax: 0,
          bonus: 0,
          netSalary,
          status: 'draft',
          paymentStatus: 'pending'
        }
      });
    });
    await Promise.all(promises);
  }
};

async function run() {
  try {
    const allowedIds = ['c-gcri', 'c-ahmedabad', 'c-rajkot', 'c-bhavnagar', 'c-siddhpur'];
    await syncPayrollForEmployees({ in: allowedIds }, 'June', 2026);
    console.log("SUCCESS!");
  } catch(e) {
    console.error("CRASHED!", e);
  }
  await prisma.$disconnect();
}
run();
