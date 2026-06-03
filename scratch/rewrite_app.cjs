const fs = require('fs');
const file = 'src/App.tsx';
let app = fs.readFileSync(file, 'utf8');

const startMarker = '  // Persistent user credentials';
const endMarker = 'const handleUpdateNotifications = (updater: Notification[] | ((prev: Notification[]) => Notification[])) => {';

const startIndex = app.indexOf(startMarker);
const endIndex = app.indexOf(endMarker);

if (startIndex === -1 || endIndex === -1) {
    console.error("Markers not found");
    process.exit(1);
}

const replacement = `  // Persistent user credentials
  const [userAccounts, setUserAccounts] = useState<UserAccount[]>([]);

  // Persistent company list
  const [companies, setCompanies] = useState<Company[]>([]);

  // Persistent employees state
  const [employees, setEmployees] = useState<Employee[]>([]);

  // Persistent attendance records state
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);

  // Persistent leave requests state
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);

  // Persistent payroll records state
  const [payroll, setPayroll] = useState<PayrollRecord[]>([]);

  // Persistent documents compliance state
  const [documents, setDocuments] = useState<Document[]>([]);

  // Persistent SaaS plans state
  const [plans, setPlans] = useState<SubscriptionPlan[]>(defaultPlans);

  // Persistent SaaS transaction history state
  const [payments, setPayments] = useState<PaymentRecord[]>([]);

  // Persistent notifications state
  const [notifications, setNotifications] = useState<Notification[]>([]);

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

app = app.substring(0, startIndex) + replacement + app.substring(endIndex);

// Also remove localStorage sets in handler functions
app = app.replace(/localStorage\.setItem\('hrms_accounts', JSON\.stringify\(next\)\);/g, '');
app = app.replace(/localStorage\.setItem\('hrms_companies', JSON\.stringify\(billingResult\.updatedCompanies\)\);/g, '');
app = app.replace(/localStorage\.setItem\('hrms_notifications', JSON\.stringify\(next\)\);/g, '');
// For handleLogin:
app = app.replace("localStorage.setItem('hrms_is_masquerading', 'false');", "localStorage.setItem('hrms_is_masquerading', 'false');\n    hydrateAll();");

fs.writeFileSync(file, app);
console.log("App.tsx properly rewritten");
