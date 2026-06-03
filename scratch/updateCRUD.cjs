const fs = require('fs');

let emp = fs.readFileSync('src/pages/Employees.tsx', 'utf8');
emp = emp.replace(/isHR && canEdit && activeMainTab === 'active'/g, "isHR && canCreate && activeMainTab === 'active'");
// For the delete button in Employees:
emp = emp.replace(/onClick=\{.. => handleOpenDelete\(emp\)\}/g, "disabled={!canDelete} onClick={() => handleOpenDelete(emp)}");
// For the edit button in Employees:
emp = emp.replace(/onClick=\{.. => handleOpenEdit\(emp\)\}/g, "disabled={!canEdit} onClick={() => handleOpenEdit(emp)}");
fs.writeFileSync('src/pages/Employees.tsx', emp);

let pay = fs.readFileSync('src/pages/Payroll.tsx', 'utf8');
pay = pay.replace(/canEdit={canEdit}/g, "canEdit={canEdit} canCreate={canCreate} canDelete={canDelete}");
fs.writeFileSync('src/pages/Payroll.tsx', pay);

let lea = fs.readFileSync('src/pages/Leaves.tsx', 'utf8');
lea = lea.replace(/isHR && canEdit && \(/g, "isHR && canCreate && (");
lea = lea.replace(/onClick=\{.. => handleOpenDelete\(leave\)\}/g, "disabled={!canDelete} onClick={() => handleOpenDelete(leave)}");
fs.writeFileSync('src/pages/Leaves.tsx', lea);

console.log("Updated CRUD buttons");
