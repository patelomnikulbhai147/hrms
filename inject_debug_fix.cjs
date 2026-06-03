const fs = require('fs');
let code = fs.readFileSync('src/pages/Payroll.tsx', 'utf8');
code = code.replace(
  '<p className="text-sm text-slate-500">Current payroll health, pending approvals, and payment readiness.</p>',
  '{/* DEBUG INFO */}<p className="text-sm text-slate-500">DEBUG: scope={scopedRecords.length} pay={payroll.length} emp={uniqueEmployees.length}</p>'
);
fs.writeFileSync('src/pages/Payroll.tsx', code);
