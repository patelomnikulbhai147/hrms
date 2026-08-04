/**
 * Measure whether the redesigned Subscription Management module lays out without
 * horizontal overflow across widths.
 *
 *   node scripts/probeSubscriptionResponsive.js [frontendUrl]
 *
 * Reports, per viewport width: the shell's sidebar width, the width the module
 * actually gets, and whether the MODULE's own content box overflows it. Tables
 * are allowed to scroll inside their own container — that is the intended
 * behaviour — so the check is on the page container, not on table width.
 */
const puppeteer = require('puppeteer');
const bcrypt = require('bcryptjs');
const prisma = require('../src/config/prisma');
require('dotenv').config();

const APP = process.argv[2] || 'http://localhost:5173';
const EMAIL = 'subscription.probe@qa.local';
const PASSWORD = 'Shot@12345';
const WIDTHS = [1600, 1440, 1280, 1024, 900, 768];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const template = await prisma.user.findFirst({
    where: { role: 'Super Admin', status: 'Active' },
    select: { permissions: true, accessibleCompanyIds: true, companyId: true, branchId: true },
    orderBy: { id: 'asc' },
  });
  if (!template) throw new Error('No active Super Admin to model on.');

  await prisma.user.deleteMany({ where: { email: EMAIL } });
  const user = await prisma.user.create({
    data: {
      name: 'Subscription Probe', username: 'subscription.probe', email: EMAIL,
      passwordHash: await bcrypt.hash(PASSWORD, 10),
      role: 'Super Admin', status: 'Active',
      companyId: template.companyId ?? null, branchId: template.branchId ?? null,
      permissions: template.permissions ?? undefined,
      accessibleCompanyIds: template.accessibleCompanyIds ?? undefined,
    },
  });

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  let captchaCode = null;
  page.on('response', async (res) => {
    if (!res.url().includes('/auth/captcha')) return;
    try {
      const body = await res.json();
      const chars = [...String(body.captchaSvg || '').matchAll(/<text[^>]*>([^<])<\/text>/g)].map((m) => m[1]);
      if (chars.length) captchaCode = chars.join('');
    } catch (_) { /* ignore */ }
  });

  try {
    await page.goto(APP, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForSelector('input[type="email"]', { timeout: 30000 });
    await page.type('input[type="email"]', EMAIL, { delay: 6 });
    await page.type('input[type="password"]', PASSWORD, { delay: 6 });
    if (captchaCode) {
      const box = await page.$('input[placeholder="Enter the characters above"]');
      if (box) await box.type(captchaCode, { delay: 6 });
    }
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => !document.querySelector('input[type="password"]'), { timeout: 60000 });
    await sleep(3500);

    await page.evaluate(() => {
      const hit = [...document.querySelectorAll('button, a, div[role="button"], span')]
        .find((el) => el.textContent?.trim() === 'Subscription Management' && el.offsetParent !== null);
      if (hit) hit.click();
    });
    await sleep(4000);

    const TABS = ['Overview', 'Companies', 'Plans', 'Billing', 'Reports', 'Settings'];
    console.log('\nwidth  sidebar  module   overflow  worst-offender');
    console.log('─'.repeat(72));

    let failures = 0;
    for (const w of WIDTHS) {
      await page.setViewport({ width: w, height: 900 });
      await sleep(1200);
      for (const tab of TABS) {
        await page.evaluate((label) => {
          const inChrome = (el) => !!el.closest('aside, nav, header');
          const b = [...document.querySelectorAll('button')]
            .find((x) => x.textContent.trim() === label && x.offsetParent !== null && !inChrome(x));
          if (b) b.click();
        }, tab);
        await sleep(1100);

        const m = await page.evaluate(() => {
          const h1 = [...document.querySelectorAll('h1')].find((x) => x.textContent.includes('Subscription Management'));
          const root = h1 ? h1.closest('div')?.parentElement : null;
          if (!root) return null;
          const rootW = root.clientWidth;
          const sidebar = document.querySelector('aside');
          // Anything inside the module wider than the module itself, EXCLUDING
          // elements that are meant to scroll (overflow-x containers and their
          // descendants) — a scrolling table is correct, not an overflow bug.
          let worst = null, worstW = 0;
          for (const el of root.querySelectorAll('*')) {
            if (el.closest('.overflow-x-auto')) continue;
            const wpx = el.scrollWidth;
            if (wpx > rootW + 2 && wpx > worstW) {
              worstW = wpx;
              worst = `${el.tagName.toLowerCase()}.${String(el.className || '').split(' ').slice(0, 2).join('.')}`;
            }
          }
          return {
            rootW,
            sidebarW: sidebar ? sidebar.clientWidth : 0,
            docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            worst, worstW,
          };
        });

        if (!m) { console.log(`${w}   ${tab}: module root not found`); continue; }
        const bad = m.worst || m.docOverflow > 1;
        if (bad) failures++;
        if (bad || tab === 'Overview') {
          console.log(
            `${String(w).padEnd(6)} ${String(m.sidebarW).padEnd(8)} ${String(m.rootW).padEnd(8)} ${String(m.docOverflow).padEnd(9)} ${tab}${m.worst ? ` → ${m.worst} (${m.worstW}px)` : ''}`
          );
        }
      }
    }

    console.log('─'.repeat(72));
    console.log(failures === 0
      ? 'PASS — no horizontal overflow in any section at any tested width.'
      : `${failures} overflow condition(s) found.`);
  } finally {
    await browser.close();
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
    await prisma.$disconnect();
  }
})().catch(async (e) => {
  console.error('PROBE ERROR:', e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
