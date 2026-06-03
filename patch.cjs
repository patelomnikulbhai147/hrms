const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// 1. Add isHydrating state
code = code.replace(
  /const \[userAccounts, setUserAccounts\] = useState<UserAccount\[\]>\(\[\]\);/,
  'const [isHydrating, setIsHydrating] = useState<boolean>(true);\n  const [userAccounts, setUserAccounts] = useState<UserAccount[]>([]);'
);

// 2. Fix handleLogin
code = code.replace(
  /const handleLogin = \(profile: UserAccount, selectedCompanyId\?: string\) => \{[\s\S]*?localStorage\.setItem\('hrms_is_masquerading', 'false'\);\n  \};/,
  `const handleLogin = (profile: UserAccount, selectedCompanyId?: string) => {
    setStoredAuthProfile(profile);
    setIsAuthenticated(true);
    localStorage.setItem('hrms_auth', 'true');
    localStorage.setItem('hrms_profile', JSON.stringify(profile));
    setRole(profile.role);
    const initialCompanyId = selectedCompanyId || profile.companyId || 'c-gcri';
    setActiveCompanyId(initialCompanyId);
    localStorage.setItem('hrms_active_company_id', initialCompanyId);
    setIsMasquerading(false);
    localStorage.setItem('hrms_is_masquerading', 'false');
    setIsHydrating(true);
    hydrateAll(profile);
  };`
);

// 3. Fix handleLogout
code = code.replace(
  /const handleLogout = \(\) => \{[\s\S]*?setIsMasquerading\(false\);\n  \};/,
  `const handleLogout = () => {
    localStorage.removeItem('hrms_auth');
    localStorage.removeItem('hrms_profile');
    localStorage.removeItem('hrms_current_page');
    localStorage.removeItem('hrms_active_company_id');
    localStorage.removeItem('hrms_is_masquerading');
    localStorage.removeItem('hrms_jwt_token');
    window.location.href = '/';
  };`
);

// 4. Update hydrateAll signature and routing logic
code = code.replace(
  /const hydrateAll = async \(\) => \{/,
  'const hydrateAll = async (loginProfile?: UserAccount) => {'
);

code = code.replace(
  /        const billingResult = calculateBranchBilling\(combined, 'c-gcri', fetchedPlans \|\| \[\]\);\n        setCompanies\(billingResult\.updatedCompanies\);\n      \}/,
  `        const billingResult = calculateBranchBilling(combined, 'c-gcri', fetchedPlans || []);
        setCompanies(billingResult.updatedCompanies);

        if (loginProfile) {
          if (loginProfile.role === 'Super Admin') {
            setCurrentPage('dashboard');
            localStorage.setItem('hrms_current_page', 'dashboard');
          } else {
            const directIds = [loginProfile.companyId, ...(loginProfile.accessibleCompanyIds || [])].filter(Boolean);
            const idSet = new Set<string>(directIds);
            directIds.forEach(pid => {
              const parent = billingResult.updatedCompanies.find(c => c.id === pid);
              if (parent && (pid === 'c-gcri' || parent.isHeadOffice || !parent.parentCompanyId)) {
                billingResult.updatedCompanies.filter(c => c.parentCompanyId === pid).forEach(child => idSet.add(child.id));
              }
            });
            
            if (idSet.size > 1) {
              setCurrentPage('select-workspace');
              localStorage.setItem('hrms_current_page', 'select-workspace');
            } else {
              setCurrentPage('dashboard');
              localStorage.setItem('hrms_current_page', 'dashboard');
            }
          }
        }
      }`
);

code = code.replace(
  /      if \(fetchedNotifications\) setNotifications\(fetchedNotifications\);\n    \} catch \(err\) \{\n      console\.error\('Failed to hydrate store from backend:', err\);\n    \}\n  \};/,
  `      if (fetchedNotifications) setNotifications(fetchedNotifications);
    } catch (err) {
      console.error('Failed to hydrate store from backend:', err);
    } finally {
      setIsHydrating(false);
    }
  };`
);

code = code.replace(
  /  if \(!isAuthenticated \|\| !authProfile\) \{\n    return <Login userAccounts=\{userAccounts\} companies=\{companies\} onLogin=\{handleLogin\} \/>;\n  \}/,
  `  if (!isAuthenticated || !authProfile) {
    return <Login userAccounts={userAccounts} companies={companies} onLogin={handleLogin} />;
  }

  if (isHydrating) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
        <div className="flex flex-col items-center">
          <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <h2 className="text-xl font-semibold text-white">Loading Workspace...</h2>
        </div>
      </div>
    );
  }

  if (currentPage === 'select-workspace') {
    return (
      <SelectWorkspace 
        companies={companies} 
        user={authProfile} 
        onSelect={(id) => {
          setActiveCompanyId(id);
          localStorage.setItem('hrms_active_company_id', id);
          setCurrentPage('dashboard');
          localStorage.setItem('hrms_current_page', 'dashboard');
        }} 
      />
    );
  }`
);

fs.writeFileSync('src/App.tsx', code);
console.log('App.tsx updated successfully');
