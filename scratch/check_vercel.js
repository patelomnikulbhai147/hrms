import puppeteer from 'puppeteer';

(async () => {
  console.log('Starting puppeteer to check Vercel...');
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  page.on('requestfailed', request => console.log('REQUEST FAILED:', request.url(), request.failure()?.errorText));

  try {
    console.log('Navigating to https://hrms-d1-cun.vercel.app ...');
    await page.goto('https://hrms-d1-cun.vercel.app', { waitUntil: 'networkidle2', timeout: 15000 });
    
    // Wait a bit
    await new Promise(r => setTimeout(r, 2000));
    
    const text = await page.evaluate(() => document.body.innerText);
    console.log('--- PAGE TEXT EXTRACT ---');
    console.log(text.substring(0, 1000)); 
    console.log('-------------------------');

  } catch (err) {
    console.log('ERROR during navigation:', err);
  }

  await browser.close();
})();
