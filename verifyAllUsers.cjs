const puppeteer = require('puppeteer');
const fs = require('fs');

const delay = ms => new Promise(r => setTimeout(r, ms));

const users = [
  { username: 'superadmin', pwd: 'default123' },
  { username: 'om', pwd: 'default123' },
  { username: 'parth', pwd: 'parth123' },
  { username: 'jay', pwd: 'jay1234' },
  { username: 'nirav', pwd: 'welcome123' },
  { username: 'siddhpur-admin', pwd: 'siddhpur123' }
];

(async () => {
  console.log('Launching browser for multi-user test...');
  const browser = await puppeteer.launch({
    headless: "new",
    defaultViewport: { width: 1536, height: 864 }
  });
  
  for (const u of users) {
    const page = await browser.newPage();
    try {
      console.log(`\nTesting login for: ${u.username}`);
      await page.goto('http://localhost:5175', { waitUntil: 'networkidle2', timeout: 30000 });
      
      await page.waitForSelector('input[type="text"]', { timeout: 10000 });
      await page.type('input[type="text"]', u.username);
      await page.type('input[type="password"]', u.pwd);
      
      console.log('Clicking login...');
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
      
      console.log('Waiting for dashboard...');
      await delay(5000); 
      
      // Check if login failed (error message present)
      const errorDiv = await page.$('.text-red-500, .bg-red-500'); // simplistic check for errors
      if (errorDiv) {
         const errText = await page.evaluate(el => el.textContent, errorDiv);
         if (errText && (errText.includes('failed') || errText.includes('Incorrect'))) {
            console.log(`Login FAILED for ${u.username}: ${errText}`);
            await page.screenshot({ path: `verify_${u.username}_failed.png` });
            await page.close();
            continue;
         }
      }

      await page.screenshot({ path: `verify_${u.username}_login.png`, fullPage: true });
      console.log(`Saved verify_${u.username}_login.png`);
      
      // If it's a branch admin or super admin, try to navigate to Payroll
      console.log('Navigating to Payroll...');
      const spans = await page.$$('span');
      let payrollClicked = false;
      for (const span of spans) {
        const text = await page.evaluate(el => el.textContent, span);
        if (text && text.trim() === 'Payroll') {
          await span.click();
          payrollClicked = true;
          break;
        }
      }
      
      if (payrollClicked) {
        await delay(4000);
        await page.screenshot({ path: `verify_${u.username}_payroll.png`, fullPage: true });
        console.log(`Saved verify_${u.username}_payroll.png`);
      } else {
         console.log('No Payroll link found (perhaps not enough permissions).');
      }

      // Logout
      const outSpans = await page.$$('span');
      for (const span of outSpans) {
        const text = await page.evaluate(el => el.textContent, span);
        if (text && text.trim() === 'Log Out') {
          await span.click();
          break;
        }
      }
      await delay(2000);

    } catch (err) {
      console.error(`Error for ${u.username}:`, err.message);
      await page.screenshot({ path: `verify_${u.username}_error.png` });
    } finally {
      await page.close();
    }
  }
  
  await browser.close();
  console.log('All tests completed.');
})();
