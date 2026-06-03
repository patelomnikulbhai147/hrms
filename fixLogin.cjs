const fs = require('fs');

let data = fs.readFileSync('src/pages/Login.tsx', 'utf8');

const target = `  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Search for a matching account
    const matched = userAccounts.find(
      acc => acc.username.toLowerCase() === username.trim().toLowerCase()
    );

    if (!matched) {
      setError('Login ID not registered in SaaS directory.');
      return;
    }

    if (matched.passwordStr !== password) {
      setError('Incorrect access password. Please try again.');
      return;
    }`;

const replacement = `  const handleLoginSubmit = async (e: React.FormEvent) => {
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
      localStorage.setItem('hrms_jwt_token', response.token);`;

data = data.replace(target, replacement);

const catchTarget = `    // Single workspace or Super Admin
    onLogin(matched, matched.companyId);
  };`;

const catchReplacement = `    // Single workspace or Super Admin
    onLogin(matched, matched.companyId);
    } catch (err: any) {
      setError(err.message || 'Incorrect access password or user not found. Please try again.');
    }
  };`;

data = data.replace(catchTarget, catchReplacement);

if (!data.includes("import { api } from '../api/apiClient';")) {
  data = data.replace("import { motion } from 'framer-motion';", "import { motion } from 'framer-motion';\nimport { api } from '../api/apiClient';");
}

fs.writeFileSync('src/pages/Login.tsx', data);
console.log('done');
