import puppeteer from 'puppeteer';

(async () => {
  console.log('Starting puppeteer to check logged-in state...');
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));

  try {
    await page.setViewport({ width: 1280, height: 800 });
    console.log('Navigating to http://localhost:5173 ...');
    await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 5000 });
    
    await new Promise(r => setTimeout(r, 1000));
    
    // Attempt to log in as Super Admin
    console.log('Attempting to click Super Admin login card...');
    const clicked = await page.evaluate(() => {
        // Find the div with "Super Admin" text
        const cards = Array.from(document.querySelectorAll('div'));
        const adminCard = cards.find(c => c.innerText && c.innerText.includes('Super Admin') && c.innerText.includes('System-wide control'));
        if (adminCard) {
            adminCard.click();
            return true;
        }
        return false;
    });
    
    if (clicked) {
        console.log('Clicked! Waiting for navigation/render...');
        await new Promise(r => setTimeout(r, 2000));
        
        // Take screenshot of the logged in state!
        const screenshotPath = 'C:\\Users\\HP\\.gemini\\antigravity\\brain\\4ed5df86-47a5-4efb-bc1f-257afcafece0\\logged_in_screenshot.png';
        await page.screenshot({ path: screenshotPath });
        console.log('Logged in screenshot saved to', screenshotPath);

        const html = await page.content();
        console.log('HTML length:', html.length);
        
        // Check for vite error overlay
        const hasOverlay = await page.evaluate(() => !!document.querySelector('vite-error-overlay'));
        console.log('Vite Error Overlay present:', hasOverlay);
    } else {
        console.log('Could not find Super Admin card to click.');
    }

  } catch (err) {
    console.log('ERROR during navigation:', err);
  }

  await browser.close();
})();
