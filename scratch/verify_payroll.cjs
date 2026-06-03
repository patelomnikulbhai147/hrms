const puppeteer = require('puppeteer');

const delay = ms => new Promise(res => setTimeout(res, ms));

async function verifyPayroll() {
  const browser = await puppeteer.launch({
    headless: "new",
    defaultViewport: { width: 1440, height: 900 }
  });

  const page = await browser.newPage();
  const consoleErrors = [];

  page.on('pageerror', err => consoleErrors.push(err.toString()));
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  try {
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });
    
    // Login
    await page.type('input[type="text"]', 'superadmin');
    await page.type('input[type="password"]', 'default123');
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

    await delay(3000);
    
    // Open Payroll
    await page.goto('http://localhost:5173/payroll', { waitUntil: 'networkidle2' });
    await delay(3000);
    
    await page.screenshot({ path: 'fixed_payroll_page.png', fullPage: true });

    console.log("Console Errors:", consoleErrors.length);
    if (consoleErrors.length > 0) {
      console.log("Details:", consoleErrors);
    }
  } catch (err) {
    console.error("Script failed:", err);
  } finally {
    await browser.close();
  }
}

verifyPayroll();
