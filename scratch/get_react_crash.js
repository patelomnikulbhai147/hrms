import puppeteer from 'puppeteer';

(async () => {
  console.log('Starting puppeteer to grab React crash stack trace...');
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  // Capture all errors
  page.on('console', msg => {
      if (msg.type() === 'error') console.log('BROWSER ERROR LOG:', msg.text());
  });
  page.on('pageerror', error => console.log('PAGE ERROR (uncaught exception):', error.message));

  try {
    await page.setViewport({ width: 1280, height: 800 });
    console.log('Navigating to http://localhost:5173 ...');
    await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    await new Promise(r => setTimeout(r, 1000));
    
    // Log in as Super Admin
    console.log('Clicking Super Admin login card...');
    await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('div'));
        const adminCard = cards.find(c => c.innerText && c.innerText.includes('Super Admin') && c.innerText.includes('System-wide control'));
        if (adminCard) adminCard.click();
    });
    
    await new Promise(r => setTimeout(r, 1000));
    
    // We are on Companies dashboard. Click "Manage" on a company.
    console.log('Clicking Manage on a company...');
    await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const manageBtn = buttons.find(b => b.innerText && (b.innerText.includes('Manage') || b.innerText.includes('Activate')));
        if (manageBtn) manageBtn.click();
    });
    
    await new Promise(r => setTimeout(r, 1000));
    
    // Click Employees in Sidebar
    console.log('Clicking Employees in Sidebar...');
    await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const empBtn = buttons.find(b => b.innerText && b.innerText.includes('Employees'));
        if (empBtn) empBtn.click();
    });
    
    // Wait for crash
    await new Promise(r => setTimeout(r, 2000));
    console.log('Done waiting for crash.');

  } catch (err) {
    console.log('Puppeteer Script Error:', err);
  }

  await browser.close();
})();
