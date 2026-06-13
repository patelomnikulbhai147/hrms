/**
 * ============================================================================
 *  IMPORT / RECONCILE  Employee master Excel  ->  MySQL (Vishv Enterprise)
 * ============================================================================
 *
 *  Reads the GCRI master workbook (one sheet per branch), normalises every
 *  employee row, validates it, de-duplicates by employee code, maps each
 *  employee to the correct branch, and reconciles against the live MySQL data:
 *
 *    - creates Vishv Enterprise + any missing branch (none expected; safe)
 *    - CREATES employees present in Excel but missing from the database
 *    - SKIPS employees that already exist (no duplicates)
 *    - REPORTS validation failures, in-Excel duplicates, branch mismatches,
 *      roster drift (DB rows not in Excel) and non-roster/test records
 *
 *  Modes:
 *    (default)   analyze only — NO writes; prints the full reconcile report
 *    --apply     create the missing employees (still never deletes anything)
 *
 *  Always writes a detailed log to  scripts/data/employee-import-log.json
 *
 *  USAGE
 *      node scripts/importEmployeesFromExcel.js              # analyze
 *      node scripts/importEmployeesFromExcel.js --apply      # create missing
 *      node scripts/importEmployeesFromExcel.js --file="C:/path/to.xlsx"
 * ============================================================================
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const prisma = require('../src/config/prisma');

const APPLY = process.argv.includes('--apply');
const fileArg = process.argv.find((a) => a.startsWith('--file='));
const EXCEL_FILE = fileArg ? fileArg.slice('--file='.length)
  : 'C:/Users/HP/OneDrive/Desktop/GCRI FINAL MASTER DATA FROM 01.11......xlsx';

const COMPANY_ID = 'c-gcri';
const COMPANY_NAME = 'Vishv Enterprise';

// Sheet name -> branch (id + canonical name + location). Auto-created if absent.
const SHEET_BRANCH = {
  AHMEDABAD: { id: 'c-ahmedabad', name: 'Ahmedabad', location: 'Ahmedabad, Gujarat', code: 'AHMD' },
  BHAVNAGAR: { id: 'c-bhavnagar', name: 'Bhavnagar', location: 'Bhavnagar, Gujarat', code: 'BHAV' },
  RAJKOT:    { id: 'c-rajkot',    name: 'Rajkot',    location: 'Rajkot, Gujarat',    code: 'RAJK' },
  SIDDHPUR:  { id: 'c-siddhpur',  name: 'Siddhpur',  location: 'Siddhpur, Gujarat',  code: 'SIDD' },
};

// ── Header text -> canonical field. Order matters (specific first). ─────────
const HEADER_MAP = [
  [/BANK\s*A\/?C|BANK\s*AC|A\/C\s*NO/, 'accountNumber'],
  [/NAME OF BANK|^BANK$/, 'bankName'],
  [/IFSC|BRANCH\s*\(IFSC\)/, 'ifsc'],
  [/EMPLOYEE\s*CODE|^ID\s*NO/, 'code'],
  [/SR\.?\s*NO/, 'srNo'],
  [/FULL NAME/, 'fullName'],
  [/NAME AS PER AADHAR/, 'nameAadhar'],
  [/SURNAME/, 'surname'],
  [/FIRST NAME/, 'firstName'],
  [/MIDDLE NAME/, 'middleName'],
  [/FATHER|SPOU/, 'fatherSpouseName'],
  [/GENDER/, 'gender'],
  [/^RELATION/, 'relationType'],
  [/DATE OF BIRTH|^DOB/, 'dob'],
  [/MARRIED|MARITAL/, 'maritalStatus'],
  [/NATIONALITY/, 'nationality'],
  [/EDUCATION/, 'education'],
  [/DATE OF JOINING|^DOJ/, 'joinDate'],
  [/DESIGNATION/, 'designation'],
  [/CATEGORY/, 'category'],
  [/TYPE OF EMPLOYMENT/, 'employmentType'],
  [/MOBIL|MOBILE|^PHONE/, 'phone'],
  [/^PF\s*NO|^PF$/, 'pfNumber'],
  [/UAN/, 'uan'],
  [/ESIC/, 'esiNumber'],
  [/^PAN/, 'pan'],
  [/AADHAR/, 'aadhaar'],
  [/PRESENT ADDRESS/, 'presentAddress'],
  [/PERMENENT|PERMANENT/, 'permanentAddress'],
  [/SERVICE BOOK/, 'serviceBookNo'],
  [/DATE OF EXIT/, 'exitDate'],
  [/REASON OF EXIT/, 'exitReason'],
  [/EMAIL/, 'email'],
  [/^PHOTO/, 'photoUpload'],
];

const norm = (s) => String(s == null ? '' : s).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
const HEADER_TOKENS = ['FULL NAME', 'ID NO', 'EMPLOYEE CODE', 'DESIGNATION', 'MOBIL', 'AADHAR'];

// Find the header row inside a sheet's array-of-arrays (first row matching >=3 tokens).
function findHeaderRow(aoa) {
  for (let i = 0; i < Math.min(aoa.length, 8); i++) {
    const cells = (aoa[i] || []).map(norm);
    const hits = HEADER_TOKENS.filter((t) => cells.some((c) => c.includes(t))).length;
    if (hits >= 3) return i;
  }
  return -1;
}

// Map each column index -> canonical field, first match wins, no double-assign.
function buildColumnMap(headerCells) {
  const map = {};
  const used = new Set();
  headerCells.forEach((cell, idx) => {
    const h = norm(cell);
    if (!h) return;
    for (const [re, field] of HEADER_MAP) {
      if (used.has(field)) continue;
      if (re.test(h)) { map[idx] = field; used.add(field); break; }
    }
  });
  return map;
}

// ── value normalisers ──────────────────────────────────────────────────────
function cleanCode(v) {
  if (v == null) return null;
  const s = String(v).replace(/[\r\n]+/g, '').trim().toUpperCase();
  return s || null;
}
function cleanMobile(v) {
  if (v == null) return null;
  const runs = String(v).match(/\d{6,}/g);
  if (!runs) return null;
  for (let run of runs) {
    if (run.length >= 12 && run.startsWith('91')) run = run.slice(run.length - 10);
    if (run.length === 11 && run.startsWith('0')) run = run.slice(1);
    if (run.length === 10 && /^[6-9]/.test(run)) return run;
  }
  // fallback: last 10 digits of the longest run
  const longest = runs.sort((a, b) => b.length - a.length)[0];
  const tail = longest.slice(-10);
  return /^[6-9]\d{9}$/.test(tail) ? tail : null;
}
function cleanStr(v) {
  if (v == null) return null;
  const s = String(v).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  return s === '' ? null : s;
}
function titleCase(s) {
  return s ? s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : s;
}
// Parse messy dates: dd/mm/yy, m/d/yy, dd/mm/yyyy, Excel serials. Returns Date|null.
function parseDate(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') { // Excel serial
    const d = XLSX.SSF ? XLSX.SSF.parse_date_code(v) : null;
    if (d) return new Date(Date.UTC(d.y, d.m - 1, d.d));
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    let [, a, b, y] = m; a = +a; b = +b; y = +y;
    if (y < 100) y += y < 50 ? 2000 : 1900;
    // Heuristic: if a>12 it's the day (dd/mm); else assume dd/mm (Indian) unless b>12
    let day, mon;
    if (a > 12) { day = a; mon = b; }
    else if (b > 12) { mon = a; day = b; }
    else { day = a; mon = b; } // ambiguous -> assume dd/mm
    if (mon < 1 || mon > 12 || day < 1 || day > 31) return null;
    return new Date(Date.UTC(y, mon - 1, day));
  }
  const d = new Date(s);
  return isNaN(d) ? null : d;
}
// department derived from designation keyword (real data, not invented).
function deriveDepartment(designation) {
  const d = (designation || '').toUpperCase();
  if (/NURSE/.test(d)) return 'Nursing';
  if (/DOCTOR|MEDICAL OFFICER|CONSULTANT|PHYSICIAN|SURGEON|ONCOLOG/.test(d)) return 'Medical';
  if (/TECH|RADIO|LAB|PHARMA|OT |OPERATION THEATRE/.test(d)) return 'Technical';
  if (/CLERK|ADMIN|ACCOUNT|HR|OFFICE|RECEPTION|DATA/.test(d)) return 'Administration';
  if (/WARD|AYA|ATTEND|HELPER|SWEEPER|HOUSE KEEP|HOUSEKEEP|SECURITY|GUARD|PEON|DRIVER/.test(d)) return 'Support Staff';
  return 'General';
}

function isValidEmail(e) { return !e || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }

// ── parse one sheet into normalised employee records + per-row issues ──────
function parseSheet(ws, sheetName, branch) {
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false });
  const hr = findHeaderRow(aoa);
  if (hr === -1) return { records: [], issues: [{ sheet: sheetName, error: 'header row not found' }] };
  const colMap = buildColumnMap(aoa[hr]);
  const records = [];
  const issues = [];
  for (let r = hr + 1; r < aoa.length; r++) {
    const row = aoa[r] || [];
    const get = (field) => {
      const idx = Object.keys(colMap).find((k) => colMap[k] === field);
      return idx === undefined ? null : row[idx];
    };
    const rec = {};
    for (const idx of Object.keys(colMap)) rec[colMap[idx]] = row[idx];

    const fullName = cleanStr(rec.fullName) || cleanStr(rec.nameAadhar);
    const code = cleanCode(rec.code) || cleanCode(rec.serviceBookNo);
    // skip fully empty rows
    if (!fullName && !code) continue;

    const mobile = cleanMobile(rec.phone);
    const email = cleanStr(rec.email);
    const designation = cleanStr(rec.designation) || 'Staff';
    const rowIssues = [];
    if (!code) rowIssues.push('missing employee code');
    else if (!/^VE\d+/i.test(code) && !/^\d+$/.test(code)) rowIssues.push(`unusual code "${code}"`);
    if (!fullName) rowIssues.push('missing name');
    if (rec.phone && !mobile) rowIssues.push(`invalid mobile "${String(rec.phone).replace(/[\r\n]+/g, ' ').trim()}"`);
    if (email && !isValidEmail(email)) rowIssues.push(`invalid email "${email}"`);

    records.push({
      sheet: sheetName,
      excelRow: r + 1,
      code,
      name: titleCase(fullName) || null,
      rawName: fullName,
      firstName: titleCase(cleanStr(rec.firstName)),
      middleName: titleCase(cleanStr(rec.middleName)),
      lastName: titleCase(cleanStr(rec.surname)),
      phone: mobile,
      email: email || '',
      gender: cleanStr(rec.gender),
      dob: cleanStr(rec.dob),
      maritalStatus: cleanStr(rec.maritalStatus),
      nationality: cleanStr(rec.nationality),
      fatherSpouseName: titleCase(cleanStr(rec.fatherSpouseName)),
      relationType: cleanStr(rec.relationType),
      designation,
      department: deriveDepartment(designation),
      category: cleanStr(rec.category),
      employmentType: cleanStr(rec.employmentType),
      joinDate: parseDate(rec.joinDate),
      exitDate: parseDate(rec.exitDate),
      exitReason: cleanStr(rec.exitReason),
      pan: cleanStr(rec.pan) ? rec.pan.toUpperCase().trim() : null,
      aadhaar: cleanStr(rec.aadhaar),
      uan: cleanStr(rec.uan),
      pfNumber: cleanStr(rec.pfNumber),
      esiNumber: cleanStr(rec.esiNumber),
      bankName: cleanStr(rec.bankName),
      accountNumber: cleanStr(rec.accountNumber),
      ifsc: cleanStr(rec.ifsc) ? rec.ifsc.toUpperCase().replace(/\s+/g, '') : null,
      presentAddress: cleanStr(rec.presentAddress),
      permanentAddress: cleanStr(rec.permanentAddress),
      serviceBookNo: cleanStr(rec.serviceBookNo),
      branchId: branch.id,
      branchName: branch.name,
      issues: rowIssues,
    });
  }
  return { records, issues };
}

async function ensureCompanyAndBranches() {
  let company = await prisma.company.findUnique({ where: { id: COMPANY_ID } });
  if (!company && APPLY) {
    company = await prisma.company.create({ data: { id: COMPANY_ID, name: COMPANY_NAME, isHeadOffice: true } });
    console.log(`  + created company ${COMPANY_NAME}`);
  }
  const branchStatus = {};
  for (const [sheet, b] of Object.entries(SHEET_BRANCH)) {
    let br = await prisma.branch.findUnique({ where: { id: b.id } });
    if (!br) {
      if (APPLY) {
        br = await prisma.branch.create({ data: { id: b.id, companyId: COMPANY_ID, branchName: b.name, location: b.location, branchCode: b.code } });
        branchStatus[sheet] = 'created';
      } else branchStatus[sheet] = 'MISSING (would create)';
    } else branchStatus[sheet] = 'exists';
  }
  return { company: !!company, branchStatus };
}

async function main() {
  console.log('============================================================');
  console.log(' IMPORT / RECONCILE  Employee Excel  ->  MySQL');
  console.log(' MODE:', APPLY ? 'APPLY (create missing)' : 'ANALYZE (no writes)');
  console.log(' FILE:', EXCEL_FILE);
  console.log('============================================================\n');
  if (!fs.existsSync(EXCEL_FILE)) { console.error('ERROR: Excel not found:', EXCEL_FILE); process.exit(1); }

  const wb = XLSX.readFile(EXCEL_FILE, { cellDates: false });
  const { company, branchStatus } = await ensureCompanyAndBranches();
  console.log('Company present:', company, '| Branches:', JSON.stringify(branchStatus), '\n');

  // 1) parse every branch sheet
  let allRecords = [];
  const parseIssues = [];
  const perSheet = {};
  for (const [sheet, branch] of Object.entries(SHEET_BRANCH)) {
    if (!wb.Sheets[sheet]) { parseIssues.push({ sheet, error: 'sheet not found in workbook' }); continue; }
    const { records, issues } = parseSheet(wb.Sheets[sheet], sheet, branch);
    perSheet[sheet] = records.length;
    allRecords = allRecords.concat(records);
    parseIssues.push(...issues);
  }
  console.log('── Parsed Excel rows per branch ──');
  for (const [s, n] of Object.entries(perSheet)) console.log(`  ${s.padEnd(12)} ${String(n).padStart(5)}`);
  console.log(`  ${'TOTAL'.padEnd(12)} ${String(allRecords.length).padStart(5)}\n`);

  // 2) in-Excel de-duplication by code
  const seen = new Map();
  const duplicates = [];
  const unique = [];
  for (const rec of allRecords) {
    const key = rec.code ? rec.code.toUpperCase() : null;
    if (key && seen.has(key)) { duplicates.push({ code: key, rows: [seen.get(key).excelRow, rec.excelRow], name: rec.rawName }); continue; }
    if (key) seen.set(key, rec);
    unique.push(rec);
  }

  // 3) load DB roster
  const dbEmployees = await prisma.employee.findMany({
    where: { companyId: COMPANY_ID },
    select: { id: true, employeeId: true, name: true, phone: true, branchId: true },
  });
  const dbByCode = new Map(dbEmployees.map((e) => [String(e.employeeId).toUpperCase(), e]));
  const excelCodes = new Set(unique.filter((r) => r.code).map((r) => r.code.toUpperCase()));

  // 4) reconcile
  const toCreate = [];
  const matched = [];
  const branchMismatch = [];
  const invalid = [];          // no name at all -> cannot import
  const noCodeNamed = [];      // real name but no code -> import with generated code
  for (const rec of unique) {
    if (!rec.rawName) { invalid.push(rec); continue; }
    if (!rec.code) { noCodeNamed.push(rec); continue; }
    const db = dbByCode.get(rec.code.toUpperCase());
    if (db) {
      matched.push(rec);
      if (db.branchId !== rec.branchId) branchMismatch.push({ code: rec.code, db: db.branchId, excel: rec.branchId, name: rec.name });
    } else {
      toCreate.push(rec);
    }
  }
  // assign deterministic, clearly-marked codes to named-but-codeless rows
  noCodeNamed.forEach((rec) => { rec.code = `NOCODE-${rec.sheet.slice(0, 3)}-${rec.excelRow}`; rec.generatedCode = true; toCreate.push(rec); });
  // DB rows not represented in the Excel roster
  const dbNotInExcel = dbEmployees.filter((e) => !excelCodes.has(String(e.employeeId).toUpperCase()));
  const testRecords = dbNotInExcel.filter((e) => /TEST|AUTO|^E\d|DEMO|SAMPLE|EMP-/i.test(e.employeeId) || /TEST|AUTO|DEMO|SAMPLE/i.test(e.name || ''));

  // 5) report
  console.log('── Reconcile (Excel vs MySQL, by employee code) ──');
  console.log(`  Excel unique employees     : ${unique.length}`);
  console.log(`  In-Excel duplicate codes   : ${duplicates.length}`);
  console.log(`  Already in DB (matched)    : ${matched.length}`);
  console.log(`  Missing from DB (to create): ${toCreate.length}  (incl. ${noCodeNamed.length} named-but-codeless -> generated code)`);
  console.log(`  Invalid (no name, skipped) : ${invalid.length}`);
  console.log(`  Branch mismatches          : ${branchMismatch.length}`);
  console.log(`  DB rows NOT in Excel       : ${dbNotInExcel.length}  (of which test/demo-like: ${testRecords.length})`);
  if (testRecords.length) {
    console.log('   test/demo-like DB records:');
    for (const t of testRecords) console.log(`     - ${t.employeeId}  "${t.name}"  branch=${t.branchId}`);
  }
  if (branchMismatch.length) {
    console.log('   branch mismatches (first 10):');
    branchMismatch.slice(0, 10).forEach((b) => console.log(`     - ${b.code} ${b.name}: DB=${b.db} Excel=${b.excel}`));
  }

  // 6) apply: create the missing employees
  let created = 0, createFailed = [];
  if (APPLY && toCreate.length) {
    console.log(`\n── Creating ${toCreate.length} missing employees ──`);
    for (const rec of toCreate) {
      try {
        await prisma.employee.create({ data: {
          employeeId: rec.code,
          companyId: COMPANY_ID,
          branchId: rec.branchId,
          name: rec.name,
          firstName: rec.firstName, middleName: rec.middleName, lastName: rec.lastName,
          email: rec.email || '',
          phone: rec.phone,
          department: rec.department,
          designation: rec.designation,
          status: rec.exitDate ? 'Inactive' : 'Active',
          joinDate: rec.joinDate || new Date(),
          exitDate: rec.exitDate, exitReason: rec.exitReason,
          gender: rec.gender, dob: rec.dob, maritalStatus: rec.maritalStatus,
          nationality: rec.nationality, fatherSpouseName: rec.fatherSpouseName, relationType: rec.relationType,
          category: rec.category, employmentType: rec.employmentType,
          pan: rec.pan, aadhaar: rec.aadhaar, uan: rec.uan, pfNumber: rec.pfNumber, esiNumber: rec.esiNumber,
          bankName: rec.bankName, accountNumber: rec.accountNumber, ifsc: rec.ifsc,
          presentAddress: rec.presentAddress, permanentAddress: rec.permanentAddress,
          serviceBookNo: rec.serviceBookNo, branchLocation: rec.branchName,
        } });
        created++;
      } catch (e) {
        createFailed.push({ code: rec.code, name: rec.name, error: e.message.split('\n')[0] });
      }
    }
    console.log(`  created: ${created} | failed: ${createFailed.length}`);
    // refresh branch headcounts to live counts
    for (const b of Object.values(SHEET_BRANCH)) {
      const n = await prisma.employee.count({ where: { branchId: b.id } });
      await prisma.branch.update({ where: { id: b.id }, data: { headcount: n } });
    }
    const total = await prisma.employee.count({ where: { companyId: COMPANY_ID } });
    await prisma.company.update({ where: { id: COMPANY_ID }, data: { employeeCount: total } });
    console.log('  refreshed branch headcounts + company employeeCount to live values');
  }

  // 7) write log
  const logDir = path.resolve(__dirname, 'data');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  const log = {
    generatedAt: new Date().toISOString(),
    mode: APPLY ? 'apply' : 'analyze',
    file: EXCEL_FILE,
    perSheet, totalParsed: allRecords.length, uniqueEmployees: unique.length,
    counts: {
      matched: matched.length, missingToCreate: toCreate.length, generatedCode: noCodeNamed.length,
      invalid: invalid.length, duplicates: duplicates.length, branchMismatch: branchMismatch.length,
      dbNotInExcel: dbNotInExcel.length, created, createFailed: createFailed.length,
    },
    createdWithGeneratedCode: noCodeNamed.map((r) => ({ sheet: r.sheet, row: r.excelRow, code: r.code, name: r.rawName })),
    duplicates, branchMismatch,
    invalidRows: invalid.map((r) => ({ sheet: r.sheet, row: r.excelRow, name: r.rawName, code: r.code, issues: r.issues })),
    validationWarnings: unique.filter((r) => r.issues.length).map((r) => ({ sheet: r.sheet, row: r.excelRow, code: r.code, name: r.rawName, issues: r.issues })),
    dbNotInExcel: dbNotInExcel.map((e) => ({ employeeId: e.employeeId, name: e.name, branchId: e.branchId })),
    testRecords: testRecords.map((e) => ({ employeeId: e.employeeId, name: e.name, branchId: e.branchId })),
    createFailed,
    parseIssues,
  };
  const logFile = path.join(logDir, 'employee-import-log.json');
  fs.writeFileSync(logFile, JSON.stringify(log, null, 2));
  console.log(`\nLog written: ${logFile}`);
  console.log(`Validation warnings logged: ${log.validationWarnings.length}`);
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error('FATAL:', e); try { await prisma.$disconnect(); } catch {} process.exit(1); });
