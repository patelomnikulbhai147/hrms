const puppeteer = require('../node_modules/puppeteer');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const http = require('http');

(async () => {
  const browser = await puppeteer.launch({ defaultViewport: { width: 1280, height: 900 } });
  const page = await browser.newPage();
  
  try {
    await page.goto('http://localhost:5173');
    await new Promise(r => setTimeout(r, 1000));
    
    let needsLogin = await page.$('input[placeholder="Enter login ID"]');
    if (needsLogin) {
      await page.type('input[placeholder="Enter login ID"]', 'superadmin');
      await page.type('input[placeholder="Enter password"]', 'default123');
      await page.click('button[type="submit"]');
      await new Promise(r => setTimeout(r, 2000));
    }
    
    await page.goto('http://localhost:5173/companies');
    await new Promise(r => setTimeout(r, 2000));
    
    // Screenshot 1: Before employee creation
    await page.screenshot({ path: 'C:/Users/HP/.gemini/antigravity/brain/46165fa7-2480-491e-b3c9-f956f6d15794/artifacts/screenshot_headcount_before.png' });
    console.log('Took screenshot: Before');

    // Create Employee via API to bypass UI forms
    const uniqueId = Math.floor(Math.random() * 10000);
    await prisma.employee.create({
      data: {
        employeeId: `EMP-${uniqueId}`,
        companyId: 'c-gcri',
        branchId: 'c-siddhpur',
        name: `Test Headcount ${uniqueId}`,
        email: `emp${uniqueId}@gcri.com`,
        department: 'IT',
        designation: 'Developer',
        status: 'Active',
        joinDate: new Date()
      }
    });
    
    console.log('Employee created in database directly.');

    // Reload page
    await page.reload();
    await new Promise(r => setTimeout(r, 2000));
    
    // Screenshot 2: After employee creation
    await page.screenshot({ path: 'C:/Users/HP/.gemini/antigravity/brain/46165fa7-2480-491e-b3c9-f956f6d15794/artifacts/screenshot_headcount_after.png' });
    console.log('Took screenshot: After');
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await prisma.$disconnect();
    await browser.close();
  }
})();
