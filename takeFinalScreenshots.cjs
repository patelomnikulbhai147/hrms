const puppeteer = require('puppeteer');
const fs = require('fs');

const delay = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('Capturing Final Visual Walkthrough Screenshots');
  const browser = await puppeteer.launch({ headless: "new", defaultViewport: { width: 1536, height: 1080 } });
  
  try {
    const page = await browser.newPage();
    
    // 1. Login Page
    await page.goto('http://localhost:5176', { waitUntil: 'domcontentloaded' });
    await delay(3000); 
    await page.evaluate(() => localStorage.clear());
    await page.goto('http://localhost:5176', { waitUntil: 'domcontentloaded' });
    await delay(2000);
    await page.screenshot({ path: 'final_01_login_page.png', fullPage: true });

    // Login as om (Company Head) to see the most features
    await page.type('input[type="text"]', 'om');
    await page.type('input[type="password"]', 'default123');
    await page.click('button[type="submit"]');
    await delay(6000);
    
    // 2. Dashboard 
    await page.screenshot({ path: 'final_02_dashboard.png', fullPage: true });

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

    // 3. Companies
    if (await clickSpan('Companies')) {
       await delay(3000);
       await page.screenshot({ path: 'final_03_companies.png', fullPage: true });
    }
    
    // 4. Employees
    if (await clickSpan('Employees')) {
       await delay(3000);
       await page.screenshot({ path: 'final_04_employees.png', fullPage: true });
    }

    // 5. Payroll
    if (await clickSpan('Payroll')) {
       await delay(3000);
       await page.screenshot({ path: 'final_05_payroll.png', fullPage: true });
    }

    // 6. Branch Workspace Selection
    await page.evaluate(() => {
       const headerSpan = Array.from(document.querySelectorAll('span')).find(s => s.textContent.includes('Workspace') || s.textContent.includes('Company'));
       if (headerSpan) headerSpan.click();
    });
    await delay(2000);
    await page.screenshot({ path: 'final_06_workspace_selector.png', fullPage: true });

    // Select Rajkot branch
    await page.evaluate(() => {
        const divs = Array.from(document.querySelectorAll('div'));
        const rajkot = divs.find(d => d.textContent === 'Rajkot' && d.children.length === 0);
        if (rajkot) rajkot.click();
    });
    await delay(3000);
    await page.screenshot({ path: 'final_07_rajkot_dashboard.png', fullPage: true });

    // 8. Branch Employees
    if (await clickSpan('Employees')) {
       await delay(3000);
       await page.screenshot({ path: 'final_08_rajkot_employees.png', fullPage: true });
    }

    // 9. Settings
    if (await clickSpan('Settings')) {
       await delay(3000);
       await page.screenshot({ path: 'final_09_settings.png', fullPage: true });
    }

    console.log('Final screenshots captured successfully.');
  } catch(e) {
    console.error('Error capturing screenshots:', e);
  } finally {
    await browser.close();
  }
})();
