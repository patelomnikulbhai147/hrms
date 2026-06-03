const fs = require('fs');

let appContent = fs.readFileSync('src/App.tsx', 'utf-8');

// 1. Add workspaceUtils import
appContent = appContent.replace(
  `import { api } from './api/apiClient';`,
  `import { api } from './api/apiClient';\nimport { getAccessibleWorkspaceIds } from './utils/workspaceUtils';`
);

// 2. Remove all localStorage loading for entities that should come from DB
appContent = appContent.replace(
  `  const [employees, setEmployees] = useState<Employee[]>([]);`,
  `  const [employees, setEmployees] = useState<Employee[]>([]);\n\n  // Data hydration from backend PostgreSQL\n  const hydrateAll = async () => {\n    try {\n      const [fetchedCompanies, fetchedEmployees, fetchedUsers] = await Promise.all([\n        api.companies.getAll().catch(() => null),\n        api.employees.getAll().catch(() => null),\n        api.users.getAll().catch(() => null)\n      ]);\n      \n      if (fetchedCompanies) setCompanies(fetchedCompanies);\n      if (fetchedEmployees) setEmployees(fetchedEmployees);\n      if (fetchedUsers) setUserAccounts(fetchedUsers);\n    } catch (err) {\n      console.error('Hydration failed:', err);\n    }\n  };\n\n  useEffect(() => {\n    if (isAuthenticated) hydrateAll();\n  }, [isAuthenticated]);`
);

// 3. Fix handleCompanyChange to use workspaceUtils
appContent = appContent.replace(
  `    if (resolvedRole !== 'Super Admin' && !isMasquerading) {
      const allowedIds = authProfile?.accessibleCompanyIds || [authProfile?.companyId];
      
      const isAllowed = allowedIds.some(pid => {
        if (pid === companyId) return true;
        const parent = companies.find(c => c.id === pid);
        if (parent && (pid === 'c-gcri' || parent.isHeadOffice)) {
           const child = companies.find(c => c.id === companyId);
           return child?.parentCompanyId === pid;
        }
        return false;
      });

      if (!isAllowed) {
        return;
      }
    }`,
  `    if (resolvedRole !== 'Super Admin' && !isMasquerading) {
      const accessibleIds = getAccessibleWorkspaceIds(authProfile, companies);
      if (!accessibleIds.includes(companyId)) {
        return;
      }
    }`
);

// 4. Update the authProfile useMemo to use workspaceUtils for inheritance instead of inline logic
appContent = appContent.replace(
  `  const authProfile = React.useMemo(() => {
    if (!storedAuthProfile) return null;
    
    // Dynamically sync permissions and profile state from the centralized users array
    const latestProfile = userAccounts.find(u => u.id === storedAuthProfile.id) || storedAuthProfile;
    
    if (!latestProfile.accessibleCompanyIds || latestProfile.accessibleCompanyIds.length === 0) return latestProfile;

    const idSet = new Set<string>();
    latestProfile.accessibleCompanyIds.forEach(id => {
      idSet.add(id);
      companies.filter(c => c.parentCompanyId === id).forEach(b => idSet.add(b.id));
    });

    return {
      ...latestProfile,
      accessibleCompanyIds: Array.from(idSet)
    };
  }, [storedAuthProfile, userAccounts, companies]);`,
  `  const authProfile = React.useMemo(() => {
    if (!storedAuthProfile) return null;
    
    const latestProfile = userAccounts.find(u => u.id === storedAuthProfile.id) || storedAuthProfile;
    const computedAccess = getAccessibleWorkspaceIds(latestProfile, companies);
    
    return {
      ...latestProfile,
      accessibleCompanyIds: computedAccess
    };
  }, [storedAuthProfile, userAccounts, companies]);`
);


fs.writeFileSync('src/App.tsx', appContent);
console.log('App.tsx successfully patched with backend hydration and unified workspace logic.');
