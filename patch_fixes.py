import re

# 1. Patch App.tsx hydration
with open('src/App.tsx', 'r', encoding='utf-8') as f:
    app_content = f.read()

hydrate_old = """  // Data hydration from backend PostgreSQL
  const hydrateAll = async () => {
    try {
      const [fetchedCompanies, fetchedBranches, fetchedEmployees, fetchedUsers] = await Promise.all([
        api.companies.getAll().catch(() => null),
        api.branches.getAll().catch(() => null),
        api.employees.getAll().catch(() => null),
        api.users.getAll().catch(() => null)
      ]);"""

hydrate_new = """  // Data hydration from backend PostgreSQL
  const hydrateAll = async () => {
    try {
      const [fetchedCompanies, fetchedBranches, fetchedEmployees, fetchedUsers, fetchedPayroll, fetchedDocuments] = await Promise.all([
        api.companies.getAll().catch(() => null),
        api.branches.getAll().catch(() => null),
        api.employees.getAll().catch(() => null),
        api.users.getAll().catch(() => null),
        api.payroll.getAll().catch(() => null),
        api.documents.getAll().catch(() => null)
      ]);"""

if hydrate_old in app_content:
    app_content = app_content.replace(hydrate_old, hydrate_new)
else:
    print("Could not find hydrate_old block in App.tsx!")

hydration_end_old = """      if (fetchedEmployees) setEmployees(fetchedEmployees);
      if (fetchedUsers) setUserAccounts(fetchedUsers);
    } catch (err) {"""

hydration_end_new = """      if (fetchedEmployees) setEmployees(fetchedEmployees);
      if (fetchedUsers) setUserAccounts(fetchedUsers);
      if (fetchedPayroll) setPayroll(fetchedPayroll);
      if (fetchedDocuments) setDocuments(fetchedDocuments);
    } catch (err) {"""

if hydration_end_old in app_content:
    app_content = app_content.replace(hydration_end_old, hydration_end_new)
else:
    print("Could not find hydration_end_old block in App.tsx!")

with open('src/App.tsx', 'w', encoding='utf-8') as f:
    f.write(app_content)

# 2. Patch Users.tsx to save permissions to the API
with open('src/pages/Users.tsx', 'r', encoding='utf-8') as f:
    users_content = f.read()

users_save_old = """  const handleSavePermissions = () => {
    if (!selectedUser) return;
    
    onUpdateAccounts(prev => prev.map(u => u.id === selectedUser.id ? selectedUser : u));
    setSelectedUser(null);
  };"""

users_save_new = """  const handleSavePermissions = async () => {
    if (!selectedUser) return;
    
    try {
      // Import apiClient directly or assume it's available globally or we can use the fetch directly.
      // Wait, we need to import api from apiClient!
      const { api } = await import('../api/apiClient');
      await api.users.update(selectedUser.id, {
        accessibleCompanyIds: selectedUser.accessibleCompanyIds,
        moduleAccess: selectedUser.moduleAccess,
        permissions: selectedUser.permissions
      });
      
      onUpdateAccounts(prev => prev.map(u => u.id === selectedUser.id ? selectedUser : u));
      setSelectedUser(null);
    } catch (err) {
      console.error('Failed to save permissions to backend:', err);
      alert('Failed to save permissions to backend. Please try again.');
    }
  };"""

if users_save_old in users_content:
    users_content = users_content.replace(users_save_old, users_save_new)
    with open('src/pages/Users.tsx', 'w', encoding='utf-8') as f:
        f.write(users_content)
else:
    print("Could not find users_save_old block in Users.tsx!")

print("Patching complete.")
