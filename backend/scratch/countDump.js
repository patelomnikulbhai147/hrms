const fs = require('fs');
const lines = fs.readFileSync(__dirname + '/../../corehrms_backup.sql', 'utf8').split('\n');
const tables = ['SubscriptionPlan','Company','Branch','User','Employee','Shift','Attendance','LeaveRequest','Overtime','Payroll','BranchPayroll','CompanyPayroll','PaymentRecord','Document','Notification','AuditLog','LoginAudit','PasswordResetToken'];
for (const t of tables) {
  const re = new RegExp('^COPY public\\."' + t + '" \\(([^)]*)\\) FROM stdin;\\s*$');
  let found = -1, count = 0;
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i].replace(/\r$/, ''))) {
      found = i;
      for (let j = i + 1; j < lines.length; j++) {
        const l = lines[j].replace(/\r$/, '');
        if (l === '\\.') break;
        if (l === '') continue;
        count++;
      }
      break;
    }
  }
  console.log(t.padEnd(18), found === -1 ? 'NOT FOUND' : ('header@' + found + '  dataRows=' + count));
}
