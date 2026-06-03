const puppeteer = require('../node_modules/puppeteer');

(async () => {
  console.log('Launching browser...');
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('PAGE ERROR LOG:', msg.text());
    }
  });
  page.on('pageerror', error => console.log('PAGE UNCAUGHT ERROR:', error.message));
  
  console.log('Navigating to login...');
  await page.goto('http://localhost:5173');
  
  await page.type('input[placeholder="Enter login ID"]', 'superadmin');
  await page.type('input[placeholder="Enter password"]', 'default123');
  await page.click('button[type="submit"]');
  
  console.log('Waiting for login request...');
  await new Promise(r => setTimeout(r, 2000));
  
  console.log('Reloading to simulate authenticated refresh...');
  await page.goto('http://localhost:5173');
  
  await new Promise(r => setTimeout(r, 3000));
  
  const rootHtml = await page.$eval('#root', el => el.innerHTML).catch(() => 'no #root found');
  console.log('Root HTML length:', rootHtml.length);
  
  await browser.close();
  console.log('Done');
})();
