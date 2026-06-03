const fs = require('fs');

let content = fs.readFileSync('src/pages/Settings.tsx', 'utf8');

// Replace email references with adminEmail in profileForm initialization
content = content.replace(/email: currentCompany\.email \|\| '',/g, "adminEmail: currentCompany.adminEmail || '',");

// Replace all occurrences of profileForm.email with profileForm.adminEmail
content = content.replace(/profileForm\.email/g, "profileForm.adminEmail");

// Replace the payload field email: profileForm.adminEmail with adminEmail: profileForm.adminEmail
// Since the previous step turned it into `email: profileForm.adminEmail`, we need to fix it:
content = content.replace(/email: profileForm\.adminEmail,/g, "adminEmail: profileForm.adminEmail,");

// Update input label and state updater for email
content = content.replace(/setProfileForm\(\{ \.\.\.profileForm, email: val \}\);/g, "setProfileForm({ ...profileForm, adminEmail: val });");

// Update the errors state for email (just the property name inside errors)
// We can leave errors.email as it is, since it's just a local error state map, but let's change it for consistency if we want.
content = content.replace(/errors\.email/g, "errors.adminEmail");
content = content.replace(/email: validateEmail\(val\)\.error/g, "adminEmail: validateEmail(val).error");
content = content.replace(/const emailErr/g, "const adminEmailErr");
content = content.replace(/\|\| emailErr/g, "|| adminEmailErr");

fs.writeFileSync('src/pages/Settings.tsx', content);
console.log('Settings.tsx patched for adminEmail mapping.');
