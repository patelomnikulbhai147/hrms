const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  await page.setViewport({ width: 1280, height: 800 });
  
  try {
    console.log('Navigating to app...');
    await page.goto('http://localhost:5175', { waitUntil: 'domcontentloaded' });
    
    // Login
    console.log('Logging in...');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const loginBtn = buttons.find(b => b.textContent.includes('Authenticate') || b.textContent.includes('Access System Workspace') || b.textContent.includes('Login'));
      if (loginBtn) loginBtn.click();
    });
    
    await new Promise(r => setTimeout(r, 2000));
    
    console.log('Navigating to Payroll...');
    // Click Payroll in sidebar
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const payrollBtn = buttons.find(b => b.textContent.includes('Payroll'));
      if (payrollBtn) payrollBtn.click();
    });
    
    await new Promise(r => setTimeout(r, 2000));
    
    console.log('Selecting Siddhpur Branch...');
    // Click branch selector
    await page.evaluate(() => {
      const selects = document.querySelectorAll('select');
      if (selects.length > 0) {
        selects[0].value = 'c-siddhpur';
        selects[0].dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    
    await new Promise(r => setTimeout(r, 3000));
    
    console.log('Taking screenshot...');
    await page.screenshot({ path: 'C:/Users/HP/.gemini/antigravity/brain/5422bedf-4d99-4062-bf92-2fde98e28245/siddhpur_payroll_fixed.png', fullPage: true });
    console.log('Screenshot saved!');
    
  } catch (err) {
    console.error('Error during puppeteer script:', err);
  } finally {
    await browser.close();
  }
})();
