const fs = require('fs');
['Payroll.tsx', 'Documents.tsx', 'Settings.tsx', 'Attendance.tsx'].forEach(f => {
  let p = 'src/pages/'+f;
  let c = fs.readFileSync(p, 'utf8');
  if (!c.includes('import { api }')) {
    c = c.replace(/import React/, "import { api } from '../api/apiClient';\\nimport React");
    // Wait, \n in regex replace is literal text? No, it's evaluated, but I'll use `\n` literal in string
    c = c.replace("import { api } from '../api/apiClient';\\nimport React", "import { api } from '../api/apiClient';\nimport React");
    fs.writeFileSync(p, c);
  }
});
// Also fix SAFE_COMPANY_FALLBACK issue from Reports.tsx, Settings.tsx
['Reports.tsx', 'Settings.tsx', 'Dashboard.tsx'].forEach(f => {
  let p = 'src/pages/'+f;
  if(fs.existsSync(p)) {
    let c = fs.readFileSync(p, 'utf8');
    c = c.replace(/import \{ SAFE_COMPANY_FALLBACK \} from '\.\.\/App';\r?\n?/g, "");
    c = c.replace(/SAFE_COMPANY_FALLBACK/g, "({} as any)");
    fs.writeFileSync(p, c);
  }
});
console.log('Imports added and SAFE_COMPANY_FALLBACK removed');
