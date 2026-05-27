const fs = require('fs');

let content = fs.readFileSync('src/pages/Companies.tsx', 'utf-8');

// Replace the double confirmation in handleRemoveBranch
const doubleConfirmRegex = /const confirmDelete = confirm\([\s\S]*?if \(!confirmDelete\) return;\s*const reassign = confirm\([\s\S]*?if \(reassign\) \{[\s\S]*?\} else \{[\s\S]*?\}/;

const singleConfirm = `// Single Confirmation replacing the double confirm
    const confirmArchive = confirm(\`Are you sure you want to Archive the branch "\${branch.branchName || branch.name}"?\\n\\nThis will preserve all historical data (employees, payroll) but remove active status.\`);
    if (!confirmArchive) return;
    
    // Automatically archive instead of complex reassignment for now to simplify security flow
    const nextEmployees = employees.map(emp => 
      emp.branchId === branchId ? { ...emp, status: 'Archived', exitDate: new Date().toISOString().split('T')[0], exitReason: 'Branch Archived' } : emp
    );
    onUpdateEmployees(nextEmployees);`;

content = content.replace(doubleConfirmRegex, singleConfirm);

fs.writeFileSync('src/pages/Companies.tsx', content);
console.log('Companies.tsx patched to use single confirmation.');
