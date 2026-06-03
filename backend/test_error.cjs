const puppeteer = require('../node_modules/puppeteer');

(async () => {
  const browser = await puppeteer.launch({ defaultViewport: { width: 1280, height: 900 } });
  const page = await browser.newPage();
  
  page.on('console', msg => {
    if (msg.type() === 'error') console.log('BROWSER ERROR:', msg.text());
  });

  page.on('dialog', async dialog => {
    console.log(`Alert: ${dialog.message()}`);
    await dialog.accept();
  });

  await page.goto('http://localhost:5173');
  await new Promise(r => setTimeout(r, 1000));
  
  let needsLogin = await page.$('input[placeholder="Enter login ID"]');
  if (needsLogin) {
    await page.type('input[placeholder="Enter login ID"]', 'superadmin');
    await page.type('input[placeholder="Enter password"]', 'default123');
    await page.click('button[type="submit"]');
    await new Promise(r => setTimeout(r, 2000));
  }

  await page.goto('http://localhost:5173/companies');
  
  try {
    await page.waitForSelector('button[title="Manage Credentials"]', { timeout: 10000 });
  } catch(e) {}
  
  const keyButtons = await page.$$('button[title="Manage Credentials"]');
  if (keyButtons.length > 0) {
    await keyButtons[0].click();
    await new Promise(r => setTimeout(r, 1000));
    
    await page.type('input[placeholder="e.g. John Doe"]', 'Test Officer Error');
    await page.type('input[placeholder="e.g. john@company.com"]', 'error_officer@test.com');
    await page.type('input[placeholder="johndoe"]', 'error_officer');
    await page.type('input[placeholder="Enter strong password"]', 'password123');
    
    const addBtn = await page.$x("//button[contains(., 'Add Account')]");
    if (addBtn.length > 0) {
      await addBtn[0].click();
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  await browser.close();
})();
