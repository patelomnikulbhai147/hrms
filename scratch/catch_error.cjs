const puppeteer = require('puppeteer-core');
const fs = require('fs');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe',
    headless: 'new',
    args: ['--no-sandbox']
  });
  const page = await browser.newPage();
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('PAGE ERROR:', msg.text());
    }
  });

  page.on('pageerror', err => {
    console.log('PAGE UNCAUGHT ERROR:', err.toString());
  });

  try {
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });
    await page.type('input[type="text"]', 'superadmin');
    await page.type('input[type="password"]', 'default123');
    await page.click('button[type="submit"]');
    
    // Wait a bit to let it render the dashboard
    await new Promise(r => setTimeout(r, 2000));
    
  } catch(e) {
    console.error(e);
  }
  await browser.close();
})();
