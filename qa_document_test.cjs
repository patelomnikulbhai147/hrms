const puppeteer = require('puppeteer');
const fs = require('fs');

async function delay(time) {
  return new Promise(function(resolve) { setTimeout(resolve, time) });
}

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(`Console Error: ${msg.text()}`);
    }
  });
  page.on('response', response => {
    if (!response.ok() && response.request().resourceType() === 'fetch') {
      errors.push(`API Error: ${response.status()} ${response.url()}`);
    }
  });

  console.log("Testing Document Upload...");
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2' });
  await page.type('input[placeholder="Enter login ID"]', 'parth');
  await page.type('input[type="password"]', 'parth123');
  await page.click('button[type="submit"]');
  
  await delay(3000);
  
  // Click Ahmedabad branch
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => b.textContent && b.textContent.includes('Ahmedabad'));
    if (btn) btn.click();
  });
  
  await delay(3000);
  
  // Go to Documents
  await page.goto('http://localhost:5173/documents', { waitUntil: 'networkidle2' });
  await delay(3000);

  // Click Upload button
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => b.textContent && b.textContent.includes('Upload Verification Doc'));
    if (btn) btn.click();
  });
  
  await delay(1000);

  // Fill modal - select first employee
  await page.evaluate(() => {
    const selects = document.querySelectorAll('select');
    if (selects.length > 0) {
      const empSelect = selects[0];
      if (empSelect.options.length > 1) {
        empSelect.value = empSelect.options[1].value;
        empSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  });

  await delay(500);

  // Fill Document Filename
  await page.type('input[placeholder="e.g. Rajesh_Aadhaar.pdf"]', 'QA Test Document');
  
  // Document Verification Type
  await page.evaluate(() => {
    const selects = document.querySelectorAll('select');
    if (selects.length > 1) {
      const typeSelect = selects[1];
      typeSelect.value = 'Resume';
      typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });

  await page.screenshot({ path: `qa_document_upload_modal.png` });
  
  // Click Register Document (Confirm)
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => b.textContent && b.textContent.includes('Register Document'));
    if (btn) btn.click();
  });

  await delay(2000);
  await page.screenshot({ path: `qa_document_list.png` });

  console.log("Document test finished. Errors:", errors);
  await browser.close();
})();
