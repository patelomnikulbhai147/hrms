const fs = require('fs');
let content = fs.readFileSync('src/pages/Employees.tsx', 'utf-8');

// 1. Add states
content = content.replace(
  'const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);',
  `const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);`
);

// 2. Add lucide icons if missing (we need CheckCircle2, Lock, FileText, IndianRupee, UserCheck, Archive)
// We already have CheckCircle2, AlertTriangle, Users, UserCheck. Let's add Lock, FileText, IndianRupee, Archive, ArrowRight
content = content.replace(
  'LogOut, ChevronRight',
  'LogOut, ChevronRight, Lock, FileText, IndianRupee, Archive, ArrowRight'
);

// 3. Replace handleCompleteOffboarding block
const offboardingLogicStart = "const handleStartOffboarding = (emp: Employee) => {";
const offboardingLogicEndRegex = /const executeCompleteOffboarding = \(\) => \{\s*\/\/ Deprecated\s*\};/g;

const match1 = content.indexOf(offboardingLogicStart);
const match2 = offboardingLogicEndRegex.exec(content);

if (match1 !== -1 && match2 !== null) {
  const blockToReplace = content.substring(match1, match2.index + match2[0].length);
  
  const newBlock = `const handleStartOffboarding = (emp: Employee) => {
    if (emp.status === 'Archived' || emp.status === 'Terminated') {
       alert("Employee is already archived.");
       return;
    }
    setOffboardEmp(emp);
  };

  const handleConfirmInitialOffboarding = () => {
    if (!offboardEmp) return;
    
    // Set status to INITIATED
    const updated: Employee = {
      ...offboardEmp,
      offboardingState: {
        ...offboardEmp.offboardingState,
        workflowStatus: 'INITIATED',
        initiatedOn: new Date().toISOString()
      }
    };
    onUpdateEmployees(employees.map(e => e.id === offboardEmp.id ? updated : e));
    setOffboardEmp(updated);
    
    // Close initial modal, open wizard
    setIsWizardOpen(true);
    setWizardStep(1);
  };

  const handleWizardStepComplete = async (step: number) => {
    if (!offboardEmp) return;
    
    let updatedState = { ...offboardEmp.offboardingState };
    
    if (step === 1) {
      updatedState.documentClearance = true;
      updatedState.workflowStatus = 'DOCUMENT_PENDING';
    } else if (step === 2) {
      updatedState.payrollSettled = true;
      updatedState.workflowStatus = 'PAYROLL_PENDING';
    } else if (step === 3) {
      updatedState.assetReturn = true;
      updatedState.workflowStatus = 'ACCESS_REVOCATION_PENDING';
    } else if (step === 4) {
      updatedState.hrApproved = true;
      updatedState.workflowStatus = 'HR_APPROVAL_PENDING';
    }
    
    const updated: Employee = {
      ...offboardEmp,
      offboardingState: updatedState
    };
    
    onUpdateEmployees(employees.map(e => e.id === offboardEmp.id ? updated : e));
    setOffboardEmp(updated);
    setWizardStep(step + 1);
  };

  const handleFinalArchive = async () => {
    if (!offboardEmp) return;
    setIsOffboardingExecuting(true);
    
    await new Promise(resolve => setTimeout(resolve, 1000));

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
        ...offboardEmp.offboardingState,
        workflowStatus: 'ARCHIVED',
        completedOn: new Date().toISOString()
      },
      employmentHistory: [...(offboardEmp.employmentHistory || []), historyItem]
    };
    onUpdateEmployees(employees.map(e => e.id === offboardEmp.id ? updated : e));
    
    setOffboardEmp(null);
    setIsWizardOpen(false);
    setIsOffboardingExecuting(false);
    
    alert('Employee successfully archived and removed from active workforce.');
  };`;

  content = content.replace(blockToReplace, newBlock);
}

// 4. Update the ActionConfirmationModal for offboarding
const confirmModalRegex = /<ActionConfirmationModal\s+isOpen=\{!!offboardEmp\}(.|\n)*?isLoading=\{isOffboardingExecuting\}\s+\/>/gm;
const newConfirmModal = `<ActionConfirmationModal
        isOpen={!!offboardEmp && !isWizardOpen}
        onClose={() => setOffboardEmp(null)}
        onConfirm={handleConfirmInitialOffboarding}
        title="Confirm Employee Offboarding"
        description={[
          "Employee will be removed from active workforce",
          "Employee will move to archived workforce",
          "Payroll & active access will stop"
        ]}
        confirmButtonText="Confirm Offboarding"
        isDestructive={true}
        isLoading={isOffboardingExecuting}
      />

      {/* Enterprise Offboarding Wizard Modal */}
      <Modal open={isWizardOpen} onClose={() => {}} title="Enterprise Offboarding Workflow" size="xl">
        {offboardEmp && (
          <div className="flex flex-col md:flex-row gap-6">
            {/* Stepper Sidebar */}
            <div className="w-full md:w-64 shrink-0 border-r border-slate-100 pr-4">
              <div className="mb-6">
                <h3 className="font-semibold text-slate-800">{offboardEmp.name}</h3>
                <p className="text-xs text-slate-500">{offboardEmp.employeeId} • {offboardEmp.designation}</p>
              </div>
              <ul className="space-y-4">
                {[
                  { id: 1, label: 'Documentation', icon: <FileText size={16} /> },
                  { id: 2, label: 'Payroll Settlement', icon: <IndianRupee size={16} /> },
                  { id: 3, label: 'Access Revocation', icon: <Lock size={16} /> },
                  { id: 4, label: 'HR Approval', icon: <UserCheck size={16} /> },
                  { id: 5, label: 'Final Archive', icon: <Archive size={16} /> }
                ].map((step) => {
                  const isActive = wizardStep === step.id;
                  const isPast = wizardStep > step.id;
                  return (
                    <li key={step.id} className={\`flex items-center gap-3 text-sm font-medium \${isActive ? 'text-blue-600' : isPast ? 'text-emerald-600' : 'text-slate-400'}\`}>
                      <div className={\`flex items-center justify-center w-8 h-8 rounded-full border-2 \${isActive ? 'border-blue-600 bg-blue-50' : isPast ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200 bg-slate-50'}\`}>
                        {isPast ? <CheckCircle2 size={16} /> : step.icon}
                      </div>
                      {step.label}
                    </li>
                  )
                })}
              </ul>
            </div>

            {/* Stepper Content */}
            <div className="flex-1 py-2">
              {wizardStep === 1 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-slate-800">Documentation Clearance</h3>
                  <p className="text-sm text-slate-500">Verify all pending documents, ID clearance, and return of company assets.</p>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
                    <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={20} />
                    <p className="text-sm text-amber-800 font-medium">Documentation clearance pending. Please verify assets.</p>
                  </div>
                  <Button onClick={() => handleWizardStepComplete(1)} className="w-full mt-4" icon={<CheckCircle2 size={16} />}>Verify & Mark Document Clearance Complete</Button>
                </div>
              )}
              {wizardStep === 2 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-slate-800">Payroll Settlement</h3>
                  <p className="text-sm text-slate-500">Verify final salary, deductions, and clear all dues.</p>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
                    <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={20} />
                    <p className="text-sm text-amber-800 font-medium">Payroll settlement pending. Wait for finance clearance.</p>
                  </div>
                  <Button onClick={() => handleWizardStepComplete(2)} className="w-full mt-4 bg-emerald-600 hover:bg-emerald-700 text-white border-0" icon={<CheckCircle2 size={16} />}>Settle Payroll Dues</Button>
                </div>
              )}
              {wizardStep === 3 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-slate-800">Access Revocation</h3>
                  <p className="text-sm text-slate-500">Revoke system access, biometric attendance, and workspace emails.</p>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
                    <Lock className="text-blue-500 shrink-0 mt-0.5" size={20} />
                    <p className="text-sm text-blue-800 font-medium">System login and active attendance will be disabled.</p>
                  </div>
                  <Button onClick={() => handleWizardStepComplete(3)} className="w-full mt-4" icon={<CheckCircle2 size={16} />}>Revoke Access</Button>
                </div>
              )}
              {wizardStep === 4 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-slate-800">Final HR Approval</h3>
                  <p className="text-sm text-slate-500">Acknowledge completion of all offboarding checklists.</p>
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                    <label className="text-sm font-medium text-slate-700">HR Remarks</label>
                    <textarea className="w-full mt-2 border border-slate-200 rounded-md p-2 text-sm" rows={3} placeholder="Optional remarks..."></textarea>
                  </div>
                  <Button onClick={() => handleWizardStepComplete(4)} className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white border-0" icon={<CheckCircle2 size={16} />}>Approve Final Sign-off</Button>
                </div>
              )}
              {wizardStep === 5 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-slate-800">Final Archive</h3>
                  <p className="text-sm text-slate-500">Employee will now be formally archived and removed from the active workforce analytics.</p>
                  <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 flex items-start gap-3">
                    <AlertTriangle className="text-rose-500 shrink-0 mt-0.5" size={20} />
                    <p className="text-sm text-rose-800 font-medium">This action cannot be undone. Employee will be moved to Previous Employees.</p>
                  </div>
                  <div className="flex gap-3 mt-4">
                    <Button variant="outline" className="w-1/3" onClick={() => { setIsWizardOpen(false); setOffboardEmp(null); }}>Cancel</Button>
                    <Button 
                      onClick={handleFinalArchive} 
                      disabled={isOffboardingExecuting}
                      className="w-2/3 bg-rose-600 hover:bg-rose-700 text-white border-0" 
                      icon={isOffboardingExecuting ? undefined : <Archive size={16} />}
                    >
                      {isOffboardingExecuting ? 'Processing Archive...' : 'Archive Employee Record'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>`;

content = content.replace(confirmModalRegex, newConfirmModal);

fs.writeFileSync('src/pages/Employees.tsx', content);
console.log("Wizard script successfully executed.");
