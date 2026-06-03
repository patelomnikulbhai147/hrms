const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(`Console Error: ${msg.text()}`);
    }
  });
  
  page.on('pageerror', error => {
    errors.push(`Page Error: ${error.message}`);
  });

  try {
    await page.goto('http://localhost:5174', { waitUntil: 'networkidle2' });
    await page.waitForTimeout(3000); // Wait for React to mount and potentially crash
  } catch(e) {
    errors.push(`Navigation Error: ${e.message}`);
  }
  
  fs.writeFileSync('browser_errors.log', errors.join('\n'));
  console.log('Errors logged to browser_errors.log');
  await browser.close();
})();
