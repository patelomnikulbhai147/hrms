const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  
  // Intercept network requests to see what /api/companies returns
  await page.setRequestInterception(true);
  page.on('request', req => req.continue());
  page.on('response', async res => {
    if (res.url().includes('/api/companies')) {
      const status = res.status();
      if (status === 200) {
        const text = await res.text();
        console.log('Companies API Response Length:', JSON.parse(text).length);
      } else {
        console.log('Companies API failed:', status, await res.text());
      }
    }
  });

  await page.goto('http://localhost:5175', { waitUntil: 'networkidle2' });
  await page.type('input[type="text"]', 'superadmin');
  await page.type('input[type="password"]', 'default123');
  await page.click('button[type="submit"]');
  
  await page.waitForTimeout(5000);
  await browser.close();
})();
