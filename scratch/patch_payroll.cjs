const fs = require('fs');

let content = fs.readFileSync('src/pages/Payroll.tsx', 'utf8');

// handlePreparePayroll
content = content.replace(/const handlePreparePayroll = \(record: PayrollRecord\) => \{[\s\S]*?saveAuditLog\(record\.id, 'Payroll prepared for review\.'\);\n  \};/m,
`const handlePreparePayroll = async (record: PayrollRecord) => {
    try {
      await api.payroll.update(record.id, { status: 'prepared', payrollStatus: 'prepared' });
      onUpdatePayroll([] as any);
      saveAuditLog(record.id, 'Payroll prepared for review.');
    } catch(e) {
      alert('Failed to prepare payroll in DB');
    }
  };`);

// handleVerifyPayroll
content = content.replace(/const handleVerifyPayroll = \(\) => \{[\s\S]*?setAuditRecord\(null\);\n  \};/m,
`const handleVerifyPayroll = async () => {
    if (!auditRecord) return;
    try {
      await api.payroll.update(auditRecord.id, { status: 'payment_pending', payrollStatus: 'payment_pending' });
      onUpdatePayroll([] as any);
      saveAuditLog(auditRecord.id, 'Payroll verified by HR/Admin.', remarks);
      setAuditRecord(null);
    } catch(e) {
      alert('Failed to verify payroll in DB');
    }
  };`);

// handleMarkPaid
content = content.replace(/const handleMarkPaid = \(\) => \{[\s\S]*?setPaymentModal\(null\);\n  \};/m,
`const handleMarkPaid = async () => {
    if (!paymentModal) return;
    try {
      const today = new Date().toISOString().split('T')[0];
      await api.payroll.update(paymentModal.id, { 
        status: 'paid', 
        payrollStatus: 'paid',
        paymentDate: today
      });
      onUpdatePayroll([] as any);
      saveAuditLog(paymentModal.id, \`Payroll marked as paid via \${paymentMethod}.\`);
      setPaymentModal(null);
    } catch(e) {
      alert('Failed to mark payroll as paid in DB');
    }
  };`);

fs.writeFileSync('src/pages/Payroll.tsx', content);
console.log('Payroll.tsx patched');
