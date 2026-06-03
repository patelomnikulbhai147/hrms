const fs = require('fs');

let content = fs.readFileSync('src/pages/Attendance.tsx', 'utf8');

const useEffectRegex = /useEffect\(\(\) => \{[\s\S]*?\}, \[activeCompanyId, selectedDate, uniqueEmployees, attendance\]\);\n/m;
content = content.replace(useEffectRegex, '');

// Modify scopedRecords calculation
const replaceString = `const uniqueAttendance = getUniqueRecords(attendance, [a => \`\${a.employeeId}-\${a.date}\`]);
  const scopedRecords = uniqueAttendance.filter(a => isCompanyIdMatch(a.companyId, activeCompanyId));`;

const newString = `const uniqueAttendance = getUniqueRecords(attendance, [a => \`\${a.employeeId}-\${a.date}\`]);
  const dbScopedRecords = uniqueAttendance.filter(a => isCompanyIdMatch(a.companyId, activeCompanyId));
  
  // Dynamically generate missing records for today's view without saving to DB yet
  const scopedRecords = uniqueEmployees
    .filter(e => isCompanyIdMatch(e.companyId, activeCompanyId))
    .map(emp => {
      const existing = dbScopedRecords.find(a => a.employeeId === emp.id && a.date === selectedDate);
      if (existing) return existing;
      return {
        id: \`new-\${emp.id}-\${selectedDate}\`,
        companyId: emp.companyId,
        employeeId: emp.id,
        employeeName: emp.name,
        department: emp.department,
        date: selectedDate,
        clockIn: '',
        clockOut: '',
        hoursWorked: 0,
        status: 'Absent' as AttendanceStatus
      };
    });`;

content = content.replace(replaceString, newString);

fs.writeFileSync('src/pages/Attendance.tsx', content);
console.log('Attendance.tsx patched');
