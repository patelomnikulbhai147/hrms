/**
 * Merge master-data values that differ ONLY by casing.
 *
 * Production had the same branch stored as "AHMEDABAD" (774 rows) and
 * "Ahmedabad" (5 rows), so every filter and dropdown listed it twice. Same for
 * RAJKOT/Rajkot, BHAVNAGAR/Bhavnagar, STAFF NURSE/Staff Nurse, SKILLED/Skilled.
 *
 * SCOPE — deliberately narrow:
 *   • CATEGORICAL fields only (branch/department/designation/category/city/state).
 *     Employee NAMES are never rewritten: they are rendered in Title Case by the
 *     frontend instead, so nothing that was typed or imported is destroyed.
 *   • CASING ONLY. Values that differ by spelling, spacing or abbreviation
 *     ("SEMI SKILLED" vs "Semi-skilled", "X-RAY TEC" vs "XRAY TECHNICIAN",
 *     "Admin" vs "Administration") are left alone and REPORTED — merging those is
 *     a business decision, not a formatting one.
 *
 * The winning spelling is the Title Case form from utils/titleCase.js, so the
 * result is consistent regardless of which variant happened to be more common.
 *
 *   node backend/scripts/normalizeMasterDataCasing.js --check   # report only
 *   node backend/scripts/normalizeMasterDataCasing.js           # apply
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const prisma = require('../src/config/prisma');
const { titleCase, normalizeKey } = require('../src/utils/titleCase');

const CHECK = process.argv.includes('--check');

// model → the categorical text columns safe to normalise.
const TARGETS = [
  { model: 'employee', fields: ['branchLocation', 'department', 'designation', 'category', 'city', 'state'] },
  { model: 'branch', fields: ['branchName', 'location'] },
  { model: 'company', fields: ['city', 'state', 'industry', 'companyIndustry'] },
];

(async () => {
  console.log(`Master-data casing normalisation${CHECK ? '  [--check, nothing will be written]' : ''}\n`);
  const backup = [];
  let updated = 0;
  const spellingVariants = [];

  for (const { model, fields } of TARGETS) {
    let rows;
    try {
      rows = await prisma[model].findMany({ select: Object.fromEntries([['id', true], ...fields.map((f) => [f, true])]) });
    } catch (e) {
      console.log(`  SKIP ${model}: ${e.message.split('\n')[0].slice(0, 80)}`);
      continue;
    }

    for (const field of fields) {
      // Group the raw values by their case-insensitive key.
      const groups = new Map();
      for (const r of rows) {
        const v = r[field];
        if (v === null || v === undefined || String(v).trim() === '') continue;
        const k = normalizeKey(v);
        if (!groups.has(k)) groups.set(k, new Set());
        groups.get(k).add(v);
      }

      const collisions = [...groups.entries()].filter(([, variants]) => variants.size > 1);
      // Rows whose stored value differs from the canonical Title Case form.
      const toFix = rows.filter((r) => {
        const v = r[field];
        if (v === null || v === undefined || String(v).trim() === '') return false;
        return v !== titleCase(v);
      });
      if (!collisions.length && !toFix.length) continue;

      console.log(`── ${model}.${field}`);
      for (const [k, variants] of collisions) {
        console.log(`   merge ${[...variants].map((x) => JSON.stringify(x)).join(' + ')}  →  ${JSON.stringify(titleCase(k))}`);
      }
      if (!collisions.length) console.log(`   restyle ${toFix.length} row(s) to Title Case`);

      if (!CHECK) {
        // Group the writes by target value so this is a handful of updateMany
        // calls rather than one per row.
        const byTarget = new Map();
        for (const r of toFix) {
          const target = titleCase(r[field]);
          if (!byTarget.has(target)) byTarget.set(target, []);
          byTarget.get(target).push({ id: r.id, from: r[field] });
        }
        for (const [target, list] of byTarget) {
          backup.push({ model, field, to: target, rows: list });
          const res = await prisma[model].updateMany({ where: { id: { in: list.map((x) => x.id) } }, data: { [field]: target } });
          updated += res.count;
        }
      } else {
        updated += toFix.length;
      }
    }

    // Report near-duplicates that casing alone will NOT merge, so they are visible
    // rather than silently left behind.
    for (const field of fields) {
      const canon = new Map();
      for (const r of rows) {
        const v = r[field];
        if (!v || !String(v).trim()) continue;
        const loose = normalizeKey(v).replace(/[^a-z0-9]/g, '');
        if (!canon.has(loose)) canon.set(loose, new Set());
        canon.get(loose).add(titleCase(v));
      }
      for (const [, set] of canon) {
        if (set.size > 1) spellingVariants.push(`${model}.${field}: ${[...set].map((x) => JSON.stringify(x)).join(' vs ')}`);
      }
    }
  }

  if (!CHECK && backup.length) {
    const p = path.join(__dirname, `casing-backup-${Date.now()}.json`);
    fs.writeFileSync(p, JSON.stringify(backup, null, 2));
    console.log(`\noriginals backed up → ${p}`);
  }

  console.log(`\n${CHECK ? 'would update' : 'updated'} ${updated} row value(s)`);

  if (spellingVariants.length) {
    console.log(`\n${spellingVariants.length} near-duplicate(s) that CASING CANNOT MERGE — these need a human decision:`);
    [...new Set(spellingVariants)].forEach((s) => console.log('   ' + s));
  }

  await prisma.$disconnect();
})().catch(async (e) => {
  console.error('FAILED:', e.message);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
