/**
 * Seed the Country → State → City masters from the bundled dataset.
 * Idempotent: safe to run repeatedly (uses upsert / skipDuplicates).
 *
 * Run once after applying the schema:
 *   cd backend
 *   npx prisma db push
 *   node prisma/seedLocationMasters.js
 *
 * (The app also lazy-seeds on first use, so this is optional but explicit.)
 */
const { PrismaClient } = require('@prisma/client');
const { STATE_CITIES, COUNTRIES, DEFAULT_COUNTRY } = require('../src/data/locationData');

const prisma = new PrismaClient();

async function main() {
  console.log(`Seeding ${COUNTRIES.length} countries…`);
  await prisma.countryMaster.createMany({ data: COUNTRIES.map(name => ({ name, isCustom: false })), skipDuplicates: true });

  const india = await prisma.countryMaster.findUnique({ where: { name: DEFAULT_COUNTRY } });
  if (!india) throw new Error('Default country (India) not found after seeding.');

  let stateCount = 0, cityCount = 0;
  for (const [stateName, cities] of Object.entries(STATE_CITIES)) {
    const st = await prisma.stateMaster.upsert({
      where: { countryId_name: { countryId: india.id, name: stateName } },
      update: {}, create: { name: stateName, countryId: india.id, isCustom: false },
    });
    stateCount++;
    const created = await prisma.cityMaster.createMany({ data: cities.map(name => ({ name, stateId: st.id, isCustom: false })), skipDuplicates: true });
    cityCount += created.count;
  }
  console.log(`Done. States: ${stateCount}, cities inserted: ${cityCount}.`);
}

main()
  .catch((e) => { console.error('Seed failed:', e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
