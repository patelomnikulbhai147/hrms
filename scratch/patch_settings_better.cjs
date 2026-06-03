const fs = require('fs');

const path = 'src/pages/Settings.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(/currentCompany\.pfRate\.toString\(\)/g, "(currentCompany.pfRate ?? 12).toString()");
content = content.replace(/currentCompany\.esicRate\.toString\(\)/g, "(currentCompany.esicRate ?? 3.25).toString()");
content = content.replace(/currentCompany\.basicPercent\.toString\(\)/g, "(currentCompany.basicPercent ?? 50).toString()");
content = content.replace(/currentCompany\.overtimeRate\.toString\(\)/g, "(currentCompany.overtimeRate ?? 1.5).toString()");
content = content.replace(/currentCompany\.profTaxRate\.toString\(\)/g, "(currentCompany.profTaxRate ?? 200).toString()");

fs.writeFileSync(path, content, 'utf8');
console.log('Settings.tsx patched successfully with regex');
