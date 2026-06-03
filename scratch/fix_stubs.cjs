const fs = require('fs');
const p = 'c:/Users/HP/OneDrive/Desktop/enterprise-hrms-crm-application - Copy(d1)/src/pages/Employees.tsx';
let txt = fs.readFileSync(p, 'utf8');

// Find where to insert
const insertPoint = `  const today = new Date().toISOString().split('T')[0];`;

const stubs = `
  const handleConfirmInitialOffboarding = () => {};
  const handleDelete = () => {};
  const handleWizardStepComplete = (step: number) => setWizardStep(step);
  const handleFinalArchive = () => {};
  const setIsConfirmingOffboard = (val: boolean) => {};
`;

if (txt.includes(insertPoint)) {
  if (!txt.includes('const handleDelete = () => {};')) {
    txt = txt.replace(insertPoint, insertPoint + '\n' + stubs);
    fs.writeFileSync(p, txt);
    console.log('Stubs inserted successfully.');
  } else {
    console.log('Stubs already exist.');
  }
} else {
  console.log('Could not find insert point: const today = ...');
}
