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

  // Go to companies page
  await page.goto('http://localhost:5173/companies');
  await new Promise(r => setTimeout(r, 3000));
  
  // Find the Bhavnagar card and click masquerade
  // Wait, let's find the card with text "Bhavnagar"
  const buttons = await page.$$('button');
  for (const btn of buttons) {
    const html = await page.evaluate(el => el.innerHTML, btn);
    // Find the button inside the Bhavnagar card
    if (html.includes('lucide-chevron-right') && html.includes('Control Center')) {
      // Actually, we can just find the one that corresponds to Bhavnagar.
      // Or we can just programmatically set localStorage and reload!
      continue;
    }
  }
  
  // A cleaner way: set localStorage directly and reload to masquerade
  await page.evaluate(() => {
    localStorage.setItem('hrms_active_company_id', 'c-bhavnagar');
  });
  
  await page.goto('http://localhost:5173/employees');
  await new Promise(r => setTimeout(r, 3000));

  const screenshotPath = path.join(__dirname, '../scratch/bhavnagar_employees_proof.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log('Screenshot saved to:', screenshotPath);
  
  await browser.close();
})();
