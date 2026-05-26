import puppeteer from 'puppeteer';

(async () => {
  console.log('Polling Vercel to wait for the new deployment...');
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  try {
    await page.setViewport({ width: 1280, height: 800 });
    
    let deployed = false;
    for (let i = 0; i < 20; i++) {
        console.log(`Attempt ${i+1}/20 - Checking https://hrms-d1-dun.vercel.app/ ...`);
        await page.goto('https://hrms-d1-dun.vercel.app/', { waitUntil: 'networkidle2', timeout: 30000 });
        
        await new Promise(r => setTimeout(r, 2000));
        
        const hasEmployees = await page.evaluate(() => {
            const text = document.body.innerText;
            // The old version has Employees in the sidebar. The new version doesn't.
            // But wait, the user might not be logged in. 
            const loginCard = document.querySelector('div')?.innerText.includes('Super Admin');
            return text.includes('Employees') && !loginCard; // If login card is present, Employees word might not be there anyway.
        });
        
        const isLogin = await page.evaluate(() => {
            return document.body.innerText.includes('Platform Owner');
        });
        
        if (isLogin) {
            // Log in first
            await page.evaluate(() => {
                const cards = Array.from(document.querySelectorAll('div'));
                const adminCard = cards.find(c => c.innerText && c.innerText.includes('superadmin') && c.innerText.includes('Platform Owner'));
                if (adminCard) adminCard.click();
            });
            await new Promise(r => setTimeout(r, 2000));
        }
        
        // After login or if already logged in, check sidebar
        const hasEmployeesInSidebar = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const empBtn = buttons.find(b => b.innerText && b.innerText.includes('Employees'));
            return !!empBtn;
        });

        if (!hasEmployeesInSidebar) {
            console.log("SUCCESS! The new version is deployed. 'Employees' is no longer in the Super Admin sidebar.");
            deployed = true;
            break;
        } else {
            console.log("Old version still present (Employees found in Sidebar). Waiting 10s...");
            await new Promise(r => setTimeout(r, 10000));
        }
    }
    
    if (deployed) {
        const screenshotPath = 'C:\\Users\\HP\\.gemini\\antigravity\\brain\\4ed5df86-47a5-4efb-bc1f-257afcafece0\\vercel_sidebar_fixed.png';
        await page.screenshot({ path: screenshotPath });
        console.log('Final screenshot saved to', screenshotPath);
    }

  } catch (err) {
    console.log('Puppeteer Script Error:', err);
  }

  await browser.close();
})();
