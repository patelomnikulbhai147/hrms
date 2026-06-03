const fs = require('fs');
let content = fs.readFileSync('src/pages/Companies.tsx', 'utf-8');

// Normalize line endings to LF for easier matching
content = content.replace(/\r\n/g, '\n');

let replaceCount = 0;

// 1. Patch handleRemoveBranch
if (content.includes(`    // Delete company/branch
    const nextCompanies = companies.filter(c => c.id !== branchId);`)) {
  content = content.replace(
`    // Delete company/branch
    const nextCompanies = companies.filter(c => c.id !== branchId);
    onUpdateCompanies(nextCompanies);
    alert('Branch removed successfully. Employees, payroll records, and documents were preserved.');`,
`    // Delete company/branch
    api.companies.archive(branchId).then(() => {
      const nextCompanies = companies.filter(c => c.id !== branchId);
      onUpdateCompanies(nextCompanies);
      alert('Branch removed successfully. Employees, payroll records, and documents were preserved.');
    }).catch(err => {
      console.error(err);
      alert('Failed to archive branch on the backend.');
    });`
  );
  replaceCount++;
}

// 2. Patch confirmStatusToggle
if (content.includes(`      // Update state
      onUpdateCompanies(updatedCompanies);`)) {
  content = content.replace(
`      // Update state
      onUpdateCompanies(updatedCompanies);`,
`      // Update state
      api.companies.update(statusModalTarget.id, { status: nextStatus }).catch(e => console.error(e));
      onUpdateCompanies(updatedCompanies);`
  );
  replaceCount++;
}

// 3. Patch handleSavePlan
if (content.includes(`    onUpdateCompanies(updated);
    setEditPlanModal(null);`)) {
  content = content.replace(
`    onUpdateCompanies(updated);
    setEditPlanModal(null);`,
`    api.companies.update(editPlanModal.id, { 
      plan: newPlan, 
      priceMonthly: selectedPlan ? selectedPlan.priceMonthly : editPlanModal.priceMonthly,
      priceYearly: selectedPlan ? selectedPlan.priceYearly : editPlanModal.priceYearly,
      subscriptionPrice: selectedPlan ? selectedPlan.priceMonthly : editPlanModal.subscriptionPrice
    }).then(() => {
      onUpdateCompanies(updated);
      setEditPlanModal(null);
    }).catch(err => {
      console.error(err);
      alert('Failed to save plan to backend');
    });`
  );
  replaceCount++;
}

// 4. Patch handleCreateOfficer
if (content.includes(`    onUpdateAccounts([...userAccounts, newUser]);
    setOfficerForm({ name: '', email: '', username: '', password: '', role: 'Company Head' });`)) {
  content = content.replace(
`    onUpdateAccounts([...userAccounts, newUser]);
    setOfficerForm({ name: '', email: '', username: '', password: '', role: 'Company Head' });
    setOfficerErrors({});
    alert(\`Successfully provisioned new \${officerForm.role} credential:\\nID: \${newUser.username}\\nPassword: \${newUser.passwordStr}\`);`,
`    api.users.create({ ...newUser, password: newUser.passwordStr }).then(() => {
      onUpdateAccounts([...userAccounts, newUser]);
      setOfficerForm({ name: '', email: '', username: '', password: '', role: 'Company Head' });
      setOfficerErrors({});
      alert(\`Successfully provisioned new \${officerForm.role} credential:\\nID: \${newUser.username}\\nPassword: \${newUser.passwordStr}\`);
    }).catch(err => {
      console.error(err);
      alert('Failed to create user account on the backend.');
    });`
  );
  replaceCount++;
}

// 5. Patch handleCompleteOffboarding
if (content.includes(`    onUpdateCompanies(companies.map(c => {
      if (c.id === offboardCompany.id) return updated;`)) {
  content = content.replace(
`    onUpdateCompanies(companies.map(c => {
      if (c.id === offboardCompany.id) return updated;
      if (c.parentCompanyId === offboardCompany.id) return { ...c, status: 'Archived' };
      return c;
    }));
    setIsConfirmingOffboard(false);
    setOffboardCompany(null);
    alert(\`Company/Branch \${offboardCompany.name} and any child branches were offboarded and safely archived. All linked employees were automatically archived.\`);`,
`    api.companies.archive(offboardCompany.id).then(() => {
      onUpdateCompanies(companies.map(c => {
        if (c.id === offboardCompany.id) return updated;
        if (c.parentCompanyId === offboardCompany.id) return { ...c, status: 'Archived' };
        return c;
      }));
      setIsConfirmingOffboard(false);
      setOffboardCompany(null);
      alert(\`Company/Branch \${offboardCompany.name} and any child branches were offboarded and safely archived. All linked employees were automatically archived.\`);
    }).catch(err => {
      console.error(err);
      alert('Failed to execute offboarding on backend.');
    });`
  );
  replaceCount++;
}

// 6. Patch handleSaveBranch inside editingBranch ? block
if (content.includes(`      onUpdateCompanies(updatedCompanies);
      alert('Branch details updated successfully.');`)) {
  content = content.replace(
`      onUpdateCompanies(updatedCompanies);
      alert('Branch details updated successfully.');`,
`      api.companies.update(editingBranch.id, {
        name: branchForm.name,
        branchName: branchForm.name.replace(/^GCRI\\s+/, ''),
        branchCode: branchForm.branchCode,
        location: branchForm.location,
        address: branchForm.location,
        email: branchForm.email,
        adminEmail: branchForm.email,
        phone: branchForm.phone,
        adminName: branchForm.adminName,
        employeeCapacity: Number(branchForm.employeeCapacity) || 200,
        status: branchForm.status,
        pfRate: branchForm.pfRate,
        esicRate: branchForm.esicRate,
        basicPercent: branchForm.basicPercent,
        profTaxRate: branchForm.profTaxRate,
        overtimeRate: branchForm.overtimeRate,
      }).then(() => {
        onUpdateCompanies(updatedCompanies);
        alert('Branch details updated successfully.');
      }).catch(err => {
        console.error(err);
        alert('Failed to update branch on backend.');
      });`
  );
  replaceCount++;
}

// 7. Patch handleSaveBranch inside !editingBranch block
if (content.includes(`      onUpdateAccounts([...userAccounts, newAdminUser]);
      onUpdateCompanies([...companies, newBranchObj]);`)) {
  content = content.replace(
`      onUpdateAccounts([...userAccounts, newAdminUser]);
      onUpdateCompanies([...companies, newBranchObj]);
      alert(\`Branch created successfully.\\n\\nGenerated Branch Admin Account:\\nLogin ID: \${newAdminUser.username}\\nPassword: \${newAdminUser.passwordStr}\`);`,
`      Promise.all([
        api.branches.create(newBranchObj).catch(e => { console.error("Branch create error:", e); throw e; }),
        api.users.create({ ...newAdminUser, password: newAdminUser.passwordStr }).catch(e => { console.error("User create error:", e); throw e; })
      ]).then(() => {
        onUpdateAccounts([...userAccounts, newAdminUser]);
        onUpdateCompanies([...companies, newBranchObj]);
        alert(\`Branch created successfully.\\n\\nGenerated Branch Admin Account:\\nLogin ID: \${newAdminUser.username}\\nPassword: \${newAdminUser.passwordStr}\`);
      }).catch(err => {
        console.error(err);
        alert('Failed to create branch or admin user on the backend.');
      });`
  );
  replaceCount++;
}

fs.writeFileSync('src/pages/Companies.tsx', content);
console.log('Companies.tsx API integration patched successfully. Applied ' + replaceCount + ' patches.');
