const puppeteer = require('puppeteer');
const fs = require('fs');

const delay = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('Capturing Branch Audits');
  const browser = await puppeteer.launch({ headless: "new", defaultViewport: { width: 1536, height: 864 } });
  
  try {
    const page = await browser.newPage();
    await page.goto('http://localhost:5176', { waitUntil: 'domcontentloaded' });
    await delay(3000); 
    await page.evaluate(() => localStorage.clear());
    await page.goto('http://localhost:5176', { waitUntil: 'domcontentloaded' });
    await delay(2000);
    
    // Login as om (Company Head)
    await page.type('input[type="text"]', 'om');
    await page.type('input[type="password"]', 'default123');
    await page.click('button[type="submit"]');
    await delay(6000);
    
    // Select Rajkot branch
    await page.evaluate(() => {
       const headerSpan = Array.from(document.querySelectorAll('span')).find(s => s.textContent.includes('Workspace') || s.textContent.includes('Company'));
       if (headerSpan) headerSpan.click();
    });
    await delay(2000);
    
    // Attempt to click Rajkot (might not exist as a button directly, it's usually a div)
    await page.evaluate(() => {
        const divs = Array.from(document.querySelectorAll('div'));
        const rajkot = divs.find(d => d.textContent === 'Rajkot' && d.children.length === 0);
        if (rajkot) rajkot.click();
    });
    await delay(3000);
    
    await page.screenshot({ path: 'audit_6_rajkot_dashboard.png', fullPage: true });

    // Navigate to Employees
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
    
    if (await clickSpan('Employees')) {
       await delay(3000);
       await page.screenshot({ path: 'audit_7_rajkot_employees.png', fullPage: true });
    }

    if (await clickSpan('Payroll')) {
       await delay(3000);
       await page.screenshot({ path: 'audit_8_rajkot_payroll.png', fullPage: true });
    }

    console.log('Screenshots captured.');
  } catch(e) {
    console.error('Error:', e);
  } finally {
    await browser.close();
  }
})();
