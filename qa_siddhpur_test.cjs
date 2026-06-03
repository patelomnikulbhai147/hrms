const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(`Console Error: ${msg.text()}`);
    }
  });
  page.on('requestfailed', request => {
    errors.push(`Request Failed: ${request.url()} - ${request.failure()?.errorText}`);
  });
  page.on('response', response => {
    if (!response.ok() && response.request().resourceType() === 'fetch') {
      errors.push(`API Error: ${response.status()} ${response.url()}`);
    }
  });

  console.log("Checking Ahmedabad, Siddhpur branches for payroll...");
  
  // We will login as "om" (Company Admin) who should have access to Ahmedabad, etc.
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2' });
  await page.type('input[placeholder="Enter login ID"]', 'siddhpur-admin');
  await page.type('input[type="password"]', 'siddhpur123');
  await page.click('button[type="submit"]');
  
  await new Promise(r => setTimeout(r, 4000));
  await page.screenshot({ path: `qa_multi_branch_siddhpur_selector.png` });
  
  // Click Siddhpur branch
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => b.textContent && b.textContent.includes('Siddhpur'));
    if (btn) btn.click();
  });
  
  await new Promise(r => setTimeout(r, 3000));
  await page.goto('http://localhost:5173/payroll', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 4000));
  await page.screenshot({ path: `qa_payroll_siddhpur.png` });
  
  await browser.close();
  
  console.log("ERRORS:", JSON.stringify(errors, null, 2));
})();
