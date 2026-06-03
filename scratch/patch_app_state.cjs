const fs = require('fs');

let appContent = fs.readFileSync('src/App.tsx', 'utf8');

// 1. Remove default arrays and SAFE_COMPANY_FALLBACK
appContent = appContent.replace(/const defaultUsers: UserAccount\[\] = \[[\s\S]*?\];/g, '');
appContent = appContent.replace(/const defaultPayments: PaymentRecord\[\] = \[\];/g, '');
appContent = appContent.replace(/const defaultEmployees: Employee\[\] = [\s\S]*?\}\);/g, '');
appContent = appContent.replace(/export const SAFE_COMPANY_FALLBACK: any = \{[\s\S]*?\};\s+/g, '');
appContent = appContent.replace(/const validCompanies = \(companiesData && companiesData\.length > 0\) \? companiesData : defaultCompanies;/g, 'const validCompanies = companiesData || [];');

// 2. Fix handleUpdate functions to just call hydrateAll
const replacements = [
  'handleUpdatePlans', 'handleUpdatePayments', 'handleUpdateNotifications',
  'handleUpdateAccounts', 'handleUpdateCompanies', 'handleUpdateEmployees',
  'handleUpdateAttendance', 'handleUpdateLeaves', 'handleUpdatePayroll',
  'handleUpdateDocuments'
];

replacements.forEach(name => {
  const regex = new RegExp(`const ${name} = \\([\\s\\S]*?\\) => \\{[\\s\\S]*?\\};`, 'g');
  appContent = appContent.replace(regex, `const ${name} = async (updater?: any) => { await hydrateAll(); };`);
});

// Fix defaultPlans initialization if missing
appContent = appContent.replace(/setPlans\(defaultPlans\)/g, 'setPlans([])');

fs.writeFileSync('src/App.tsx', appContent);
console.log('App.tsx patched');
