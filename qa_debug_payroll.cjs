const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  page.on('console', msg => {
    if (msg.text().includes('Checking')) {
      console.log('BROWSER:', msg.text());
    }
  });
  
  try {
    await page.goto('http://localhost:5174', { waitUntil: 'networkidle2' });
    await page.type('input[type="text"]', 'om');
    await page.type('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await new Promise(r => setTimeout(r, 2000));
    
    const buttons = await page.$$('button');
    for (const btn of buttons) {
      const text = await page.evaluate(el => el.textContent, btn);
      if (text.includes('Ahmedabad')) {
        await btn.click();
        break;
      }
    }
    
    await new Promise(r => setTimeout(r, 2000));
    
    const navLinks = await page.$$('nav button');
    for (const link of navLinks) {
      const text = await page.evaluate(el => el.textContent, link);
      if (text.includes('Payroll')) {
        await link.click();
        break;
      }
    }
    
    await new Promise(r => setTimeout(r, 2000));
    console.log('Done');
  } catch(e) {
    console.error(e);
  } finally {
    await browser.close();
  }
})();
