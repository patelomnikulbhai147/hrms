const puppeteer = require('puppeteer');

const delay = ms => new Promise(r => setTimeout(r, ms));

const branches = ["Ahmedabad", "Rajkot"]; // We will check a couple of branches to prove it works

(async () => {
  console.log('Opening visible browser for user to observe the NEW Login Flow...');
  const browser = await puppeteer.launch({ headless: false, defaultViewport: null, args: ['--start-maximized'] });
  
  try {
    const page = (await browser.pages())[0] || await browser.newPage();
    
    // Login
    await page.goto('http://localhost:5176', { waitUntil: 'domcontentloaded' });
    await delay(2000); 
    await page.evaluate(() => localStorage.clear());
    await page.goto('http://localhost:5176', { waitUntil: 'domcontentloaded' });
    await delay(3000);

    // Type login credentials
    await page.type('input[type="text"]', 'om', { delay: 100 });
    await page.type('input[type="password"]', 'default123', { delay: 100 });
    await page.click('button[type="submit"]');
    
    // Give user time to see the NEW Workspace Selection Screen
    console.log('Waiting for Select Workspace screen...');
    await delay(5000);

    // Loop through branches
    for (const branch of branches) {
        console.log(`Selecting branch from grid: ${branch}`);
        
        // Find and click the branch card on the SelectWorkspace screen OR from the topbar
        // If we are on SelectWorkspace screen:
        const isSelectWorkspace = await page.evaluate(() => document.body.innerText.includes('Select Workspace'));
        
        if (isSelectWorkspace) {
           await page.evaluate((b) => {
               const buttons = Array.from(document.querySelectorAll('button'));
               const target = buttons.find(btn => btn.innerText.includes(b));
               if (target) target.click();
           }, branch);
        } else {
           // Fallback to topbar workspace selector if already logged in
           await page.evaluate(() => {
              const headerSpan = Array.from(document.querySelectorAll('span')).find(s => s.textContent.includes('Workspace') || s.textContent.includes('Company'));
              if (headerSpan) headerSpan.click();
           });
           await delay(2000);
           await page.evaluate((b) => {
               const divs = Array.from(document.querySelectorAll('div'));
               const target = divs.find(d => d.textContent === b && d.children.length === 0);
               if (target) target.click();
           }, branch);
        }
        
        // Give user time to see the branch dashboard load WITH REAL DATA
        console.log(`Viewing dashboard for ${branch}...`);
        await delay(5000);
        
        // Navigate to Payroll
        console.log(`Navigating to Payroll for ${branch}...`);
        const spans = await page.$$('span');
        for (const span of spans) {
          const text = await page.evaluate(el => el.textContent, span);
          if (text && text.trim() === 'Payroll') {
            await span.click();
            break;
          }
        }
        
        // Give user time to review the payroll table visually (IT WILL NOW HAVE DATA!)
        await delay(6000);
        
        // Go back to Select Workspace if needed? 
        // We can just logout to loop
        await page.evaluate(() => localStorage.clear());
        await page.goto('http://localhost:5176', { waitUntil: 'domcontentloaded' });
        await delay(3000);
        await page.type('input[type="text"]', 'om');
        await page.type('input[type="password"]', 'default123');
        await page.click('button[type="submit"]');
        await delay(4000);
    }

    console.log('Demo finished. Closing browser.');
  } catch(e) {
    console.error('Error during browser demo:', e);
  } finally {
    await browser.close();
  }
})();
