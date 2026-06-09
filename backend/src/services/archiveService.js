const prisma = require('../config/prisma');
const AuditService = require('./auditService');

class ArchiveService {
  /**
   * Safely offboards an employee and moves them to ArchivedEmployee
   */
  static async offboardEmployee(employeeId, reason, actorId, actorName) {
    return await prisma.$transaction(async (tx) => {
      // 1. Find active employee
      const employee = await tx.employee.findUnique({
        where: { id: employeeId },
        include: { company: true, branch: true }
      });

      if (!employee) throw new Error('Employee not found or already archived');

      // 2. Insert into ArchivedEmployee
      const archived = await tx.archivedEmployee.create({
        data: {
          employeeId: employee.employeeId,
          fullName: employee.name,
          email: employee.email,
          role: employee.role,
          department: employee.department,
          companyId: employee.companyId,
          branchId: employee.branchId,
          joiningDate: employee.joinDate,
          offboardingDate: new Date(),
          offboardingReason: reason,
          payrollCleared: false,
          documentsCleared: false,
          systemAccessRemoved: true,
          experienceSummary: 'Automated Offboarding'
        }
      });

      // 3. Delete from Active Employee table
      await tx.employee.delete({
        where: { id: employeeId }
      });

      // 4. Update headcounts
      if (employee.branchId) {
        await tx.branch.update({
          where: { id: employee.branchId },
          data: { headcount: { decrement: 1 } }
        });
      }
      if (employee.companyId) {
        await tx.company.update({
          where: { id: employee.companyId },
          data: { employeeCount: { decrement: 1 } }
        });
      }

      // 5. Log Activity
      await AuditService.logActivity(actorId, actorName, 'Offboarded', 'Employee', employee.employeeId, `Reason: ${reason}`);
      
      return archived;
    });
  }

  /**
   * Safely offboards an entire company and all its active employees
   */
  static async offboardCompany(companyId, reason, actorId, actorName) {
    return await prisma.$transaction(async (tx) => {
      // 1. Find Company & Active Employees
      const company = await tx.company.findUnique({
        where: { id: companyId },
        include: { employees: true }
      });

      if (!company) throw new Error('Company not found');

      const employeeCount = company.employees.length;

      // 2. Move all active employees to ArchivedEmployee
      for (const emp of company.employees) {
        await tx.archivedEmployee.create({
          data: {
            employeeId: emp.employeeId,
            fullName: emp.name,
            email: emp.email,
            role: emp.role,
            department: emp.department,
            companyId: emp.companyId,
            branchId: emp.branchId,
            joiningDate: emp.joinDate,
            offboardingDate: new Date(),
            offboardingReason: `Company Offboarded: ${reason}`,
            systemAccessRemoved: true
          }
        });
      }

      // 3. Delete all active employees of this company
      await tx.employee.deleteMany({
        where: { companyId: company.id }
      });

      // 4. Move company to ArchivedCompany
      const archivedComp = await tx.archivedCompany.create({
        data: {
          companyId: company.id,
          companyName: company.name,
          offboardingDate: new Date(),
          totalEmployeesArchived: employeeCount,
          paymentStatus: company.paymentStatus,
          archiveReason: reason
        }
      });

      // 5. Delete company from active (Cascade should handle branches if setup, or manual delete)
      // Since schema doesn't have cascade, we must delete branches manually
      await tx.branch.deleteMany({
        where: { companyId: company.id }
      });
      await tx.company.delete({
        where: { id: company.id }
      });

      await AuditService.logActivity(actorId, actorName, 'Offboarded', 'Company', company.name, `Reason: ${reason}`);

      return archivedComp;
    });
  }

  /**
   * Reactivate Company
   */
  static async reactivateCompany(archivedCompanyId, actorId, actorName) {
    return await prisma.$transaction(async (tx) => {
      const archived = await tx.archivedCompany.findUnique({
        where: { id: archivedCompanyId }
      });

      if (!archived) throw new Error('Archived Company not found');

      // 1. Restore Company
      const company = await tx.company.create({
        data: {
          id: archived.companyId, // preserve original ID
          name: archived.companyName,
          status: 'Active',
          employeeCount: archived.totalEmployeesArchived,
          paymentStatus: archived.paymentStatus
        }
      });

      // 2. Find and restore all employees that were archived for this company
      const archivedEmployees = await tx.archivedEmployee.findMany({
        where: { companyId: archived.companyId }
      });

      for (const aEmp of archivedEmployees) {
        await tx.employee.create({
          data: {
            employeeId: aEmp.employeeId,
            companyId: aEmp.companyId,
            branchId: aEmp.branchId,
            name: aEmp.fullName,
            email: aEmp.email,
            department: aEmp.department,
            designation: aEmp.role, // mapping role to designation loosely
            role: aEmp.role,
            status: 'Active',
            joinDate: aEmp.joiningDate || new Date()
          }
        });
        
        await tx.archivedEmployee.delete({
          where: { id: aEmp.id }
        });
      }

      // 3. Delete Archived Company
      await tx.archivedCompany.delete({
        where: { id: archivedCompanyId }
      });

      await AuditService.logActivity(actorId, actorName, 'Reactivated', 'Company', company.name, 'Reactivated by Admin');

      return company;
    });
  }
}

module.exports = ArchiveService;
