const fs = require('fs');

const appFile = 'src/App.tsx';
let content = fs.readFileSync(appFile, 'utf8');

// Remove initializations using mock arrays
content = content.replace(/useState<UserAccount\[\]>\(defaultUsers\)/, 'useState<UserAccount[]>([])');
content = content.replace(/useState<Company\[\]>\(defaultCompanies\)/, 'useState<Company[]>([])');

// Remove localStorage.setItem for data arrays
content = content.replace(/localStorage\.setItem\('hrms_accounts'.*?\);\n?/g, '');
content = content.replace(/localStorage\.setItem\('hrms_employees'.*?\);\n?/g, '');
content = content.replace(/localStorage\.setItem\('hrms_payroll'.*?\);\n?/g, '');
content = content.replace(/localStorage\.setItem\('hrms_attendance'.*?\);\n?/g, '');
content = content.replace(/localStorage\.setItem\('hrms_leaves'.*?\);\n?/g, '');
content = content.replace(/localStorage\.setItem\('hrms_documents'.*?\);\n?/g, '');
content = content.replace(/localStorage\.setItem\('hrms_payments'.*?\);\n?/g, '');

// Also remove from Components if any exists
const pagesPath = 'src/pages/';
const files = fs.readdirSync(pagesPath);
files.forEach(file => {
  if (file.endsWith('.tsx')) {
    let pageContent = fs.readFileSync(pagesPath + file, 'utf8');
    let patched = pageContent.replace(/localStorage\.setItem\('hrms_.*?_logs'.*?\);\n?/g, '');
    patched = patched.replace(/localStorage\.setItem\('hrms_audit_logs'.*?\);\n?/g, '');
    patched = patched.replace(/localStorage\.setItem\(storageKey.*?\);\n?/g, '');
    
    if (patched !== pageContent) {
      fs.writeFileSync(pagesPath + file, patched);
      console.log('Patched ' + file);
    }
  }
});

fs.writeFileSync(appFile, content);
console.log('App.tsx patched to remove localStorage data persistence.');
