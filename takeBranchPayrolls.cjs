const puppeteer = require('puppeteer');
const fs = require('fs');

const delay = ms => new Promise(r => setTimeout(r, ms));

const branches = ["Rajkot", "Bhavnagar", "Siddhpur", "Ahmedabad"];

(async () => {
  console.log('Capturing Branch Payroll Screenshots');
  const browser = await puppeteer.launch({ headless: "new", defaultViewport: { width: 1536, height: 1080 } });
  
  try {
    const page = await browser.newPage();
    
    // Login
    await page.goto('http://localhost:5176', { waitUntil: 'domcontentloaded' });
    await delay(2000); 
    await page.evaluate(() => localStorage.clear());
    await page.goto('http://localhost:5176', { waitUntil: 'domcontentloaded' });
    await delay(2000);

    await page.type('input[type="text"]', 'om');
    await page.type('input[type="password"]', 'default123');
    await page.click('button[type="submit"]');
    await delay(6000);

    for (const branch of branches) {
        console.log(`Processing branch: ${branch}`);
        
        // Open Workspace Selector
        await page.evaluate(() => {
           const headerSpan = Array.from(document.querySelectorAll('span')).find(s => s.textContent.includes('Workspace') || s.textContent.includes('Company'));
           if (headerSpan) headerSpan.click();
        });
        await delay(2000);
        
        // Select specific branch
        await page.evaluate((b) => {
            const divs = Array.from(document.querySelectorAll('div'));
            const target = divs.find(d => d.textContent === b && d.children.length === 0);
            if (target) target.click();
        }, branch);
        await delay(3000);
        
        // Navigate to Payroll
        const spans = await page.$$('span');
        for (const span of spans) {
          const text = await page.evaluate(el => el.textContent, span);
          if (text && text.trim() === 'Payroll') {
            await span.click();
            break;
          }
        }
        await delay(3000);
        
        await page.screenshot({ path: `final_payroll_${branch}.png`, fullPage: true });
        console.log(`Saved screenshot for ${branch}`);
    }

    console.log('All branch payrolls captured successfully.');
  } catch(e) {
    console.error('Error capturing screenshots:', e);
  } finally {
    await browser.close();
  }
})();
