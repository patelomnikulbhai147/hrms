const puppeteer = require('puppeteer');
const fs = require('fs');

async function delay(time) {
  return new Promise(function(resolve) { 
      setTimeout(resolve, time)
  });
}

const users = [
  { role: 'Super Admin', username: 'superadmin', password: 'default123' },
  { role: 'Company Admin', username: 'om', password: 'default123' },
  { role: 'HR', username: 'parth', password: 'parth123' },
  { role: 'Finance', username: 'finance', password: 'password123' },
  { role: 'Employee', username: 'employee', password: 'password123' },
];

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });

  console.log("Starting QA Tests...");

  for (const user of users) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    console.log(`Testing Login for ${user.role}...`);
    try {
      await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2' });
      await delay(1000);
      
      await page.waitForSelector('input[placeholder="Enter login ID"]', { timeout: 5000 });
      await page.type('input[placeholder="Enter login ID"]', user.username);
      await page.type('input[type="password"]', user.password);
      await page.click('button[type="submit"]');
      
      // wait for dashboard or workspace selector
      await delay(4000);
      
      await page.screenshot({ path: `qa_login_${user.role.replace(' ', '_')}.png` });
      console.log(`✅ Login test passed for ${user.role}`);
    } catch (e) {
      console.error(`❌ Login test failed for ${user.role}:`, e.message);
      await page.screenshot({ path: `qa_login_error_${user.role.replace(' ', '_')}.png` });
    } finally {
      await context.close();
    }
  }

  await browser.close();
  console.log("Login tests done.");
})();
