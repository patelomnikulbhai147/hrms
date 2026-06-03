const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));

  await page.goto('http://localhost:5175', { waitUntil: 'networkidle2' });
  await page.type('input[type="text"]', 'superadmin');
  await page.type('input[type="password"]', 'default123');
  
  await page.click('button[type="submit"]');
  
  await new Promise(r => setTimeout(r, 6000));
  await browser.close();
})();
