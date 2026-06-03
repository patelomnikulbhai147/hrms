const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

const handlers = [
  'handleUpdatePlans', 'handleUpdatePayments', 'handleUpdateNotifications',
  'handleUpdateAccounts', 'handleUpdateCompanies', 'handleUpdateEmployees',
  'handleUpdateAttendance', 'handleUpdateLeaves', 'handleUpdatePayroll',
  'handleUpdateDocuments'
];

handlers.forEach(name => {
  const startStr = 'const ' + name + ' =';
  let startIndex = content.indexOf(startStr);
  if (startIndex === -1) return;
  
  // Find the next function or comment or state
  const nextMarkers = ['\n  const handleUpdate', '\n  // ', '\n  const [', '\n  useEffect'];
  let minEnd = content.length;
  nextMarkers.forEach(m => {
    const idx = content.indexOf(m, startIndex + 10);
    if (idx !== -1 && idx < minEnd) minEnd = idx;
  });
  
  const original = content.substring(startIndex, minEnd);
  content = content.replace(original, 'const ' + name + ' = async (updater?: any) => { await hydrateAll(); };');
});

fs.writeFileSync('src/App.tsx', content);
console.log('App.tsx handlers patched');
