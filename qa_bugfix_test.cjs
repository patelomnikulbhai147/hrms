const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ 
    headless: 'new', 
    defaultViewport: { width: 1440, height: 900 }
  });
  const page = await browser.newPage();
  
  try {
    // 1. Go to Login
    await page.goto('http://localhost:5174', { waitUntil: 'networkidle2' });
    console.log('Navigated to login.');
    
    await page.waitForSelector('input[type="text"]', { timeout: 10000 });
    await page.type('input[type="text"]', 'om');
    await page.type('input[type="password"]', 'password123'); // assuming standard demo password
    
    // Fallback: If login fails because we don't know the password, we can intercept or just wait.
    await page.click('button[type="submit"]');
    
    // Wait for the workspace selector to appear
    await new Promise(r => setTimeout(r, 3000));
    
    // Capture workspace selector screenshot
    await page.screenshot({ path: 'bugfix_workspace_selector.png' });
    console.log('Captured Workspace Selector.');

    // Click on GCRI (if it exists) or first available
    // For om, the GCRI headquarters should appear. Let's find any button that says 'Ahmedabad' or 'GCRI'
    const buttons = await page.$$('button');
    let clicked = false;
    for (const btn of buttons) {
      const text = await page.evaluate(el => el.textContent, btn);
      if (text.includes('Ahmedabad')) {
        await btn.click();
        clicked = true;
        break;
      }
    }
    if (!clicked && buttons.length > 0) {
      await buttons[0].click();
    }
    
    // Wait for dashboard to load completely (hydrateAll takes a second)
    await new Promise(r => setTimeout(r, 4000));
    
    // Go to Employees page
    const navLinks = await page.$$('nav button');
    for (const link of navLinks) {
      const text = await page.evaluate(el => el.textContent, link);
      if (text.includes('Employees')) {
        await link.click();
        break;
      }
    }
    await new Promise(r => setTimeout(r, 2000)); // Wait for employee list to render
    
    // Capture Employees
    await page.screenshot({ path: 'bugfix_employees.png' });
    console.log('Captured Employees.');

    // Go to Payroll
    for (const link of navLinks) {
      const text = await page.evaluate(el => el.textContent, link);
      if (text.includes('Payroll')) {
        await link.click();
        break;
      }
    }
    await new Promise(r => setTimeout(r, 2000));
    
    // Capture Payroll
    await page.screenshot({ path: 'bugfix_payroll.png' });
    console.log('Captured Payroll.');

    // Go to Documents
    for (const link of navLinks) {
      const text = await page.evaluate(el => el.textContent, link);
      if (text.includes('Documents')) {
        await link.click();
        break;
      }
    }
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: 'bugfix_documents.png' });
    console.log('Captured Documents.');

  } catch (e) {
    console.error('Test failed:', e);
  } finally {
    await browser.close();
  }
})();
