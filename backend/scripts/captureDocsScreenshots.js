const puppeteer = require('puppeteer');
const path = require('path');

const BASE_URL = 'http://localhost:5173';
const SCREENSHOT_DIR = path.join(__dirname, '..', '..', 'docs', 'screenshots');

const PAGES_TO_CAPTURE = [
    { url: '/dashboard', filename: 'dashboard.png' },
    { url: '/employees', filename: 'employee_list.png' },
    { url: '/attendance', filename: 'attendance_dashboard.png' },
    { url: '/payroll', filename: 'payroll_dashboard.png' },
    { url: '/reports', filename: 'reports_center.png' },
    { url: '/settings', filename: 'company_profile.png' },
    { url: '/settings/branches', filename: 'branch_management.png' },
    { url: '/billing', filename: 'billing_dashboard.png' }
];

async function captureScreenshots() {
    console.log('Launching browser...');
    const browser = await puppeteer.launch({
        headless: "new",
        defaultViewport: { width: 1440, height: 900 }
    });

    try {
        const page = await browser.newPage();
        
        console.log('Navigating to login page...');
        await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle0' });

        console.log('Entering credentials...');
        await page.type('input[type="email"], input[name="email"], #email', 'nirav@gmail.com');
        await page.type('input[type="password"], input[name="password"], #password', 'Nirav@12345');
        
        console.log('Submitting login...');
        await page.click('button[type="submit"]');

        console.log('Waiting for login to complete...');
        // Wait for URL to change away from login, or a specific dashboard element
        await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 }).catch(() => console.log('Navigation timeout, continuing anyway...'));
        await new Promise(r => setTimeout(r, 2000)); // Additional buffer for API data to load

        for (const pageInfo of PAGES_TO_CAPTURE) {
            console.log(`Navigating to ${pageInfo.url}...`);
            await page.goto(`${BASE_URL}${pageInfo.url}`, { waitUntil: 'networkidle0' });
            
            // Wait a moment for tables/graphs to render
            await new Promise(r => setTimeout(r, 2000));
            
            const screenshotPath = path.join(SCREENSHOT_DIR, pageInfo.filename);
            await page.screenshot({ path: screenshotPath, fullPage: true });
            console.log(`Saved screenshot: ${pageInfo.filename}`);
        }

        console.log('Screenshot capture complete!');

    } catch (error) {
        console.error('Error capturing screenshots:', error);
    } finally {
        await browser.close();
    }
}

captureScreenshots();
