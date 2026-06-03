const fs = require('fs');
let content = fs.readFileSync('src/pages/Employees.tsx', 'utf8');

const target1 = `  const [isExporting, setIsExporting] = useState(false);
  const empLeavesHistory = useMemo(() => {`;
const replace1 = `  const [isExporting, setIsExporting] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  const executeExport = (format: 'excel' | 'csv' | 'pdf') => {
    setExportMenuOpen(false);
    
    const exportColumns = [
      { header: 'Emp Code', key: 'employeeId', width: 15 },
      { header: 'Full Name', key: 'name', width: 25 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Branch', key: 'branchLocation', width: 20 },
      { header: 'Department', key: 'department', width: 20 },
      { header: 'Designation', key: 'designation', width: 20 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Join Date', key: 'joinDate', width: 15 }
    ];

    exportToExcel({
      fileName: 'HRMS_Employee_Roster',
      format,
      sheets: [
        {
          sheetName: 'Active Roster',
          columns: exportColumns,
          data: filtered
        }
      ]
    });
  };
  const empLeavesHistory = useMemo(() => {`;

content = content.replace(target1, replace1);

const target2 = `  }, [leaves, viewEmp, activeCompanyId]);

  // Handlers for premium document upload and base64 parsing`;

const replace2 = `  }, [leaves, viewEmp, activeCompanyId]);

  const handleDelete = () => {
    if (!deleteEmp) return;
    onUpdateEmployees(employees.filter(e => e.id !== deleteEmp.id));
    setDeleteEmp(null);
    setIsConfirmingDelete(false);
  };

  const handleConfirmInitialOffboarding = () => {
    setIsWizardOpen(true);
  };

  const handleWizardStepComplete = (step: number) => {
    // optional tracking
  };

  const handleFinalArchive = async () => {
    if (!offboardEmp) return;
    setIsOffboardingExecuting(true);
    
    const today = new Date().toISOString().split('T')[0];
    const historyItem = {
      role: offboardEmp.role,
      designation: offboardEmp.designation,
      startDate: offboardEmp.joinDate,
      endDate: today,
      department: offboardEmp.department,
      companyId: offboardEmp.companyId,
      companyName: companies.find(c => c.id === offboardEmp.companyId)?.name || 'Unknown',
      branchName: companies.find(c => c.id === offboardEmp.branchId)?.name,
      reason: 'Formal Offboarding'
    };
    
    const updated: Employee = {
      ...offboardEmp,
      status: 'Archived',
      exitDate: today,
      exitReason: 'Formal Offboarding Completed',
      offboardingState: {
        ...(offboardEmp.offboardingState || {}),
        workflowStatus: 'ARCHIVED',
        completedOn: new Date().toISOString()
      },
      employmentHistory: [...(offboardEmp.employmentHistory || []), historyItem]
    };
    
    try {
      await api.employees.archive(offboardEmp.id, 'Formal Offboarding Completed');
      onUpdateEmployees(employees.map(e => e.id === offboardEmp.id ? updated : e));
    } catch (err: any) {
      console.error(err);
      alert('Failed to update DB, updated locally');
      onUpdateEmployees(employees.map(e => e.id === offboardEmp.id ? updated : e));
    }
    
    setOffboardEmp(null);
    setIsWizardOpen(false);
    setIsOffboardingExecuting(false);
    
    alert('Employee successfully archived and removed from active workforce.');
  };

  // Handlers for premium document upload and base64 parsing`;

content = content.replace(target2, replace2);

// Add API import
const importTarget = `import { exportToExcel } from '../utils/exportUtils';`;
const importReplace = `import { exportToExcel } from '../utils/exportUtils';\nimport { api } from '../api/apiClient';`;
content = content.replace(importTarget, importReplace);

// Now refactor handleAddSubmit
const handleAddRegex = /const handleAddSubmit = \(\) => \{([\s\S]*?)onUpdateEmployees\(\[newEmp, \.\.\.employees\]\);\s*setAddOpen\(false\);\s*alert\(`Absence\/Employee profile for \$\{form.name\} logged successfully.`\);\s*\};/g;

const newHandleAdd = `const handleAddSubmit = async () => {$1
    try {
      const savedEmp = await api.employees.create(newEmp);
      onUpdateEmployees([savedEmp, ...employees]);
      setAddOpen(false);
      alert(\`Employee profile for \$\{form.name\} logged successfully to PostgreSQL.\`);
    } catch (err: any) {
      console.error(err);
      alert(\`Failed to save to PostgreSQL: \$\{err.message\}\`);
    }
  };`;

content = content.replace(handleAddRegex, newHandleAdd);

// Now refactor handleEditSubmit
const handleEditRegex = /const handleEditSubmit = \(\) => \{([\s\S]*?)onUpdateEmployees\(employees\.map\(e => e\.id === editEmp\.id \? updated : e\)\);\s*setEditEmp\(null\);\s*alert\('Employee profile updated successfully\.'\);\s*\};/g;

const newHandleEdit = `const handleEditSubmit = async () => {$1
    try {
      const savedEmp = await api.employees.update(updated.id, updated);
      onUpdateEmployees(employees.map(e => e.id === editEmp.id ? savedEmp : e));
      setEditEmp(null);
      alert('Employee profile updated successfully in PostgreSQL.');
    } catch (err: any) {
      console.error(err);
      alert(\`Failed to update in PostgreSQL: \$\{err.message\}\`);
    }
  };`;

content = content.replace(handleEditRegex, newHandleEdit);

fs.writeFileSync('src/pages/Employees.tsx', content, 'utf8');
console.log('Restored missed functions and updated handleAddSubmit, handleEditSubmit, handleFinalArchive to use API.');
