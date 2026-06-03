const fs = require('fs');

const file = 'src/pages/Employees.tsx';
let content = fs.readFileSync(file, 'utf8');

// Replace 1
const target1 = `    const newEmp: Employee = {
      id: \`emp-\${Date.now()}\`,
      employeeId: form.employeeId.trim(),
      companyId: getCompanyIdFromBranchName(form.branchLocation || '', activeCompanyId, companies),
      branchId: getCompanyIdFromBranchName(form.branchLocation || '', activeCompanyId, companies) !== activeCompanyId ? getCompanyIdFromBranchName(form.branchLocation || '', activeCompanyId, companies) : null,`;

const rep1 = `    const branchMatchId = getCompanyIdFromBranchName(form.branchLocation || '', activeCompanyId, companies);
    const matchedCompany = companies.find(c => c.id === branchMatchId);
    const parentCompanyIdForDb = matchedCompany?.parentCompanyId || branchMatchId;
    const branchIdForDb = matchedCompany?.parentCompanyId ? branchMatchId : null;

    const newEmp: Employee = {
      id: \`emp-\${Date.now()}\`,
      employeeId: form.employeeId.trim(),
      companyId: parentCompanyIdForDb,
      branchId: branchIdForDb,`;

content = content.replace(target1, rep1);

// Replace 2
const target2 = `    const branchMatch = getCompanyIdFromBranchName(editEmp.branchLocation || '', activeCompanyId, companies);
    const updatedEmp = {
      ...editEmp,
      companyId: branchMatch,
      branchId: branchMatch !== activeCompanyId ? branchMatch : null
    };`;

const rep2 = `    const branchMatch = getCompanyIdFromBranchName(editEmp.branchLocation || '', activeCompanyId, companies);
    const matchedCompany = companies.find(c => c.id === branchMatch);
    const parentCompanyIdForDb = matchedCompany?.parentCompanyId || branchMatch;
    const branchIdForDb = matchedCompany?.parentCompanyId ? branchMatch : null;

    const updatedEmp = {
      ...editEmp,
      companyId: parentCompanyIdForDb,
      branchId: branchIdForDb
    };`;

content = content.replace(target2, rep2);

// Replace 3
const target3 = `            const parsedEmp = {
              id: \`emp-gcri-\${empCode}\`,
              employeeId: empCode,
              companyId: getCompanyIdFromBranchName(sheetName, activeCompanyId, companies),`;

const rep3 = `            const branchMatchId = getCompanyIdFromBranchName(sheetName, activeCompanyId, companies);
            const matchedCompany = companies.find(c => c.id === branchMatchId);
            const parentCompanyIdForDb = matchedCompany?.parentCompanyId || branchMatchId;
            const branchIdForDb = matchedCompany?.parentCompanyId ? branchMatchId : null;

            const parsedEmp = {
              id: \`emp-gcri-\${empCode}\`,
              employeeId: empCode,
              companyId: parentCompanyIdForDb,
              branchId: branchIdForDb,`;

content = content.replace(target3, rep3);

fs.writeFileSync(file, content);
console.log('Employees.tsx updated successfully');
