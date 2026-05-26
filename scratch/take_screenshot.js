import puppeteer from 'puppeteer';
import path from 'path';

(async () => {
  console.log('Starting puppeteer to take screenshot...');
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));

  try {
    await page.setViewport({ width: 1280, height: 800 });
    console.log('Navigating to http://localhost:5173 ...');
    
    // Use domcontentloaded and a short timeout, since networkidle0 hangs
    await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 5000 });
    
    // Wait a bit for React to render
    await new Promise(r => setTimeout(r, 2000));
    
    const screenshotPath = 'C:\\Users\\HP\\.gemini\\antigravity\\brain\\4ed5df86-47a5-4efb-bc1f-257afcafece0\\scratch_screenshot.png';
    await page.screenshot({ path: screenshotPath });
    console.log('Screenshot saved to', screenshotPath);

    // Also get the HTML
    const html = await page.content();
    console.log('HTML length:', html.length);
    console.log('First 500 chars of HTML:', html.substring(0, 500));

  } catch (err) {
    console.log('ERROR during navigation:', err);
  }

  await browser.close();
})();
