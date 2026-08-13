/**
 * live_wallet_test.js
 * Opens a real Chromium browser, logs in, navigates to Payroll Wallet,
 * clicks "Recharge Wallet", tests the modal, then clicks Continue.
 * Saves screenshots at every step.
 */
const puppeteer = require('puppeteer');
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const SCREENSHOT_DIR = 'C:/Users/yoges/.gemini/antigravity-ide/brain/00bfa5fb-0411-4fea-8232-cbb82e2eac6f';
const prisma = new PrismaClient();

async function shot(page, name) {
  const p = `${SCREENSHOT_DIR}/${name}.png`;
  await page.screenshot({ path: p, fullPage: false });
  console.log(`📸 Screenshot: ${name}.png`);
  return p;
}

async function main() {
  console.log('\n🚀 Starting Live Wallet Button Test...\n');

  // ── 1. Prepare test user ──────────────────────────────────────────────────
  const email = 'om@gmail.com';
  const plainPassword = 'password123';
  const hash = await bcrypt.hash(plainPassword, 10);
  await prisma.user.updateMany({ where: { email }, data: { passwordHash: hash } });
  const user = await prisma.user.findUnique({ where: { email } });
  console.log(`✅ User ready: ${user.email} (role: ${user.role}, id: ${user.id})`);

  // ── 2. Generate JWT ───────────────────────────────────────────────────────
  const secret = process.env.JWT_SECRET || 'enterprise_hrms_super_secret_key_2026';
  const token = jwt.sign({ id: user.id }, secret, { expiresIn: '12h' });
  console.log(`✅ JWT generated`);

  // ── 3. Launch browser (HEADFUL so we can see it) ──────────────────────────
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1400,900'],
    defaultViewport: { width: 1400, height: 900 },
  });
  const page = await browser.newPage();

  // Collect console errors
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  // Collect network requests
  const networkRequests = [];
  page.on('request', req => {
    if (req.url().includes('/api/wallet')) {
      networkRequests.push(`➡ ${req.method()} ${req.url()}`);
    }
  });
  page.on('response', async res => {
    if (res.url().includes('/api/wallet')) {
      let body = '';
      try { body = await res.text(); } catch {}
      networkRequests.push(`⬅ ${res.status()} ${res.url()} → ${body.substring(0, 200)}`);
    }
  });

  try {
    // ── 4. Set auth in localStorage ──────────────────────────────────────────
    console.log('\n📌 Step 1: Setting auth tokens in localStorage...');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle0', timeout: 30000 });
    await page.evaluate((tok, usr) => {
      localStorage.setItem('hrms_jwt_token', tok);
      localStorage.setItem('hrms_auth', 'true');
      localStorage.setItem('hrms_profile', JSON.stringify(usr));
      localStorage.setItem('hrms_current_page', 'payroll-wallet');
      localStorage.setItem('hrms_active_company_id', String(usr.companyId || '1'));
      localStorage.setItem('hrms_active_workspace_kind', 'company');
      localStorage.setItem('hrms_is_masquerading', 'false');
      sessionStorage.setItem('hrms_session_active', '1');
    }, token, user);

    // ── 5. Navigate to payroll-wallet page ───────────────────────────────────
    console.log('📌 Step 2: Navigating to /payroll-wallet...');
    // Force navigate to payroll-wallet URL (SPA will honor it on load)
    await page.goto('http://localhost:5173/payroll-wallet', { waitUntil: 'networkidle0', timeout: 30000 });
    await new Promise(r => setTimeout(r, 4000));
    await shot(page, 'step1_payroll_wallet_page');

    // Check what page we're actually on
    const pageTitle = await page.evaluate(() => document.title);
    const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 500));
    console.log(`   Page title: ${pageTitle}`);
    console.log(`   Body text (first 200 chars): ${bodyText.substring(0, 200)}`);
    console.log(`   Current URL: ${page.url()}`);

    // Check if on workspace selector
    const onWorkspaceSelector = await page.evaluate(() => {
      return document.body.innerText.includes('Select a workspace') || document.body.innerText.includes('WORKSPACE ACCESS');
    });
    if (onWorkspaceSelector) {
      console.log('   ⚠ On workspace selector - clicking first available company...');
      await page.evaluate(() => {
        // Try to click Vishv Enterprise (company 1)
        const btns = Array.from(document.querySelectorAll('button'));
        const enterBtn = btns.find(b => b.textContent.includes('ENTER') || b.textContent.includes('Enter'));
        if (enterBtn) { enterBtn.click(); return; }
        // Fallback: click first SELECT button
        const selectBtn = btns.find(b => b.textContent.trim() === 'SELECT');
        if (selectBtn) selectBtn.click();
      });
      await new Promise(r => setTimeout(r, 3000));
    }

    // Check if on Welcome/onboarding page
    const hasWelcome = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Continue to Dashboard'));
    });
    if (hasWelcome) {
      console.log('   ⚠ Welcome page - clicking Continue to Dashboard...');
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Continue to Dashboard'));
        if (btn) btn.click();
      });
      await new Promise(r => setTimeout(r, 2000));
    }

    // Now click "Payroll Wallet" in sidebar
    console.log('   Clicking sidebar "Payroll Wallet"...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, a'));
      const btn = btns.find(b => b.textContent.trim() === 'Payroll Wallet');
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 4000));
    await shot(page, 'step1b_after_sidebar_wallet_click');

    // ── 6. Click "Recharge Wallet" button ────────────────────────────────────
    console.log('\n📌 Step 4: Clicking "Recharge Wallet" button...');
    await shot(page, 'step2_before_recharge_click');

    const clicked = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const btn = btns.find(b => b.textContent.trim().includes('Recharge Wallet'));
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    console.log(`   Clicked: ${clicked}`);
    await new Promise(r => setTimeout(r, 1500));
    await shot(page, 'step3_after_recharge_click');

    // ── 7. Check if modal opened ──────────────────────────────────────────────
    console.log('\n📌 Step 5: Checking if recharge modal opened...');
    const modalState = await page.evaluate(() => {
      const hasModal = !!document.querySelector('input[type="number"]');
      const hasQuickAmounts = Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('₹500'));
      const hasContinue = Array.from(document.querySelectorAll('button')).some(b => b.textContent.trim() === 'Continue');
      const modalDiv = document.querySelector('.fixed.inset-0');
      return {
        hasModal,
        hasQuickAmounts,
        hasContinue,
        modalVisible: !!modalDiv,
        modalDisplay: modalDiv ? window.getComputedStyle(modalDiv).display : 'none',
      };
    });
    console.log(`   Modal input visible: ${modalState.hasModal}`);
    console.log(`   Quick amounts visible: ${modalState.hasQuickAmounts}`);
    console.log(`   Continue button: ${modalState.hasContinue}`);
    console.log(`   Modal div visible: ${modalState.modalVisible}`);

    if (!modalState.hasModal) {
      console.log('\n❌ MODAL DID NOT OPEN! Investigating overlay issues...');

      // Check for any element covering the button
      const overlayInfo = await page.evaluate(() => {
        const allFixed = Array.from(document.querySelectorAll('*')).filter(el => {
          const style = window.getComputedStyle(el);
          return style.position === 'fixed' && el.tagName !== 'SCRIPT';
        });
        return allFixed.map(el => ({
          tag: el.tagName,
          id: el.id,
          className: el.className.substring(0, 80),
          zIndex: window.getComputedStyle(el).zIndex,
          pointerEvents: window.getComputedStyle(el).pointerEvents,
          display: window.getComputedStyle(el).display,
        }));
      });
      console.log('   Fixed-position elements:', JSON.stringify(overlayInfo, null, 2));

      // Check rechargeOpen state by looking at what the DOM shows
      const domBefore = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        return btns.map(b => b.textContent.trim()).filter(t => t);
      });
      console.log('   All buttons visible:', domBefore);
    } else {
      console.log('\n✅ MODAL OPENED SUCCESSFULLY!');

      // ── 8. Select ₹5000 and click Continue ──────────────────────────────────
      console.log('\n📌 Step 6: Selecting ₹5000...');
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const btn = btns.find(b => b.textContent.trim() === '₹5000');
        if (btn) btn.click();
      });
      await new Promise(r => setTimeout(r, 500));
      await shot(page, 'step4_amount_selected');

      console.log('\n📌 Step 7: Clicking Continue...');
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const btn = btns.find(b => b.textContent.trim() === 'Continue');
        if (btn) btn.click();
      });
      await new Promise(r => setTimeout(r, 5000));
      await shot(page, 'step5_after_continue');

      const finalUrl = page.url();
      console.log(`   Final URL: ${finalUrl}`);
    }

    // ── 9. Report all network requests ────────────────────────────────────────
    console.log('\n📌 Network Requests to /api/wallet:');
    networkRequests.forEach(r => console.log('  ', r));

    // ── 10. Report console errors ─────────────────────────────────────────────
    if (consoleErrors.length > 0) {
      console.log('\n❌ JavaScript Console Errors:');
      consoleErrors.forEach(e => console.log('  ', e));
    } else {
      console.log('\n✅ No JavaScript errors in console');
    }

    await shot(page, 'final_state');
    console.log('\n✅ Test complete. Browser left open for 8 seconds...');
    await new Promise(r => setTimeout(r, 8000));

  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}

main().catch(e => {
  console.error('\n❌ Fatal:', e.message);
  process.exit(1);
});
