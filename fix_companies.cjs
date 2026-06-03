const fs = require('fs');
const p = 'c:/Users/HP/OneDrive/Desktop/enterprise-hrms-crm-application - Copy(d1)/src/pages/Companies.tsx';
let txt = fs.readFileSync(p, 'utf8');

// 1. handleCreateCompany
txt = txt.replace(
  `    onUpdateAccounts([...userAccounts, newHead]);
    onUpdateCompanies([fresh, ...companies]);
    setAddOpen(false);`,
  `    try {
      await api.companies.create(fresh);
      onUpdateAccounts([...userAccounts, newHead]);
      onUpdateCompanies([fresh, ...companies]);
      setAddOpen(false);
    } catch (e) {
      alert('Failed to save company to server');
      return;
    }`
);

// 2. confirmStatusToggle
txt = txt.replace(
  `      // Update state
      onUpdateCompanies(updatedCompanies);`,
  `      // Update state
      api.companies.update(statusModalTarget.id, { status: nextStatus }).then(() => {
        onUpdateCompanies(updatedCompanies);
      }).catch(() => {
        alert('Failed to update status on server');
      });`
);

// 3. handleSavePlan
txt = txt.replace(
  `    onUpdateCompanies(updated);
    setEditPlanModal(null);`,
  `    api.companies.update(editPlanModal.id, { plan: newPlan }).then(() => {
      onUpdateCompanies(updated);
      setEditPlanModal(null);
    }).catch(() => alert('Failed to update plan on server'));`
);

// 4. handleSaveBranch (Create mode)
txt = txt.replace(
  `      onUpdateAccounts([...userAccounts, newAdminUser]);
      onUpdateCompanies([...companies, newBranchObj]);
      alert(\`Branch created successfully.\\n\\nGenerated Branch Admin Account:\\nLogin ID: \${newAdminUser.username}\\nPassword: \${newAdminUser.passwordStr}\`);`,
  `      api.companies.create(newBranchObj).then(() => {
        onUpdateAccounts([...userAccounts, newAdminUser]);
        onUpdateCompanies([...companies, newBranchObj]);
        alert(\`Branch created successfully.\\n\\nGenerated Branch Admin Account:\\nLogin ID: \${newAdminUser.username}\\nPassword: \${newAdminUser.passwordStr}\`);
      }).catch(() => alert('Failed to create branch on server'));`
);

// 5. handleSaveBranch (Edit mode)
txt = txt.replace(
  `      onUpdateCompanies(updatedCompanies);
      alert('Branch updated successfully.');`,
  `      api.companies.update(editingBranch.id, branchForm).then(() => {
        onUpdateCompanies(updatedCompanies);
        alert('Branch updated successfully.');
      }).catch(() => alert('Failed to update branch on server'));`
);

// 6. handleRemoveBranch
txt = txt.replace(
  `    // Delete company/branch
    const nextCompanies = companies.filter(c => c.id !== branchId);
    onUpdateCompanies(nextCompanies);
    alert('Branch removed successfully. Employees, payroll records, and documents were preserved.');`,
  `    // Delete company/branch
    api.companies.archive(branchId).then(() => {
      const nextCompanies = companies.filter(c => c.id !== branchId);
      onUpdateCompanies(nextCompanies);
      alert('Branch removed successfully. Employees, payroll records, and documents were preserved.');
    }).catch(() => alert('Failed to delete branch on server'));`
);

// 7. handleCompleteOffboarding
txt = txt.replace(
  `    onUpdateCompanies(companies.map(c => {
      if (c.id === offboardCompany.id) return updated;
      if (c.parentCompanyId === offboardCompany.id) return { ...c, status: 'Archived' };
      return c;
    }));
    setIsConfirmingOffboard(false);
    setOffboardCompany(null);
    alert(\`Company/Branch \${offboardCompany.name} and any child branches were offboarded and safely archived. All linked employees were automatically archived.\`);`,
  `    api.companies.update(offboardCompany.id, { status: 'Archived' }).then(() => {
      onUpdateCompanies(companies.map(c => {
        if (c.id === offboardCompany.id) return updated;
        if (c.parentCompanyId === offboardCompany.id) return { ...c, status: 'Archived' };
        return c;
      }));
      setIsConfirmingOffboard(false);
      setOffboardCompany(null);
      alert(\`Company/Branch \${offboardCompany.name} and any child branches were offboarded and safely archived. All linked employees were automatically archived.\`);
    }).catch(() => alert('Failed to archive company on server'));`
);

fs.writeFileSync(p, txt);
console.log('done');
