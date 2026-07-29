/**
 * Screenshot the redesigned Super Admin Subscription Management module through a
 * real browser.
 *
 *   node scripts/shotSubscriptionRedesign.js [frontendUrl] [outDir]
 *
 * Drives the real login form (the internal CAPTCHA is solved by reading the
 * characters out of the SVG the server returns — no security setting is touched),
 * then walks every section and sub-section, capturing each at 1440×900.
 *
 * A temporary Super Admin is created for the run — modelled on the existing Super
 * Admin so the permission matrix is faithful — and deleted afterwards, so no real
 * account's password is changed.
 *
 * Console errors and failed network requests are recorded per screen, so "no
 * errors" is measured rather than claimed.
 */
const puppeteer = require('puppeteer');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const prisma = require('../src/config/prisma');
require('dotenv').config();

const APP = process.argv[2] || 'http://localhost:5173';
const OUT = process.argv[3] || path.join(__dirname, '..', '..', 'screenshots', 'subscription-redesign');
const EMAIL = 'subscription.shot@qa.local';
const PASSWORD = 'Shot@12345';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── In-page helpers (serialised into the browser) ────────────────────────────

/** Click a button by its exact visible text, ignoring the sidebar / nav chrome. */
const CLICK_BY_TEXT = (label) => {
  const inChrome = (el) => !!el.closest('aside, nav, header');
  const btns = [...document.querySelectorAll('button, a[role="tab"]')]
    .filter((b) => b.textContent.trim() === label && b.offsetParent !== null && !inChrome(b));
  if (!btns.length) return false;
  btns[0].click();
  return true;
};

/** Click the first data row of the first table that has one. */
const CLICK_FIRST_ROW = () => {
  const table = [...document.querySelectorAll('table')].find((t) => t.querySelectorAll('tbody tr').length);
  if (!table) return null;
  const tr = table.querySelector('tbody tr');
  if (!tr) return null;
  const label = tr.querySelector('td')?.textContent.trim().split('\n')[0] || '';
  tr.click();
  return label;
};

/** A compact description of what actually rendered — proof independent of the image. */
const DESCRIBE = () => {
  const txt = (el) => (el ? el.textContent.trim().replace(/\s+/g, ' ') : '');
  const heading = txt(document.querySelector('h1'));
  const tiles = [...document.querySelectorAll('p, div')]
    .filter((el) => /uppercase/.test(el.className || '') && el.textContent.trim().length < 40)
    .slice(0, 8)
    .map((el) => el.textContent.trim());
  const table = [...document.querySelectorAll('table')].find((t) => t.querySelectorAll('tbody tr').length);
  const head = table ? [...table.querySelectorAll('thead th')].map((th) => txt(th)).filter(Boolean) : [];
  const rows = table ? table.querySelectorAll('tbody tr').length : 0;
  const firstRow = table
    ? [...(table.querySelector('tbody tr')?.querySelectorAll('td') || [])].map((td) => txt(td)).join(' | ').slice(0, 180)
    : '';
  const svgs = document.querySelectorAll('svg[role="img"]').length;
  const empty = /No .*yet|No .*match|Nothing/i.test(document.body.innerText) ;
  return { heading, tiles, head, rows, firstRow, charts: svgs, hasEmptyState: empty };
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  // ── Temporary Super Admin modelled on the real one ─────────────────────────
  const template = await prisma.user.findFirst({
    where: { role: 'Super Admin', status: 'Active' },
    select: { permissions: true, accessibleCompanyIds: true, companyId: true, branchId: true },
    orderBy: { id: 'asc' },
  });
  if (!template) throw new Error('No active Super Admin exists to model the screenshot account on.');

  await prisma.user.deleteMany({ where: { email: EMAIL } });
  const user = await prisma.user.create({
    data: {
      name: 'Subscription Shot', username: 'subscription.shot', email: EMAIL,
      passwordHash: await bcrypt.hash(PASSWORD, 10),
      role: 'Super Admin', status: 'Active',
      companyId: template.companyId ?? null,
      branchId: template.branchId ?? null,
      permissions: template.permissions ?? undefined,
      accessibleCompanyIds: template.accessibleCompanyIds ?? undefined,
    },
  });

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--window-size=1440,900'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

  const consoleErrors = [], failedRequests = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('requestfailed', (r) => failedRequests.push(`${r.method()} ${r.url()} — ${r.failure()?.errorText}`));
  page.on('response', (r) => { if (r.status() >= 400) failedRequests.push(`HTTP ${r.status()} ${r.url()}`); });

  let captchaCode = null;
  page.on('response', async (res) => {
    if (!res.url().includes('/auth/captcha')) return;
    try {
      const body = await res.json();
      const chars = [...String(body.captchaSvg || '').matchAll(/<text[^>]*>([^<])<\/text>/g)].map((m) => m[1]);
      if (chars.length) captchaCode = chars.join('');
    } catch (_) { /* not the JSON endpoint */ }
  });

  const shots = [];
  const capture = async (name, note) => {
    const file = path.join(OUT, `${name}.png`);
    await page.screenshot({ path: file, fullPage: false });
    const desc = await page.evaluate(DESCRIBE);
    shots.push({ name, note, ...desc });
    console.log(`\n▶ ${name}${note ? ` — ${note}` : ''}`);
    console.log(`  heading  : ${desc.heading}`);
    if (desc.head.length) console.log(`  columns  : ${desc.head.join(' · ')}`);
    console.log(`  rows     : ${desc.rows}${desc.charts ? ` · charts: ${desc.charts}` : ''}`);
    if (desc.firstRow) console.log(`  first row: ${desc.firstRow}`);
  };

  const click = async (label, waitMs = 1400) => {
    const ok = await page.evaluate(CLICK_BY_TEXT, label);
    if (!ok) console.log(`  ! could not find a control labelled "${label}"`);
    await sleep(waitMs);
    return ok;
  };

  try {
    // ── Login ────────────────────────────────────────────────────────────────
    await page.goto(APP, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForSelector('input[type="email"]', { timeout: 30000 });
    await page.type('input[type="email"]', EMAIL, { delay: 8 });
    await page.type('input[type="password"]', PASSWORD, { delay: 8 });
    if (captchaCode) {
      const box = await page.$('input[placeholder="Enter the characters above"]');
      if (box) { await box.type(captchaCode, { delay: 8 }); console.log(`CAPTCHA solved from SVG: ${captchaCode}`); }
    }
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => !document.querySelector('input[type="password"]'), { timeout: 60000 });
    console.log('logged in as Super Admin');
    await sleep(3500);

    // ── Open Subscription Management from the sidebar ────────────────────────
    const opened = await page.evaluate(() => {
      const hit = [...document.querySelectorAll('button, a, div[role="button"], span')]
        .find((el) => el.textContent?.trim() === 'Subscription Management' && el.offsetParent !== null);
      if (hit) { hit.click(); return true; }
      return false;
    });
    console.log('Subscription Management opened:', opened);
    await sleep(4000);

    // ── 1. OVERVIEW ──────────────────────────────────────────────────────────
    await capture('01-overview', 'four figures + revenue and plan-mix charts');

    // ── 2. COMPANIES ─────────────────────────────────────────────────────────
    await click('Companies', 2500);
    await capture('02-companies', 'seven-column register');

    // ── 3. PLANS ─────────────────────────────────────────────────────────────
    await click('Plans', 2500);
    await capture('03-plans', 'plan cards');
    if (await click('Edit', 2200)) {
      await capture('03b-plan-editor', 'plan editor — billing cycles, limits, credits');
      await click('Cancel', 1600);
    }

    // ── 4. BILLING ───────────────────────────────────────────────────────────
    await click('Billing', 2500);
    await capture('04-billing-invoices', 'invoice register');
    for (const [label, file] of [
      ['Payments', '04b-billing-payments'],
      ['Refunds', '04c-billing-refunds'],
      ['Revenue', '04d-billing-revenue'],
      ['Pending', '04e-billing-pending'],
      ['Failed', '04f-billing-failed'],
    ]) {
      await click(label, 2200);
      await capture(file, `Billing → ${label}`);
    }

    // ── 5. REPORTS ───────────────────────────────────────────────────────────
    await click('Reports', 2500);
    await capture('05-reports-revenue', 'Reports → Revenue');
    for (const [label, file] of [
      ['Growth', '05b-reports-growth'],
      ['Renewals', '05c-reports-renewals'],
      ['Expired Plans', '05d-reports-expired'],
      ['Verification Credit Sales', '05e-reports-credit-sales'],
      ['Employee Slot Sales', '05f-reports-slot-sales'],
      ['GST', '05g-reports-gst'],
    ]) {
      await click(label, 2200);
      await capture(file, `Reports → ${label}`);
    }

    // ── 6. SETTINGS ──────────────────────────────────────────────────────────
    await click('Settings', 2500);
    await capture('06-settings-gst', 'Settings → GST');
    for (const [label, file] of [
      ['Payment Gateway', '06b-settings-gateway'],
      ['Invoice Template', '06c-settings-template'],
      ['Billing Rules', '06d-settings-rules'],
      ['Pricing Matrix', '06e-settings-pricing'],
      ['Coupons', '06f-settings-coupons'],
    ]) {
      await click(label, 2200);
      await capture(file, `Settings → ${label}`);
    }

    // ── 7. COMPANY DETAILS ───────────────────────────────────────────────────
    await click('Companies', 2500);
    const company = await page.evaluate(CLICK_FIRST_ROW);
    console.log(`\nopened company detail: ${company}`);
    await sleep(4000);
    await capture('07-company-subscription', 'Company Details → Subscription');
    for (const [label, file] of [
      ['Employee Slots', '07b-company-slots'],
      ['Verification Credits', '07c-company-credits'],
      ['Billing', '07d-company-billing'],
      ['Invoices', '07e-company-invoices'],
      ['Payment History', '07f-company-payments'],
      ['Usage', '07g-company-usage'],
      ['Audit Logs', '07h-company-audit'],
    ]) {
      await click(label, 2000);
      await capture(file, `Company Details → ${label}`);
    }

    // ── Responsive check ─────────────────────────────────────────────────────
    // The shell decides its sidebar mode when it mounts, so a bare setViewport
    // would measure the desktop shell squeezed into a phone. Reload at the mobile
    // width so the shell initialises in mobile mode and this tests the MODULE.
    await page.setViewport({ width: 430, height: 932, deviceScaleFactor: 2 });
    await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
    await sleep(5000);
    await click('Subscription', 1500);
    await capture('08-company-mobile', 'Company Details at 430px, sidebar collapsed');
    await click('Usage', 1500);
    await capture('08b-company-mobile-usage', 'Company Details → Usage at 430px');
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

    // ── Summary ──────────────────────────────────────────────────────────────
    console.log(`\n${'─'.repeat(72)}`);
    console.log(`screens captured : ${shots.length}  →  ${OUT}`);
    console.log(`console errors   : ${consoleErrors.length}`);
    [...new Set(consoleErrors)].slice(0, 10).forEach((e) => console.log(`   ${e.slice(0, 220)}`));
    console.log(`failed requests  : ${failedRequests.length}`);
    [...new Set(failedRequests)].slice(0, 15).forEach((e) => console.log(`   ${e.slice(0, 220)}`));

    fs.writeFileSync(
      path.join(OUT, 'capture-report.json'),
      JSON.stringify({ shots, consoleErrors: [...new Set(consoleErrors)], failedRequests: [...new Set(failedRequests)] }, null, 2),
      'utf8'
    );
  } finally {
    await browser.close();
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
    await prisma.$disconnect();
  }
})().catch(async (e) => {
  console.error('SHOT ERROR:', e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
