const fs = require('fs');
const file = 'src/pages/Companies.tsx';
let lines = fs.readFileSync(file, 'utf8').split('\n');

lines[594] = "        alert(`Successfully provisioned new ${officerForm.role} credential:\\nID: ${savedUser.username}\\nPassword: ${savedUser.passwordStr}`);";
lines[595] = "      } catch (err) {\n        console.error(err);\n        alert('Failed to provision user');\n      }\n  };";

fs.writeFileSync(file, lines.join('\n'));
console.log('Fixed lines!');
