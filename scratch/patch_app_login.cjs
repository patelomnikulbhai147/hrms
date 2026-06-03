const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../src/App.tsx');
let content = fs.readFileSync(file, 'utf8');

// Replace handleLogin
const handleLoginRegex = /const handleLogin = \([\s\S]*?localStorage\.setItem\('hrms_is_masquerading', 'false'\);\s*\};/m;
const newHandleLogin = `const handleLogin = async (profile: UserAccount, selectedCompanyId?: string) => {
    try {
      const res = await api.auth.login({
        username: profile.username,
        password: profile.passwordStr
      });
      
      const user = res.user;
      localStorage.setItem('hrms_jwt_token', res.token);
      
      const newProfile = {
        ...user,
        passwordStr: '',
        role: user.role || 'Employee'
      };
      
      setStoredAuthProfile(newProfile);
      setIsAuthenticated(true);
      localStorage.setItem('hrms_auth', 'true');
      localStorage.setItem('hrms_profile', JSON.stringify(newProfile));
      setRole(newProfile.role);
      
      const initialCompanyId = selectedCompanyId || newProfile.companyId || 'c-gcri';
      setActiveCompanyId(initialCompanyId);
      localStorage.setItem('hrms_active_company_id', initialCompanyId);
      setCurrentPage('dashboard');
      localStorage.setItem('hrms_current_page', 'dashboard');
      setIsMasquerading(false);
      localStorage.setItem('hrms_is_masquerading', 'false');
    } catch (err: any) {
      alert("Login failed: " + err.message);
    }
  };`;

content = content.replace(handleLoginRegex, newHandleLogin);

// Add useEffect for fetching data
const useEffectRegex = /useEffect\(\(\) => \{\s*if \(\!authProfile\) return;\s*\/\* Explicit RBAC/m;
const newUseEffect = `useEffect(() => {
    const fetchBackendData = async () => {
      try {
        const [backendCompanies, backendEmployees] = await Promise.all([
          api.companies.getAll(),
          api.employees.getAll()
        ]);
        setCompanies(backendCompanies);
        setEmployees(backendEmployees);
      } catch (err) {
        console.error("Failed to sync with PostgreSQL:", err);
      }
    };

    if (isAuthenticated) {
      fetchBackendData();
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!authProfile) return;
    
    // Explicit RBAC`;

content = content.replace(useEffectRegex, newUseEffect);

fs.writeFileSync(file, content);
console.log('App.tsx patched for login and sync!');
