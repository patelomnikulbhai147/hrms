const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// Add isHydrating state
code = code.replace(
  'const [userAccounts, setUserAccounts] = useState<UserAccount[]>([]);',
  'const [isHydrating, setIsHydrating] = useState<boolean>(true);\n  const [userAccounts, setUserAccounts] = useState<UserAccount[]>([]);'
);

// Fix handleLogin
const loginStart = code.indexOf('const handleLogin = (profile: UserAccount, selectedCompanyId?: string) => {');
const loginEnd = code.indexOf('};', loginStart) + 2;
const handleLoginReplacement = `const handleLogin = (profile: UserAccount, selectedCompanyId?: string) => {
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
  };`;
code = code.substring(0, loginStart) + handleLoginReplacement + code.substring(loginEnd);

// Fix handleLogout
const logoutStart = code.indexOf('const handleLogout = () => {');
const logoutEnd = code.indexOf('};', logoutStart) + 2;
const handleLogoutReplacement = `const handleLogout = () => {
    localStorage.removeItem('hrms_auth');
    localStorage.removeItem('hrms_profile');
    localStorage.removeItem('hrms_current_page');
    localStorage.removeItem('hrms_active_company_id');
    localStorage.removeItem('hrms_is_masquerading');
    localStorage.removeItem('hrms_jwt_token');
    window.location.href = '/';
  };`;
code = code.substring(0, logoutStart) + handleLogoutReplacement + code.substring(logoutEnd);

// Fix hydrateAll signature
code = code.replace(
  'const hydrateAll = async () => {',
  'const hydrateAll = async (loginProfile?: UserAccount) => {'
);

// Fix hydrateAll logic and catch block
const hydrateEndStart = code.indexOf("const billingResult = calculateBranchBilling(combined, 'c-gcri', fetchedPlans || []);");
const hydrateEndEnd = code.indexOf('  useEffect(() => {', hydrateEndStart);
const hydrateMiddleReplacement = `const billingResult = calculateBranchBilling(combined, 'c-gcri', fetchedPlans || []);
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
      }
      if (fetchedEmployees) {
        console.log('Fetched employees:', fetchedEmployees.length, fetchedEmployees[0]);
        setEmployees(fetchedEmployees);
      }
      if (fetchedUsers) setUserAccounts(fetchedUsers);
      if (fetchedAttendance) setAttendance(fetchedAttendance);
      if (fetchedLeaves) setLeaves(fetchedLeaves);
      if (fetchedPayroll) setPayroll(fetchedPayroll);
      if (fetchedDocuments) setDocuments(fetchedDocuments);
      if (fetchedPayments) setPayments(fetchedPayments);
      if (fetchedPlans) setPlans(fetchedPlans);
      
      if (fetchedNotifications) setNotifications(fetchedNotifications);
    } catch (err) {
      console.error('Failed to hydrate store from backend:', err);
    } finally {
      setIsHydrating(false);
    }
  };

`;
code = code.substring(0, hydrateEndStart) + hydrateMiddleReplacement + code.substring(hydrateEndEnd);

// Fix render
const renderStart = code.indexOf('if (!isAuthenticated || !authProfile) {');
const renderEnd = code.indexOf('const renderPage = () => {', renderStart);
const renderReplacement = `if (!isAuthenticated || !authProfile) {
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
  }

  `;
code = code.substring(0, renderStart) + renderReplacement + code.substring(renderEnd);

fs.writeFileSync('src/App.tsx', code);
console.log('App.tsx updated successfully');
