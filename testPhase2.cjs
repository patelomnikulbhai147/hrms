const puppeteer = require('puppeteer');

const delay = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ headless: "new", defaultViewport: { width: 1536, height: 864 } });
  const page = await browser.newPage();
  
  await page.goto('http://localhost:5175', { waitUntil: 'networkidle2' });
  await page.evaluate(() => localStorage.clear());
  await page.goto('http://localhost:5175', { waitUntil: 'networkidle2' });
  
  await page.type('input[type="text"]', 'superadmin');
  await page.type('input[type="password"]', 'default123');
  await page.click('button[type="submit"]');
  
  await delay(5000);
  
  // Navigate to Companies
  const spans = await page.$$('span');
  for (const span of spans) {
    const text = await page.evaluate(el => el.textContent, span);
    if (text && text.trim() === 'Companies') {
      await span.click();
      break;
    }
  }
  
  await delay(3000);
  await page.screenshot({ path: 'phase2_companies_dashboard.png', fullPage: true });
  console.log('Saved phase2_companies_dashboard.png');
  
  await browser.close();
})();
