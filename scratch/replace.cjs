const fs = require('fs');
let content = fs.readFileSync('src/pages/Employees.tsx', 'utf-8');

content = content.replace(
  'const [isConfirmingOffboard, setIsConfirmingOffboard] = useState(false);',
  'const [isOffboardingExecuting, setIsOffboardingExecuting] = useState(false);'
);

const targetFunctions = `  const handleStartOffboarding = (emp: Employee) => {
    if (emp.status === 'Archived' || emp.status === 'Terminated') {
       alert("Employee is already archived.");
       return;
    }
    setOffboardEmp({
      ...emp,
      offboardingState: emp.offboardingState || {
        initiatedOn: new Date().toISOString(),
        documentClearance: false,
        assetReturn: false,
        payrollSettled: false,
        attendanceCleared: false,
        managerApproved: false,
        hrApproved: false
      }
    });
    setOffboardStep(1);
  };

  const handleCompleteOffboarding = () => {
    setIsConfirmingOffboard(false);
    if (!offboardEmp) return;
    const state = offboardEmp.offboardingState;
    if (!state?.documentClearance || !state?.assetReturn || !state?.payrollSettled || !state?.attendanceCleared || !state?.managerApproved || !state?.hrApproved) {
      alert("Cannot finalize offboarding: Pending clearances or approvals.");
      return;
    }
    const today = new Date().toISOString().split('T')[0];
    
    // Add to employment history
    const historyItem = {
      companyId: activeCompanyId,
      companyName: companies.find(c => c.id === activeCompanyId)?.name || 'Unknown',
      branchName: offboardEmp.branchLocation,
      role: offboardEmp.role,
      designation: offboardEmp.designation,
      startDate: offboardEmp.joinDate,
      endDate: today,
      reason: 'Tender/Contract Completed'
    };

    const updated: Employee = {
      ...offboardEmp,
      status: 'Archived',
      exitDate: today,
      exitReason: 'Formal Offboarding Completed',
      offboardingState: {
        ...state,
        completedOn: new Date().toISOString()
      },
      employmentHistory: [...(offboardEmp.employmentHistory || []), historyItem]
    };
    onUpdateEmployees(employees.map(e => e.id === offboardEmp.id ? updated : e));
    setOffboardStep(1);
    setOffboardEmp(null);
    alert(\`Employee \${offboardEmp.name} successfully offboarded and archived.\`);
  };

  const executeCompleteOffboarding = () => {
    setIsConfirmingOffboard(true);
  };`;

const newFunctions = `  const handleStartOffboarding = (emp: Employee) => {
    if (emp.status === 'Archived' || emp.status === 'Terminated') {
       alert("Employee is already archived.");
       return;
    }
    setOffboardEmp(emp);
  };

  const handleCompleteOffboarding = async () => {
    if (!offboardEmp) return;
    setIsOffboardingExecuting(true);
    
    await new Promise(resolve => setTimeout(resolve, 800));

    const today = new Date().toISOString().split('T')[0];
    
    const historyItem = {
      companyId: activeCompanyId,
      companyName: companies.find(c => c.id === activeCompanyId)?.name || 'Unknown',
      branchName: offboardEmp.branchLocation,
      role: offboardEmp.role,
      designation: offboardEmp.designation,
      startDate: offboardEmp.joinDate,
      endDate: today,
      reason: 'Formal Offboarding'
    };

    const updated: Employee = {
      ...offboardEmp,
      status: 'Archived',
      exitDate: today,
      exitReason: 'Formal Offboarding Completed',
      offboardingState: {
        initiatedOn: new Date().toISOString(),
        completedOn: new Date().toISOString()
      },
      employmentHistory: [...(offboardEmp.employmentHistory || []), historyItem]
    };
    onUpdateEmployees(employees.map(e => e.id === offboardEmp.id ? updated : e));
    setOffboardEmp(null);
    setIsOffboardingExecuting(false);
    alert('Employee successfully archived and removed from active workforce.');
  };`;

content = content.replace(targetFunctions, newFunctions);

const modalRegex = /\{\/\* Enterprise Offboarding Modal \*\/\}(.|\n)*?(?=<ActionConfirmationModal\s+isOpen=\{isConfirmingDelete\})/gm;

const newModal = `      <ActionConfirmationModal
        isOpen={!!offboardEmp}
        onClose={() => setOffboardEmp(null)}
        onConfirm={handleCompleteOffboarding}
        title="Confirm Employee Offboarding"
        description={[
          "Employee will be removed from active workforce",
          "Employee will move to archived workforce",
          "Payroll & active access will stop"
        ]}
        confirmButtonText="Confirm Offboarding"
        isDestructive={true}
        isLoading={isOffboardingExecuting}
      />\n\n      `;

content = content.replace(modalRegex, newModal);

const oldOffboardingModalRegex = /<ActionConfirmationModal\s+isOpen=\{isConfirmingOffboard\}(.|\n)*?isDestructive=\{true\}\s+\/>/g;
content = content.replace(oldOffboardingModalRegex, '');

fs.writeFileSync('src/pages/Employees.tsx', content);
console.log('Replaced successfully!');
