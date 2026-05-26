import puppeteer from 'puppeteer';

(async () => {
  console.log('Starting puppeteer to take success screenshot...');
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  try {
    await page.setViewport({ width: 1280, height: 800 });
    console.log('Navigating to http://localhost:5173 ...');
    await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    await new Promise(r => setTimeout(r, 1000));
    
    // Log in as Super Admin
    await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('div'));
        const adminCard = cards.find(c => c.innerText && c.innerText.includes('superadmin') && c.innerText.includes('Platform Owner'));
        if (adminCard) adminCard.click();
    });
    
    await new Promise(r => setTimeout(r, 1500));
    
    // Click Manage
    await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const manageBtn = buttons.find(b => b.innerText && (b.innerText.includes('Manage') || b.innerText.includes('Activate')));
        if (manageBtn) manageBtn.click();
    });
    
    await new Promise(r => setTimeout(r, 1500));
    
    // Click Employees
    await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const empBtn = buttons.find(b => b.innerText && b.innerText.includes('Employees'));
        if (empBtn) empBtn.click();
    });
    
    await new Promise(r => setTimeout(r, 2000));
    
    // Take screenshot!
    const screenshotPath = 'C:\\Users\\HP\\.gemini\\antigravity\\brain\\4ed5df86-47a5-4efb-bc1f-257afcafece0\\employees_success.png';
    await page.screenshot({ path: screenshotPath });
    console.log('Screenshot saved to', screenshotPath);

  } catch (err) {
    console.log('Puppeteer Script Error:', err);
  }

  await browser.close();
})();
