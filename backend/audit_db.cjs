const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function audit() {
  const issues = [];
  
  // 1. Audit Employees
  const employees = await prisma.employee.findMany();
  let empNullNames = 0;
  let empDuplicates = new Set();
  let empIds = new Set();
  let emails = new Set();
  
  for (const emp of employees) {
    if (!emp.name || emp.name.trim() === '') empNullNames++;
    if (empIds.has(emp.employeeId)) empDuplicates.add(emp.employeeId);
    if (emp.email && emails.has(emp.email)) empDuplicates.add(emp.email);
    empIds.add(emp.employeeId);
    if (emp.email) emails.add(emp.email);
  }
  
  issues.push(`Employees: ${employees.length} total. ${empNullNames} with null/empty names. ${empDuplicates.size} duplicate IDs/Emails.`);

  // 2. Audit Users
  const users = await prisma.user.findMany();
  let userNullEmail = 0;
  let duplicateUsers = new Set();
  let userEmails = new Set();
  for (const u of users) {
    if (!u.email) userNullEmail++;
    if (userEmails.has(u.email)) duplicateUsers.add(u.email);
    userEmails.add(u.email);
  }
  issues.push(`Users: ${users.length} total. ${userNullEmail} with null email. ${duplicateUsers.size} duplicates.`);

  // 3. Audit Payrolls
  const payrolls = await prisma.payroll.findMany();
  issues.push(`Payrolls: ${payrolls.length} total.`);

  // 4. Audit Attendance
  const attendance = await prisma.attendance.findMany();
  let attNullDate = 0;
  for (const a of attendance) {
    if (!a.date) attNullDate++;
  }
  issues.push(`Attendance: ${attendance.length} total. ${attNullDate} with no date.`);

  // 5. Audit Branches
  const branches = await prisma.branch.findMany({ include: { employees: true } });
  let branchMismatches = 0;
  for (const b of branches) {
    if (b.headcount !== b.employees.length) branchMismatches++;
  }
  issues.push(`Branches: ${branches.length} total. ${branchMismatches} with mismatched headcount vs actual employees.`);

  console.log(issues.join('\n'));
  
  await prisma.$disconnect();
}

audit().catch(e => {
  console.error(e);
  prisma.$disconnect();
});
