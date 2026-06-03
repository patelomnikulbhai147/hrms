const puppeteer = require('../node_modules/puppeteer');
(async () => {
  const browser = await puppeteer.launch({ defaultViewport: { width: 1280, height: 900 } });
  const page = await browser.newPage();
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
  await new Promise(r => setTimeout(r, 5000));
  const rows = await page.('tbody tr'); console.log('Number of company rows:', rows.length); await page.screenshot({ path: '../scratch/companies_debug.png' });
  await browser.close();
})();
