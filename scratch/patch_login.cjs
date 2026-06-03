const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../src/pages/Login.tsx');
let content = fs.readFileSync(file, 'utf8');

// Replace handleLoginSubmit
const handleLoginRegex = /const handleLoginSubmit = \(e: React\.FormEvent\) => \{[\s\S]*?onLogin\(matched, matched\.companyId\);\s*\};/m;
const newHandleLogin = `const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!username || !password) {
      setError('Please enter both Login ID and Access Password.');
      return;
    }
    
    // Pass raw credentials to parent App.tsx to handle actual DB login
    // We send a mock user object for type-compatibility, App.tsx will ignore it and use API
    onLogin({ username, passwordStr: password } as any, '');
  };`;

content = content.replace(handleLoginRegex, newHandleLogin);

// Remove Demo UI
const demoRegex = /\{\/\* Demo Quick-Select Panel \*\/\}[\s\S]*?\{\/\* Login Form \*\/\}/m;
content = content.replace(demoRegex, '{/* Login Form */}');

fs.writeFileSync(file, content);
console.log('Login.tsx patched!');
