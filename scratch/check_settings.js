const puppeteer = require('puppeteer');

(async () => {
  console.log("Starting puppeteer to grab React crash stack trace...");
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('BROWSER ERROR LOG:', msg.text());
    }
  });

  page.on('pageerror', err => {
    console.log('BROWSER UNCAUGHT EXCEPTION:', err.toString());
  });

  console.log("Navigating to http://localhost:5173 ...");
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle2' });

  // 1. Type username and password
  await page.type('input[type="text"]', 'admin');
  await page.type('input[type="password"]', 'admin123');
  
  // 2. Click Authenticate
  await page.click('button[type="submit"]');
  await new Promise(r => setTimeout(r, 2000));
  
  // 3. Go to Companies
  const companiesTab = await page.$x("//span[contains(text(), 'Tenants')]");
  if (companiesTab.length > 0) {
    await companiesTab[0].click();
  } else {
    // try finding by href
    await page.goto('http://localhost:5173/companies', { waitUntil: 'networkidle2' });
  }
  await new Promise(r => setTimeout(r, 2000));
  
  // 4. Click 'Manage' on the first company
  const manageButtons = await page.$x("//button[contains(., 'Manage ')]");
  if (manageButtons.length > 0) {
    console.log("Clicking Manage on a company...");
    await manageButtons[0].click();
    await new Promise(r => setTimeout(r, 2000));
  } else {
    console.log("Could not find Manage button");
  }

  // 5. Click 'Settings' in the sidebar
  const settingsTab = await page.$x("//span[contains(text(), 'Settings')]");
  if (settingsTab.length > 0) {
    console.log("Clicking Settings in Sidebar...");
    await settingsTab[settingsTab.length - 1].click(); // usually the last one
    await new Promise(r => setTimeout(r, 2000));
  } else {
    // fallback navigation
    await page.goto('http://localhost:5173/settings', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log("Done waiting for crash.");
  await browser.close();
})();
