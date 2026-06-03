const puppeteer = require('../node_modules/puppeteer');

(async () => {
  console.log('Launching browser...');
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  
  console.log('Navigating to login...');
  await page.goto('http://localhost:5173');
  
  console.log('Typing login...');
  await page.type('input[placeholder="Enter login ID"]', 'superadmin');
  await page.type('input[placeholder="Enter password"]', 'default123');
  await page.click('button[type="submit"]');
  
  console.log('Waiting for nav...');
  await page.waitForNavigation();
  
  console.log('Going to employees...');
  await page.goto('http://localhost:5173/employees');
  
  await new Promise(r => setTimeout(r, 4000));
  await browser.close();
  console.log('Done');
})();
