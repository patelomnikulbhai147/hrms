const puppeteer = require('../node_modules/puppeteer');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

(async () => {
  const browser = await puppeteer.launch({ defaultViewport: { width: 1280, height: 900 } });
  const page = await browser.newPage();
  
  // Enable request interception to capture the POST request
  await page.setRequestInterception(true);
  const networkLogs = [];
  page.on('request', req => {
    if (req.method() === 'POST' && req.url().includes('/api/users')) {
      networkLogs.push(`POST ${req.url()} - Body: ${req.postData()}`);
    }
    req.continue();
  });
  page.on('response', async res => {
    if (res.request().method() === 'POST' && res.url().includes('/api/users')) {
      networkLogs.push(`RESPONSE ${res.status()} - Body: ${await res.text()}`);
    }
  });

  // Handle alerts automatically and take screenshots
  page.on('dialog', async dialog => {
    console.log(`Alert: ${dialog.message()}`);
    await dialog.accept();
  });

  console.log('Logging in as superadmin...');
  await page.goto('http://localhost:5173');
  await new Promise(r => setTimeout(r, 1000));
  
  let needsLogin = await page.$('input[placeholder="Enter login ID"]');
  if (needsLogin) {
    await page.type('input[placeholder="Enter login ID"]', 'superadmin');
    await page.type('input[placeholder="Enter password"]', 'default123');
    await page.click('button[type="submit"]');
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log('Going to Companies page...');
  await page.goto('http://localhost:5173/companies');
  
  try {
    await page.waitForSelector('button[title="Manage Credentials"]', { timeout: 10000 });
  } catch (e) {
    console.log('Timeout waiting for Manage Credentials button');
  }

  console.log('Opening Manage Credentials modal...');
  const keyButtons = await page.$$('button[title="Manage Credentials"]');
  if (keyButtons.length > 0) {
    await keyButtons[0].click();
    await new Promise(r => setTimeout(r, 1000));
    
    console.log('Creating new officer account...');
    const uniqueId = Math.floor(Math.random() * 10000);
    const username = `officer_${uniqueId}`;
    
    await page.type('input[placeholder="e.g. John Doe"]', 'Test Officer');
    await page.type('input[placeholder="e.g. john@company.com"]', `officer${uniqueId}@test.com`);
    await page.type('input[placeholder="johndoe"]', username);
    await page.type('input[placeholder="Enter strong password"]', 'password123');
    
    const addBtn = await page.$x("//button[contains(., 'Add Account')]");
    if (addBtn.length > 0) {
      await addBtn[0].click();
      await new Promise(r => setTimeout(r, 2000));
    }
    
    console.log('\n--- NETWORK LOGS ---');
    networkLogs.forEach(log => console.log(log));
    console.log('--------------------\n');

    await page.screenshot({ path: path.join(__dirname, '../artifacts/screenshot_modal_user.png') });
    console.log('Captured screenshot of Credentials Modal');
    
    console.log('Logging out...');
    await page.goto('http://localhost:5173/login');
    await new Promise(r => setTimeout(r, 1500));
    await page.evaluate(() => localStorage.clear());
    await page.goto('http://localhost:5173');
    await new Promise(r => setTimeout(r, 1500));

    console.log(`Logging in as new user: ${username}...`);
    needsLogin = await page.$('input[placeholder="Enter login ID"]');
    if (needsLogin) {
      await page.type('input[placeholder="Enter login ID"]', username);
      await page.type('input[placeholder="Enter password"]', 'password123');
      await page.click('button[type="submit"]');
      await new Promise(r => setTimeout(r, 3000));
      
      await page.screenshot({ path: path.join(__dirname, '../artifacts/screenshot_successful_login.png') });
      console.log('Captured screenshot of Successful Login');
    }
    
    const prisma = new PrismaClient();
    const insertedUser = await prisma.user.findUnique({ where: { username: username } });
    console.log('\n--- POSTGRESQL RECORD ---');
    console.log(JSON.stringify(insertedUser, null, 2));
    console.log('-------------------------');
    
    const htmlContent = `
      <html>
      <body style="background: #1e1e1e; color: #d4d4d4; font-family: monospace; padding: 20px;">
        <h2>Network POST Request</h2>
        <pre style="background: #252526; padding: 10px; border-radius: 5px;">${networkLogs.join('\\n')}</pre>
        <h2>PostgreSQL Inserted Record</h2>
        <pre style="background: #252526; padding: 10px; border-radius: 5px;">${JSON.stringify(insertedUser, null, 2)}</pre>
      </body>
      </html>
    `;
    const fs = require('fs');
    fs.writeFileSync(path.join(__dirname, 'evidence.html'), htmlContent);
    await page.goto('file://' + path.join(__dirname, 'evidence.html'));
    await page.screenshot({ path: path.join(__dirname, '../artifacts/screenshot_db_network_evidence.png') });
    
    await prisma.$disconnect();
  } else {
    console.log('Could not find Manage Credentials button.');
  }

  await browser.close();
})();
