const fs = require('fs');
let content = fs.readFileSync('src/pages/Settings.tsx', 'utf8');

content = content.replace(/const handleSave = \(\) => \{[\s\S]*?onUpdateCompanies\(updatedCompanies\);\n    alert\('Company statutory profiles.*? preserved.'\);\n  \};/m,
`const handleSave = async () => {
    try {
      await api.companies.update(company.id, {
        pfRate: Number(form.pfRate) || 12,
        esicRate: Number(form.esicRate) || 3.25,
        basicPercent: Number(form.basicPercent) || 50,
        profTaxRate: Number(form.profTaxRate) || 200,
        overtimeRate: Number(form.overtimeRate) || 1.5,
        address: form.address,
        email: form.email,
        phone: form.phone,
        primaryColor: form.primaryColor,
        headerText: form.headerText,
        footerText: form.footerText,
        signatureText: form.signatureText,
        themeStyle: form.themeStyle,
      });
      onUpdateCompanies([] as any);
      alert('Company statutory profiles, templates, and branding configurations saved securely to database. Employee history is preserved.');
    } catch(e) {
      alert('Failed to save settings to database');
    }
  };`);

fs.writeFileSync('src/pages/Settings.tsx', content);
console.log('Settings.tsx patched');
