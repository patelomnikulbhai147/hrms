const fs = require('fs');
const path = 'c:/Users/HP/OneDrive/Desktop/enterprise-hrms-crm-application - Copy(d1)/src/App.tsx';

let content = fs.readFileSync(path, 'utf8');

// Remove migration block
content = content.replace(/\/\/ Auto-migration: check if browser[\s\S]*?window\.location\.reload\(\);\s*\}\s*\}/, '');

// Remove all localStorage.setItem for data
content = content.replace(/localStorage\.setItem\('hrms_employees', JSON\.stringify\(nextEmployees\)\);/g, '');
content = content.replace(/localStorage\.setItem\('hrms_payroll', JSON\.stringify\(nextPayroll\)\);/g, '');
content = content.replace(/localStorage\.setItem\('hrms_attendance', JSON\.stringify\(next\)\);/g, '');
content = content.replace(/localStorage\.setItem\('hrms_leaves', JSON\.stringify\(nextLeaves\)\);/g, '');
content = content.replace(/localStorage\.setItem\('hrms_documents', JSON\.stringify\(next\)\);/g, '');

// Update useEffect to fetch profile
const authUseEffect = `
  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('hrms_jwt_token');
      if (token) {
        try {
          const user = await api.auth.getMe();
          setStoredAuthProfile(user);
          setIsAuthenticated(true);
          setRole(user.role);
          localStorage.setItem('hrms_profile', JSON.stringify(user));
        } catch (e) {
          handleLogout();
        }
      }
      hydrateAll();
    };
    initAuth();
  }, []);
`;
content = content.replace(/useEffect\(\(\) => \{\s*hydrateAll\(\);\s*\}, \[\]\);/, authUseEffect);

// In handleLogout, clear token
content = content.replace(/localStorage\.removeItem\('hrms_auth'\);/, "localStorage.removeItem('hrms_auth');\n    localStorage.removeItem('hrms_jwt_token');");

fs.writeFileSync(path, content, 'utf8');
console.log('App.tsx patched successfully');
