const puppeteer = require('puppeteer');
const fs = require('fs');
const http = require('http');

const delay = ms => new Promise(res => setTimeout(res, ms));

async function runVerification() {
  console.log("Starting Final Verification Task...");

  const browser = await puppeteer.launch({
    headless: "new",
    defaultViewport: { width: 1440, height: 900 }
  });

  const page = await browser.newPage();
  
  const consoleLogs = [];
  const networkErrors = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleLogs.push(msg.text());
    }
  });

  page.on('response', res => {
    if (!res.ok() && res.request().resourceType() === 'xhr') {
      networkErrors.push(`API Error: ${res.url()} - ${res.status()}`);
    }
  });

  try {
    console.log("Navigating to Frontend Login...");
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });
    await page.screenshot({ path: 'frontend_login_page.png', fullPage: true });

    console.log("Logging in...");
    await page.type('input[type="text"]', 'superadmin');
    await page.type('input[type="password"]', 'default123');
    
    const buttons = await page.$$('button');
    let clicked = false;
    for (const btn of buttons) {
      const text = await page.evaluate(el => el.textContent, btn);
      if (text && text.includes('Authenticate Session')) {
        await btn.click();
        clicked = true;
        break;
      }
    }
    if (!clicked) await page.click('button[type="submit"]');

    await delay(3000);
    await page.screenshot({ path: 'successful_login_dashboard.png', fullPage: true });

    console.log("Checking Companies...");
    await page.goto('http://localhost:5173/companies', { waitUntil: 'networkidle2' });
    await delay(2000);
    await page.screenshot({ path: 'companies_page.png', fullPage: true });

    console.log("Checking Employees...");
    await page.goto('http://localhost:5173/employees', { waitUntil: 'networkidle2' });
    await delay(2000);
    await page.screenshot({ path: 'employee_list_before.png', fullPage: true });

    console.log("Creating Test Employee via API...");
    const empData = {
      employeeId: `VERIFY-EMP-${Date.now()}`,
      companyId: 'c-gcri',
      branchId: 'c-ahmedabad',
      name: 'Verification Test Employee',
      email: `verify${Date.now()}@test.com`,
      phone: '+91 8888888888',
      department: 'Nursing',
      designation: 'Staff Nurse',
      role: 'Staff',
      status: 'Active',
      joinDate: new Date().toISOString(),
      location: 'Ahmedabad, Gujarat',
      salary: 45000,
      firstName: 'Verify',
      lastName: 'Test',
      aadhaarName: 'Verification Test Employee',
      gender: 'Male',
      dob: '1995-01-01',
      maritalStatus: 'UNMARRIED',
      nationality: 'INDIAN',
      category: 'Skilled',
      employmentType: 'CONTRACTUAL',
      branchLocation: 'AHMEDABAD'
    };
    
    const token = await page.evaluate(() => localStorage.getItem('token'));
    await page.evaluate(async (data, jwt) => {
      await fetch('http://localhost:5000/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jwt}` },
        body: JSON.stringify(data)
      });
    }, empData, token);

    await delay(2000);
    console.log("Refreshing Employees Page...");
    await page.reload({ waitUntil: 'networkidle2' });
    await delay(3000);
    await page.screenshot({ path: 'employee_list_after.png', fullPage: true });

    console.log("Checking Payroll...");
    await page.goto('http://localhost:5173/payroll', { waitUntil: 'networkidle2' });
    await delay(3000);
    await page.screenshot({ path: 'payroll_page.png', fullPage: true });
    
    console.log("Logout...");
    await page.evaluate(() => localStorage.clear());
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle2' });

    console.log("Logging in again...");
    await page.type('input[type="text"]', 'superadmin');
    await page.type('input[type="password"]', 'default123');
    const loginBtns2 = await page.$$('button');
    let clicked2 = false;
    for (const btn of loginBtns2) {
      const text = await page.evaluate(el => el.textContent, btn);
      if (text && text.includes('Authenticate Session')) {
        await btn.click();
        clicked2 = true;
        break;
      }
    }
    if (!clicked2) await page.click('button[type="submit"]');
    
    await delay(3000);
    await page.goto('http://localhost:5173/employees', { waitUntil: 'networkidle2' });
    await delay(2000);
    await page.screenshot({ path: 'employee_list_after_relogin.png', fullPage: true });

    console.log("Console Errors:", consoleLogs.length);
    console.log("Network Errors:", networkErrors.length);

    fs.writeFileSync('browser_console.log', consoleLogs.join('\n'));
    fs.writeFileSync('browser_network.log', networkErrors.join('\n'));
    
  } catch (error) {
    console.error("Verification script error:", error);
  } finally {
    await browser.close();
  }
}

runVerification();
