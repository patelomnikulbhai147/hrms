const fs = require('fs');
const p = 'c:/Users/HP/OneDrive/Desktop/enterprise-hrms-crm-application - Copy(d1)/src/pages/Employees.tsx';
let txt = fs.readFileSync(p, 'utf8');

const searchStr1 = `        companies.find(c => c.id === emp.companyId)?.name.toUpperCase() === branchFilter.toUpperCase() || 
        companies.find(c => c.id === emp.companyId)?.branchName?.toUpperCase() === branchFilter.toUpperCase();`;

const replaceStr1 = `        companies.find(c => c.id === emp.companyId)?.name?.toUpperCase() === branchFilter.toUpperCase() || 
        companies.find(c => c.id === emp.companyId)?.branchName?.toUpperCase() === branchFilter.toUpperCase();`;

txt = txt.replace(searchStr1, replaceStr1);
fs.writeFileSync(p, txt);
console.log('Fixed crash in Employees.tsx');
