const fs = require('fs');

let lines = fs.readFileSync('src/pages/Login.tsx', 'utf8').split('\n');

// Find the start of handleLoginSubmit
const startIdx = lines.findIndex(l => l.includes('const handleLoginSubmit = (e: React.FormEvent) => {'));
if (startIdx === -1) {
  console.log('Could not find start of handleLoginSubmit');
  process.exit(1);
}

// Find the end of handleLoginSubmit
let endIdx = -1;
let openBraces = 0;
let started = false;
for (let i = startIdx; i < lines.length; i++) {
  if (lines[i].includes('{')) {
    openBraces += (lines[i].match(/{/g) || []).length;
    started = true;
  }
  if (lines[i].includes('}')) {
    openBraces -= (lines[i].match(/}/g) || []).length;
  }
  if (started && openBraces <= 0) {
    endIdx = i;
    break;
  }
}

if (endIdx === -1) {
  console.log('Could not find end of handleLoginSubmit');
  process.exit(1);
}

const replacementLines = `  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const response = await api.auth.login({ username: username.trim(), password });
      
      if (!response || !response.token || !response.user) {
        setError('Login failed. Invalid response from server.');
        return;
      }

      const matched: UserAccount = response.user;
      
      // Store JWT token globally so apiClient intercepts it
      localStorage.setItem('hrms_jwt_token', response.token);

      if (matched.status === 'Disabled') {
        setError('This corporate account has been deactivated. Please contact your administrator.');
        return;
      }

      // Tenant/Company active subscription block logic (skip for Super Admin platform owners)
      if (matched.role !== 'Super Admin' && matched.companyId) {
        const company = companies.find(c => c.id === matched.companyId);
        if (company) {
          if (company.accountStatus === 'Suspended') {
            setError('Access Suspended: Your corporate workspace has been suspended. Please contact your billing administrator.');
            return;
          }
          if (company.paymentStatus === 'Expired') {
            setError('Access Expired: Your corporate subscription has expired. Please contact your billing administrator.');
            return;
          }
          if (company.status === 'Inactive') {
            setError('Access Blocked: Your corporate workspace is currently inactive. Please contact your administrator.');
            return;
          }
        }
      }

      // Success
      if (matched.accessibleCompanyIds) {
        const idSet = new Set<string>();
        matched.accessibleCompanyIds.forEach(id => {
          idSet.add(id);
          companies.filter(c => c.parentCompanyId === id).forEach(b => idSet.add(b.id));
        });
        matched.accessibleCompanyIds = Array.from(idSet);
      }

      if (matched.accessibleCompanyIds && matched.accessibleCompanyIds.length > 1) {
        setPendingUser(matched);
        return;
      }
      
      onLogin(matched, matched.companyId);
    } catch (err: any) {
      setError(err.message || 'Incorrect access password or user not found. Please try again.');
    }
  };`.split('\n');

lines.splice(startIdx, endIdx - startIdx + 1, ...replacementLines);

let output = lines.join('\n');
if (!output.includes("import { api } from '../api/apiClient';")) {
  output = output.replace("import { motion } from 'framer-motion';", "import { motion } from 'framer-motion';\nimport { api } from '../api/apiClient';");
}

fs.writeFileSync('src/pages/Login.tsx', output);
console.log('Replaced successfully');
