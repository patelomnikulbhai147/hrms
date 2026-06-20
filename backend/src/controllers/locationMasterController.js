/**
 * Location masters — Country → State → City reference data for the Employee
 * Personal-Info (State, City) and Nationality fields.
 *
 * Canonical data lives in src/data/locationData.js and is lazily seeded into the
 * relational masters (country_masters → state_masters → city_masters). Custom
 * additions are persisted with isCustom=true: a custom CITY is always linked to
 * its STATE, so a state's city dropdown only ever shows that state's cities.
 *
 * Everything degrades gracefully: if the master tables are not migrated yet, the
 * endpoints fall back to the legacy flat `location_masters` table so the app keeps
 * working and existing employee records are never affected.
 */
const prisma = require('../config/prisma');
const { STATE_CITIES, COUNTRIES, DEFAULT_COUNTRY } = require('../data/locationData');

const clean = (v) => (v == null ? '' : String(v).trim());
const canAdd = (req) => ['Super Admin', 'Company Head', 'HR', 'Finance'].includes(req.user?.role);
const isSuperAdmin = (req) => req.user?.role === 'Super Admin';

let seedAttempted = false;

// Populate the masters from the bundled dataset the first time they're empty.
// Idempotent and best-effort; a no-op (caught) if the tables aren't migrated yet.
async function seedIfEmpty() {
  if (seedAttempted) return;
  seedAttempted = true;
  try {
    if ((await prisma.countryMaster.count()) > 0) return;
    await prisma.countryMaster.createMany({ data: COUNTRIES.map(name => ({ name, isCustom: false })), skipDuplicates: true });
    const india = await prisma.countryMaster.findUnique({ where: { name: DEFAULT_COUNTRY } });
    if (india) {
      for (const [stateName, cities] of Object.entries(STATE_CITIES)) {
        const st = await prisma.stateMaster.upsert({
          where: { countryId_name: { countryId: india.id, name: stateName } },
          update: {}, create: { name: stateName, countryId: india.id, isCustom: false },
        });
        await prisma.cityMaster.createMany({ data: cities.map(name => ({ name, stateId: st.id, isCustom: false })), skipDuplicates: true });
      }
    }
  } catch (e) {
    // Tables not migrated yet (run `npx prisma db push`) or a transient DB issue —
    // non-fatal; the static fallback in getAll covers the dropdowns.
    console.warn('locationMaster.seedIfEmpty skipped:', e.code || e.message);
  }
}

// GET / — custom additions for the creatable dropdowns. Canonical lists live on
// the client (static, instant); this returns what the user has added so the two
// are merged. Shape: { countries:[], states:[], cities:[], citiesByState:{} }.
exports.getAll = async (req, res) => {
  // Guaranteed-safe base from the legacy flat table.
  let cities = [], states = [];
  try {
    const rows = await prisma.locationMaster.findMany({ orderBy: { name: 'asc' } });
    cities = rows.filter(r => r.type === 'city').map(r => r.name);
    states = rows.filter(r => r.type === 'state').map(r => r.name);
  } catch { /* legacy table unavailable — ignore */ }

  let countries = [];
  const citiesByState = {};
  try {
    await seedIfEmpty();
    const [customCountries, customStates, customCities] = await Promise.all([
      prisma.countryMaster.findMany({ where: { isCustom: true }, orderBy: { name: 'asc' } }),
      prisma.stateMaster.findMany({ where: { isCustom: true }, orderBy: { name: 'asc' } }),
      prisma.cityMaster.findMany({ where: { isCustom: true }, include: { state: true } }),
    ]);
    countries = customCountries.map(c => c.name);
    states = Array.from(new Set([...states, ...customStates.map(s => s.name)]));
    for (const c of customCities) {
      const sn = c.state && c.state.name;
      if (!sn) continue;
      (citiesByState[sn] = citiesByState[sn] || []).push(c.name);
    }
  } catch (e) {
    console.warn('locationMaster.getAll masters unavailable:', e.code || e.message);
  }
  res.json({ countries, states, cities, citiesByState });
};

// POST /city — { state, name }. Custom city linked to its state (Country → State → City).
exports.addCity = async (req, res) => {
  try {
    if (!canAdd(req)) return res.status(403).json({ error: 'You do not have permission to add locations.' });
    const state = clean(req.body?.state).slice(0, 191);
    const name = clean(req.body?.name).slice(0, 191);
    if (!state || !name) return res.status(400).json({ error: 'Both state and city name are required.' });
    try {
      const country = await prisma.countryMaster.upsert({ where: { name: DEFAULT_COUNTRY }, update: {}, create: { name: DEFAULT_COUNTRY, isCustom: false } });
      const knownState = Object.prototype.hasOwnProperty.call(STATE_CITIES, state);
      const st = await prisma.stateMaster.upsert({
        where: { countryId_name: { countryId: country.id, name: state } },
        update: {}, create: { name: state, countryId: country.id, isCustom: !knownState },
      });
      const knownCity = (STATE_CITIES[state] || []).some(c => c.toLowerCase() === name.toLowerCase());
      const city = await prisma.cityMaster.upsert({
        where: { stateId_name: { stateId: st.id, name } },
        update: {}, create: { name, stateId: st.id, isCustom: !knownCity },
      });
      // Mirror into the legacy flat table so older readers still see the city.
      await prisma.locationMaster.upsert({ where: { type_name: { type: 'city', name } }, update: {}, create: { type: 'city', name } }).catch(() => {});
      return res.status(201).json({ city: city.name, state: st.name });
    } catch (e) {
      // Masters not migrated — keep the value via the legacy flat table.
      await prisma.locationMaster.upsert({ where: { type_name: { type: 'city', name } }, update: {}, create: { type: 'city', name } }).catch(() => {});
      return res.status(201).json({ city: name, state, degraded: true });
    }
  } catch (e) {
    console.error('locationMaster.addCity', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

// POST /country — { name }. Manual nationality entry is Super-Admin only.
exports.addCountry = async (req, res) => {
  try {
    if (!isSuperAdmin(req)) return res.status(403).json({ error: 'Only a Super Admin can add a new country.' });
    const name = clean(req.body?.name).slice(0, 191);
    if (!name) return res.status(400).json({ error: 'Country name is required.' });
    try {
      const row = await prisma.countryMaster.upsert({ where: { name }, update: {}, create: { name, isCustom: true } });
      return res.status(201).json({ country: row.name });
    } catch (e) {
      return res.status(201).json({ country: name, degraded: true });
    }
  } catch (e) {
    console.error('locationMaster.addCountry', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

// POST / — legacy { type:'city'|'state', name }. Kept for backward compatibility.
exports.add = async (req, res) => {
  try {
    if (!canAdd(req)) return res.status(403).json({ error: 'You do not have permission to add locations.' });
    const type = clean(req.body?.type).toLowerCase();
    const name = clean(req.body?.name).slice(0, 191);
    if (type !== 'city' && type !== 'state') return res.status(400).json({ error: "type must be 'city' or 'state'." });
    if (!name) return res.status(400).json({ error: 'Name is required.' });
    const row = await prisma.locationMaster.upsert({ where: { type_name: { type, name } }, update: {}, create: { type, name } });
    // Best-effort: also reflect a custom state into the relational masters.
    if (type === 'state') {
      try {
        const country = await prisma.countryMaster.upsert({ where: { name: DEFAULT_COUNTRY }, update: {}, create: { name: DEFAULT_COUNTRY, isCustom: false } });
        const knownState = Object.prototype.hasOwnProperty.call(STATE_CITIES, name);
        await prisma.stateMaster.upsert({ where: { countryId_name: { countryId: country.id, name } }, update: {}, create: { name, countryId: country.id, isCustom: !knownState } });
      } catch { /* masters not migrated — flat row is enough */ }
    }
    res.status(201).json(row);
  } catch (e) {
    console.error('locationMaster.add', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

// Helper for other controllers: remember a custom location (best-effort).
exports.remember = async (type, name) => {
  const n = clean(name).slice(0, 191);
  if (!n || (type !== 'city' && type !== 'state')) return;
  try { await prisma.locationMaster.upsert({ where: { type_name: { type, name: n } }, update: {}, create: { type, name: n } }); }
  catch { /* non-blocking */ }
};
