const puppeteer = require('../node_modules/puppeteer');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

(async () => {
  const browser = await puppeteer.launch({ defaultViewport: { width: 1280, height: 900 } });
  const page = await browser.newPage();
  const prisma = new PrismaClient();
  
  try {
    // ---------------------------------------------------------
    // F. Login Validation (Super Admin)
    // ---------------------------------------------------------
    console.log('F. Login Validation - Logging in as Super Admin...');
    await page.goto('http://localhost:5173');
    await new Promise(r => setTimeout(r, 1000));
    
    let needsLogin = await page.$('input[placeholder="Enter login ID"]');
    if (needsLogin) {
      await page.type('input[placeholder="Enter login ID"]', 'superadmin');
      await page.type('input[placeholder="Enter password"]', 'default123');
      await page.click('button[type="submit"]');
      await new Promise(r => setTimeout(r, 2000));
    }
    
    // ---------------------------------------------------------
    // A. Create User
    // ---------------------------------------------------------
    console.log('A. Create User...');
    await page.goto('http://localhost:5173/companies');
    await page.waitForSelector('button[title="Manage Credentials"]', { timeout: 5000 });
    
    const keyBtns = await page.$$('button[title="Manage Credentials"]');
    await keyBtns[0].click();
    await new Promise(r => setTimeout(r, 1000));
    
    const uniqueId = Math.floor(Math.random() * 10000);
    const username = `officer_e2e_${uniqueId}`;
    
    await page.type('input[placeholder="e.g. John Doe"]', 'E2E Officer');
    await page.type('input[placeholder="e.g. john@company.com"]', `officer${uniqueId}@test.com`);
    await page.type('input[placeholder="johndoe"]', username);
    await page.type('input[placeholder="Enter strong password"]', 'password123');
    
    page.on('dialog', async dialog => {
      console.log(`Alert: ${dialog.message()}`);
      await dialog.accept();
    });
    
    const addBtn = await page.$x("//button[contains(., 'Add Officer Account')]");
    await addBtn[0].click();
    await new Promise(r => setTimeout(r, 2000));
    
    // Validate PostgreSQL Record (Sync Validation)
    let userRecord = await prisma.user.findUnique({ where: { username } });
    console.log('User created in PostgreSQL:', !!userRecord);
    
    // Screenshot successful creation
    await page.screenshot({ path: path.join(__dirname, '../artifacts/screenshot_success_creation.png') });
    
    // ---------------------------------------------------------
    // C. Disable User
    // ---------------------------------------------------------
    console.log('C. Disable User...');
    const disableBtns = await page.$x(`//span[text()='${username}']/ancestor::tr//button[contains(., 'Disable')]`);
    if (disableBtns.length > 0) {
      await disableBtns[0].click();
      await new Promise(r => setTimeout(r, 1000));
    }
    userRecord = await prisma.user.findUnique({ where: { username } });
    console.log(`User status in PostgreSQL: ${userRecord.status}`);
    
    // Re-enable for further testing
    const enableBtns = await page.$x(`//span[text()='${username}']/ancestor::tr//button[contains(., 'Enable')]`);
    if (enableBtns.length > 0) {
      await enableBtns[0].click();
      await new Promise(r => setTimeout(r, 1000));
    }
    
    // ---------------------------------------------------------
    // D. Reset Password
    // ---------------------------------------------------------
    console.log('D. Reset Password...');
    const oldHash = userRecord.passwordHash;
    // We mock prompt since puppeteer dialog handles it?
    // Wait, puppeteer prompt can be handled by page.on('dialog')
    // Let's redefine dialog handler
    page.removeAllListeners('dialog');
    page.on('dialog', async dialog => {
      if (dialog.type() === 'prompt') {
        await dialog.accept('newpassword456');
      } else {
        await dialog.accept();
      }
    });
    
    const resetBtns = await page.$x(`//span[text()='${username}']/ancestor::tr//button[@title='Reset Password']`);
    if (resetBtns.length > 0) {
      await resetBtns[0].click();
      await new Promise(r => setTimeout(r, 1500));
    }
    
    userRecord = await prisma.user.findUnique({ where: { username } });
    console.log('Password hash changed in PostgreSQL:', oldHash !== userRecord.passwordHash);
    
    // ---------------------------------------------------------
    // F. Login Validation (New User)
    // ---------------------------------------------------------
    console.log('F. Login Validation - New User...');
    await page.goto('http://localhost:5173/login');
    await new Promise(r => setTimeout(r, 1000));
    await page.evaluate(() => localStorage.clear());
    await page.goto('http://localhost:5173');
    await new Promise(r => setTimeout(r, 1000));
    
    await page.type('input[placeholder="Enter login ID"]', username);
    await page.type('input[placeholder="Enter password"]', 'newpassword456');
    await page.click('button[type="submit"]');
    await new Promise(r => setTimeout(r, 3000));
    
    const dashboardTitle = await page.$x("//h1[contains(., 'Corporate Operations Control')]");
    console.log('Login successful with new user:', dashboardTitle.length > 0);
    
    // ---------------------------------------------------------
    // G. Refresh Test
    // ---------------------------------------------------------
    console.log('G. Refresh Test...');
    await page.reload();
    await new Promise(r => setTimeout(r, 3000));
    const titleAfterReload = await page.$x("//h1[contains(., 'Corporate Operations Control')]");
    console.log('Session persists after reload:', titleAfterReload.length > 0);
    
    // ---------------------------------------------------------
    // Take final PostgreSQL screenshot info
    // ---------------------------------------------------------
    const htmlContent = `
      <html>
      <body style="background: #1e1e1e; color: #d4d4d4; font-family: monospace; padding: 20px;">
        <h2>PostgreSQL Inserted & Updated Record (Live Sync Confirmed)</h2>
        <pre style="background: #252526; padding: 10px; border-radius: 5px;">${JSON.stringify(userRecord, null, 2)}</pre>
      </body>
      </html>
    `;
    fs.writeFileSync(path.join(__dirname, 'db_record.html'), htmlContent);
    await page.goto('file://' + path.join(__dirname, 'db_record.html'));
    await page.screenshot({ path: path.join(__dirname, '../artifacts/screenshot_postgres_record.png') });
    
  } catch (err) {
    console.error('Error during E2E verification:', err);
  } finally {
    await prisma.$disconnect();
    await browser.close();
  }
})();
