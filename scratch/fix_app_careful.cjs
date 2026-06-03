const fs = require('fs');
require('child_process').execSync('git checkout src/App.tsx');
let content = fs.readFileSync('src/App.tsx', 'utf8');

// Fix imports
content = content.replace(/from "\.\.\/types"/g, "from './types'");
content = content.replace(/from '\.\.\/types'/g, "from './types'");
content = content.replace(/import { allExcelParsedEmployees } from '\.\/data\/excelSeededData';\r?\n?/g, "");

// Remove default arrays
content = content.replace(/const defaultUsers: UserAccount\[\] = \[[\s\S]*?\];/g, "");
content = content.replace(/const defaultPayments: PaymentRecord\[\] = \[\];/g, "");
content = content.replace(/const defaultEmployees: Employee\[\] = [\s\S]*?\}\);/g, "");
content = content.replace(/export const SAFE_COMPANY_FALLBACK: any = \{[\s\S]*?\};\s+/g, "");

// Fix default fallbacks in component body
content = content.replace(/useState<UserAccount\[\]>\(defaultUsers\)/g, "useState<UserAccount[]>([])");
content = content.replace(/useState<PaymentRecord\[\]>\(defaultPayments\)/g, "useState<PaymentRecord[]>([])");
content = content.replace(/const validCompanies = \(companiesData && companiesData\.length > 0\) \? companiesData : defaultCompanies;/g, "const validCompanies = companiesData || [];");

// We need hydrateAll function. It's already there! Let's check where it is.
// I will not touch handleUpdate functions for now, I will replace them one by one.

fs.writeFileSync('src/App.tsx', content);
