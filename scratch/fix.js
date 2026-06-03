const fs = require('fs');
const file = 'src/pages/Users.tsx';
let content = fs.readFileSync(file, 'utf8');
content = content.replace("updatedUser.accessibleCompanyIds = [updatedUser.companyId || 'c-gcri'];", "updatedUser.accessibleCompanyIds = [updatedUser.companyId || companies[0]?.id || ''];");
fs.writeFileSync(file, content);
