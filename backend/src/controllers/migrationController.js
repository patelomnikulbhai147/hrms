const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

exports.migrateSystem = async (req, res) => {
  console.log('Starting full system migration...');
  const { users, companies, branches, employees } = req.body;

  try {
    let stats = {
      users: 0,
      companies: 0,
      branches: 0,
      employees: 0,
      errors: []
    };

    // 1. Migrate Companies
    if (companies && Array.isArray(companies)) {
      for (const comp of companies) {
        try {
          await prisma.company.upsert({
            where: { id: comp.id },
            update: {
              name: comp.name,
              status: comp.status || 'Active',
              employeeCount: comp.employeeCount || 0,
            },
            create: {
              id: comp.id,
              name: comp.name,
              status: comp.status || 'Active',
              employeeCount: comp.employeeCount || 0,
              domain: comp.domain || '',
              plan: comp.plan || 'Starter',
            }
          });
          stats.companies++;
        } catch (err) {
          stats.errors.push(`Company ${comp.id}: ${err.message}`);
        }
      }
    }

    // 2. Migrate Branches (wait, do they have a separate branches array in localStorage?)
    // Usually branches are in companies array, but let's handle if passed separately
    if (branches && Array.isArray(branches)) {
      for (const branch of branches) {
        try {
          await prisma.branch.upsert({
            where: { id: branch.id },
            update: { branchName: branch.branchName },
            create: {
              id: branch.id,
              branchName: branch.branchName,
              companyId: branch.parentCompanyId || branch.companyId,
              location: branch.address || 'Unknown'
            }
          });
          stats.branches++;
        } catch (err) {
          stats.errors.push(`Branch ${branch.id}: ${err.message}`);
        }
      }
    }

    // 3. Migrate Users
    if (users && Array.isArray(users)) {
      const salt = await bcrypt.genSalt(10);
      for (const user of users) {
        try {
          const passwordHash = await bcrypt.hash(user.passwordStr || 'default123', salt);
          await prisma.user.upsert({
            where: { username: user.username },
            update: { name: user.name },
            create: {
              id: user.id,
              name: user.name,
              email: user.email || `${user.username}@example.com`,
              username: user.username,
              passwordHash,
              role: user.role,
              companyId: user.companyId || 'UNKNOWN',
              accessibleCompanyIds: user.accessibleCompanyIds || []
            }
          });
          stats.users++;
        } catch (err) {
          stats.errors.push(`User ${user.username}: ${err.message}`);
        }
      }
    }

    // 4. Migrate Employees (The 840+ records)
    if (employees && Array.isArray(employees)) {
      for (const emp of employees) {
        try {
          await prisma.employee.upsert({
            where: { employeeId: emp.employeeId },
            update: {
              name: emp.name,
              status: emp.status || 'Active',
              salary: typeof emp.salary === 'number' ? emp.salary : 0
            },
            create: {
              id: emp.id,
              employeeId: emp.employeeId,
              name: emp.name,
              email: emp.email || `${emp.employeeId}@example.com`,
              companyId: emp.companyId || 'UNKNOWN',
              branchId: emp.branchId || null,
              department: emp.department || 'General',
              designation: emp.designation || 'Staff',
              status: emp.status || 'Active',
              joinDate: emp.joinDate ? new Date(emp.joinDate) : new Date(),
              salary: typeof emp.salary === 'number' ? emp.salary : 0
            }
          });
          stats.employees++;
        } catch (err) {
          stats.errors.push(`Employee ${emp.employeeId}: ${err.message}`);
        }
      }
    }

    console.log('Migration completed with stats:', stats);
    res.json({ message: 'Migration completed successfully', stats });
  } catch (error) {
    console.error('Fatal Migration Error:', error);
    res.status(500).json({ error: 'Fatal error during migration' });
  }
};
