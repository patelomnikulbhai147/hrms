import puppeteer from 'puppeteer';

(async () => {
  console.log('Starting puppeteer to grab Vite error overlay...');
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  try {
    await page.setViewport({ width: 1280, height: 800 });
    console.log('Navigating to http://localhost:5173 ...');
    await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    await new Promise(r => setTimeout(r, 2000));
    
    // Log in as Super Admin
    await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('div'));
        const adminCard = cards.find(c => c.innerText && c.innerText.includes('Super Admin') && c.innerText.includes('System-wide control'));
        if (adminCard) adminCard.click();
    });
    
    await new Promise(r => setTimeout(r, 2000));
    
    // Click Manage
    await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const manageBtn = buttons.find(b => b.innerText && (b.innerText.includes('Manage') || b.innerText.includes('Activate')));
        if (manageBtn) manageBtn.click();
    });
    
    await new Promise(r => setTimeout(r, 2000));
    
    // Click Employees
    await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const empBtn = buttons.find(b => b.innerText && b.innerText.includes('Employees'));
        if (empBtn) empBtn.click();
    });
    
    await new Promise(r => setTimeout(r, 3000));
    
    // Check for vite-error-overlay
    const errorText = await page.evaluate(() => {
        const overlay = document.querySelector('vite-error-overlay');
        if (overlay && overlay.shadowRoot) {
            return overlay.shadowRoot.textContent;
        }
        return document.body.innerText.substring(0, 1000);
    });
    
    console.log('--- VITE ERROR TEXT ---');
    console.log(errorText);
    console.log('-----------------------');

  } catch (err) {
    console.log('Puppeteer Script Error:', err);
  }

  await browser.close();
})();
