const puppeteer = require('puppeteer');

const delay = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: "new",
    defaultViewport: { width: 1536, height: 864 }
  });
  const page = await browser.newPage();
  
  try {
    console.log('Navigating to login...');
    await page.goto('http://localhost:5175', { waitUntil: 'networkidle2', timeout: 30000 });
    
    await page.waitForSelector('input[type="text"]', { timeout: 10000 });
    await page.type('input[type="text"]', 'superadmin');
    await page.type('input[type="password"]', 'default123');
    
    console.log('Clicking login...');
    const buttons = await page.$$('button');
    let clicked = false;
    for (const btn of buttons) {
      const text = await page.evaluate(el => el.textContent, btn);
      if (text && text.includes('Authenticate Session')) {
        await btn.click();
        clicked = true;
        break;
      }
    }
    
    if (!clicked) {
       await page.click('button[type="submit"]');
    }
    
    console.log('Waiting for dashboard...');
    await delay(5000); // Wait for API response and React re-render
    
    await page.screenshot({ path: 'verify_login_success.png', fullPage: true });
    console.log('Saved verify_login_success.png');
    
    // Now switch to Siddhpur branch
    console.log('Switching to Siddhpur...');
    const switchers = await page.$$('button');
    let switcherBtn = null;
    for (const btn of switchers) {
      const text = await page.evaluate(el => el.textContent, btn);
      if (text && (text.includes('GCRI') || text.includes('Global Corporate'))) {
        switcherBtn = btn;
        break;
      }
    }
    
    if (switcherBtn) {
      await switcherBtn.click();
      await delay(1500);
      const divs = await page.$$('div');
      for (const div of divs) {
        const text = await page.evaluate(el => el.textContent, div);
        if (text && text.trim() === 'Siddhpur') {
          await div.click();
          break;
        }
      }
      await delay(4000); // Wait for Siddhpur dashboard API fetch
    } else {
      console.log('Company switcher not found');
    }

    await page.screenshot({ path: 'verify_dashboard_siddhpur.png', fullPage: true });
    console.log('Saved verify_dashboard_siddhpur.png');
    
    console.log('Navigating to Payroll...');
    const spans = await page.$$('span');
    for (const span of spans) {
      const text = await page.evaluate(el => el.textContent, span);
      if (text && text.trim() === 'Payroll') {
        await span.click();
        break;
      }
    }
    
    await delay(4000); // Wait for Payroll page to render
    await page.screenshot({ path: 'verify_payroll_siddhpur.png', fullPage: true });
    console.log('Saved verify_payroll_siddhpur.png');
    
  } catch (err) {
    console.error('Error during puppeteer script:', err);
    await page.screenshot({ path: 'verify_error_state.png' });
  } finally {
    await browser.close();
  }
})();
