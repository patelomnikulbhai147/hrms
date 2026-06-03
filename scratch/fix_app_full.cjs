const fs = require('fs');
let app = fs.readFileSync('src/App.tsx', 'utf8');

// 1. Rewrite all the useState hooks that are using localStorage.
app = app.replace(/const \[userAccounts, setUserAccounts\] = useState<UserAccount\[\]>\(\(\) => \{[\s\S]*?\}\);/g, `const [userAccounts, setUserAccounts] = useState<UserAccount[]>([]);`);
app = app.replace(/const \[companies, setCompanies\] = useState<Company\[\]>\(\(\) => \{[\s\S]*?\}\);/g, `const [companies, setCompanies] = useState<Company[]>([]);`);
app = app.replace(/const \[employees, setEmployees\] = useState<Employee\[\]>\(\[\w\W]*?\);/g, `const [employees, setEmployees] = useState<Employee[]>([]);`);
app = app.replace(/const \[attendance, setAttendance\] = useState<AttendanceRecord\[\]>\(\(\) => \{[\s\S]*?\}\);/g, `const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);`);
app = app.replace(/const \[leaves, setLeaves\] = useState<LeaveRequest\[\]>\(\(\) => \{[\s\S]*?\}\);/g, `const [leaves, setLeaves] = useState<LeaveRequest[]>([]);`);
app = app.replace(/const \[payroll, setPayroll\] = useState<PayrollRecord\[\]>\(\(\) => \{[\s\S]*?\}\);/g, `const [payroll, setPayroll] = useState<PayrollRecord[]>([]);`);
app = app.replace(/const \[documents, setDocuments\] = useState<Document\[\]>\(\(\) => \{[\s\S]*?\}\);/g, `const [documents, setDocuments] = useState<Document[]>([]);`);
app = app.replace(/const \[plans, setPlans\] = useState<SubscriptionPlan\[\]>\(\(\) => \{[\s\S]*?\}\);/g, `const [plans, setPlans] = useState<SubscriptionPlan[]>(defaultPlans);`);
app = app.replace(/const \[payments, setPayments\] = useState<PaymentRecord\[\]>\(\(\) => \{[\s\S]*?\}\);/g, `const [payments, setPayments] = useState<PaymentRecord[]>([]);`);
app = app.replace(/const \[notifications, setNotifications\] = useState<Notification\[\]>\(\(\) => \{[\s\S]*?\}\);/g, `const [notifications, setNotifications] = useState<Notification[]>([]);`);

// Remove localStorage.setItem from handleUpdateX
app = app.replace(/localStorage\.setItem\('hrms_accounts', JSON\.stringify\(next\)\);/g, '');
app = app.replace(/localStorage\.setItem\('hrms_companies', JSON\.stringify\(billingResult\.updatedCompanies\)\);/g, '');
app = app.replace(/localStorage\.setItem\('hrms_notifications', JSON\.stringify\(next\)\);/g, '');

// Insert hydrateAll
const hydrateStr = `
  const hydrateAll = async () => {
    try {
      const [
        usersData, companiesData, employeesData, leavesData, documentsData,
        paymentsData, notificationsData, payrollData, attendanceData
      ] = await Promise.all([
        api.users.getAll().catch(() => []),
        api.companies.getAll().catch(() => []),
        api.employees.getAll().catch(() => []),
        api.leaves.getAll().catch(() => []),
        api.documents.getAll().catch(() => []),
        api.payments.getAll().catch(() => []),
        api.notifications.getAll().catch(() => []),
        api.payroll.getAll().catch(() => []),
        api.attendance.getAll().catch(() => [])
      ]);

      if (usersData) setUserAccounts(usersData);
      
      const validCompanies = (companiesData && companiesData.length > 0) ? companiesData : defaultCompanies;
      const billingResult = calculateBranchBilling(validCompanies, 'c-gcri', defaultPlans);
      setCompanies(billingResult.updatedCompanies);

      if (employeesData) setEmployees(employeesData);
      if (leavesData) setLeaves(leavesData);
      if (documentsData) setDocuments(documentsData);
      if (paymentsData) setPayments(paymentsData);
      if (notificationsData && notificationsData.length > 0) {
        setNotifications(notificationsData);
      } else {
        setNotifications([{ id: 'n1', companyId: 'c-ahmedabad', type: 'system', message: 'Welcome to GCRI Ahmedabad Enterprise HRMS Platform!', timestamp: '2026-05-22 09:00', read: false, priority: 'medium' }]);
      }
      if (payrollData) setPayroll(payrollData);
      if (attendanceData) setAttendance(attendanceData);
    } catch (error) {
      console.error('Global hydration failed:', error);
    }
  };

  useEffect(() => {
    hydrateAll();
  }, []);

`;

app = app.replace("useEffect(() => {\n    document.documentElement.setAttribute('data-theme', theme);", hydrateStr + "\n  useEffect(() => {\n    document.documentElement.setAttribute('data-theme', theme);");

app = app.replace("localStorage.setItem('hrms_is_masquerading', 'false');", "localStorage.setItem('hrms_is_masquerading', 'false');\n    hydrateAll();");

fs.writeFileSync('src/App.tsx', app);
console.log('App.tsx rebuilt perfectly.');
