import puppeteer from 'puppeteer';

(async () => {
  console.log('Starting puppeteer to take screenshot of Vercel...');
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  try {
    await page.setViewport({ width: 1280, height: 800 });
    console.log('Navigating to https://hrms-d1-dun.vercel.app/ ...');
    await page.goto('https://hrms-d1-dun.vercel.app/', { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Wait for the login screen or dashboard to render completely
    await new Promise(r => setTimeout(r, 3000));
    
    // Take screenshot!
    const screenshotPath = 'C:\\Users\\HP\\.gemini\\antigravity\\brain\\4ed5df86-47a5-4efb-bc1f-257afcafece0\\vercel_success.png';
    await page.screenshot({ path: screenshotPath });
    console.log('Screenshot saved to', screenshotPath);

  } catch (err) {
    console.log('Puppeteer Script Error:', err);
  }

  await browser.close();
})();
