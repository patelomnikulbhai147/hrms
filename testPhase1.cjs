const puppeteer = require('puppeteer');
const fs = require('fs');

const delay = ms => new Promise(r => setTimeout(r, ms));

const roles = [
  { role: 'Super Admin', username: 'superadmin', pwd: 'default123' },
  { role: 'Company Head', username: 'om', pwd: 'default123' },
  { role: 'HR', username: 'parth', pwd: 'parth123' },
  { role: 'Finance', username: 'jay', pwd: 'jay1234' },
  { role: 'Employee', username: 'nirav', pwd: 'welcome123' }
];

(async () => {
  console.log('Phase 1: Login Testing (All Roles)');
  const browser = await puppeteer.launch({
    headless: "new",
    defaultViewport: { width: 1536, height: 864 }
  });
  
  for (const r of roles) {
    const page = await browser.newPage();
    let errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
         errors.push(msg.text());
      }
    });
    page.on('pageerror', err => errors.push(err.toString()));
    page.on('response', res => {
      if (!res.ok() && res.request().resourceType() === 'xhr') {
         errors.push(`API Error: ${res.url()} - ${res.status()}`);
      }
    });

    try {
      console.log(`\nTesting login for: ${r.role} (${r.username})`);
      await page.goto('http://localhost:5175', { waitUntil: 'networkidle2', timeout: 30000 });
      await page.evaluate(() => localStorage.clear());
      await page.goto('http://localhost:5175', { waitUntil: 'networkidle2' });
      
      await page.waitForSelector('input[type="text"]', { timeout: 10000 });
      await page.type('input[type="text"]', r.username);
      await page.type('input[type="password"]', r.pwd);
      
      const buttons = await page.$$('button');
      let clicked = false;
      for (const btn of buttons) {
        const text = await page.evaluate(el => el.textContent, btn);
        if (text && text.includes('Authenticate Session')) {
          await btn.click();
          clicked = true;
          break;
        }
      }
      if (!clicked) await page.click('button[type="submit"]');
      
      // Wait for navigation / data load
      await delay(8000); 
      
      const errorDiv = await page.$('.text-red-500, .bg-red-500'); 
      if (errorDiv) {
         const errText = await page.evaluate(el => el.textContent, errorDiv);
         if (errText && (errText.includes('failed') || errText.includes('Incorrect'))) {
            console.log(`Login FAILED for ${r.username}: ${errText}`);
         }
      }

      await page.screenshot({ path: `phase1_${r.role.replace(' ', '_')}_login.png`, fullPage: true });
      console.log(`Saved screenshot: phase1_${r.role.replace(' ', '_')}_login.png`);

      // Verify page refresh works
      console.log('Refreshing page...');
      await page.reload({ waitUntil: 'networkidle2' });
      await delay(5000);
      
      console.log(`Console Errors for ${r.role}: ${errors.length > 0 ? errors.join(' | ') : 'None'}`);
      
      await page.evaluate(() => localStorage.clear());

    } catch (err) {
      console.error(`Script Error for ${r.username}:`, err.message);
    } finally {
      await page.close();
    }
  }
  
  await browser.close();
  console.log('Phase 1 completed.');
})();
