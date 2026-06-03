const puppeteer = require('../node_modules/puppeteer');

(async () => {
  const browser = await puppeteer.launch({ defaultViewport: { width: 1280, height: 900 } });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  page.on('dialog', async dialog => {
    console.log('DIALOG OPENED:', dialog.message());
    await dialog.accept();
  });
  
  await page.goto('http://localhost:5173');
  await new Promise(r => setTimeout(r, 1000));
  
  const needsLogin = await page.$('input[placeholder="Enter login ID"]');
  if (needsLogin) {
    await page.type('input[placeholder="Enter login ID"]', 'superadmin');
    await page.type('input[placeholder="Enter password"]', 'default123');
    await page.click('button[type="submit"]');
    await new Promise(r => setTimeout(r, 2000));
  }

  await page.goto('http://localhost:5173/employees');
  await new Promise(r => setTimeout(r, 2000));

  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const addBtn = btns.find(b => b.textContent.includes('Add Employee'));
    if (addBtn) addBtn.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  // Personal Info
  await page.evaluate(() => {
    const inputs = document.querySelectorAll('input');
    for (const input of inputs) {
      if (input.parentElement && input.parentElement.textContent.includes('Employee Code')) input.value = 'E123456';
      if (input.parentElement && input.parentElement.textContent.includes('Aadhaar Full Name')) input.value = 'TEST EMPLOYEE NAME';
      if (input.parentElement && input.parentElement.textContent.includes('First Name')) input.value = 'TEST';
      if (input.parentElement && input.parentElement.textContent.includes('Surname')) input.value = 'NAME';
      if (input.parentElement && input.parentElement.textContent.includes('Mobile Number')) input.value = '9876543210';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });

  // Click Next Step 3 times
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const nextBtn = btns.find(b => b.textContent.includes('Next Step'));
    if (nextBtn) nextBtn.click();
  });
  await new Promise(r => setTimeout(r, 500)); 

  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const nextBtn = btns.find(b => b.textContent.includes('Next Step'));
    if (nextBtn) nextBtn.click();
  });
  await new Promise(r => setTimeout(r, 500)); 
  
  await page.evaluate(() => {
    const inputs = document.querySelectorAll('input');
    for (const input of inputs) {
      if (input.parentElement && input.parentElement.textContent.includes('Aadhaar Number')) input.value = '123456789012';
      if (input.parentElement && input.parentElement.textContent.includes('PAN Card')) input.value = 'ABCDE1234F';
      if (input.parentElement && input.parentElement.textContent.includes('Bank Name')) input.value = 'State Bank of India';
      if (input.parentElement && input.parentElement.textContent.includes('Account Number')) input.value = '1234567890';
      if (input.parentElement && input.parentElement.textContent.includes('IFSC Code')) input.value = 'SBIN0001234';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });

  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const nextBtn = btns.find(b => b.textContent.includes('Next Step'));
    if (nextBtn) nextBtn.click();
  });
  await new Promise(r => setTimeout(r, 500)); 
  
  await page.evaluate(() => {
    const inputs = document.querySelectorAll('input');
    for (const input of inputs) {
      if (input.parentElement && input.parentElement.textContent.includes('Present Address')) input.value = '123 Test St';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });

  console.log("Clicking Save Master File...");
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const saveBtn = btns.find(b => b.textContent.includes('Save Master File'));
    if (saveBtn) saveBtn.click();
  });
  
  await new Promise(r => setTimeout(r, 3000));
  await browser.close();
})();
