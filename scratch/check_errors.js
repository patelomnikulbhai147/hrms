import puppeteer from 'puppeteer';

(async () => {
  console.log('Starting puppeteer...');
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  page.on('requestfailed', request => console.log('REQUEST FAILED:', request.url(), request.failure()?.errorText));

  try {
    console.log('Navigating to http://localhost:5173 ...');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle0', timeout: 15000 });
    console.log('Navigation complete.');
    const content = await page.content();
    if (content.includes('Access Denied')) {
        console.log('PAGE STATUS: Access Denied shown');
    } else if (content.length < 1000) {
        console.log('PAGE STATUS: Content very short, might be blank');
    } else {
        console.log('PAGE STATUS: Looks loaded. Body length: ' + content.length);
    }
  } catch (err) {
    console.log('ERROR during navigation:', err);
  }

  await browser.close();
})();
