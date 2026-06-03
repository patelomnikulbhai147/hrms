const fs = require('fs');
const p = 'c:/Users/HP/OneDrive/Desktop/enterprise-hrms-crm-application - Copy(d1)/src/pages/Documents.tsx';
let txt = fs.readFileSync(p, 'utf8');

txt = txt.replace('const handleUploadDocument = () => {', 'const handleUploadDocument = async () => {');
txt = txt.replace('onUpdateDocuments([newDoc, ...documents]);', `try { const saved = await api.documents.create(newDoc); onUpdateDocuments([saved, ...documents]); } catch(e) { alert('Failed to upload to DB'); }`);

txt = txt.replace(`const handleToggleStatus = (id: string, nextStatus: 'Verified' | 'Rejected') => {`, `const handleToggleStatus = async (id: string, nextStatus: 'Verified' | 'Rejected') => {`);
txt = txt.replace('onUpdateDocuments(documents.map(d => d.id === id ? { ...d, status: nextStatus } : d));', `try { const t = documents.find(d => d.id === id); if(!t) return; const saved = await api.documents.update(id, { ...t, status: nextStatus }); onUpdateDocuments(documents.map(d => d.id === id ? saved : d)); } catch(e) { alert('Failed to update in DB'); }`);

txt = txt.replace('const handleQuickVerify = (empId: string) => {', 'const handleQuickVerify = async (empId: string) => {');
txt = txt.replace('const updated = documents.map(d => {', 'const updatedPromises = documents.map(async d => {');
txt = txt.replace(`return { ...d, status: 'Verified' as const };`, `const u = { ...d, status: 'Verified' as const }; return await api.documents.update(d.id, u).catch(()=>u);`);
txt = txt.replace('onUpdateDocuments(updated);', 'const updated = await Promise.all(updatedPromises); onUpdateDocuments(updated);');

fs.writeFileSync(p, txt);
console.log('done');
