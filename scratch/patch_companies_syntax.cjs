const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../src/pages/Companies.tsx');
let content = fs.readFileSync(file, 'utf8');

const target = "alert(`Successfully provisioned new ${officerForm.role} credential:\\nID: ${newUser.username}\\nPassword: ${newUser.passwordStr}`);\n  };";
const replacement = "alert(`Successfully provisioned new ${officerForm.role} credential:\\nID: ${savedUser.username}\\nPassword: ${savedUser.passwordStr}`);\n      } catch (err) {\n        console.error(err);\n        alert('Failed to provision user');\n      }\n  };";

content = content.replace(target, replacement);

fs.writeFileSync(file, content);
console.log("Patched successfully");
