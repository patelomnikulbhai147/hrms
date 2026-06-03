const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf8');

// Replace the broken segments
content = content.replace(/const handleUpdateEmployees = async \(updater\?: any\) => \{ await hydrateAll\(\); \};[\s\S]*?const handleUpdateAttendance = async \(updater\?: any\) => \{ await hydrateAll\(\); \};/, 
`const handleUpdateEmployees = async (updater?: any) => { await hydrateAll(); };
  const handleUpdateAttendance = async (updater?: any) => { await hydrateAll(); };`);

content = content.replace(/const handleUpdateLeaves = async \(updater\?: any\) => \{ await hydrateAll\(\); \};[\s\S]*?const handleUpdatePayroll = async \(updater\?: any\) => \{ await hydrateAll\(\); \};/, 
`const handleUpdateLeaves = async (updater?: any) => { await hydrateAll(); };
  const handleUpdatePayroll = async (updater?: any) => { await hydrateAll(); };`);

content = content.replace(/const handleUpdatePayroll = async \(updater\?: any\) => \{ await hydrateAll\(\); \};[\s\S]*?const handleUpdateDocuments = async \(updater\?: any\) => \{ await hydrateAll\(\); \};/, 
`const handleUpdatePayroll = async (updater?: any) => { await hydrateAll(); };
  const handleUpdateDocuments = async (updater?: any) => { await hydrateAll(); };`);

fs.writeFileSync('src/App.tsx', content);
console.log('App.tsx repaired');
