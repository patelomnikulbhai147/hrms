const fs = require('fs');

let content = fs.readFileSync('src/types/index.ts', 'utf8');

content = content.replace(/address: string;/g, "billingAddress: string;");
content = content.replace(/email: string;/g, "adminEmail: string;");

fs.writeFileSync('src/types/index.ts', content);
console.log('src/types/index.ts patched.');
