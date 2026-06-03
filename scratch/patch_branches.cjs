const fs = require('fs');
const path = 'src/pages/Companies.tsx';
let content = fs.readFileSync(path, 'utf8');

const oldFilter = `  const filtered = companies.filter(c => {
    const isArchived = c.status === 'Archived';`;

const newFilter = `  const filtered = companies.filter(c => {
    if (c.parentCompanyId || c.isHeadOffice === false) return false;
    const isArchived = c.status === 'Archived';`;

content = content.replace(oldFilter, newFilter);

fs.writeFileSync(path, content, 'utf8');
console.log('Branches filtered from parent companies rendering successfully.');
