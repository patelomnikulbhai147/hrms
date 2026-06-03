const puppeteer = require('../node_modules/puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({ defaultViewport: { width: 1280, height: 900 } });
  const page = await browser.newPage();
  
  await page.goto('http://localhost:5173');
  await new Promise(r => setTimeout(r, 1000));
  
  const needsLogin = await page.$('input[placeholder="Enter login ID"]');
  if (needsLogin) {
    await page.type('input[placeholder="Enter login ID"]', 'superadmin');
    await page.type('input[placeholder="Enter password"]', 'default123');
    await page.click('button[type="submit"]');
    await new Promise(r => setTimeout(r, 2000));
  }

  await page.goto('http://localhost:5173/companies');
  await new Promise(r => setTimeout(r, 3000));
  
  const buttons = await page.$$('button');
  for (const btn of buttons) {
    const html = await page.evaluate(el => el.innerHTML, btn);
    if (html.includes('lucide-chevron-right')) {
      await btn.click();
      break;
    }
  }

  await new Promise(r => setTimeout(r, 1000));

  const screenshotPath = path.join(__dirname, '../scratch/final_companies_proof.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log('Screenshot saved to:', screenshotPath);
  
  await browser.close();
})();
