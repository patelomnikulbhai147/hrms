const fs = require('fs');

let content = fs.readFileSync('src/pages/Employees.tsx', 'utf-8');

// 1. Add api import if missing
if (!content.includes("import { api } from '../api/apiClient';")) {
  content = content.replace("import { Download, Upload, Plus,", "import { api } from '../api/apiClient';\nimport { Download, Upload, Plus,");
}

// 2. Patch Add Employee
const handleAddRegex = /const newEmp: Employee = \{[\s\S]*?onUpdateEmployees\(\[\.\.\.employees, newEmp\]\);[\s\S]*?setIsAdding\(false\);/;
const newHandleAdd = `const newEmp: Employee = {
      id: crypto.randomUUID(),
      employeeId: 'EMP' + Math.floor(Math.random() * 10000),
      name: form.name,
      email: form.email,
      phone: form.countryCode + form.mobileNumber,
      department: form.department,
      designation: form.designation,
      role: 'Staff',
      status: 'Active',
      joinDate: form.joinDate,
      location: form.location,
      companyId: activeCompanyId,
      branchId: activeBranchId,
      branchLocation: activeBranchId ? companies.find(c => c.id === activeBranchId)?.branchName || form.location : form.location,
      avatar: form.previewImage || '',
      salary: Number(form.salary),
      manager: form.manager,
      
      // new fields
      gender: form.gender,
      bloodGroup: form.bloodGroup,
      maritalStatus: form.maritalStatus,
      probationPeriod: form.probationPeriod,
      noticePeriod: form.noticePeriod,
      uan: form.uan,
      pfNumber: form.pfNumber,
      pan: form.pan,
      aadhaar: form.aadhaar,
      bankName: form.bankName,
      accountNumber: form.accountNumber,
      ifsc: form.ifsc,
      employmentType: form.employmentType
    };

    api.employees.create(newEmp).then(savedEmp => {
      onUpdateEmployees([...employees, savedEmp]);
      setIsAdding(false);
    }).catch(err => {
      console.error(err);
      alert('Failed to save to database, saved locally.');
      onUpdateEmployees([...employees, newEmp]);
      setIsAdding(false);
    });`;

if(content.match(handleAddRegex)) {
  content = content.replace(handleAddRegex, newHandleAdd);
}

// 3. Patch handleFinalArchive (offboarding)
const archiveRegex = /const updated: Employee = \{[\s\S]*?\.\.\.offboardEmp,[\s\S]*?status: 'Archived',[\s\S]*?\};[\s\S]*?onUpdateEmployees\(employees\.map\(e => e\.id === offboardEmp\.id \? updated : e\)\);/;
const newArchive = `const updated: Employee = {
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
    });`;

if(content.match(archiveRegex)) {
  content = content.replace(archiveRegex, newArchive);
}


fs.writeFileSync('src/pages/Employees.tsx', content);
console.log('Employees.tsx patched with API client.');
