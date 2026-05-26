import puppeteer from 'puppeteer';

(async () => {
  console.log('Starting puppeteer...');
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));

  try {
    console.log('Navigating to http://localhost:5173 ...');
    await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 15000 });
    
    // Wait for network to settle slightly
    await new Promise(r => setTimeout(r, 2000));
    
    const text = await page.evaluate(() => document.body.innerText);
    console.log('--- PAGE TEXT EXTRACT ---');
    console.log(text.substring(0, 1000)); // Print first 1000 chars of page text
    console.log('-------------------------');

    // Check for Vite error overlay
    const hasErrorOverlay = await page.evaluate(() => {
        return !!document.querySelector('vite-error-overlay');
    });
    console.log('Has Vite Error Overlay?', hasErrorOverlay);

  } catch (err) {
    console.log('ERROR during navigation:', err);
  }

  await browser.close();
})();
