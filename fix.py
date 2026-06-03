import re

with open('src/App.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Remove hydrateAll block
hydrate_pattern = r"  // Data hydration from backend PostgreSQL\s+const hydrateAll = async \(\) => \{.*?\};\s+useEffect\(\(\) => \{\s+if \(isAuthenticated\) hydrateAll\(\);\s+\}, \[isAuthenticated\]\);\s+"
content = re.sub(hydrate_pattern, '', content, flags=re.DOTALL)

# 2. Insert it after isAuthenticated
auth_pattern = r"  const \[isAuthenticated, setIsAuthenticated\] = useState<boolean>\(\(\) => \{\s+return localStorage\.getItem\('hrms_auth'\) === 'true';\s+\}\);\s+"

hydrate_code = """  // Data hydration from backend PostgreSQL
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
  }, [isAuthenticated]);
  
"""

content = re.sub(auth_pattern, r'\g<0>' + hydrate_code, content)

with open('src/App.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Python script fixed App.tsx")
