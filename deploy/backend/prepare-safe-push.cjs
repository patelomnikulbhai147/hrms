#!/usr/bin/env node
/**
 * prepare-safe-push.js — make `prisma db push` NON-DESTRUCTIVE on the live RDS.
 *
 * The committed prisma/schema.prisma is destructive vs the live database:
 *   1. It DROPS three legacy columns that still hold real history:
 *        Employee.serviceBookNo, Payroll.leaveEncashmentAmount, Payroll.leaveEncashmentDays
 *   2. It ADDS unique constraints that the live data violates, so the push FAILS
 *      half-applied (MySQL DDL auto-commits) → columns already dropped = data loss:
 *        Attendance @@unique([employeeId, date])   (duplicate day-rows exist)
 *        TemporaryEmployee.mobile @unique          (duplicate mobile exists)
 *
 * This script rewrites schema.prisma IN PLACE so `db push` becomes purely
 * additive: it re-adds the 3 legacy columns (as optional — the app ignores them
 * but the DB keeps the data) and removes the 2 unresolved unique constraints.
 * The push then only CREATES the new tables (invoice_*, payroll_components,
 * whatsapp_*, automation_*, support_sessions, company_owners, etimeoffice_*) and
 * ADDS the new nullable columns (departmentMeta, designJson) — no drops, no fails.
 *
 * IDEMPOTENT: safe to run twice. Run it AFTER `npx prisma generate` (so the
 * generated client still matches the full app schema) and BEFORE `npx prisma db
 * push`. `git reset --hard` restores the pristine schema each deploy, so this must
 * run on every deploy until the repo schema is permanently reconciled.
 *
 *   node deploy/backend/prepare-safe-push.js
 */
const fs = require('fs');
const path = require('path');

const SCHEMA = path.resolve(__dirname, '../../backend/prisma/schema.prisma');
let src = fs.readFileSync(SCHEMA, 'utf8');
const before = src;
const notes = [];

// Insert a field as the first line inside `model <Name> {` if `field` is absent.
function ensureField(model, field, line) {
  if (new RegExp(`\\b${field}\\b`).test(src)) {
    notes.push(`= ${model}.${field} already present — skipped`);
    return;
  }
  const re = new RegExp(`(model ${model} \\{\\r?\\n)`);
  if (!re.test(src)) { notes.push(`! model ${model} not found — SKIPPED (verify manually)`); return; }
  src = src.replace(re, `$1  ${line}\n`);
  notes.push(`+ re-added ${model}.${field}`);
}

// 1. Re-add the 3 legacy columns so db push never drops them.
ensureField('Employee', 'serviceBookNo',
  'serviceBookNo         String?  // legacy history — kept so db push never drops it');
ensureField('Payroll', 'leaveEncashmentAmount',
  'leaveEncashmentAmount Float?   // legacy history — kept so db push never drops it');
ensureField('Payroll', 'leaveEncashmentDays',
  'leaveEncashmentDays   Float?   // legacy history — kept so db push never drops it');

// 2. Drop the Attendance compound unique (live data still has duplicate day-rows).
{
  const re = /^[ \t]*@@unique\(\[employeeId, ?date\]\).*\r?\n/m;
  if (re.test(src)) { src = src.replace(re, ''); notes.push('- removed Attendance @@unique([employeeId, date])'); }
  else notes.push('= Attendance @@unique already absent — skipped');
}

// 3. Drop the TemporaryEmployee.mobile @unique (live data still has a duplicate).
{
  const re = /(\n[ \t]*mobile[ \t]+String)[ \t]+@unique/;
  if (re.test(src)) { src = src.replace(re, '$1        '); notes.push('- removed TemporaryEmployee.mobile @unique'); }
  else notes.push('= TemporaryEmployee.mobile @unique already absent — skipped');
}

if (src !== before) {
  fs.writeFileSync(SCHEMA, src, 'utf8');
  console.log('✔ schema.prisma patched for a safe additive db push:');
} else {
  console.log('✔ schema.prisma already safe (nothing to change):');
}
notes.forEach(n => console.log('   ' + n));
console.log('\nNext: npx prisma db push   (additive only — no drops, no data loss)');
