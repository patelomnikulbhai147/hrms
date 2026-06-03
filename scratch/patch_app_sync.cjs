const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../src/App.tsx');
let content = fs.readFileSync(file, 'utf8');

// Update useEffect to fetch users
const useEffectRegex = /const \[backendCompanies, backendEmployees\] = await Promise\.all\(\[\s*api\.companies\.getAll\(\),\s*api\.employees\.getAll\(\)\s*\]\);\s*setCompanies\(backendCompanies\);\s*setEmployees\(backendEmployees\);/m;
const newUseEffect = `const [backendCompanies, backendEmployees, backendUsers] = await Promise.all([
          api.companies.getAll(),
          api.employees.getAll(),
          api.users.getAll()
        ]);
        setCompanies(backendCompanies);
        setEmployees(backendEmployees);
        setUserAccounts(backendUsers);`;

content = content.replace(useEffectRegex, newUseEffect);

// Remove localStorage sets from handleUpdateAccounts
const handleUpdateAccountsRegex = /const next = typeof updater === 'function' \? updater\(userAccounts\) : updater;\s*setUserAccounts\(next\);\s*localStorage\.setItem\('hrms_accounts', JSON\.stringify\(next\)\);/m;
const newHandleUpdateAccounts = `const next = typeof updater === 'function' ? updater(userAccounts) : updater;
    setUserAccounts(next);
    // Removed localStorage.setItem - source of truth is now DB`;

content = content.replace(handleUpdateAccountsRegex, newHandleUpdateAccounts);

// Remove localStorage from handleUpdateCompanies
const handleUpdateCompaniesRegex = /const next = typeof updater === 'function' \? updater\(companies\) : updater;\s*const billingResult = calculateBranchBilling\(next, 'c-gcri', plans\);\s*setCompanies\(billingResult\.updatedCompanies\);\s*localStorage\.setItem\('hrms_companies', JSON\.stringify\(billingResult\.updatedCompanies\)\);/m;
const newHandleUpdateCompanies = `const next = typeof updater === 'function' ? updater(companies) : updater;
    const billingResult = calculateBranchBilling(next, 'c-gcri', plans);
    setCompanies(billingResult.updatedCompanies);`;
    
content = content.replace(handleUpdateCompaniesRegex, newHandleUpdateCompanies);

fs.writeFileSync(file, content);
console.log('App.tsx patched for PostgreSQL source of truth!');
