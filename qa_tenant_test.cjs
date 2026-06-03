const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', defaultViewport: { width: 1280, height: 800 } });
  const page = await browser.newPage();
  
  try {
    // 1. Go to Login
    await page.goto('http://localhost:5174', { waitUntil: 'networkidle2' });
    
    // Login as superadmin
    await page.waitForSelector('input[type="text"]', { timeout: 10000 });
    await page.type('input[type="text"]', 'superadmin');
    await page.type('input[type="password"]', 'password123'); // assuming standard demo password
    
    await page.click('button[type="submit"]');
    
    // As superadmin, we should go straight to dashboard. Let's navigate to /companies
    // Wait, it is an SPA. Superadmin has access to Tenant Directory.
    // Let's click the "Companies" sidebar link.
    await page.waitForSelector('text/Companies', { timeout: 5000 });
    const companiesLink = await page.$('xpath///a[contains(., "Companies")]');
    if (companiesLink) {
        await companiesLink.click();
    }
    
    await new Promise(r => setTimeout(r, 2000));
    
    // Find GCRI row and click the expand button to show branches
    const gcriExpandButton = await page.$('xpath///tr[contains(., "GCRI")]//button[contains(@class, "hover:bg-slate-700/50")]');
    if (gcriExpandButton) {
        await gcriExpandButton.click();
        await new Promise(r => setTimeout(r, 1000));
    }
    
    await page.screenshot({ path: 'bugfix_tenant_directory.png', fullPage: true });
    console.log('Captured Tenant Directory.');

  } catch(e) {
    console.error('Test failed:', e);
  } finally {
    await browser.close();
  }
})();
