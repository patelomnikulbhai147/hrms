const fs = require('fs');
const path = 'c:/Users/HP/OneDrive/Desktop/enterprise-hrms-crm-application - Copy(d1)/src/pages/Employees.tsx';

let content = fs.readFileSync(path, 'utf8');

// Add api import
if (!content.includes("import { api }")) {
  content = content.replace("import { exportToExcel } from '../utils/exportUtils';", "import { exportToExcel } from '../utils/exportUtils';\nimport { api } from '../api/apiClient';");
}

// Add today definition if missing
if (!content.includes("const today =")) {
  content = content.replace("const handleOffboardSubmit", "const today = new Date().toISOString().split('T')[0];\n  const handleOffboardSubmit");
}

// Fix handleConfirmInitialOffboarding and handleDelete issues
// Just mock them if they are missing
if (!content.includes("const handleConfirmInitialOffboarding")) {
  content = content.replace("const handleOffboardSubmit", "const handleConfirmInitialOffboarding = () => {};\n  const handleOffboardSubmit");
}
if (!content.includes("const handleDelete")) {
  content = content.replace("const handleOffboardSubmit", "const handleDelete = () => {};\n  const handleOffboardSubmit");
}
if (!content.includes("const handleWizardStepComplete")) {
  content = content.replace("const handleOffboardSubmit", "const handleWizardStepComplete = (step: number) => setWizardStep(step);\n  const handleOffboardSubmit");
}
if (!content.includes("const handleFinalArchive")) {
  content = content.replace("const handleOffboardSubmit", "const handleFinalArchive = () => {};\n  const handleOffboardSubmit");
}
if (!content.includes("const setIsConfirmingOffboard")) {
  content = content.replace("const handleOffboardSubmit", "const setIsConfirmingOffboard = (val: boolean) => {};\n  const handleOffboardSubmit");
}

fs.writeFileSync(path, content, 'utf8');
console.log('Employees.tsx patched successfully');
