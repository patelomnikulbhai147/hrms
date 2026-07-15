/**
 * ADDITIVE QA dataset for a REAL company (default: Pulpit, id 11).
 *
 * Unlike scripts/seedDemoDataset.js (which WIPES and rebuilds a (DEMO) company),
 * this script is strictly ADDITIVE and NON-DESTRUCTIVE to real data:
 *
 *   • It NEVER deletes a row that is not tagged as QA-dummy.
 *   • Real employees / attendance / payroll / loans stay exactly as they are.
 *   • It layers a full, internally-consistent dummy dataset ALONGSIDE the real
 *     rows so every report in complianceReportController has volume to render.
 *
 * Dummy markers (the ONLY rows this script will ever remove on re-run / --clean):
 *   Employee.employeeId   LIKE 'PM-QA-%'
 *   Branch.branchCode     LIKE 'QA-%'
 *   Shift.code            LIKE 'Q%'   (real company had 0 shifts)
 *   Loan.loanNumber       LIKE 'QA/%'
 *   Document.uploadedBy        = 'QA Seed'
 *   CommunicationHoliday.createdBy = 'QA Seed'
 *   EmployeeBonus.createdByName = 'QA Seed'
 *   BonusCycle.name       LIKE 'QA %'
 *   CompanyOwner/Contact.email LIKE '%@qa.pulpitseed.local'
 *
 * Business logic, report generators, payroll formulas and templates are NOT
 * touched — this only writes/cleans rows.
 *
 *   node scripts/seedPulpitAdditive.js [--company=11] [--employees=60]
 *   node scripts/seedPulpitAdditive.js --company=11 --clean   # remove dummy only
 *
 * Idempotent: a normal run first removes its own previous dummy rows, then
 * re-creates them, so re-running produces the same additive dataset.
 * Deterministic (seeded PRNG) — report numbers are stable across runs.
 */
require('dotenv').config();
const zlib = require('zlib');
const prisma = require('../src/config/prisma');
const { nextEntityId, nextBranchNo } = require('../src/utils/sequentialNo');

// ── args ─────────────────────────────────────────────────────────────────────
const arg = (n, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.split('=')[1] : d;
};
const has = (n) => process.argv.includes(`--${n}`);
const COMPANY_ID = parseInt(arg('company', '11'), 10);
const EMPLOYEE_COUNT = parseInt(arg('employees', '60'), 10);
const CLEAN_ONLY = has('clean');

const QA_DOMAIN = 'qa.pulpitseed.local';

const WINDOW_START = '2025-04-01';
const WINDOW_END = '2026-07-10';
const PAYROLL_LAST = '2026-06';

// ── deterministic PRNG (mulberry32) ──────────────────────────────────────────
let _s = 0x1a2b3c4d;
const rnd = () => {
  _s |= 0; _s = (_s + 0x6d2b79f5) | 0;
  let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const chance = (p) => rnd() < p;
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// ── tiny solid-colour PNG builder (branding needs a real raster for PDF) ──────
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return t;
})();
const crc32 = (buf) => { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const pngChunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
function makePng(w, h, [r, g, b]) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const off = y * (w * 3 + 1);
    raw[off] = 0;
    for (let x = 0; x < w; x++) { raw[off + 1 + x * 3] = r; raw[off + 2 + x * 3] = g; raw[off + 3 + x * 3] = b; }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString('base64')}`;
}

// ── master data ──────────────────────────────────────────────────────────────
const BRANCHES = [
  { branchName: 'Ahmedabad Head Office', branchCode: 'QA-AHM-HO', location: 'Ashram Road, Ahmedabad', city: 'Ahmedabad', adminName: 'Rakesh Mehta', phone: '+91 79 4000 1100', email: `ahmedabad@${QA_DOMAIN}` },
  { branchName: 'Rajkot Branch', branchCode: 'QA-RJT-BR', location: 'Kalawad Road, Rajkot', city: 'Rajkot', adminName: 'Nilesh Vora', phone: '+91 281 400 2200', email: `rajkot@${QA_DOMAIN}` },
  { branchName: 'Gandhinagar Branch', branchCode: 'QA-GNR-BR', location: 'Sector 11, Gandhinagar', city: 'Gandhinagar', adminName: 'Priya Desai', phone: '+91 79 4000 3300', email: `gandhinagar@${QA_DOMAIN}` },
  { branchName: 'Surat Branch', branchCode: 'QA-SRT-BR', location: 'Ring Road, Surat', city: 'Surat', adminName: 'Amit Kapadia', phone: '+91 261 400 4400', email: `surat@${QA_DOMAIN}` },
  { branchName: 'Vadodara Branch', branchCode: 'QA-VAD-BR', location: 'Alkapuri, Vadodara', city: 'Vadodara', adminName: 'Sneha Joshi', phone: '+91 265 400 5500', email: `vadodara@${QA_DOMAIN}` },
];

const DEPARTMENTS = ['HR', 'IT', 'Payroll', 'Finance', 'Accounts', 'Sales', 'Marketing', 'Production',
  'Quality', 'Purchase', 'Admin', 'Security', 'Housekeeping', 'Operations', 'Support'];

const DESIGNATIONS = [
  { name: 'CEO', min: 300000, max: 380000, cat: 'Highly Skilled', weight: 1 },
  { name: 'Director', min: 250000, max: 320000, cat: 'Highly Skilled', weight: 1 },
  { name: 'COO', min: 220000, max: 280000, cat: 'Highly Skilled', weight: 1 },
  { name: 'General Manager', min: 140000, max: 190000, cat: 'Highly Skilled', weight: 3 },
  { name: 'HR Head', min: 120000, max: 160000, cat: 'Highly Skilled', weight: 2 },
  { name: 'HR Manager', min: 75000, max: 105000, cat: 'Skilled', weight: 5 },
  { name: 'Payroll Manager', min: 70000, max: 95000, cat: 'Skilled', weight: 4 },
  { name: 'Team Lead', min: 55000, max: 80000, cat: 'Skilled', weight: 16 },
  { name: 'Accountant', min: 38000, max: 58000, cat: 'Skilled', weight: 12 },
  { name: 'Senior Executive', min: 34000, max: 48000, cat: 'Skilled', weight: 30 },
  { name: 'Executive', min: 24000, max: 33000, cat: 'Semi Skilled', weight: 45 },
  { name: 'Officer', min: 19000, max: 25000, cat: 'Semi Skilled', weight: 40 },
  { name: 'Assistant', min: 14000, max: 19000, cat: 'Unskilled', weight: 32 },
  { name: 'Intern', min: 9000, max: 13000, cat: 'Unskilled', weight: 8 },
];

const SHIFTS = [
  { name: 'Morning', code: 'QMOR', start: '06:00', end: '14:00', grace: '10', breakTime: '30', otEnabled: true },
  { name: 'General', code: 'QGEN', start: '09:00', end: '18:00', grace: '15', breakTime: '60', otEnabled: true },
  { name: 'Evening', code: 'QEVE', start: '14:00', end: '22:00', grace: '10', breakTime: '30', otEnabled: true },
  { name: 'Night', code: 'QNGT', start: '22:00', end: '06:00', grace: '10', breakTime: '45', otEnabled: true },
  { name: 'Rotational', code: 'QROT', start: '08:00', end: '17:00', grace: '15', breakTime: '45', otEnabled: false },
];

const FIRST_M = ['Amit', 'Rakesh', 'Nilesh', 'Jignesh', 'Bhavesh', 'Chirag', 'Dhaval', 'Hardik', 'Kunal', 'Manish', 'Nikhil', 'Paresh', 'Rahul', 'Sanjay', 'Tushar', 'Vikram', 'Yash', 'Rohit', 'Ketan', 'Mihir', 'Pankaj', 'Suresh', 'Vishal', 'Alok', 'Deepak'];
const FIRST_F = ['Priya', 'Sneha', 'Kavita', 'Meera', 'Nisha', 'Pooja', 'Rekha', 'Shreya', 'Trupti', 'Vaishali', 'Anjali', 'Bhavna', 'Divya', 'Hetal', 'Jyoti', 'Komal', 'Mansi', 'Nidhi', 'Payal', 'Ritu'];
const LAST = ['Patel', 'Shah', 'Mehta', 'Desai', 'Joshi', 'Trivedi', 'Vora', 'Kapadia', 'Bhatt', 'Chauhan', 'Solanki', 'Parmar', 'Rathod', 'Gohil', 'Jadeja', 'Panchal', 'Modi', 'Thakkar', 'Dave', 'Pandya'];
const BLOOD = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];
const BANKS = [
  { bankName: 'HDFC Bank', ifsc: 'HDFC0001234', bankBranch: 'Ashram Road' },
  { bankName: 'ICICI Bank', ifsc: 'ICIC0004567', bankBranch: 'C G Road' },
  { bankName: 'State Bank of India', ifsc: 'SBIN0007890', bankBranch: 'Rajkot Main' },
  { bankName: 'Axis Bank', ifsc: 'UTIB0001122', bankBranch: 'Alkapuri' },
  { bankName: 'Bank of Baroda', ifsc: 'BARB0VJSURA', bankBranch: 'Ring Road' },
];

const HOLIDAYS = [
  ['2025-08-15', 'Independence Day', 'National'], ['2025-08-27', 'Ganesh Chaturthi', 'Religious'],
  ['2025-10-02', 'Gandhi Jayanti', 'National'], ['2025-10-21', 'Diwali', 'Religious'],
  ['2025-10-22', 'Govardhan Puja', 'Religious'], ['2025-10-23', 'Bhai Dooj', 'Religious'],
  ['2025-11-05', 'Guru Nanak Jayanti', 'Religious'], ['2025-12-25', 'Christmas', 'Religious'],
  ['2026-01-01', 'New Year', 'Company'], ['2026-01-14', 'Uttarayan', 'Regional'],
  ['2026-01-26', 'Republic Day', 'National'], ['2026-03-04', 'Holi', 'Religious'],
  ['2026-03-21', 'Ramadan Eid', 'Religious'], ['2026-04-14', 'Ambedkar Jayanti', 'National'],
  ['2026-05-01', 'Gujarat Day', 'Regional'], ['2026-06-16', 'Company Foundation Day', 'Company'],
];
const HOLIDAY_SET = new Set(HOLIDAYS.map((h) => h[0]));

const LEAVE_TYPES = ['CL', 'PL', 'SL', 'Maternity', 'Paternity', 'LWP', 'Comp Off', 'Optional Holiday'];
const LEAVE_STATUSES = ['Approved', 'Approved', 'Approved', 'Pending', 'Rejected', 'Cancelled'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// Employment status spread → drives Employee-status / Exit / Gratuity reports.
const ESI_CEIL = 21000, PF_CEIL = 15000;

// ── date helpers ─────────────────────────────────────────────────────────────
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; };
const eachDay = (from, to) => { const out = []; for (let d = new Date(from); d <= new Date(to); d = addDays(d, 1)) out.push(new Date(d)); return out; };
const hhmm = (h, m) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

function computePayroll(gross, payableDays, totalDays, otHours, bonus, loanEmi) {
  const basic = r2(gross * 0.5);
  const allowances = r2(gross - basic);
  const lopDays = Math.max(0, totalDays - payableDays);
  const lop = r2((gross / totalDays) * lopDays);
  const pf = r2(0.12 * Math.min(basic, PF_CEIL));
  const esi = gross <= ESI_CEIL ? r2(gross * 0.0075) : 0;
  const pt = gross > 12000 ? 200 : 150;
  const lwf = 20;
  const tds = gross > 60000 ? r2(gross * 0.05) : 0;
  const otAmount = r2(otHours * ((basic / 26) / 8) * 2);
  const deductions = r2(pf + esi + pt + lwf + tds + loanEmi + lop);
  const net = Math.max(0, r2(basic + allowances + otAmount + bonus - deductions));
  return { basic, allowances, deductions, net, otAmount, tax: tds };
}

// ── dummy cleanup (NEVER touches untagged/real rows) ──────────────────────────
async function cleanupDummy() {
  const w = { companyId: COMPANY_ID };
  const dummyEmps = await prisma.employee.findMany({ where: { ...w, employeeId: { startsWith: 'PM-QA-' } }, select: { id: true } });
  const empIds = dummyEmps.map((e) => e.id);
  const out = {};
  const del = async (k, model, where) => { out[k] = (await model.deleteMany({ where })).count; };

  if (empIds.length) {
    const byEmp = { companyId: COMPANY_ID, employeeId: { in: empIds } };
    await del('attendance', prisma.attendance, byEmp);
    await del('attendanceSummary', prisma.attendanceSummary, byEmp);
    await del('overtime', prisma.overtime, byEmp);
    await del('leaveRequest', prisma.leaveRequest, byEmp);
    await del('leaveBalance', prisma.leaveBalance, byEmp);
    await del('payroll', prisma.payroll, byEmp);
  }
  // Bonus (dummy cycle + its children) — real bonusCycle count was 0.
  const dummyCycles = await prisma.bonusCycle.findMany({ where: { ...w, name: { startsWith: 'QA ' } }, select: { id: true } });
  const cycleIds = dummyCycles.map((c) => c.id);
  if (cycleIds.length) {
    await del('bonusPayment', prisma.bonusPayment, { cycleId: { in: cycleIds } });
    await del('bonusCalculation', prisma.bonusCalculation, { cycleId: { in: cycleIds } });
    await del('bonusEligibility', prisma.bonusEligibility, { cycleId: { in: cycleIds } });
    await del('bonusCycle', prisma.bonusCycle, { id: { in: cycleIds } });
  }
  await del('employeeBonus', prisma.employeeBonus, { ...w, createdByName: 'QA Seed' });
  // Loans (dummy loanNumber prefix) + their installments.
  const dummyLoans = await prisma.loan.findMany({ where: { ...w, loanNumber: { startsWith: 'QA/' } }, select: { id: true } });
  const loanIds = dummyLoans.map((l) => l.id);
  if (loanIds.length) await del('loanInstallment', prisma.loanInstallment, { loanId: { in: loanIds } });
  await del('loan', prisma.loan, { ...w, loanNumber: { startsWith: 'QA/' } });
  // Documents / holidays / owners / contacts / employees / shifts / branches (all tagged).
  await del('document', prisma.document, { ...w, uploadedBy: 'QA Seed' });
  await del('communicationHoliday', prisma.communicationHoliday, { ...w, createdBy: 'QA Seed' });
  await del('companyOwner', prisma.companyOwner, { ...w, email: { endsWith: `@${QA_DOMAIN}` } });
  await del('companyContact', prisma.companyContact, { ...w, email: { endsWith: `@${QA_DOMAIN}` } });
  await del('employee', prisma.employee, { ...w, employeeId: { startsWith: 'PM-QA-' } });
  await del('shift', prisma.shift, { ...w, code: { startsWith: 'Q' } });
  await del('branch', prisma.branch, { ...w, branchCode: { startsWith: 'QA-' } });

  const nz = Object.entries(out).filter(([, v]) => v);
  console.log('  cleaned dummy rows:', nz.length ? nz.map(([k, v]) => `${k}=${v}`).join(' ') : 'none');
  return out;
}

// ── company master: fill ONLY empty fields (never overwrite real values) ──────
async function fillCompanyIfEmpty() {
  const co = await prisma.company.findUnique({ where: { id: COMPANY_ID } });
  const isEmpty = (v) => v === null || v === undefined || v === '' || (typeof v === 'number' && Number.isNaN(v));
  const candidates = {
    legalName: 'Pulpit Mobility Private Limited', tradeName: 'Pulpit Mobility',
    companyType: 'Private Limited', industry: 'Technology', companyIndustry: 'Technology',
    businessCategory: 'Software & Mobility Solutions', natureOfBusiness: 'IT Services',
    dateOfIncorporation: '2020-06-16', dateOfEstablishment: '2020-06-16', companyStatusLabel: 'Active',
    gstNumber: '24AABCP1234Q1Z8', panNumber: 'AABCP1234Q', tanNumber: 'AHMP01234C',
    cinNumber: 'U74999GJ2020PTC099887', registrationNumber: 'ROC-GJ-099887',
    iecCode: '0899887766', msmeNumber: 'UDYAM-GJ-01-0099887',
    pfCode: 'GJAHM0099887000', esiCode: '37000998870000101',
    ptaxRegistrationNumber: 'PT-GJ-24-0099887', labourLicenseNumber: 'LL-GJ-2021-0777',
    shopEstablishmentNumber: 'SE-AHM-2020-9911', factoryLicenseNumber: 'FL-GJ-2021-0044',
    isoCertNumber: 'ISO-9001-2015-IN-9911', otherRegistrations: 'LWF Registration: LWF-GJ-24-009911',
    address: '2nd Floor, Iscon Emporio, S G Highway', registeredOfficeAddress: '2nd Floor, Iscon Emporio, S G Highway, Ahmedabad',
    headOfficeAddress: '2nd Floor, Iscon Emporio, S G Highway, Ahmedabad',
    city: 'Ahmedabad', state: 'Gujarat', pincode: '380015', country: 'India',
    website: 'https://pulpitmobility.com', contactEmail: 'info@pulpitmobility.com', contactNumber: '+91 79 4000 9911',
    landline: '+91 79 4000 9911', supportEmail: 'support@pulpitmobility.com', hrEmail: 'hr@pulpitmobility.com',
    payrollEmail: 'payroll@pulpitmobility.com',
    salaryCycle: 'Monthly', financialYearStart: '2025-04-01', leaveYearStart: '2026-01-01',
    defaultCurrency: 'INR', defaultTimeZone: 'Asia/Kolkata',
    authorizedSignatory: 'Yogesh Patel', signatoryDesignation: 'Director',
    bankName: 'HDFC Bank', bankBranch: 'S G Highway', bankAccountNumber: '50200099887766',
    ifscCode: 'HDFC0001234', accountHolderName: 'Pulpit Mobility Private Limited',
    pfRate: 12, esicRate: 3.25, basicPercent: 50, profTaxRate: 200, overtimeRate: 2,
    logoImage: makePng(240, 80, [108, 60, 240]), letterheadImage: makePng(600, 120, [244, 240, 255]),
    digitalSignatureImage: makePng(180, 60, [30, 30, 90]), stampImage: makePng(120, 120, [140, 30, 40]),
    faviconImage: makePng(32, 32, [108, 60, 240]),
  };
  const data = {};
  for (const [k, v] of Object.entries(candidates)) if (k in co && isEmpty(co[k])) data[k] = v;
  if (!('customDepartments' in data) && (!Array.isArray(co.customDepartments) || !co.customDepartments.length)) data.customDepartments = DEPARTMENTS;
  const keys = Object.keys(data);
  if (keys.length) await prisma.company.update({ where: { id: COMPANY_ID }, data });
  console.log(`  filled ${keys.length} empty company field(s): ${keys.filter((k) => !k.endsWith('Image')).join(', ') || '(images only)'}`);
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  const company = await prisma.company.findUnique({ where: { id: COMPANY_ID } });
  if (!company) throw new Error(`Company ${COMPANY_ID} not found.`);
  console.log(`Target: [${company.id}] "${company.name}"   ${CLEAN_ONLY ? '(CLEAN ONLY)' : `employees=+${EMPLOYEE_COUNT}`}`);

  console.log('\n[1] Removing any previous QA-dummy rows (real data untouched)…');
  await cleanupDummy();
  if (CLEAN_ONLY) { console.log('\nClean complete. Real data left intact.'); return; }

  console.log('[2] Company master (fill empty fields only)…');
  await fillCompanyIfEmpty();

  console.log('[3] Owners, contacts…');
  await prisma.companyOwner.createMany({
    data: [
      { companyId: COMPANY_ID, name: 'Yogesh Patel', designation: 'Director', email: `yogesh@${QA_DOMAIN}`, mobile: '9825099901', ownershipPercentage: '60', isPrimary: true, sortOrder: 0 },
      { companyId: COMPANY_ID, name: 'Sneha Joshi', designation: 'Director', email: `sneha@${QA_DOMAIN}`, mobile: '9825099902', ownershipPercentage: '25', isPrimary: false, sortOrder: 1 },
      { companyId: COMPANY_ID, name: 'Amit Kapadia', designation: 'Director', email: `amit@${QA_DOMAIN}`, mobile: '9825099903', ownershipPercentage: '15', isPrimary: false, sortOrder: 2 },
    ],
  });
  await prisma.companyContact.createMany({
    data: [
      { companyId: COMPANY_ID, name: 'Yogesh Patel', designation: 'Director', roleKey: 'authorizedSignatory', email: `yogesh@${QA_DOMAIN}`, mobile: '9825099901', sortOrder: 0 },
      { companyId: COMPANY_ID, name: 'Kavita Trivedi', designation: 'HR Head', roleKey: 'hrHead', email: `hr@${QA_DOMAIN}`, mobile: '9825099910', sortOrder: 1 },
      { companyId: COMPANY_ID, name: 'Nilesh Vora', designation: 'Finance Head', roleKey: 'financeHead', email: `finance@${QA_DOMAIN}`, mobile: '9825099911', sortOrder: 2 },
    ],
  });

  console.log('[4] Branches, shifts, holidays, leave policy…');
  const branchIds = [];
  for (const b of BRANCHES) {
    const row = await prisma.branch.create({
      data: {
        id: await nextEntityId(), branchNo: await nextBranchNo(COMPANY_ID), companyId: COMPANY_ID,
        branchName: b.branchName, branchCode: b.branchCode, location: b.location,
        adminName: b.adminName, adminEmail: b.email, phone: b.phone, email: b.email,
        employeeCapacity: 200, pfRate: 12, esicRate: 3.25, basicPercent: 50, overtimeRate: 1.5, profTaxRate: 200,
      },
    });
    branchIds.push(row.id);
  }
  const shiftIds = [];
  for (const s of SHIFTS) shiftIds.push((await prisma.shift.create({ data: { companyId: COMPANY_ID, ...s } })).id);

  await prisma.communicationHoliday.createMany({
    data: HOLIDAYS.map(([date, name, category]) => ({
      companyId: COMPANY_ID, name, category, date,
      applicableBranches: 'all', applicableDepartments: 'all',
      isPublicHoliday: category !== 'Company', isOptionalHoliday: category === 'Regional',
      status: 'Active', createdBy: 'QA Seed',
    })),
  });
  for (const year of [2025, 2026]) {
    const exists = await prisma.leaveCreditConfig.findUnique({ where: { companyId_year: { companyId: COMPANY_ID, year } } }).catch(() => null);
    if (!exists) {
      await prisma.leaveCreditConfig.create({
        data: {
          companyId: COMPANY_ID, year, startMonth: 1, endMonth: 12,
          clPerMonth: 1, plPerMonth: 1.5, slPerMonth: 1,
          carryForward: 5, carryForwardEnabled: true, maxCarryForward: 15,
          allowEncashment: true, encashableTypes: 'PL', maxEncashmentDays: 30,
        },
      });
    }
  }

  console.log(`[5] ${EMPLOYEE_COUNT} dummy employees…`);
  const desigPool = DESIGNATIONS.flatMap((d) => Array(d.weight).fill(d));
  const now = new Date();
  const empRows = [];
  for (let i = 0; i < EMPLOYEE_COUNT; i++) {
    const gender = chance(0.62) ? 'Male' : 'Female';
    const first = gender === 'Male' ? pick(FIRST_M) : pick(FIRST_F);
    const last = pick(LAST);
    const name = `${first} ${last}`;
    // Weighted-random pick (not sequential) so even a small headcount samples the
    // FULL wage pyramid — including sub-₹21k roles that drive ESI & Bonus reports.
    const desig = pick(desigPool);
    const dept = DEPARTMENTS[i % DEPARTMENTS.length];
    const bIdx = i % BRANCHES.length;
    const gross = ri(desig.min, desig.max);
    const joinDate = new Date(Date.UTC(ri(2014, 2026), ri(0, 11), ri(1, 28)));
    // Employment status spread: mostly Active, plus Resigned/Terminated/Probation/
    // New-Joiner so status/exit/gratuity reports have every bucket.
    const ageMonths = (now - joinDate) / (1000 * 60 * 60 * 24 * 30);
    let status = 'Active';
    let exitDate = null, exitReason = null;
    const roll = rnd();
    if (roll < 0.05 && joinDate < new Date('2024-06-01')) { status = 'Resigned'; exitDate = new Date(Date.UTC(2025, ri(6, 11), ri(1, 28))); exitReason = pick(['Resignation', 'Better Opportunity', 'Relocation']); }
    else if (roll < 0.08 && joinDate < new Date('2024-06-01')) { status = 'Terminated'; exitDate = new Date(Date.UTC(2026, ri(0, 5), ri(1, 28))); exitReason = pick(['Performance', 'Misconduct', 'Restructuring']); }
    else if (ageMonths <= 6) { status = 'Probation'; }
    const confirmationDate = ageMonths > 6 ? iso(addDays(joinDate, 180)) : null;
    const bank = BANKS[i % BANKS.length];

    const history = [];
    let sal = Math.round(gross * 0.75);
    for (let y = joinDate.getUTCFullYear() + 1; y <= 2026 && history.length < 3; y += 2) {
      const next = Math.round(sal * (1 + ri(8, 18) / 100));
      history.push({ effectiveDate: `${y}-04-01`, oldSalary: sal, newSalary: next });
      sal = next;
    }

    empRows.push({
      employeeId: `PM-QA-${String(i + 1).padStart(4, '0')}`, companyId: COMPANY_ID,
      branchId: branchIds[bIdx], shiftId: shiftIds[i % shiftIds.length],
      biometricId: `QA9${String(10000 + i).slice(0, 5)}`,
      name, firstName: first, lastName: last,
      email: `${first.toLowerCase()}.${last.toLowerCase()}${i + 1}@${QA_DOMAIN}`,
      phone: `97${String(25000000 + i * 7).slice(0, 8)}`,
      department: dept, designation: desig.name, role: 'Staff',
      status, joinDate, exitDate, exitReason,
      location: BRANCHES[bIdx].city, branchLocation: BRANCHES[bIdx].branchName,
      salary: gross,
      manager: pick(['Yogesh Patel', 'Sneha Joshi', 'Nilesh Vora', 'Kavita Trivedi', 'Amit Kapadia']),
      pan: `A${String.fromCharCode(65 + (i % 26))}QPZ${String(1000 + (i % 9000))}${String.fromCharCode(65 + (i % 26))}`,
      aadhaar: String(300000000000 + i * 137).slice(0, 12),
      uan: String(110000000000 + i * 31).slice(0, 12),
      pfNumber: `GJAHM00998870000${String(i + 1).padStart(4, '0')}`,
      esiNumber: String(3700000000 + i * 17).slice(0, 10),
      bankName: bank.bankName, ifsc: bank.ifsc, bankBranch: bank.bankBranch, bankState: 'Gujarat',
      accountNumber: String(50200099000000 + i * 971).slice(0, 14),
      accountHolderName: name,
      category: desig.cat, employmentType: chance(0.9) ? 'Permanent' : 'Contract',
      dob: iso(new Date(Date.UTC(ri(1972, 2003), ri(0, 11), ri(1, 28)))),
      gender, maritalStatus: chance(0.6) ? 'Married' : 'Single', nationality: 'Indian',
      fatherSpouseName: `${pick(FIRST_M)} ${last}`,
      emergencyContact: `${pick(FIRST_F)} ${last} - 97${String(76000000 + i * 13).slice(0, 8)}`,
      state: 'Gujarat', city: BRANCHES[bIdx].city,
      presentAddress: `${ri(1, 99)}, ${pick(['Shanti', 'Gokul', 'Nandan', 'Krishna', 'Sagar'])} Residency, ${BRANCHES[bIdx].city}, Gujarat`,
      permanentAddress: `${ri(1, 99)}, ${pick(['Shanti', 'Gokul', 'Nandan', 'Krishna', 'Sagar'])} Residency, ${BRANCHES[bIdx].city}, Gujarat`,
      employmentHistory: history,
      employmentMeta: {
        bloodGroup: pick(BLOOD), skillCategory: desig.cat, confirmationDate,
        pfApplicable: true, esicApplicable: gross <= ESI_CEIL, ptApplicable: true, lwfApplicable: true,
        weeklyOff: 'Sunday', probationMonths: 6,
      },
      bonusApplicable: gross <= ESI_CEIL,
      bonusType: gross <= ESI_CEIL ? 'Yearly' : null,
      bonusCalcMethod: gross <= ESI_CEIL ? 'Percentage of Salary' : null,
      bonusValue: gross <= ESI_CEIL ? 8.33 : null,
    });
  }
  await prisma.employee.createMany({ data: empRows });
  const employees = await prisma.employee.findMany({ where: { companyId: COMPANY_ID, employeeId: { startsWith: 'PM-QA-' } }, orderBy: { employeeId: 'asc' } });
  console.log(`   created ${employees.length} dummy employees`);
  const shiftNameOf = (e) => SHIFTS[shiftIds.indexOf(e.shiftId)]?.name || 'General';

  console.log('[6] Attendance (Apr 2025 → Jul 2026)…');
  const days = eachDay(WINDOW_START, WINDOW_END);
  const summary = new Map();
  const bump = (empId, key, field, by = 1) => {
    if (!summary.has(empId)) summary.set(empId, new Map());
    const m = summary.get(empId);
    if (!m.has(key)) m.set(key, { presentDays: 0, absentDays: 0, cl: 0, pl: 0, sl: 0, lwp: 0, halfDays: 0, otHours: 0, payableDays: 0, weeklyOff: 0, holiday: 0 });
    m.get(key)[field] += by;
  };
  let attBuf = [], attCount = 0;
  for (const e of employees) {
    const shift = shiftNameOf(e);
    const from = iso(e.joinDate), to = e.exitDate ? iso(e.exitDate) : null;
    for (const d of days) {
      const ds = iso(d);
      if (ds < from) continue;
      if (to && ds > to) continue;
      const mk = ds.slice(0, 7);
      let stat, clockIn = '', clockOut = '', hours = 0;
      const flags = []; let leaveType = null;
      if (d.getUTCDay() === 0) { stat = 'Weekly Off'; bump(e.id, mk, 'weeklyOff'); }
      else if (HOLIDAY_SET.has(ds)) { stat = 'Holiday'; bump(e.id, mk, 'holiday'); }
      else {
        const rr = rnd();
        if (rr < 0.855) {
          stat = 'Present';
          const late = chance(0.10), early = chance(0.06);
          clockIn = late ? hhmm(9, ri(31, 55)) : hhmm(9, ri(0, 28));
          clockOut = early ? hhmm(17, ri(5, 28)) : hhmm(18, ri(0, 40));
          hours = r2(8 - (early ? 1 : 0) + (chance(0.15) ? ri(1, 3) : 0));
          if (late) flags.push('Late');
          if (early) flags.push('Early Exit');
          if (chance(0.015)) { clockOut = ''; flags.push('Missing Punch'); }
          if (hours > 8) bump(e.id, mk, 'otHours', hours - 8);
          bump(e.id, mk, 'presentDays'); bump(e.id, mk, 'payableDays');
        } else if (rr < 0.895) { stat = 'Absent'; bump(e.id, mk, 'absentDays'); bump(e.id, mk, 'lwp'); }
        else if (rr < 0.925) { stat = 'Half Day'; clockIn = hhmm(9, ri(0, 20)); clockOut = hhmm(13, ri(30, 59)); hours = 4; bump(e.id, mk, 'halfDays'); bump(e.id, mk, 'payableDays', 0.5); }
        else { stat = 'Leave'; leaveType = pick(['CL', 'PL', 'SL']); bump(e.id, mk, leaveType.toLowerCase()); bump(e.id, mk, 'payableDays'); }
      }
      if (stat === 'Weekly Off' || stat === 'Holiday') bump(e.id, mk, 'payableDays');
      attBuf.push({ companyId: COMPANY_ID, employeeId: e.id, employeeName: e.name, department: e.department, branch: e.branchLocation, date: ds, clockIn, clockOut, status: stat, hoursWorked: hours, flags, leaveType, shift });
      attCount++;
      if (attBuf.length >= 2000) { await prisma.attendance.createMany({ data: attBuf, skipDuplicates: true }); attBuf = []; }
    }
  }
  if (attBuf.length) await prisma.attendance.createMany({ data: attBuf, skipDuplicates: true });
  console.log(`   created ${attCount} attendance rows`);

  console.log('[7] Attendance summaries…');
  const empById = new Map(employees.map((e) => [e.id, e]));
  const sumRows = [];
  for (const [empId, months] of summary) {
    for (const [mk, c] of months) {
      const [y, m] = mk.split('-');
      const totalDays = new Date(Date.UTC(+y, +m, 0)).getUTCDate();
      const workingDays = Math.max(0, totalDays - c.weeklyOff - c.holiday);
      sumRows.push({
        companyId: COMPANY_ID, employeeId: empId, month: MONTH_NAMES[+m - 1], year: +y,
        presentDays: c.presentDays, absentDays: c.absentDays, cl: c.cl, pl: c.pl, sl: c.sl,
        lwp: c.lwp, halfDays: c.halfDays, otHours: r2(c.otHours), payableDays: r2(c.payableDays),
        workingDays, weeklyOffDays: c.weeklyOff, holidayDays: c.holiday,
        attendanceStatus: 'Complete', attendanceSource: 'System Computed', syncedAt: now,
        shift: shiftNameOf(empById.get(empId)), locked: false, updatedBy: 'QA Seed',
      });
    }
  }
  for (let i = 0; i < sumRows.length; i += 2000) await prisma.attendanceSummary.createMany({ data: sumRows.slice(i, i + 2000), skipDuplicates: true });
  console.log(`   created ${sumRows.length} summary rows`);

  console.log('[8] Overtime…');
  const otRows = [];
  for (const e of employees) {
    if (!chance(0.35)) continue;
    const from = iso(e.joinDate);
    for (let k = 0; k < ri(3, 10); k++) {
      const ds = iso(days[ri(0, days.length - 1)]);
      if (ds < from) continue;
      if (e.exitDate && ds > iso(e.exitDate)) continue;
      const hrs = ri(1, 4);
      otRows.push({ companyId: COMPANY_ID, employeeId: e.id, employeeName: e.name, employeeCode: e.employeeId, department: e.department, branch: e.branchLocation, shift: shiftNameOf(e), date: ds, inTime: '18:00', outTime: hhmm(18 + hrs, 0), otHours: hrs, type: pick(['Normal', 'Weekend', 'Holiday']), reason: pick(['Production target', 'Month-end closing', 'Shipment dispatch', 'Audit support']), status: pick(['Approved', 'Approved', 'Approved', 'Pending', 'Rejected']) });
    }
  }
  await prisma.overtime.createMany({ data: otRows });
  console.log(`   created ${otRows.length} overtime rows`);

  console.log('[9] Leave requests & balances…');
  const lvRows = [];
  for (const e of employees) {
    for (let k = 0; k < ri(2, 6); k++) {
      const start = days[ri(0, days.length - 8)];
      if (iso(start) < iso(e.joinDate)) continue;
      const len = ri(1, 4);
      const type = pick(LEAVE_TYPES);
      const st = pick(LEAVE_STATUSES);
      const lwp = type === 'LWP' ? len : 0;
      lvRows.push({ companyId: COMPANY_ID, employeeId: e.id, employeeName: e.name, department: e.department, leaveType: type, fromDate: iso(start), toDate: iso(addDays(start, len - 1)), days: len, reason: pick(['Personal work', 'Family function', 'Medical', 'Travel', 'Child care', 'Festival']), status: st, appliedOn: iso(addDays(start, -ri(2, 10))), approvedBy: st === 'Approved' ? 'Kavita Trivedi' : null, approvedOn: st === 'Approved' ? iso(addDays(start, -1)) : null, paidDays: len - lwp, lwpDays: lwp });
    }
  }
  await prisma.leaveRequest.createMany({ data: lvRows });
  const balRows = [];
  for (const e of employees) {
    for (const year of [2025, 2026]) {
      const clU = ri(0, 8), plU = ri(0, 12), slU = ri(0, 6);
      balRows.push({ companyId: COMPANY_ID, employeeId: e.id, year, clBalance: r2(12 - clU), plBalance: r2(18 - plU), slBalance: r2(12 - slU), clUsed: clU, plUsed: plU, slUsed: slU, carryForward: ri(0, 10), accruedThroughMonth: year === 2026 ? 7 : 12 });
    }
  }
  await prisma.leaveBalance.createMany({ data: balRows, skipDuplicates: true });
  console.log(`   created ${lvRows.length} leave requests, ${balRows.length} balances`);

  console.log('[10] Loans & advances…');
  const LOAN_START_IDX = 2025 * 12 + 4;
  const mkIdx = (mk) => { const [y, m] = mk.split('-').map(Number); return y * 12 + (m - 1); };
  // Reuse the company's existing loan types; only create a QA type if none exist.
  let loanTypes = await prisma.loanType.findMany({ where: { companyId: COMPANY_ID, active: true } });
  if (!loanTypes.length) {
    loanTypes = [await prisma.loanType.create({ data: { companyId: COMPANY_ID, name: 'Personal Loan', code: 'QA-PL', defaultInterestRate: 10, maxAmount: 300000, maxTenureMonths: 36, isSystem: false, active: true, createdBy: 'QA Seed' } })];
  }
  const loanRows = [];
  let loanNo = 0;
  for (const e of employees) {
    if (!chance(0.22)) continue;
    const lt = pick(loanTypes);
    const principal = ri(2, 20) * 5000;
    const tenure = ri(6, Math.min(24, lt.maxTenureMonths || 24));
    const interest = r2((principal * (lt.defaultInterestRate || 0) * (tenure / 12)) / 100);
    const totalPayable = r2(principal + interest);
    const emi = r2(totalPayable / tenure);
    const st = pick(['Active', 'Active', 'Active', 'Closed', 'Pending Approval']);
    loanNo++;
    loanRows.push({ companyId: COMPANY_ID, branchId: e.branchId, employeeId: e.id, employeeName: e.name, department: e.department, loanNumber: `QA/2025-26/${String(loanNo).padStart(4, '0')}`, loanTypeId: lt.id, loanTypeName: lt.name, principalAmount: principal, interestType: lt.defaultInterestType, interestRate: lt.defaultInterestRate, totalInterest: interest, totalPayable, tenureMonths: tenure, emiAmount: emi, startDate: '2025-05-01', endDate: '2026-04-30', deductionStartMonth: 'May', deductionStartYear: 2025, purpose: pick(['Home renovation', 'Medical emergency', 'Education fees', 'Vehicle purchase', 'Wedding expenses']), status: st, disbursedDate: st === 'Pending Approval' ? null : '2025-05-05', requestedBy: e.name, approvedBy: st === 'Pending Approval' ? null : 'Yogesh Patel', approvedAt: st === 'Pending Approval' ? null : new Date('2025-05-03'), closedAt: st === 'Closed' ? new Date('2026-04-30') : null, approvalAuthority: 'Director' });
  }
  await prisma.loan.createMany({ data: loanRows });
  const loans = await prisma.loan.findMany({ where: { companyId: COMPANY_ID, loanNumber: { startsWith: 'QA/' } } });
  const loanByEmp = new Map();
  for (const l of loans) if (l.status !== 'Pending Approval') loanByEmp.set(l.employeeId, l);
  const loanEmiFor = (empId, mk) => {
    const l = loanByEmp.get(empId);
    if (!l) return 0;
    const i = mkIdx(mk);
    return (i >= LOAN_START_IDX && i < LOAN_START_IDX + l.tenureMonths) ? l.emiAmount : 0;
  };
  const instRows = [];
  for (const l of loans) {
    if (l.status === 'Pending Approval') continue;
    let bal = l.totalPayable;
    for (let seq = 1; seq <= l.tenureMonths; seq++) {
      const idx = LOAN_START_IDX + seq - 1;
      const year = Math.floor(idx / 12), mIdx = idx % 12;
      const mk = `${year}-${String(mIdx + 1).padStart(2, '0')}`;
      const principalPart = r2(l.principalAmount / l.tenureMonths);
      const interestPart = r2(l.emiAmount - principalPart);
      const opening = r2(bal); bal = r2(bal - l.emiAmount);
      const paid = l.status === 'Closed' || mk < PAYROLL_LAST;
      instRows.push({ companyId: COMPANY_ID, loanId: l.id, seq, periodMonth: MONTH_NAMES[mIdx], periodYear: year, dueDate: `${mk}-28`, emiAmount: l.emiAmount, principalComponent: principalPart, interestComponent: interestPart, openingBalance: opening, closingBalance: Math.max(0, bal), status: paid ? 'Paid' : 'Pending', paidAmount: paid ? l.emiAmount : 0, paidDate: paid ? new Date(`${mk}-28`) : null });
    }
  }
  for (let i = 0; i < instRows.length; i += 1000) await prisma.loanInstallment.createMany({ data: instRows.slice(i, i + 1000), skipDuplicates: true });
  console.log(`   ${loans.length} loans, ${instRows.length} installments`);

  console.log('[11] Payroll…');
  const payMonths = [];
  for (const d = new Date(WINDOW_START); iso(d).slice(0, 7) <= PAYROLL_LAST; d.setUTCMonth(d.getUTCMonth() + 1)) payMonths.push(iso(d).slice(0, 7));
  const payRows = [];
  for (const e of employees) {
    const joinMk = iso(e.joinDate).slice(0, 7);
    const exitMk = e.exitDate ? iso(e.exitDate).slice(0, 7) : null;
    for (const mk of payMonths) {
      if (mk < joinMk) continue;
      if (exitMk && mk > exitMk) continue;
      const [y, m] = mk.split('-').map(Number);
      const s = summary.get(e.id)?.get(mk);
      const totalDays = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const payable = s ? Math.min(totalDays, r2(s.payableDays)) : totalDays;
      const workingDays = s ? Math.max(0, totalDays - s.weeklyOff - s.holiday) : totalDays;
      const otHours = s ? r2(s.otHours) : 0;
      const bonus = m === 10 && e.salary <= ESI_CEIL ? r2(Math.min(e.salary, 7000) * 12 * 0.0833) : 0;
      const loanEmi = loanEmiFor(e.id, mk);
      const c = computePayroll(e.salary, payable, totalDays, otHours, bonus, loanEmi);
      const settled = mk < PAYROLL_LAST;
      payRows.push({
        companyId: COMPANY_ID, employeeId: e.id, employeeName: e.name, department: e.department,
        month: MONTH_NAMES[m - 1], year: y,
        basicSalary: c.basic, allowances: c.allowances, deductions: c.deductions, netSalary: c.net,
        payrollStatus: settled ? 'locked' : 'processed', paymentStatus: settled ? 'paid' : 'pending',
        payslipGenerated: true,
        presentDays: s?.presentDays || 0, clDays: s?.cl || 0, plDays: s?.pl || 0, slDays: s?.sl || 0,
        lwpDays: s?.lwp || 0, halfDays: s?.halfDays || 0, otHours, payableDays: payable,
        workingDays, weeklyOffDays: s?.weeklyOff || 0, holidayDays: s?.holiday || 0,
        attendanceSyncedAt: now, attendanceSource: 'System Computed',
        processedOn: `${mk}-28`, paymentDate: settled ? `${mk}-30` : null,
        paymentMethod: 'Bank Transfer', paidBy: 'Nilesh Vora',
        bonus, overtime: c.otAmount, tax: c.tax, loanDeduction: loanEmi,
        summarySyncedAt: now, generatedAt: now,
        lockedAt: settled ? now : null, approvedAt: settled ? now : null, approvedBy: settled ? 'Yogesh Patel' : null,
        payslipFileName: `Payslip_${e.employeeId}_${MONTH_NAMES[m - 1]}_${y}.pdf`,
      });
    }
  }
  for (let i = 0; i < payRows.length; i += 1000) await prisma.payroll.createMany({ data: payRows.slice(i, i + 1000), skipDuplicates: true });
  console.log(`   created ${payRows.length} payroll rows across ${payMonths.length} cycles`);

  console.log('[12] Bonus cycle & documents…');
  let cfg = await prisma.bonusConfiguration.findFirst({ where: { companyId: COMPANY_ID, financialYear: '2025-2026' } });
  if (!cfg) cfg = await prisma.bonusConfiguration.create({ data: { companyId: COMPANY_ID, bonusType: 'Statutory', financialYear: '2025-2026', minBonusPercent: 8.33, maxBonusPercent: 20, salaryCeiling: 21000, minWorkingDays: 30, includeLeaveDays: true, isActive: true } });
  const eligible = employees.filter((e) => e.salary <= ESI_CEIL);
  const bonusOf = (e) => r2(Math.min(e.salary, 7000) * 12 * 0.0833);
  const cycle = await prisma.bonusCycle.create({ data: { companyId: COMPANY_ID, configId: cfg.id, name: 'QA Statutory Bonus FY 2025-26', bonusType: 'Statutory', financialYear: '2025-2026', status: 'Paid', employeeCount: eligible.length, totalAmount: r2(eligible.reduce((t, e) => t + bonusOf(e), 0)), generatedAt: new Date('2025-10-01'), approvedAt: new Date('2025-10-10'), paidAt: new Date('2025-10-18') } });
  await prisma.bonusEligibility.createMany({ data: employees.map((e) => ({ cycleId: cycle.id, companyId: COMPANY_ID, employeeId: e.id, workingDays: ri(240, 300), eligibilityStatus: e.salary <= ESI_CEIL ? 'Eligible' : 'Not Eligible', reason: e.salary <= ESI_CEIL ? 'Within statutory wage ceiling' : 'Gross above the ₹21,000 ceiling' })) });
  await prisma.bonusCalculation.createMany({ data: eligible.map((e) => ({ cycleId: cycle.id, companyId: COMPANY_ID, employeeId: e.id, eligibleSalary: Math.min(e.salary, 7000), bonusPercent: 8.33, bonusAmount: bonusOf(e) })) });
  await prisma.bonusPayment.createMany({ data: eligible.map((e, i) => ({ cycleId: cycle.id, companyId: COMPANY_ID, employeeId: e.id, amount: bonusOf(e), paymentDate: new Date('2025-10-18'), paymentMode: 'Bank Transfer', reference: `QABON/2025-26/${String(i + 1).padStart(4, '0')}`, status: 'Paid' })) });
  await prisma.employeeBonus.createMany({ data: employees.filter(() => chance(0.3)).map((e) => ({ companyId: COMPANY_ID, employeeId: e.id, source: 'payroll', bonusType: pick(['Festival', 'Performance']), calcMethod: 'Fixed Amount', amount: ri(3000, 20000), reason: pick(['Diwali festival bonus', 'Q3 performance award', 'Project delivery incentive']), approvedByName: 'Yogesh Patel', approvalDate: new Date('2025-10-15'), effectiveDate: new Date('2025-10-01'), status: 'Paid', payrollMonth: 'October', payrollYear: 2025, createdByName: 'QA Seed' })) });

  const today = iso(now);
  const companyDocs = [
    ['GST Registration Certificate', 'Tax', '24AABCP1234Q1Z8'], ['PAN Card', 'Tax', 'AABCP1234Q'],
    ['Certificate of Incorporation', 'Legal', 'U74999GJ2020PTC099887'], ['TAN Certificate', 'Tax', 'AHMP01234C'],
    ['PF Registration Certificate', 'Labour', 'GJAHM0099887000'], ['ESI Registration Certificate', 'Labour', '37000998870000101'],
    ['Shops & Establishment Certificate', 'Labour', 'SE-AHM-2020-9911'], ['MSME / Udyam Certificate', 'Business', 'UDYAM-GJ-01-0099887'],
  ];
  await prisma.document.createMany({ data: companyDocs.map(([name, category, num]) => ({ companyId: COMPANY_ID, employeeId: null, name, type: category, category, documentNumber: num, uploadedBy: 'QA Seed', uploadedOn: today, size: '128 KB', status: 'Verified', issuingAuthority: category === 'Tax' ? 'Income Tax Department' : 'Government of Gujarat', issueDate: '2020-07-01', expiryDate: category === 'Labour' ? '2027-03-31' : null })) });

  const HR_LETTERS = ['Offer Letter', 'Appointment Letter', 'Experience Letter'];
  const ID_DOCS = [
    { name: 'Passport', type: 'Passport', category: 'Identity', num: (i) => `Z${String(1000000 + i).slice(0, 7)}`, expiry: '2032-03-31' },
    { name: 'Driving License', type: 'Driving License', category: 'Identity', num: (i) => `GJ01 2020${String(1000000 + i).slice(0, 7)}`, expiry: '2029-12-31' },
    { name: 'Education Certificate — Degree Marksheet', type: 'Education', category: 'Other', num: (i) => `EDU/${2010 + (i % 12)}/${1000 + i}`, expiry: null },
  ];
  const empDocs = [];
  employees.slice(0, Math.min(40, employees.length)).forEach((e) => {
    for (const dn of HR_LETTERS) empDocs.push({ companyId: COMPANY_ID, employeeId: e.id, employeeName: e.name, branchId: e.branchId, name: `${dn} — ${e.name}`, type: 'HR', category: 'HR', documentNumber: `${e.employeeId}/${dn.split(' ')[0].toUpperCase()}`, uploadedBy: 'QA Seed', uploadedOn: today, size: '64 KB', status: 'Verified' });
  });
  employees.slice(0, Math.min(50, employees.length)).forEach((e, i) => {
    for (const d of ID_DOCS) {
      const st = i % 5 === 0 ? 'Pending' : 'Verified';
      empDocs.push({ companyId: COMPANY_ID, employeeId: e.id, employeeName: e.name, branchId: e.branchId, name: `${d.name} — ${e.name}`, type: d.type, category: d.category, documentNumber: d.num(i), issueDate: '2020-06-15', expiryDate: d.expiry, uploadedBy: 'QA Seed', uploadedOn: today, size: '96 KB', status: st, issuingAuthority: d.type === 'Education' ? 'Gujarat University' : 'Government of India' });
    }
  });
  await prisma.document.createMany({ data: empDocs });
  console.log(`   bonus cycle ${cycle.id} (${eligible.length} eligible), ${companyDocs.length + empDocs.length} documents`);

  console.log('\nAdditive seed complete. Real Pulpit data left untouched; dummy rows tagged for clean removal.');
}

main()
  .catch((e) => { console.error('\nSEED FAILED:', e.message); console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
