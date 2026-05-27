const fs = require('fs');
let content = fs.readFileSync('src/pages/Employees.tsx', 'utf-8');

const funcStart = "const handleStartOffboarding = (emp: Employee) => {";
const funcEndRegex = /const executeCompleteOffboarding = \(\) => \{\s*setIsConfirmingOffboard\(true\);\s*\};/g;

const match1 = content.indexOf(funcStart);
const match2 = funcEndRegex.exec(content);

if (match1 !== -1 && match2 !== null) {
  const funcEndIndex = match2.index + match2[0].length;
  const blockToReplace = content.substring(match1, funcEndIndex);
  
  const newBlock = `const handleStartOffboarding = (emp: Employee) => {
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
  };

  const executeCompleteOffboarding = () => {
    // Deprecated
  };`;

  content = content.replace(blockToReplace, newBlock);
}

const enterpriseModalStart = "{/* Enterprise Offboarding Modal */}";
const enterpriseModalEndRegex = /<ActionConfirmationModal\s+isOpen=\{isConfirmingDelete\}/g;

const m1 = content.indexOf(enterpriseModalStart);
const m2 = enterpriseModalEndRegex.exec(content);

if (m1 !== -1 && m2 !== null) {
  const blockToReplace = content.substring(m1, m2.index);
  content = content.replace(blockToReplace, "");
}

const confirmModalRegex = /<ActionConfirmationModal\s+isOpen=\{isConfirmingOffboard\}[\s\S]*?confirmButtonText="Execute Offboarding"\s+isDestructive=\{true\}\s+\/>/g;

const newConfirmModal = `<ActionConfirmationModal
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
      />`;

content = content.replace(confirmModalRegex, newConfirmModal);

fs.writeFileSync('src/pages/Employees.tsx', content);
console.log("Fixed!");
