const fs = require('fs');

let content = fs.readFileSync('src/pages/Documents.tsx', 'utf8');

// Replace handleBulkApproveDossier
content = content.replace(/const handleBulkApproveDossier = \(empId: string\) => \{[\s\S]*?\}\);/m,
`const handleBulkApproveDossier = async (empId: string) => {
    try {
      const empDocs = documents.filter(d => d.employeeId === empId && d.status === 'Pending');
      await Promise.all(empDocs.map(d => api.documents.update(d.id, { status: 'Verified' })));
      onUpdateDocuments([] as any);
      alert(\`All pending documents for this employee have been audited as Verified.\`);
    } catch(e) {
      alert('Failed to bulk verify documents on server.');
    }
  };`);

// Replace handleUpload
content = content.replace(/const handleUpload = \(\) => \{[\s\S]*?alert\('Document registered in compliance vault.'\);\n  \};/m,
`const handleUpload = async () => {
    if (!uploadForm.name) return;
    
    const newDoc = {
      companyId: activeCompanyId,
      employeeId: selectedEmpId || (isEmployee && authProfile ? authProfile.employeeId! : ''),
      name: uploadForm.name,
      type: uploadForm.type,
      uploadDate: new Date().toISOString().split('T')[0],
      status: 'Pending',
      url: '#'
    };
    
    try {
      await api.documents.create(newDoc);
      onUpdateDocuments([] as any);
      setUploadOpen(false);
      setUploadForm({ name: '', type: 'Aadhaar' });
      alert('Document registered in compliance vault.');
    } catch(e) {
      alert('Failed to register document on server.');
    }
  };`);

// Replace handleToggleStatus
content = content.replace(/const handleToggleStatus = \(id: string, currentStatus: string\) => \{[\s\S]*?alert\(\`Document audited as \$\{nextStatus\}\`\);\n  \};/m,
`const handleToggleStatus = async (id: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'Verified' ? 'Rejected' : (currentStatus === 'Rejected' ? 'Pending' : 'Verified');
    try {
      await api.documents.update(id, { status: nextStatus });
      onUpdateDocuments([] as any);
      alert(\`Document audited as \${nextStatus}\`);
    } catch(e) {
      alert('Failed to update document status on server.');
    }
  };`);

fs.writeFileSync('src/pages/Documents.tsx', content);
console.log('Documents.tsx patched');
