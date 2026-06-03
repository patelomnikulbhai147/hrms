const puppeteer = require('puppeteer');

const delay = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('Capturing Final Audit Screenshots');
  const browser = await puppeteer.launch({ headless: "new", defaultViewport: { width: 1536, height: 864 } });
  
  try {
    const page = await browser.newPage();
    await page.goto('http://localhost:5176', { waitUntil: 'domcontentloaded' });
    await delay(3000); // Give Vite time to settle
    await page.evaluate(() => localStorage.clear());
    await page.goto('http://localhost:5176', { waitUntil: 'domcontentloaded' });
    await delay(2000);
    
    // Login as Super Admin
    await page.type('input[type="text"]', 'superadmin');
    await page.type('input[type="password"]', 'default123');
    await page.click('button[type="submit"]');
    await delay(6000);

    // 1. Dashboard screenshot
    await page.screenshot({ path: 'audit_1_dashboard.png', fullPage: true });
    
    const clickSpan = async (textMatch) => {
        const spans = await page.$$('span');
        for (const span of spans) {
          const text = await page.evaluate(el => el.textContent, span);
          if (text && text.trim() === textMatch) {
            await span.click();
            return true;
          }
        }
        return false;
    };

    // 2. Companies
    if (await clickSpan('Companies')) {
       await delay(3000);
       await page.screenshot({ path: 'audit_2_companies.png', fullPage: true });
    }
    
    // 3. Employees
    if (await clickSpan('Employees')) {
       await delay(3000);
       await page.screenshot({ path: 'audit_3_employees.png', fullPage: true });
    }

    // 4. Payroll
    if (await clickSpan('Payroll')) {
       await delay(3000);
       await page.screenshot({ path: 'audit_4_payroll.png', fullPage: true });
    }
    
    // 5. Settings / User Management
    if (await clickSpan('Settings')) {
       await delay(3000);
       // Click Users tab
       const btns = await page.$$('button');
       for (const btn of btns) {
          const text = await page.evaluate(el => el.textContent, btn);
          if (text && text.includes('Users')) {
             await btn.click();
             break;
          }
       }
       await delay(2000);
       await page.screenshot({ path: 'audit_5_user_management.png', fullPage: true });
    }

    console.log('Screenshots captured successfully.');
  } catch(e) {
    console.error('Error capturing screenshots:', e);
  } finally {
    await browser.close();
  }
})();
