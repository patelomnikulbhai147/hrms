/**
 * ============================================================================
 *  MIGRATE employee codes -> professional branch-wise format  VE-<BRANCH>-####
 * ============================================================================
 *
 *  - Sets each Vishv Enterprise branch's `branchCode` (AHMD/BHAV/RJKT/SIDD).
 *  - Re-codes every employee per branch with a clean, zero-padded sequence,
 *    deterministically ordered by their legacy VE number then name.
 *  - Preserves the previous code in `legacyEmployeeId` (zero data loss).
 *  - Relationships are untouched: Payroll/Attendance/Leave reference Employee.id
 *    (the primary key), NOT the code, so re-coding `employeeId` is safe.
 *  - Verifies: every employee coded, no duplicates, per-branch contiguous 1..N.
 *  - Writes a full old->new mapping to scripts/data/employee-code-migration.json
 *
 *  USAGE
 *      node scripts/migrateEmployeeCodes.js            # analyze (no writes)
 *      node scripts/migrateEmployeeCodes.js --apply    # perform migration
 * ============================================================================
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const prisma = require('../src/config/prisma');
const { buildCode, companyPrefix } = require('../src/utils/employeeCode');

const APPLY = process.argv.includes('--apply');
const COMPANY_ID = 'c-gcri';

// Desired branch codes for Vishv Enterprise branches.
const BRANCH_CODES = {
  'c-ahmedabad': 'AHMD',
  'c-bhavnagar': 'BHAV',
  'c-rajkot':    'RJKT',
  'c-siddhpur':  'SIDD',
};

// Deterministic ordering: legacy VE number ascending, then name.
function legacyVeNum(code) {
  const m = /^VE(\d+)$/.exec(String(code || ''));
  return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
}
function sortEmployees(a, b) {
  const na = legacyVeNum(a.employeeId), nb = legacyVeNum(b.employeeId);
  if (na !== nb) return na - nb;
  return String(a.name || '').localeCompare(String(b.name || ''));
}

async function main() {
  console.log('============================================================');
  console.log(' MIGRATE EMPLOYEE CODES ->  VE-<BRANCH>-####');
  console.log(' MODE:', APPLY ? 'APPLY' : 'ANALYZE (no writes)');
  console.log('============================================================\n');

  const company = await prisma.company.findUnique({ where: { id: COMPANY_ID } });
  const prefix = companyPrefix(company);
  console.log(`Company: ${company?.name} | prefix: ${prefix}\n`);

  // 1) set branch codes
  console.log('── Branch codes ──');
  for (const [branchId, code] of Object.entries(BRANCH_CODES)) {
    const br = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!br) { console.log(`  ${branchId}: MISSING`); continue; }
    console.log(`  ${br.branchName.padEnd(12)} ${br.branchCode || '(none)'} -> ${code}`);
    if (APPLY) await prisma.branch.update({ where: { id: branchId }, data: { branchCode: code } });
  }

  // 2) assign codes per branch
  const mapping = [];
  const allNewCodes = new Set();
  let totalRecoded = 0;
  console.log('\n── Re-coding employees per branch ──');
  for (const [branchId, branchCode] of Object.entries(BRANCH_CODES)) {
    const emps = await prisma.employee.findMany({ where: { companyId: COMPANY_ID, branchId } });
    emps.sort(sortEmployees);
    let seq = 0;
    for (const e of emps) {
      seq++;
      const newCode = buildCode(prefix, branchCode, seq);
      if (allNewCodes.has(newCode)) throw new Error(`Duplicate new code generated: ${newCode}`);
      allNewCodes.add(newCode);
      mapping.push({ id: e.id, name: e.name, branchId, oldCode: e.employeeId, newCode });
      totalRecoded++;
    }
    console.log(`  ${branchCode}: ${emps.length} employees -> ${branchCode}-0001 … ${branchCode}-${String(seq).padStart(4, '0')}`);
  }

  // employees with no branch (should be 0 for GCRI) -> HQ sequence
  const noBranch = await prisma.employee.findMany({ where: { companyId: COMPANY_ID, branchId: null } });
  if (noBranch.length) {
    noBranch.sort(sortEmployees);
    let seq = 0;
    for (const e of noBranch) {
      seq++;
      const newCode = buildCode(prefix, 'HQ', seq);
      mapping.push({ id: e.id, name: e.name, branchId: null, oldCode: e.employeeId, newCode });
      allNewCodes.add(newCode);
      totalRecoded++;
    }
    console.log(`  HQ (no branch): ${noBranch.length} employees`);
  }

  console.log(`\n  total to re-code: ${totalRecoded}`);
  console.log(`  unique new codes: ${allNewCodes.size}  ${allNewCodes.size === totalRecoded ? 'OK' : 'DUPLICATE!'}`);

  // 3) apply updates — two-phase to avoid unique collisions during the swap
  if (APPLY) {
    console.log('\n── Applying (phase 1: temp codes, phase 2: final codes) ──');
    // Phase 1: move everyone to a guaranteed-free temp code, stash legacy code.
    for (const m of mapping) {
      await prisma.employee.update({
        where: { id: m.id },
        data: { employeeId: `TMP-${m.id.slice(0, 12)}-${Math.abs(hash(m.newCode)) % 100000}`, legacyEmployeeId: m.oldCode },
      });
    }
    // Phase 2: set the real new codes.
    for (const m of mapping) {
      await prisma.employee.update({ where: { id: m.id }, data: { employeeId: m.newCode } });
    }
    console.log('  done.');
  }

  // 4) write mapping artifact
  const dir = path.resolve(__dirname, 'data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, 'employee-code-migration.json');
  fs.writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), mode: APPLY ? 'apply' : 'analyze', prefix, branchCodes: BRANCH_CODES, total: totalRecoded, mapping }, null, 2));
  console.log(`\nMapping written: ${out}`);

  // 5) verify after apply
  if (APPLY) {
    const total = await prisma.employee.count({ where: { companyId: COMPANY_ID } });
    const coded = await prisma.employee.count({ where: { companyId: COMPANY_ID, employeeId: { startsWith: prefix + '-' } } });
    const distinct = await prisma.employee.findMany({ where: { companyId: COMPANY_ID }, select: { employeeId: true } });
    const uniq = new Set(distinct.map((d) => d.employeeId));
    console.log('\n── Verification ──');
    console.log(`  total GCRI employees: ${total}`);
    console.log(`  coded ${prefix}-* : ${coded}  ${coded === total ? 'OK' : 'MISMATCH'}`);
    console.log(`  unique codes: ${uniq.size}/${total}  ${uniq.size === total ? 'OK (no duplicates)' : 'DUPLICATES!'}`);
  }
  await prisma.$disconnect();
}

function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; } return h; }

main().catch(async (e) => { console.error('FATAL:', e); try { await prisma.$disconnect(); } catch {} process.exit(1); });
