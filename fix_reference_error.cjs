const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf-8');

const hydrateCode = `  // Data hydration from backend PostgreSQL
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
  };

  useEffect(() => {
    if (isAuthenticated) hydrateAll();
  }, [isAuthenticated]);\n\n`;

content = content.replace(hydrateCode, '');

// Insert it right after the isAuthenticated definition
const authCode = `  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem('hrms_auth') === 'true';
  });\n\n`;

content = content.replace(authCode, authCode + hydrateCode);

fs.writeFileSync('src/App.tsx', content, 'utf-8');
console.log('Fixed ReferenceError in App.tsx');
