const fs = require('fs');

let content = fs.readFileSync('src/pages/Settings.tsx', 'utf8');

// 1. Add api import
if (!content.includes("import { api } from '../api/apiClient';")) {
  content = "import { api } from '../api/apiClient';\n" + content;
}

// 2. Fix mockData import
content = content.replace("import { type Company, type Role, getCompanyDepartments } from '../data/mockData';", "import { type Company, type Role } from '../types';");

// 3. Fix SAFE_COMPANY_FALLBACK
content = content.replace("|| SAFE_COMPANY_FALLBACK;", "|| ({} as any);");

// 4. Change address to billingAddress in profileForm initialization
content = content.replace(/address: currentCompany\.address \|\| '',/g, "billingAddress: currentCompany.billingAddress || '',");

// 5. Fix the input bindings for address
content = content.replace(/value=\{profileForm\.address\}/g, "value={profileForm.billingAddress}");
content = content.replace(/onChange=\{e => setProfileForm\(\{ \.\.\.profileForm, address: e\.target\.value \}\)\}/g, "onChange={e => setProfileForm({ ...profileForm, billingAddress: e.target.value })}");

// 6. Fix disable logic
content = content.replace(/!profileForm\.address \|\|/g, "!profileForm.billingAddress ||");
content = content.replace(/!profileForm\.address/g, "!profileForm.billingAddress");

// 7. Fix preview mapping
content = content.replace(/\{profileForm\.address \|\| 'Company Address'\}/g, "{profileForm.billingAddress || 'Company Address'}");

// 8. Fix handleSaveAll
// Let's find the exact boundaries of handleSaveAll
const startIndex = content.indexOf('const handleSaveAll = () => {');
if (startIndex !== -1) {
  const endIndex = content.indexOf('const handleColorPreset =', startIndex);
  if (endIndex !== -1) {
    const newSaveAll = `const handleSaveAll = async () => {
    if (role !== 'Super Admin' && role !== 'Company Head') {
      alert('Error: HR operators are not authorized to edit settings.');
      return;
    }

    const nameErr = validateCompanyName(profileForm.name).error;
    const emailErr = validateEmail(profileForm.email).error;
    const phoneErr = validatePhone(phoneNum).error;
    const pfErr = validatePercentage(payrollForm.pfRate, 'PF Rate').error;
    const esicErr = validatePercentage(payrollForm.esicRate, 'ESIC Rate').error;
    const basicErr = validatePercentage(payrollForm.basicPercent, 'Basic Salary Percentage').error;

    if (nameErr || emailErr || phoneErr || pfErr || esicErr || basicErr || !profileForm.billingAddress) {
      alert('Error: Please resolve validation errors before saving.');
      return;
    }

    try {
      const payload = {
        name: profileForm.name,
        phone: \`\${phoneCode} \${phoneNum}\`,
        email: profileForm.email,
        billingAddress: profileForm.billingAddress,
        industry: profileForm.industry,
        companyIndustry: profileForm.companyIndustry,
        departmentTemplateType: profileForm.departmentTemplateType,
        inheritParentDepartments: profileForm.inheritParentDepartments,
        customDepartments: customDepartments,
        pfRate: parseFloat(payrollForm.pfRate) || 12,
        esicRate: parseFloat(payrollForm.esicRate) || 3.25,
        basicPercent: parseFloat(payrollForm.basicPercent) || 50,
        overtimeRate: parseFloat(payrollForm.overtimeRate) || 1.5,
        profTaxRate: parseFloat(payrollForm.profTaxRate) || 200,
        logo: brandingForm.logoText,
        logoImage: brandingForm.logoImage,
        primaryColor: brandingForm.primaryColor,
        headerText: brandingForm.headerText,
        footerText: brandingForm.footerText,
        signatureText: brandingForm.signatureText,
        themeStyle: brandingForm.themeStyle as any,
      };

      await api.companies.update(currentCompany.id, payload);

      const updatedCompanies = companies.map(c => {
        if (c.id === currentCompany.id) {
          return { ...c, ...payload };
        }
        return c;
      });

      onUpdateCompanies(updatedCompanies);
      alert('Company statutory profiles, templates, and branding configurations updated successfully! Changes immediately active.');
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Failed to save settings to database.');
    }
  };

  `;
    content = content.substring(0, startIndex) + newSaveAll + content.substring(endIndex);
  } else {
    console.log("Could not find handleColorPreset");
  }
} else {
  console.log("Could not find handleSaveAll");
}

fs.writeFileSync('src/pages/Settings.tsx', content);
console.log('Done rewriting Settings.tsx robustly.');
