const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf8');

// 1. Remove localStorage calls inside the initializers, but KEEP the default structure for now, except we set it to [] for simplicity (Wait! No, some states need to be initialized. Let's just remove the localStorage lines from the initializers)

content = content.replace(/const raw = localStorage\.getItem\('hrms_accounts'\);\s*if \(raw\) return JSON\.parse\(raw\);\s*localStorage\.setItem\('hrms_accounts', JSON\.stringify\(defaultUsers\)\);/g, '');

content = content.replace(/localStorage\.setItem\('hrms_accounts', JSON\.stringify\(next\)\);/g, '');

// For companies:
content = content.replace(/const raw = localStorage\.getItem\('hrms_companies'\);\s*if \(raw\) \{[\s\S]*?return sanitized;\s*\} catch \(e\) \{\s*console\.error\("Error parsing cached companies", e\);\s*\}\s*\}\s*localStorage\.setItem\('hrms_companies', JSON\.stringify\(defaultCompanies\)\);/g, '');

content = content.replace(/localStorage\.setItem\('hrms_companies', JSON\.stringify\(next\)\);/g, '');

// For employees:
content = content.replace(/const raw = localStorage\.getItem\('hrms_employees'\);\s*if \(raw\) return JSON\.parse\(raw\);\s*localStorage\.setItem\('hrms_employees', JSON\.stringify\(defaultEmployees\)\);/g, '');

content = content.replace(/localStorage\.setItem\('hrms_employees', JSON\.stringify\(next\)\);/g, '');

// For attendance:
content = content.replace(/const raw = localStorage\.getItem\('hrms_attendance'\);\s*if \(raw\) return JSON\.parse\(raw\);\s*localStorage\.setItem\('hrms_attendance', JSON\.stringify\(defaultAttendance\)\);/g, '');
content = content.replace(/localStorage\.setItem\('hrms_attendance', JSON\.stringify\(next\)\);/g, '');

// For leaves:
content = content.replace(/const raw = localStorage\.getItem\('hrms_leaves'\);\s*if \(raw\) return JSON\.parse\(raw\);\s*localStorage\.setItem\('hrms_leaves', JSON\.stringify\(defaultLeaves\)\);/g, '');
content = content.replace(/localStorage\.setItem\('hrms_leaves', JSON\.stringify\(next\)\);/g, '');

// For payroll:
content = content.replace(/const raw = localStorage\.getItem\('hrms_payroll'\);\s*if \(raw\) return JSON\.parse\(raw\);\s*localStorage\.setItem\('hrms_payroll', JSON\.stringify\(defaultPayroll\)\);/g, '');
content = content.replace(/localStorage\.setItem\('hrms_payroll', JSON\.stringify\(next\)\);/g, '');

// For documents:
content = content.replace(/const raw = localStorage\.getItem\('hrms_documents'\);\s*if \(raw\) return JSON\.parse\(raw\);\s*localStorage\.setItem\('hrms_documents', JSON\.stringify\(defaultDocuments\)\);/g, '');
content = content.replace(/localStorage\.setItem\('hrms_documents', JSON\.stringify\(next\)\);/g, '');

// For plans:
content = content.replace(/const raw = localStorage\.getItem\('hrms_plans'\);\s*if \(raw\) \{[\s\S]*?return merged;\s*\} catch \(e\) \{\s*console\.error\("Failed to parse cached plans", e\);\s*\}\s*\}\s*localStorage\.setItem\('hrms_plans', JSON\.stringify\(defaultPlans\)\);/g, '');
content = content.replace(/localStorage\.setItem\('hrms_plans', JSON\.stringify\(next\)\);/g, '');

// For payments:
content = content.replace(/const raw = localStorage\.getItem\('hrms_payments'\);\s*if \(raw\) return JSON\.parse\(raw\);\s*localStorage\.setItem\('hrms_payments', JSON\.stringify\(defaultPayments\)\);/g, '');
content = content.replace(/localStorage\.setItem\('hrms_payments', JSON\.stringify\(next\)\);/g, '');


// Replace .catch(() => defaultData) in hydrateAll
content = content.replace(/api\.users\.getAll\(\)\.catch\(\(\) => defaultUsers\)/g, 'api.users.getAll().catch(() => [])');
content = content.replace(/api\.companies\.getAll\(\)\.catch\(\(\) => defaultCompanies\)/g, 'api.companies.getAll().catch(() => [])');


// Move hydrateAll OUT of useEffect
content = content.replace(/useEffect\(\(\) => \{\n\s+const hydrateAll = async \(\) => \{/g, 'const hydrateAll = async () => {');
content = content.replace(/      \} catch \(error\) \{\n        console.error\('Global hydration failed:', error\);\n      \}\n    \};\n    hydrateAll\(\);\n  \}, \[\]\);/g, `      } catch (error) {
        console.error('Global hydration failed:', error);
      }
    };
  useEffect(() => { hydrateAll(); }, []);`);

// Inside handleLogin, add hydrateAll() after setting token
content = content.replace(/setIsAuthenticated\(true\);\n\s+localStorage.setItem\('hrms_auth', 'true'\);/g, "setIsAuthenticated(true);\\n      localStorage.setItem('hrms_auth', 'true');\\n      hydrateAll();");


fs.writeFileSync('src/App.tsx', content);
console.log('App.tsx cleanly patched.');
