const puppeteer = require('puppeteer');
const fs = require('fs');

async function delay(time) {
  return new Promise(function(resolve) { setTimeout(resolve, time) });
}

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  if (!fs.existsSync('artifacts')) {
    fs.mkdirSync('artifacts');
  }

  console.log("Final QA Screenshots...");
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2' });
  await page.type('input[placeholder="Enter login ID"]', 'parth');
  await page.type('input[type="password"]', 'parth123');
  await page.click('button[type="submit"]');
  
  await delay(3000);
  await page.screenshot({ path: `artifacts/working_workspace_selector.png` });

  // Click on "Rajkot" branch
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const rajkotBtn = buttons.find(b => b.textContent && b.textContent.includes('Rajkot'));
    if (rajkotBtn) rajkotBtn.click();
  });
  
  await delay(4000);
  await page.screenshot({ path: `artifacts/working_dashboard.png` });

  // Go to Companies
  await page.goto('http://localhost:5173/companies', { waitUntil: 'networkidle2' });
  await delay(3000);
  await page.screenshot({ path: `artifacts/working_company_list.png` });

  // Go to Employees
  await page.goto('http://localhost:5173/employees', { waitUntil: 'networkidle2' });
  await delay(3000);
  await page.screenshot({ path: `artifacts/working_employee_list.png` });

  // Go to Payroll
  await page.goto('http://localhost:5173/payroll', { waitUntil: 'networkidle2' });
  await delay(4000);
  await page.screenshot({ path: `artifacts/working_payroll.png` });

  // Go to Documents
  await page.goto('http://localhost:5173/documents', { waitUntil: 'networkidle2' });
  await delay(4000);
  await page.screenshot({ path: `artifacts/working_documents.png` });

  // Click Logout
  await page.evaluate(() => {
    const navItems = Array.from(document.querySelectorAll('button, a'));
    const logoutBtn = navItems.find(b => b.textContent && b.textContent.includes('Logout'));
    if (logoutBtn) logoutBtn.click();
  });
  
  await delay(2000);
  await page.screenshot({ path: `artifacts/working_logout.png` });

  await browser.close();
  console.log("Done.");
})();
