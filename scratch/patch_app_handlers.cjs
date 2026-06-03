const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

const handlers = [
  'handleUpdatePlans', 'handleUpdatePayments', 'handleUpdateNotifications',
  'handleUpdateAccounts', 'handleUpdateCompanies', 'handleUpdateEmployees',
  'handleUpdateAttendance', 'handleUpdateLeaves', 'handleUpdatePayroll',
  'handleUpdateDocuments'
];

handlers.forEach(name => {
  // Use regex to find the start of the function and replace until the next const or useState
  const startRegex = new RegExp(\`const \${name} = \\([\\s\\S]*?\\) => \\{[\\s\\S]*?(?=\\n  const handleUpdate|\\n  \/\/|\\n  const \\[)\`, 'g');
  content = content.replace(startRegex, \`const \${name} = async (updater?: any) => { await hydrateAll(); };\`);
});

fs.writeFileSync('src/App.tsx', content);
console.log('App.tsx handlers patched');
