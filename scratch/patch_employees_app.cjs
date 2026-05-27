const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf-8');

// 1. Find the useEffect we injected for companies and add employees fetch to it
const companyUseEffectRegex = /api\.companies\.getAll\(\)[\s\S]*?\}\);/g;
const newUseEffectContent = `api.companies.getAll()
      .then(data => setCompanies(data))
      .catch(err => {
        console.error('Failed to load companies from DB, falling back to local', err);
        const raw = localStorage.getItem('hrms_companies');
        if (raw) setCompanies(JSON.parse(raw));
      });

    // Phase 3: Fetching live employees from PostgreSQL Backend
    api.employees.getAll()
      .then(data => setEmployees(data))
      .catch(err => {
        console.error('Failed to load employees from DB, falling back to local', err);
        const raw = localStorage.getItem('hrms_employees');
        if (raw) setEmployees(JSON.parse(raw));
      });`;

content = content.replace(companyUseEffectRegex, newUseEffectContent);

// 2. Modify the employee state initialization to start empty (the useEffect will populate it)
const employeeStateRegex = /const \[employees, setEmployees\] = useState<Employee\[\]>\(\(\) => \{[\s\S]*?return uniqueEmployees;\s*\}\);/;
const newEmployeeState = `const [employees, setEmployees] = useState<Employee[]>([]);`;

content = content.replace(employeeStateRegex, newEmployeeState);

// 3. Modify handleUpdateEmployees to persist to DB
// We will replace the entire handleUpdateEmployees function.
const handleUpdateEmployeesRegex = /const handleUpdateEmployees = \(updater: Employee\[\] \| \(\(prev: Employee\[\]\) => Employee\[\]\)\) => \{[\s\S]*?localStorage\.setItem\('hrms_employees', JSON\.stringify\(next\)\);\s*\};/;
const newHandleUpdateEmployees = `const handleUpdateEmployees = async (updater: Employee[] | ((prev: Employee[]) => Employee[])) => {
    const next = typeof updater === 'function' ? updater(employees) : updater;
    setEmployees(next);
    localStorage.setItem('hrms_employees', JSON.stringify(next));
    
    // In a fully robust backend setup, we would identify exactly which employee was changed 
    // instead of replacing the whole array. For immediate compatibility with all existing 
    // frontend workflows (offboarding, editing, adding) without breaking UI, 
    // we let the frontend keep array state but the individual components (Employees.tsx) 
    // will be responsible for sending the individual API calls.
  };`;

content = content.replace(handleUpdateEmployeesRegex, newHandleUpdateEmployees);

fs.writeFileSync('src/App.tsx', content);
console.log('App.tsx patched for employees API integration.');
