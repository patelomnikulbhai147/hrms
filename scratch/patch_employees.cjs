const fs = require('fs');
let content = fs.readFileSync('src/pages/Employees.tsx', 'utf8');

// Replace handleBulkCommit
const bulkCommitRegex = /const handleBulkCommit = \(\) => \{[\s\S]*?alert\(`Bulk synchronized.*?`\);\n  \};/m;
const newBulkCommit = `const handleBulkCommit = async () => {
    setIsConfirmingBulk(false);
    if (importedRows.length === 0) return;
    
    try {
      // Execute sequentially or in batches if needed, Promise.all for now
      await Promise.all(importedRows.map(emp => api.employees.create(emp)));
      onUpdateEmployees([] as any); // trigger refresh
      setImportedRows([]);
      setImportLogs([]);
      setImportOpen(false);
      alert(\`Bulk synchronized \${importedRows.length} employees from Excel to PostgreSQL successfully.\`);
    } catch (e: any) {
      console.error(e);
      alert('Error during bulk import to database: ' + e.message);
    }
  };`;
content = content.replace(bulkCommitRegex, newBulkCommit);

// Remove loadSeededMockExcel function
const loadSeededRegex = /const loadSeededMockExcel = \(\) => \{[\s\S]*?\}\s*?\};\n/m;
content = content.replace(loadSeededRegex, '');

// Remove button that triggers it
const buttonRegex = /<button[^>]*onClick=\{loadSeededMockExcel\}[^>]*>[\s\S]*?<\/button>/g;
content = content.replace(buttonRegex, '');

fs.writeFileSync('src/pages/Employees.tsx', content);
console.log('Employees.tsx patched');
