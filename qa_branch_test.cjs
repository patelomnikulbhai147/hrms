const puppeteer = require('puppeteer');
const fs = require('fs');

async function delay(time) {
  return new Promise(function(resolve) { setTimeout(resolve, time) });
}

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  console.log("Testing Multi-Branch User (parth)...");
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2' });
  await delay(1000);
  
  await page.type('input[placeholder="Enter login ID"]', 'parth');
  await page.type('input[type="password"]', 'parth123');
  await page.click('button[type="submit"]');
  
  await delay(3000);
  await page.screenshot({ path: `qa_multi_branch_selector.png` });
  console.log("Screenshot taken: qa_multi_branch_selector.png");

  // Click on "Rajkot" branch
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const rajkotBtn = buttons.find(b => b.textContent && b.textContent.includes('Rajkot'));
    if (rajkotBtn) {
      rajkotBtn.click();
    }
  });
  console.log("Clicked Rajkot branch");

  await delay(4000);
  await page.screenshot({ path: `qa_multi_branch_dashboard.png` });
  console.log("Screenshot taken: qa_multi_branch_dashboard.png");

  // Go to Employees
  await page.goto('http://localhost:5173/employees', { waitUntil: 'networkidle2' });
  await delay(3000);
  await page.screenshot({ path: `qa_employee_list.png` });
  console.log("Screenshot taken: qa_employee_list.png");

  // Go to Payroll
  await page.goto('http://localhost:5173/payroll', { waitUntil: 'networkidle2' });
  await delay(4000);
  await page.screenshot({ path: `qa_payroll_rajkot.png` });
  console.log("Screenshot taken: qa_payroll_rajkot.png");

  await browser.close();
  console.log("Done.");
})();
