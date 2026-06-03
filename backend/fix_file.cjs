const fs = require('fs');
let code = fs.readFileSync('src/pages/Companies.tsx', 'utf-8');

code = code.replace(
  /const \[officerForm, setOfficerForm\] = useState\(\{[\s\S]*?role: 'Company Head' as 'Company Head' \| 'HR',\n  \}\);/,
  match => match + '\n  const [isSubmittingOfficer, setIsSubmittingOfficer] = useState(false);'
);

code = code.replace(
  /disabled=\{\s*!officerForm\.name \|\|\s*!officerForm\.email \|\|\s*!officerForm\.username \|\|\s*!!officerErrors\.name \|\|\s*!!officerErrors\.email\s*\}/,
  'disabled={isSubmittingOfficer || !officerForm.name || !officerForm.email || !officerForm.username || !!officerErrors.name || !!officerErrors.email}'
);

code = code.replace(
  />\s*Add Officer Account\s*<\/Button>/,
  '>{isSubmittingOfficer ? "Provisioning..." : "Add Officer Account"}</Button>'
);

fs.writeFileSync('src/pages/Companies.tsx', code);
