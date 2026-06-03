const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf8');

// Replace state initializations with clean ones
content = content.replace(/const \[userAccounts, setUserAccounts\] = useState<UserAccount\[\]>\(\(\) => \{[\s\S]*?\}\);/g, 'const [userAccounts, setUserAccounts] = useState<UserAccount[]>([]);');
content = content.replace(/const \[companies, setCompanies\] = useState<Company\[\]>\(\(\) => \{[\s\S]*?\}\);/g, 'const [companies, setCompanies] = useState<Company[]>([]);');
content = content.replace(/const \[employees, setEmployees\] = useState<Employee\[\]>\(\(\) => \{[\s\S]*?\}\);/g, 'const [employees, setEmployees] = useState<Employee[]>([]);');
content = content.replace(/const \[attendance, setAttendance\] = useState<AttendanceRecord\[\]>\(\(\) => \{[\s\S]*?\}\);/g, 'const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);');
content = content.replace(/const \[leaves, setLeaves\] = useState<LeaveRequest\[\]>\(\(\) => \{[\s\S]*?\}\);/g, 'const [leaves, setLeaves] = useState<LeaveRequest[]>([]);');
content = content.replace(/const \[payroll, setPayroll\] = useState<PayrollRecord\[\]>\(\(\) => \{[\s\S]*?\}\);/g, 'const [payroll, setPayroll] = useState<PayrollRecord[]>([]);');
content = content.replace(/const \[documents, setDocuments\] = useState<Document\[\]>\(\(\) => \{[\s\S]*?\}\);/g, 'const [documents, setDocuments] = useState<Document[]>([]);');
content = content.replace(/const \[plans, setPlans\] = useState<SubscriptionPlan\[\]>\(\(\) => \{[\s\S]*?\}\);/g, 'const [plans, setPlans] = useState<SubscriptionPlan[]>([]);');
content = content.replace(/const \[payments, setPayments\] = useState<PaymentRecord\[\]>\(\(\) => \{[\s\S]*?\}\);/g, 'const [payments, setPayments] = useState<PaymentRecord[]>([]);');
content = content.replace(/const \[notifications, setNotifications\] = useState<Notification\[\]>\(\(\) => \{[\s\S]*?\}\);/g, 'const [notifications, setNotifications] = useState<Notification[]>([]);');

// Ensure they exist if not found
if (!content.includes('const [attendance, setAttendance]')) content = content.replace('const [employees, setEmployees] = useState<Employee[]>([]);', 'const [employees, setEmployees] = useState<Employee[]>([]);\\n  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);\\n  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);\\n  const [payroll, setPayroll] = useState<PayrollRecord[]>([]);\\n  const [documents, setDocuments] = useState<Document[]>([]);');

// Expose hydrateAll
content = content.replace(/useEffect\(\(\) => \{\n\s+const hydrateAll = async \(\) => \{/g, 'const hydrateAll = async () => {');
content = content.replace(/      \} catch \(error\) \{\n        console.error\('Global hydration failed:', error\);\n      \}\n    \};\n    hydrateAll\(\);\n  \}, \[\]\);/g, `      } catch (error) {
        console.error('Global hydration failed:', error);
      }
    };
  useEffect(() => { hydrateAll(); }, []);`);

// Call hydrateAll in handleLogin
content = content.replace(/setIsAuthenticated\(true\);\n\s+localStorage.setItem\('hrms_auth', 'true'\);/, "setIsAuthenticated(true);\\n      localStorage.setItem('hrms_auth', 'true');\\n      hydrateAll();");

fs.writeFileSync('src/App.tsx', content);
console.log('App.tsx repaired.');
