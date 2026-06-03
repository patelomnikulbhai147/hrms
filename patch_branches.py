import re

with open('src/App.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the hydrateAll block to include branches
hydrate_old = """  // Data hydration from backend PostgreSQL
  const hydrateAll = async () => {
    try {
      const [fetchedCompanies, fetchedEmployees, fetchedUsers] = await Promise.all([
        api.companies.getAll().catch(() => null),
        api.employees.getAll().catch(() => null),
        api.users.getAll().catch(() => null)
      ]);
      
      if (fetchedCompanies) setCompanies(fetchedCompanies);
      if (fetchedEmployees) setEmployees(fetchedEmployees);
      if (fetchedUsers) setUserAccounts(fetchedUsers);
    } catch (err) {
      console.error('Hydration failed:', err);
    }
  };"""

hydrate_new = """  // Data hydration from backend PostgreSQL
  const hydrateAll = async () => {
    try {
      const [fetchedCompanies, fetchedBranches, fetchedEmployees, fetchedUsers] = await Promise.all([
        api.companies.getAll().catch(() => null),
        api.branches.getAll().catch(() => null),
        api.employees.getAll().catch(() => null),
        api.users.getAll().catch(() => null)
      ]);
      
      if (fetchedCompanies) {
        let allEntities = [...fetchedCompanies];
        if (fetchedBranches) {
          const mappedBranches = fetchedBranches.map((b: any) => ({
             ...b,
             name: b.branchName || b.name,
             isHeadOffice: false
          }));
          allEntities = [...allEntities, ...mappedBranches];
        }
        setCompanies(allEntities);
      }
      
      if (fetchedEmployees) setEmployees(fetchedEmployees);
      if (fetchedUsers) setUserAccounts(fetchedUsers);
    } catch (err) {
      console.error('Hydration failed:', err);
    }
  };"""

if hydrate_old in content:
    content = content.replace(hydrate_old, hydrate_new)
    with open('src/App.tsx', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Successfully patched hydrateAll in App.tsx")
else:
    print("Could not find the exact old hydrateAll block. Regex fallback needed.")
