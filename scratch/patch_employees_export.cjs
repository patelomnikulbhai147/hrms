const fs = require('fs');
const p = 'c:/Users/HP/OneDrive/Desktop/enterprise-hrms-crm-application - Copy(d1)/src/pages/Employees.tsx';
let txt = fs.readFileSync(p, 'utf8');

// Fix 1: matchesBranch
const searchStr1 = `const matchesBranch = !branchFilter || (emp.branchLocation || '').toUpperCase() === branchFilter.toUpperCase() || companies.find(c => c.id === emp.companyId)?.name.toUpperCase() === branchFilter.toUpperCase() || companies.find(c => c.id === emp.companyId)?.branchName?.toUpperCase() === branchFilter.toUpperCase();`;
const replaceStr1 = `const branchIdStr = (emp as any).branchId ? companies.find(c => c.id === (emp as any).branchId)?.name : '';
      const matchesBranch = !branchFilter || 
        (emp.branchLocation || '').toUpperCase() === branchFilter.toUpperCase() || 
        (branchIdStr || '').toUpperCase() === branchFilter.toUpperCase() ||
        companies.find(c => c.id === emp.companyId)?.name.toUpperCase() === branchFilter.toUpperCase() || 
        companies.find(c => c.id === emp.companyId)?.branchName?.toUpperCase() === branchFilter.toUpperCase();`;
txt = txt.replace(searchStr1, replaceStr1);

// Fix 2: bulk import save to database
const searchStr2 = `  const handleBulkCommit = () => {
    setIsConfirmingBulk(false);
    if (importedRows.length === 0) return;
    onUpdateEmployees([...importedRows, ...employees]);
    setImportedRows([]);
    setImportLogs([]);
    setImportOpen(false);
    alert(\`Bulk synchronized \${importedRows.length} employees from Excel to local HRMS successfully.\`);
  };`;

const replaceStr2 = `  const handleBulkCommit = async () => {
    setIsConfirmingBulk(false);
    if (importedRows.length === 0) return;
    
    try {
      const savedEmployees = await Promise.all(importedRows.map(emp => api.employees.create(emp)));
      onUpdateEmployees([...savedEmployees, ...employees]);
      setImportedRows([]);
      setImportLogs([]);
      setImportOpen(false);
      alert(\`Bulk synchronized \${savedEmployees.length} employees from Excel to PostgreSQL successfully.\`);
    } catch (err: any) {
      console.error(err);
      alert(\`Failed to bulk import employees to PostgreSQL: \${err.message}\`);
    }
  };`;
txt = txt.replace(searchStr2, replaceStr2);

fs.writeFileSync(p, txt);
console.log('Done updating Employees.tsx');
