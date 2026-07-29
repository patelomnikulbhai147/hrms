/**
 * Verify the standalone demo HTML files the way a client will open them:
 * straight off the filesystem (file://), with no server, no build and no network.
 *
 *   node scripts/shotDemoHtml.js
 *
 * Captures each screen, exercises the interactions (tabs, filters, search,
 * pagination, modals) and reports any console error or failed request.
 */
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const DEMO = path.join(ROOT, 'demo');
const OUT  = path.join(ROOT, 'screenshots', 'demo-html');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CLICK_TEXT = (label) => {
  const b = [...document.querySelectorAll('button')]
    .find((x) => x.textContent.trim().replace(/\s+/g, ' ') === label && x.offsetParent !== null);
  if (b) { b.click(); return true; }
  return false;
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--allow-file-access-from-files'] });
  const problems = [];

  for (const file of ['payroll.html', 'invoice-management.html']) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
    const errors = [], failed = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
    page.on('requestfailed', (r) => {
      // Google Fonts is the only remote request and is expected to be optional.
      if (!/fonts\.(googleapis|gstatic)\.com/.test(r.url())) failed.push(r.url());
    });

    const url = 'file:///' + path.join(DEMO, file).replace(/\\/g, '/');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
    await sleep(1200);

    const base = file.replace('.html', '');
    const shot = async (name) => {
      await page.screenshot({ path: path.join(OUT, `${base}-${name}.png`), fullPage: false });
    };

    // ── Rendering sanity: did the JS actually build the page? ───────────────
    const built = await page.evaluate(() => ({
      navItems: document.querySelectorAll('.nav-item').length,
      icons: document.querySelectorAll('svg').length,
      unpainted: document.querySelectorAll('[data-icon]').length,
      tableRows: document.querySelectorAll('table tbody tr').length,
      cards: document.querySelectorAll('.stat-card,.kpi,.money-card,.count-card').length,
      title: document.title,
    }));
    console.log(`\n══ ${file} ══`);
    console.log(`  nav items ${built.navItems} · cards ${built.cards} · table rows ${built.tableRows} · svg icons ${built.icons} · unpainted ${built.unpainted}`);
    if (built.unpainted > 0) problems.push(`${file}: ${built.unpainted} icon placeholders never rendered`);
    // The Invoice module opens on Dashboard, which is cards + chart and has no
    // table — so "rendered" means nav + cards, and a table only where one exists.
    if (built.navItems === 0 || built.cards === 0) problems.push(`${file}: page did not render`);
    if (file === 'payroll.html' && built.tableRows === 0) problems.push(`${file}: payroll table is empty`);

    await shot('01-main');

    if (file === 'payroll.html') {
      // Search → filter → clear
      await page.type('#search', 'priya', { delay: 20 });
      await sleep(500);
      const searched = await page.evaluate(() => document.querySelectorAll('#tbody tr').length);
      console.log(`  search "priya" → ${searched} row(s)`);
      if (searched !== 1) problems.push(`${file}: search returned ${searched} rows, expected 1`);
      await shot('02-search');
      await page.evaluate(() => { document.getElementById('search').value = ''; });
      await page.type('#search', ' ', { delay: 10 });
      await page.evaluate(() => { document.getElementById('search').value = ''; });
      await page.evaluate(() => document.getElementById('search').dispatchEvent(new Event('input', { bubbles: true })));
      await sleep(400);

      // Department filter
      await page.select('#deptFilter', 'Engineering');
      await sleep(400);
      const eng = await page.evaluate(() => document.querySelectorAll('#tbody tr').length);
      console.log(`  department "Engineering" → ${eng} row(s)`);
      await page.select('#deptFilter', '');
      await sleep(400);

      // Pagination
      await page.evaluate(() => { const b = document.querySelector('[data-page="next"]'); if (b) b.click(); });
      await sleep(400);
      const pageLabel = await page.evaluate(() => {
        const el = [...document.querySelectorAll('#pager span')].find((s) => /Page \d+ of/.test(s.textContent));
        return el ? el.textContent.trim() : '';
      });
      console.log(`  pagination → ${pageLabel}`);
      if (!/Page 2 of 2/.test(pageLabel)) problems.push(`${file}: pagination did not advance (${pageLabel})`);
      await shot('03-page2');
      await page.evaluate(() => { const b = document.querySelector('[data-page="prev"]'); if (b) b.click(); });
      await sleep(300);

      // Select-all → workflow scope banner
      await page.evaluate(() => document.getElementById('selAll').click());
      await sleep(400);
      const selText = await page.evaluate(() => document.getElementById('selText').textContent);
      console.log(`  select all → "${selText}"`);
      await shot('04-selection');
      await page.evaluate(() => document.getElementById('clearSel').click());
      await sleep(300);

      // View payroll details modal
      await page.evaluate(() => document.querySelector('[data-view]').click());
      await sleep(700);
      const modal = await page.evaluate(() => {
        const o = document.getElementById('payslipOverlay');
        return { open: !o.hidden, net: (document.querySelector('#payslipBody') || {}).textContent?.includes('Net Salary Payable') };
      });
      console.log(`  payroll detail modal open=${modal.open} netSalarySection=${modal.net}`);
      if (!modal.open || !modal.net) problems.push(`${file}: payroll detail modal failed`);
      await shot('05-detail-modal');
      await page.keyboard.press('Escape');
      await sleep(300);

      // Generate payroll modal
      await page.evaluate(() => { const b = document.querySelector('[data-act="generate"]'); if (b) b.click(); });
      await sleep(700);
      const genOpen = await page.evaluate(() => !document.getElementById('generateOverlay').hidden);
      console.log(`  generate payroll modal open=${genOpen}`);
      if (!genOpen) problems.push(`${file}: generate payroll modal failed`);
      await shot('06-generate-modal');
      await page.keyboard.press('Escape');
      await sleep(300);

      // Export dropdown
      await page.evaluate(() => document.getElementById('btnExport').click());
      await sleep(400);
      await shot('07-export-menu');
      await page.keyboard.press('Escape');
    } else {
      // Tabs
      for (const [tab, name] of [['invoices','02-invoices'], ['create','03-create'], ['customers','04-customers'], ['products','05-products'], ['settings','06-settings']]) {
        await page.evaluate((t) => { const b = document.querySelector(`[data-tab="${t}"]`); if (b) b.click(); }, tab);
        await sleep(600);
        await shot(name);
      }

      // Back to All Invoices, exercise search + status filter
      await page.evaluate(() => document.querySelector('[data-tab="invoices"]').click());
      await sleep(500);
      await page.type('#invSearch', 'nimbus', { delay: 25 });
      await sleep(500);
      const found = await page.evaluate(() => document.querySelectorAll('table tbody tr').length);
      console.log(`  search "nimbus" → ${found} row(s)`);
      if (found < 1) problems.push(`${file}: invoice search returned nothing`);
      await shot('07-search');
      await page.evaluate(() => {
        const el = document.getElementById('invSearch');
        el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await sleep(400);
      await page.select('#statusFilter', 'Paid');
      await sleep(500);
      const paid = await page.evaluate(() => document.querySelectorAll('table tbody tr').length);
      console.log(`  status "Paid" → ${paid} row(s)`);
      await page.select('#statusFilter', 'All Status');
      await sleep(400);

      // Invoice detail modal
      await page.evaluate(() => document.querySelector('tr.clickable').click());
      await sleep(700);
      const inv = await page.evaluate(() => {
        const o = document.getElementById('viewOverlay');
        const body = document.getElementById('viewBody').textContent;
        // Customer information = the party block (name + GSTIN + state + email).
        return { open: !o.hidden, title: document.getElementById('viewTitle').textContent,
                 hasCustomer: /[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]/.test(body) && /@/.test(body),
                 hasTotals: /Grand Total/.test(body) };
      });
      console.log(`  invoice modal open=${inv.open} (${inv.title}) customer=${inv.hasCustomer} totals=${inv.hasTotals}`);
      if (!inv.open || !inv.hasTotals) problems.push(`${file}: invoice detail modal failed`);
      await shot('08-invoice-modal');

      // Record payment (mutates the demo data and re-renders)
      await page.evaluate(() => document.getElementById('btnPay').click());
      await sleep(600);
      const payOpen = await page.evaluate(() => !document.getElementById('payOverlay').hidden);
      console.log(`  record payment modal open=${payOpen}`);
      await shot('09-payment-modal');
      if (payOpen) {
        await page.evaluate(() => document.getElementById('submitPay').click());
        await sleep(700);
        const after = await page.evaluate(() => document.body.textContent.includes('recorded against'));
        console.log(`  payment recorded toast=${after}`);
      }
      await shot('10-after-payment');

      // Printable document built?
      const printLen = await page.evaluate(() => document.getElementById('printArea').innerHTML.length);
      console.log(`  print document built: ${printLen} chars`);
      if (printLen < 500) problems.push(`${file}: print document not built`);
    }

    // ── Responsive ──
    await page.setViewport({ width: 430, height: 932, deviceScaleFactor: 2 });
    await sleep(800);
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    console.log(`  430px horizontal overflow: ${overflow}px`);
    if (overflow > 1) problems.push(`${file}: overflows by ${overflow}px at 430px`);
    await page.screenshot({ path: path.join(OUT, `${base}-11-mobile.png`) });

    console.log(`  console errors : ${errors.length}`);
    errors.slice(0, 6).forEach((e) => console.log(`     ${e.slice(0, 200)}`));
    console.log(`  failed requests: ${failed.length}`);
    failed.slice(0, 6).forEach((e) => console.log(`     ${e.slice(0, 160)}`));
    if (errors.length) problems.push(`${file}: ${errors.length} console error(s)`);
    if (failed.length) problems.push(`${file}: ${failed.length} failed local request(s)`);

    await page.close();
  }

  await browser.close();
  console.log('\n' + '─'.repeat(70));
  console.log(problems.length === 0 ? 'PASS — both files open, render and interact correctly from file://'
                                    : 'ISSUES:\n  - ' + problems.join('\n  - '));
  console.log(`screenshots → ${OUT}`);
  process.exit(problems.length ? 1 : 0);
})().catch((e) => { console.error('DEMO SHOT ERROR:', e); process.exit(1); });
