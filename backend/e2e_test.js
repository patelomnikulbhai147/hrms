const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function runTest() {
  console.log('Starting E2E Test...');
  
  // 1. Reset password for om@gmail.com to ensure login works
  const email = 'om@gmail.com';
  const plainPassword = 'password123';
  const hashedPassword = await bcrypt.hash(plainPassword, 10);
  await prisma.user.update({
    where: { email },
    data: { passwordHash: hashedPassword }
  });
  console.log('Test user password reset to password123');
  
  // 2. Launch Puppeteer
  const browser = await puppeteer.launch({
    headless: "new",
    defaultViewport: { width: 1366, height: 768 }
  });
  const page = await browser.newPage();
  
  // Prepare screenshot dir
  const outDir = 'C:\\Users\\yoges\\.gemini\\antigravity-ide\\brain\\00bfa5fb-0411-4fea-8232-cbb82e2eac6f';
  
  async function takeScreenshot(name) {
    const p = path.join(outDir, `${name}.png`);
    await page.screenshot({ path: p, fullPage: true });
    console.log(`Screenshot saved: ${p}`);
  }

  try {
    console.log('Generating JWT manually...');
    const jwt = require('jsonwebtoken');
    const user = await prisma.user.findUnique({ where: { email } });
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET || 'enterprise_hrms_super_secret_key_2026', { expiresIn: '12h' });
    
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });
    
    await page.evaluate((token, user) => {
      localStorage.setItem('hrms_jwt_token', token);
      localStorage.setItem('hrms_auth', 'true');
      localStorage.setItem('hrms_profile', JSON.stringify(user));
      sessionStorage.setItem('hrms_session_active', '1');
    }, token, user);
    
    console.log('Navigating to dashboard...');
    await page.goto('http://localhost:5173/dashboard', { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 2000));
    
    // Check if we are on the Welcome page
    const welcomeBtn = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.some(b => b.textContent.includes('Continue to Dashboard'));
    });
    if (welcomeBtn) {
      console.log('Clicking Continue to Dashboard on Welcome page...');
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const btn = btns.find(b => b.textContent.includes('Continue to Dashboard'));
        if (btn) btn.click();
      });
      await new Promise(r => setTimeout(r, 2000));
    }
    
    await takeScreenshot('2_dashboard');

    // 4. Navigate to Payroll Wallet dashboard
    console.log('Navigating to payroll-wallet...');
    await page.goto('http://localhost:5173/payroll-wallet', { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 3000));
    await takeScreenshot('4_wallet_dashboard');
    
    // Log console messages
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));

    // Get balance before recharge
    await page.waitForFunction(() => {
      const ps = Array.from(document.querySelectorAll('p'));
      return ps.some(p => p.textContent.includes('₹'));
    }, { timeout: 10000 }).catch(() => {});
    
    const balanceBefore = await page.evaluate(() => {
      const balanceEl = Array.from(document.querySelectorAll('p')).find(p => p.textContent.includes('₹'));
      return balanceEl ? balanceEl.textContent : 'Unknown';
    });
    console.log('Balance before:', balanceBefore);

    // 5. Click "Recharge Wallet" on the dashboard
    console.log('Clicking Recharge Wallet on dashboard...');
    // There are two "Recharge Wallet" texts (header and main). We want the main one.
    // Try to click the one inside the main content area (which is usually the last one).
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.includes('Recharge Wallet'));
      if (btns.length > 0) {
        btns[btns.length - 1].click();
      }
    });
    
    await new Promise(r => setTimeout(r, 2000));
    await takeScreenshot('5_recharge_modal_opened');
    
    // Check if modal actually opened
    const modalExists = await page.evaluate(() => !!document.querySelector('input[type="number"]'));
    if (!modalExists) {
      console.log('DOM dump:', await page.evaluate(() => document.body.innerHTML));
      throw new Error('Modal did not open!');
    }

    // Type amount instead of click
    console.log('Typing amount 5000...');
    await page.focus('input[type="number"]');
    await page.keyboard.type('5000');
    
    // Intercept network requests
    let createOrderRequest = null;
    let createOrderResponse = null;
    page.on('request', req => {
      if (req.url().includes('/api/wallet/create-order') || req.url().includes('/wallet/create-order')) {
        createOrderRequest = {
          url: req.url(),
          method: req.method(),
          postData: req.postData()
        };
      }
    });
    page.on('response', async res => {
      if (res.url().includes('/api/wallet/create-order') || res.url().includes('/wallet/create-order')) {
        try {
          createOrderResponse = {
            status: res.status(),
            body: await res.json()
          };
        } catch (e) {}
      }
    });

    // 6. Click Continue
    console.log('Clicking Continue...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const pBtn = btns.find(b => b.textContent.includes('Continue'));
      if (pBtn) pBtn.click();
    });
    
    await new Promise(r => setTimeout(r, 4000)); // Wait for API and Cashfree redirect
    await takeScreenshot('6_after_continue');
    
    console.log('Create Order Request:', JSON.stringify(createOrderRequest, null, 2));
    console.log('Create Order Response:', JSON.stringify(createOrderResponse, null, 2));

    // If Cashfree sandbox opens, we can try to simulate success
    const currentUrl = page.url();
    console.log('Current URL:', currentUrl);
    
    if (currentUrl.includes('cashfree.com')) {
      console.log('On Cashfree sandbox. Waiting to simulate success...');
      await new Promise(r => setTimeout(r, ));
      await takeScreenshot('7_cashfree_sandbox');
      
      try {
        await page.evaluate(() => {
          const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Success') || b.textContent.includes('Simulate'));
          if (btn) btn.click();
        });
        await new Promise(r => setTimeout(r, )); // wait for redirect back
      } catch (e) {}
    } else {
      console.log('Did not redirect to Cashfree. Checking if payment session is active on same page.');
    }
    
    await takeScreenshot('8_final_state');
    
    const balanceAfter = await page.evaluate(() => {
      const balanceEl = Array.from(document.querySelectorAll('p')).find(p => p.textContent.includes('₹'));
      return balanceEl ? balanceEl.textContent : 'Unknown';
    });
    console.log('Balance after:', balanceAfter);
    
  } catch (error) {
    console.error('Test failed with error:', error);
    try {
      await takeScreenshot('error_state');
    } catch(e) {}
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}

runTest();
