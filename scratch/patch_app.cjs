const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf-8');

// 1. Add API import
if (!content.includes("import { api } from './api/apiClient';")) {
  content = content.replace("import React, { useState", "import React, { useState, useEffect\nimport { api } from './api/apiClient';");
}

// 2. Replace company state initialization
const companyStateRegex = /const \[companies, setCompanies\] = useState<Company\[\]>\(\(\) => \{[\s\S]*?return defaultCompanies;[\s\S]*?\}\);/;
const newCompanyState = `const [companies, setCompanies] = useState<Company[]>([]);

  useEffect(() => {
    // Phase 2: Fetching live companies from PostgreSQL Backend
    api.companies.getAll()
      .then(data => setCompanies(data))
      .catch(err => {
        console.error('Failed to load companies from DB, falling back to local', err);
        const raw = localStorage.getItem('hrms_companies');
        if (raw) {
           setCompanies(JSON.parse(raw));
        } else {
           setCompanies(defaultCompanies);
        }
      });
  }, []);`;

content = content.replace(companyStateRegex, newCompanyState);

// 3. Update handleAddCompany
const handleAddCompanyRegex = /const handleAddCompany = \(newCompany: Company\) => \{[\s\S]*?setCompanies\(next\);\s*localStorage\.setItem\('hrms_companies', JSON\.stringify\(next\)\);\s*\};/;
const newHandleAddCompany = `const handleAddCompany = async (newCompany: Company) => {
    try {
      // Send to DB
      const savedCompany = await api.companies.create(newCompany);
      const next = [...companies, savedCompany];
      setCompanies(next);
      localStorage.setItem('hrms_companies', JSON.stringify(next));
    } catch(err) {
      console.error(err);
      alert('Failed to save company to Database');
    }
  };`;

content = content.replace(handleAddCompanyRegex, newHandleAddCompany);

// 4. Update handleUpdateCompany
const handleUpdateCompanyRegex = /const handleUpdateCompany = \(updatedCompany: Company\) => \{[\s\S]*?setCompanies\(next\);\s*localStorage\.setItem\('hrms_companies', JSON\.stringify\(next\)\);\s*\};/;
const newHandleUpdateCompany = `const handleUpdateCompany = async (updatedCompany: Company) => {
    try {
      const savedCompany = await api.companies.update(updatedCompany.id, updatedCompany);
      const next = companies.map\(c => c.id === savedCompany.id ? savedCompany : c\);
      setCompanies(next);
      localStorage.setItem('hrms_companies', JSON.stringify(next));
    } catch(err) {
      console.error(err);
      alert('Failed to update company in Database');
    }
  };`;

content = content.replace(handleUpdateCompanyRegex, newHandleUpdateCompany);

fs.writeFileSync('src/App.tsx', content);
console.log('App.tsx patched successfully with API client.');
