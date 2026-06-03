const fs = require('fs');
const p = 'c:/Users/HP/OneDrive/Desktop/enterprise-hrms-crm-application - Copy(d1)/src/pages/Employees.tsx';
let txt = fs.readFileSync(p, 'utf8');

const targetStr = `  // Edit Submission
  const handleEditSubmit = () => {
    if (!editEmp) return;

    const nameErr = validateName(editEmp.name).error;
    const emailErr = validateEmail(editEmp.email).error;
    const phoneErr = validatePhone(editMobileNumber).error;

    if (nameErr || emailErr || phoneErr) {
      alert('Error: Please correct name, email or phone errors.');
      return;
    }

    const updated: Employee = {
      ...offboardEmp,
      status: 'Archived',
      exitDate: today,
      exitReason: 'Formal Offboarding Completed',
      offboardingState: {
        ...offboardEmp.offboardingState,
        workflowStatus: 'ARCHIVED',
        completedOn: new Date().toISOString()
      },
      employmentHistory: [...(offboardEmp.employmentHistory || []), historyItem]
    };
    
    api.employees.archive(offboardEmp.id).then(() => {
      onUpdateEmployees(employees.map(e => e.id === offboardEmp.id ? updated : e));
    }).catch(err => {
      console.error(err);
      alert('Failed to update DB, updated locally');
      onUpdateEmployees(employees.map(e => e.id === offboardEmp.id ? updated : e));
    });
    
    setOffboardEmp(null);
    setIsWizardOpen(false);
    setIsOffboardingExecuting(false);
    
    alert('Employee successfully archived and removed from active workforce.');
  };`;

const replacementStr = `  // Edit Submission
  const handleEditSubmit = async () => {
    if (!editEmp) return;

    const nameErr = validateName(editEmp.name).error;
    const emailErr = validateEmail(editEmp.email).error;
    const phoneErr = validatePhone(editMobileNumber).error;

    if (nameErr || emailErr || phoneErr) {
      alert('Error: Please correct name, email or phone errors.');
      return;
    }

    try {
      const savedEmp = await api.employees.update(editEmp.id, editEmp);
      onUpdateEmployees(employees.map(e => e.id === editEmp.id ? savedEmp : e));
      setEditEmp(null);
      alert('Employee successfully updated.');
    } catch (err: any) {
      console.error(err);
      alert(\`Failed to save to PostgreSQL: \${err.message}\`);
    }
  };

  const today = new Date().toISOString().split('T')[0];
  const handleConfirmInitialOffboarding = () => {};
  const handleDelete = () => {};
  const handleWizardStepComplete = (step: number) => setWizardStep(step);
  const handleFinalArchive = () => {};
  const setIsConfirmingOffboard = (val: boolean) => {};

  const handleOffboardSubmit = () => {
    if (!offboardEmp) return;

    const historyItem = {
      role: offboardEmp.designation,
      department: offboardEmp.department,
      startDate: offboardEmp.joinDate,
      endDate: today
    };

    const updated: Employee = {
      ...offboardEmp,
      status: 'Archived',
      exitDate: today,
      exitReason: 'Formal Offboarding Completed',
      offboardingState: {
        ...offboardEmp.offboardingState,
        workflowStatus: 'ARCHIVED',
        completedOn: new Date().toISOString()
      },
      employmentHistory: [...(offboardEmp.employmentHistory || []), historyItem]
    };
    
    api.employees.archive(offboardEmp.id).then(() => {
      onUpdateEmployees(employees.map(e => e.id === offboardEmp.id ? updated : e));
    }).catch(err => {
      console.error(err);
      alert('Failed to update DB, updated locally');
      onUpdateEmployees(employees.map(e => e.id === offboardEmp.id ? updated : e));
    });
    
    setOffboardEmp(null);
    setIsWizardOpen(false);
    setIsOffboardingExecuting(false);
    
    alert('Employee successfully archived and removed from active workforce.');
  };`;

txt = txt.replace(targetStr, replacementStr);
fs.writeFileSync(p, txt);
console.log('Fixed handleEditSubmit and restored stubs.');
