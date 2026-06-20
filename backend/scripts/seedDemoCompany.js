/**
 * Seed the VISHV ENTERPRISE (DEMO) company so every report has sample data to
 * generate a preview from. Fully isolated: all records live under the demo
 * company's id, so previews NEVER touch real company data. Idempotent: re-running
 * reuses the demo company and only seeds records if it has none yet.
 *
 *   node prisma/../scripts/seedDemoCompany.js
 */
const prisma = require('../src/config/prisma');

const DEMO_NAME = 'VISHV ENTERPRISE (DEMO)';
const MONTHS = ['April', 'May', 'June'];
const YEAR = 2026;

const DEPTS = ['Production', 'Accounts', 'HR', 'Sales', 'Maintenance'];
const BRANCHES = ['Ahmedabad', 'Rajkot'];
const DESIGS = ['Operator', 'Supervisor', 'Accountant', 'HR Executive', 'Sales Executive', 'Technician', 'Manager'];

function pad(n, w = 3) { return String(n).padStart(w, '0'); }

async function main() {
  // 1) Company (find-or-create by name)
  let demo = await prisma.company.findFirst({ where: { name: DEMO_NAME } });
  if (!demo) {
    demo = await prisma.company.create({
      data: {
        name: DEMO_NAME, isHeadOffice: true,
        address: '123 Industrial Estate, GIDC', city: 'Ahmedabad', state: 'Gujarat', pincode: '380015',
        gstNumber: '24AAACV1234A1Z5', panNumber: 'AAACV1234A', cinNumber: 'U17110GJ2010PTC012345',
        primaryColor: '#4F46E5', signatureText: 'For VISHV ENTERPRISE',
      },
    });
    console.log('Created demo company id=', demo.id);
  } else {
    console.log('Demo company already exists id=', demo.id);
  }

  const existingEmps = await prisma.employee.count({ where: { companyId: demo.id } });
  if (existingEmps > 0) {
    console.log(`Demo already seeded (${existingEmps} employees). Nothing to do.`);
    return demo.id;
  }

  // 2) Employees — varied salary so some are ESI-eligible (gross <= 21000), some not.
  const NAMES = [
    'Ramesh Patel', 'Sunita Sharma', 'Imran Shaikh', 'Priya Mehta', 'Vikram Desai',
    'Anjali Joshi', 'Karan Trivedi', 'Neha Gohil', 'Sahil Vora', 'Pooja Rana',
    'Manish Solanki', 'Divya Nair',
  ];
  const empData = NAMES.map((name, i) => {
    const salary = 12000 + (i % 6) * 6000; // 12k..42k
    const dept = DEPTS[i % DEPTS.length];
    const branch = BRANCHES[i % BRANCHES.length];
    const exited = i >= NAMES.length - 2; // last 2 have exited (for exit/F&F reports)
    return {
      employeeId: `VISHV${pad(i + 1)}`, companyId: demo.id, name, email: `${name.split(' ')[0].toLowerCase()}${i + 1}@vishv.demo`,
      phone: `98${pad(7654321 + i, 8)}`.slice(0, 10), department: dept, designation: DESIGS[i % DESIGS.length],
      status: exited ? 'Resigned' : 'Active', joinDate: new Date(2021 + (i % 4), i % 12, 1 + (i % 27)),
      exitDate: exited ? new Date(2026, 4, 15) : null, exitReason: exited ? 'Resignation' : null,
      salary, branchLocation: branch, gender: i % 2 ? 'Female' : 'Male',
      dob: `${1985 + (i % 15)}-0${1 + (i % 9)}-1${i % 9}`, maritalStatus: i % 2 ? 'MARRIED' : 'UNMARRIED',
      fatherSpouseName: 'Father ' + name.split(' ')[1], nationality: 'India', category: i % 3 === 0 ? 'Skilled' : 'Semi-Skilled',
      employmentType: 'PERMANENT', pan: `ABCDE${pad(1000 + i, 4)}F`, aadhaar: `${pad(123456780000 + i, 12)}`,
      uan: `10${pad(123456780 + i, 10)}`, pfNumber: `GJ/AHD/0012345/000/${pad(i + 1)}`, esiNumber: `31${pad(1234567890 + i, 10)}`,
      bankName: 'HDFC Bank', accountNumber: `5010${pad(1234567 + i, 9)}`, ifsc: 'HDFC0001234', accountHolderName: name,
      bankBranch: branch, state: 'Gujarat', city: branch,
    };
  });
  await prisma.employee.createMany({ data: empData });
  const emps = await prisma.employee.findMany({ where: { companyId: demo.id }, orderBy: { employeeId: 'asc' } });
  console.log('Seeded employees:', emps.length);

  const grossOf = (e) => e.salary;
  const basicOf = (e) => Math.round(e.salary * 0.5);

  // 3) Payroll (3 months each)
  const payroll = [];
  for (const e of emps) {
    for (const month of MONTHS) {
      const basic = basicOf(e); const allowances = e.salary - basic; const pf = Math.round(Math.min(basic, 15000) * 0.12);
      const esi = grossOf(e) <= 21000 ? Math.round(grossOf(e) * 0.0075) : 0; const pt = 200;
      const tax = e.salary > 30000 ? Math.round(e.salary * 0.05) : 0;
      const deductions = pf + esi + pt + tax; const net = e.salary - deductions;
      payroll.push({
        companyId: demo.id, employeeId: e.id, employeeName: e.name, department: e.department, month, year: YEAR,
        basicSalary: basic, allowances, deductions, netSalary: net, tax, bonus: 0,
        presentDays: 24, clDays: 1, plDays: 0, slDays: 0, lwpDays: 0, halfDays: 1, otHours: e.id % 3 === 0 ? 6 : 0, payableDays: 25,
        payrollStatus: 'approved', paymentStatus: month === 'June' ? 'pending' : 'paid', paymentMethod: 'Bank Transfer',
        paymentDate: month === 'June' ? null : `${YEAR}-0${MONTHS.indexOf(month) + 4}-28`,
      });
    }
  }
  await prisma.payroll.createMany({ data: payroll });
  console.log('Seeded payroll rows:', payroll.length);

  // 4) Attendance — June 1..20, varied statuses
  const att = [];
  for (const e of emps.filter(x => x.status === 'Active')) {
    for (let d = 1; d <= 20; d++) {
      const date = `${YEAR}-06-${pad(d, 2)}`; const dow = new Date(date).getDay();
      let status = 'Present'; if (dow === 0) status = 'Weekly Off'; else if (d % 9 === 0) status = 'Absent'; else if (d % 7 === 0) status = 'Leave'; else if (d % 11 === 0) status = 'Half Day';
      att.push({ companyId: demo.id, employeeId: e.id, employeeName: e.name, department: e.department, branch: e.branchLocation, date, status, clockIn: status === 'Present' ? '09:05' : '', clockOut: status === 'Present' ? '18:10' : '', hoursWorked: status === 'Present' ? 8.5 : 0 });
    }
  }
  // createMany respects the unique(employeeId,date) — skipDuplicates for safety
  await prisma.attendance.createMany({ data: att, skipDuplicates: true });
  console.log('Seeded attendance rows:', att.length);

  // 5) Attendance summaries (June)
  const summaries = emps.filter(x => x.status === 'Active').map(e => ({
    companyId: demo.id, employeeId: e.id, month: 'June', year: YEAR,
    presentDays: 22, absentDays: 2, cl: 1, pl: 0, sl: 1, lwp: 0, halfDays: 1, otHours: e.id % 3 === 0 ? 6 : 0, payableDays: 24,
  }));
  await prisma.attendanceSummary.createMany({ data: summaries, skipDuplicates: true });
  console.log('Seeded attendance summaries:', summaries.length);

  // 6) Leave requests + balances
  const leaves = emps.slice(0, 6).map((e, i) => ({
    companyId: demo.id, employeeId: e.id, employeeName: e.name, department: e.department, leaveType: ['Casual Leave', 'Sick Leave', 'Privilege Leave'][i % 3],
    fromDate: `${YEAR}-06-0${2 + i}`, toDate: `${YEAR}-06-0${3 + i}`, days: 2, paidDays: 2, lwpDays: 0, reason: 'Personal', appliedOn: `${YEAR}-05-28`, status: i % 4 === 0 ? 'Pending' : 'Approved', approvedBy: 'HR Manager',
  }));
  await prisma.leaveRequest.createMany({ data: leaves });
  const balances = emps.map(e => ({ companyId: demo.id, employeeId: e.id, year: YEAR, clBalance: 6, plBalance: 12, slBalance: 6, clUsed: 2, plUsed: 0, slUsed: 1, carryForward: 3 }));
  await prisma.leaveBalance.createMany({ data: balances, skipDuplicates: true });
  console.log('Seeded leaves/balances:', leaves.length, balances.length);

  // 7) Overtime
  const ot = emps.filter(e => e.id % 3 === 0).map((e, i) => ({ companyId: demo.id, employeeId: e.id, employeeName: e.name, department: e.department, date: `${YEAR}-06-${pad(5 + i, 2)}`, inTime: '18:00', outTime: '21:00', otHours: 3, type: 'Normal Overtime', status: 'Approved' }));
  if (ot.length) await prisma.overtime.createMany({ data: ot });
  console.log('Seeded overtime:', ot.length);

  // 8) Bonus cycle + calculations + payments
  try {
    const cycle = await prisma.bonusCycle.create({ data: { companyId: demo.id, name: 'Diwali Bonus 2025-26', bonusType: 'Statutory', financialYear: '2025-26' } });
    const calcs = emps.map(e => ({ cycleId: cycle.id, companyId: demo.id, employeeId: e.id, eligibleSalary: Math.min(basicOf(e), 7000), bonusPercent: 8.33, bonusAmount: Math.round(Math.min(basicOf(e), 7000) * 0.0833 * 12) }));
    await prisma.bonusCalculation.createMany({ data: calcs });
    const pays = emps.slice(0, 8).map(e => ({ cycleId: cycle.id, companyId: demo.id, employeeId: e.id, amount: Math.round(Math.min(basicOf(e), 7000) * 0.0833 * 12), paymentDate: new Date(2025, 9, 20), paymentMode: 'Bank Transfer', status: 'Paid' }));
    await prisma.bonusPayment.createMany({ data: pays });
    console.log('Seeded bonus calcs/payments:', calcs.length, pays.length);
  } catch (e) { console.warn('Bonus seed skipped:', e.message); }

  // 9) Documents (for document reports)
  const docTypes = [['Aadhaar Card', 'Aadhaar'], ['PAN Card', 'PAN'], ['Degree Certificate', 'Education'], ['Experience Letter', 'Experience'], ['Appointment Letter', 'Contract']];
  const docs = [];
  emps.slice(0, 8).forEach((e, i) => { const [name, type] = docTypes[i % docTypes.length]; docs.push({ companyId: demo.id, name, type, employeeId: e.id, employeeName: e.name, uploadedBy: 'HR Manager', uploadedOn: `${YEAR}-05-20`, size: '240 KB', status: i % 3 === 0 ? 'Pending' : 'Verified', documentNumber: type === 'PAN' ? e.pan : type === 'Aadhaar' ? e.aadhaar : '', issueDate: '2020-01-01' }); });
  await prisma.document.createMany({ data: docs });
  console.log('Seeded documents:', docs.length);

  console.log('\n✅ VISHV ENTERPRISE demo seeded. companyId =', demo.id);
  return demo.id;
}

main().catch(e => { console.error('SEED FAILED:', e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
