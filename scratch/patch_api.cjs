const fs = require('fs');

function patchFile(filePath, regex, replacement) {
  let content = fs.readFileSync(filePath, 'utf8');
  if (!content.includes("import { api }")) {
    content = content.replace(/import \{ usePermissions \} from '\.\.\/context\/PermissionContext';/, "import { usePermissions } from '../context/PermissionContext';\nimport { api } from '../api/apiClient';");
  }
  let patched = content.replace(regex, replacement);
  fs.writeFileSync(filePath, patched);
  console.log(`Patched ${filePath}`);
}

// Documents.tsx patching
patchFile('src/pages/Documents.tsx', 
  /const handleSaveEdit = \(\) => \{\n\s+if \(!editDoc\) return;\n\s+const updated = \{\n([\s\S]*?)\};\n\s+onUpdateDocuments\(documents\.map\(d => d\.id === editDoc\.id \? updated : d\)\);\n\s+setEditDoc\(null\);\n\s+alert\('Document updated successfully.'\);\n\s+\};/,
  `const handleSaveEdit = async () => {
    if (!editDoc) return;
    const updated = {
$1};
    try {
      const saved = await api.documents.update(editDoc.id, updated);
      onUpdateDocuments(documents.map(d => d.id === editDoc.id ? saved : d));
      setEditDoc(null);
      alert('Document updated successfully.');
    } catch (e) { alert('Failed to update document on server.'); }
  };`
);

// Companies.tsx patching
patchFile('src/pages/Companies.tsx',
  /const handleSaveEdit = \(\) => \{\n\s+if \(!editCompany\) return;\n\s+const updated = \{\n([\s\S]*?)\};\n\s+onUpdateCompanies\(companies\.map\(c => c\.id === editCompany\.id \? updated : c\)\);\n\s+setEditCompany\(null\);\n\s+alert\('Company updated successfully.'\);\n\s+\};/,
  `const handleSaveEdit = async () => {
    if (!editCompany) return;
    const updated = {
$1};
    try {
      const saved = await api.companies.update(editCompany.id, updated);
      onUpdateCompanies(companies.map(c => c.id === editCompany.id ? saved : c));
      setEditCompany(null);
      alert('Company updated successfully.');
    } catch (e) { alert('Failed to update company on server.'); }
  };`
);

console.log("Done patching handlers.");
