const puppeteer = require('puppeteer');
const fs = require('fs');

const delay = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  try {
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    
    // Capture console logs
    page.on('console', msg => {
      console.log('BROWSER_CONSOLE:', msg.text());
    });
    
    await page.goto('http://localhost:5174/login');
    await page.waitForSelector('input[type="text"]');
    await page.type('input[type="text"]', 'superadmin');
    await page.type('input[type="password"]', 'default123');
    await page.click('button[type="submit"]');
    await delay(3000);
    
    // Switch to Ahmedabad
    await page.evaluate(() => {
      localStorage.setItem('hrms_active_company_id', 'c-ahmedabad');
    });
    await page.reload();
    await delay(3000);
    
    // Click Payroll tab in sidebar
    await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('button'));
      const payrollLink = links.find(el => el.innerText.includes('Payroll'));
      if (payrollLink) payrollLink.click();
    });
    await delay(5000);
    
    const debugText = await page.evaluate(() => {
      const el = document.querySelector('.bg-red-100');
      return el ? el.innerText : 'NO DEBUG TEXT FOUND';
    });
    console.log('EXTRACTED_DEBUG:', debugText);
    
    await browser.close();
  } catch(e) {
    console.error(e);
  }
})();
