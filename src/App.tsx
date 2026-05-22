import { useState, useEffect } from 'react';
import { Sidebar, type PageId } from './components/layout/Sidebar';
import { Topbar } from './components/layout/Topbar';
import { Dashboard } from './pages/Dashboard';
import { Employees } from './pages/Employees';
import { Leaves } from './pages/Leaves';
import { Attendance } from './pages/Attendance';
import { Payroll } from './pages/Payroll';
import { Companies } from './pages/Companies';
import { Documents } from './pages/Documents';
import { Reports } from './pages/Reports';
import { Settings } from './pages/Settings';
import { Billing } from './pages/Billing';
import { Login, type UserAccount } from './pages/Login';
import {
  Role,
  Company,
  companies as defaultCompanies,
  attendanceRecords as defaultAttendance,
  leaveRequests as defaultLeaves,
  payrollRecords as defaultPayroll,
  documents as defaultDocuments,
  Employee,
  AttendanceRecord,
  LeaveRequest,
  PayrollRecord,
  Document,
  SubscriptionPlan,
  PaymentRecord,
  Notification
} from './data/mockData';
import { allExcelParsedEmployees } from './data/excelSeededData';

const pageTitles: Record<PageId, string> = {
  dashboard: 'Dashboard',
  companies: 'Companies',
  employees: 'Employees',
  leaves: 'Leave Management',
  payroll: 'Payroll',
  attendance: 'Attendance',
  documents: 'Documents',
  reports: 'Reports',
  settings: 'Settings',
  billing: 'SaaS Subscriptions',
};

const defaultUsers: UserAccount[] = [
  { id: 'u1', name: 'Super Admin', email: 'admin@platform.in', username: 'superadmin', passwordStr: 'admin123', role: 'Super Admin', companyId: '', status: 'Active', avatar: 'SA' }
];

const defaultPlans: SubscriptionPlan[] = [
  { id: 'sp1', name: 'Starter', priceMonthly: 1999, priceYearly: 19999, employeeLimit: 25, hrLimit: 2, storageLimit: '5 GB', payrollAccess: true, documentAccess: false },
  { id: 'sp2', name: 'Professional', priceMonthly: 4999, priceYearly: 49999, employeeLimit: 100, hrLimit: 5, storageLimit: '25 GB', payrollAccess: true, documentAccess: true },
  { id: 'sp3', name: 'Enterprise', priceMonthly: 12999, priceYearly: 129999, employeeLimit: 9999, hrLimit: 9999, storageLimit: '100 GB', payrollAccess: true, documentAccess: true }
];

const defaultPayments: PaymentRecord[] = [];

const defaultEmployees: Employee[] = allExcelParsedEmployees.map(emp => {
  return {
    ...emp,
    role: 'Staff',
    status: (emp.status || 'Active') as any
  };
});

export const SAFE_COMPANY_FALLBACK: any = {
  id: '',
  name: 'Global Workspace',
  domain: '',
  adminName: '',
  adminEmail: '',
  phone: '',
  industry: '',
  status: 'Active',
  employeeCount: 0,
  joinDate: '',
  plan: 'Starter',
  logo: '',
  pfRate: 12,
  esicRate: 3.25,
  basicPercent: 50,
  profTaxRate: 200,
  overtimeRate: 1.5,
  address: '',
  email: '',
  primaryColor: '#3b82f6',
  headerText: 'GLOBAL COMPANY WORKSPACE',
  footerText: '',
  signatureText: '',
  themeStyle: 'Modern',
  paymentStatus: 'Paid',
  renewalDate: '',
  gstNumber: '',
  billingAddress: '',
  subscriptionPrice: 0,
  billingCycle: 'Monthly',
  accountStatus: 'Active'
};

const seedDataForCompany = (companyId: string, companyName: string) => {
  const seededEmployees: Employee[] = [
    {
      id: `emp-${companyId}-1`,
      employeeId: `EMP-${companyId.toUpperCase()}-01`,
      companyId,
      name: 'Arjun Mehta',
      email: `arjun.mehta@${companyName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'company'}.com`,
      phone: '+91 98123 45671',
      department: 'Engineering',
      designation: 'Senior Developer',
      role: 'Staff',
      status: 'Active',
      joinDate: '2025-03-10',
      location: 'Mumbai, India',
      avatar: 'AM',
      salary: 950000,
      manager: 'Company Head'
    },
    {
      id: `emp-${companyId}-2`,
      employeeId: `EMP-${companyId.toUpperCase()}-02`,
      companyId,
      name: 'Kavita Rao',
      email: `kavita.rao@${companyName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'company'}.com`,
      phone: '+91 98123 45672',
      department: 'Human Resources',
      designation: 'HR Specialist',
      role: 'Staff',
      status: 'Active',
      joinDate: '2025-06-15',
      location: 'Bangalore, India',
      avatar: 'KR',
      salary: 620000,
      manager: 'Company Head'
    },
    {
      id: `emp-${companyId}-3`,
      employeeId: `EMP-${companyId.toUpperCase()}-03`,
      companyId,
      name: 'Siddharth Nair',
      email: `siddharth.nair@${companyName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'company'}.com`,
      phone: '+91 98123 45673',
      department: 'Sales',
      designation: 'Account Executive',
      role: 'Staff',
      status: 'Active',
      joinDate: '2025-08-01',
      location: 'Delhi, India',
      avatar: 'SN',
      salary: 780000,
      manager: 'Company Head'
    },
    {
      id: `emp-${companyId}-4`,
      employeeId: `EMP-${companyId.toUpperCase()}-04`,
      companyId,
      name: 'Nisha Desai',
      email: `nisha.desai@${companyName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'company'}.com`,
      phone: '+91 98123 45674',
      department: 'Finance',
      designation: 'Finance Lead',
      role: 'Staff',
      status: 'Active',
      joinDate: '2025-11-20',
      location: 'Pune, India',
      avatar: 'ND',
      salary: 850000,
      manager: 'Company Head'
    }
  ];

  const seededLeaves: LeaveRequest[] = [
    {
      id: `l-seeded-${companyId}-1`,
      companyId,
      employeeId: `emp-${companyId}-2`,
      employeeName: 'Kavita Rao',
      department: 'Human Resources',
      leaveType: 'Sick',
      fromDate: '2026-05-18',
      toDate: '2026-05-19',
      days: 2,
      reason: 'Suffering from seasonal fever. Medical certificate submitted.',
      status: 'Approved',
      appliedOn: '2026-05-17'
    },
    {
      id: `l-seeded-${companyId}-2`,
      companyId,
      employeeId: `emp-${companyId}-3`,
      employeeName: 'Siddharth Nair',
      department: 'Sales',
      leaveType: 'Casual',
      fromDate: '2026-05-24',
      toDate: '2026-05-26',
      days: 3,
      reason: 'Attending family function out of town.',
      status: 'Pending',
      appliedOn: '2026-05-20'
    }
  ];

  const todayStr = new Date().toISOString().split('T')[0];
  const seededAttendance: AttendanceRecord[] = seededEmployees.map((emp, idx) => ({
    id: `a-seeded-${companyId}-${idx}`,
    companyId,
    employeeId: emp.id,
    employeeName: emp.name,
    department: emp.department,
    date: todayStr,
    clockIn: idx === 2 ? '09:45' : '09:12',
    clockOut: idx === 1 ? '17:00' : '18:15',
    hoursWorked: idx === 2 ? 7.5 : 9.0,
    status: idx === 2 ? 'Late' : (idx === 1 ? 'Half Day' : 'Present')
  }));

  return { seededEmployees, seededLeaves, seededAttendance };
};

export default function App() {
  // Auto-migration: check if browser has cached the old mock database or is missing our new branch seeding, and clear it for a clean slate
  if (typeof window !== 'undefined') {
    const realMigrated = localStorage.getItem('hrms_real_migration_v2');
    if (!realMigrated) {
      localStorage.removeItem('hrms_accounts');
      localStorage.removeItem('hrms_companies');
      localStorage.removeItem('hrms_employees');
      localStorage.removeItem('hrms_attendance');
      localStorage.removeItem('hrms_leaves');
      localStorage.removeItem('hrms_payroll');
      localStorage.removeItem('hrms_documents');
      localStorage.removeItem('hrms_payments');
      localStorage.setItem('hrms_real_migration_v2', 'true');
      window.location.reload();
    }
  }

  // Persistent user credentials
  const [userAccounts, setUserAccounts] = useState<UserAccount[]>(() => {
    const raw = localStorage.getItem('hrms_accounts');
    if (raw) return JSON.parse(raw);
    localStorage.setItem('hrms_accounts', JSON.stringify(defaultUsers));
    return defaultUsers;
  });

  // Persistent company list (including address and primaryColor configs!)
  const [companies, setCompanies] = useState<Company[]>(() => {
    const raw = localStorage.getItem('hrms_companies');
    if (raw) {
      try {
        const parsed: Company[] = JSON.parse(raw);
        // sanitize renewalDate fields that may be invalid
        const sanitized = parsed.map(c => {
          if (!c.renewalDate) return c;
          const d = new Date(c.renewalDate);
          if (isNaN(d.getTime())) {
            return { ...c, renewalDate: '' };
          }
          return c;
        });
        // persist sanitized back
        localStorage.setItem('hrms_companies', JSON.stringify(sanitized));
        return sanitized;
      } catch (e) {
        localStorage.setItem('hrms_companies', JSON.stringify(defaultCompanies));
        return defaultCompanies;
      }
    }
    localStorage.setItem('hrms_companies', JSON.stringify(defaultCompanies));
    return defaultCompanies;
  });

  // Persistent employees state
  const [employees, setEmployees] = useState<Employee[]>(() => {
    const raw = localStorage.getItem('hrms_employees');
    if (raw) return JSON.parse(raw);
    localStorage.setItem('hrms_employees', JSON.stringify(defaultEmployees));
    return defaultEmployees;
  });

  // Persistent attendance records state
  const [attendance, setAttendance] = useState<AttendanceRecord[]>(() => {
    const raw = localStorage.getItem('hrms_attendance');
    if (raw) return JSON.parse(raw);
    localStorage.setItem('hrms_attendance', JSON.stringify(defaultAttendance));
    return defaultAttendance;
  });

  // Persistent leave requests state
  const [leaves, setLeaves] = useState<LeaveRequest[]>(() => {
    const raw = localStorage.getItem('hrms_leaves');
    if (raw) return JSON.parse(raw);
    localStorage.setItem('hrms_leaves', JSON.stringify(defaultLeaves));
    return defaultLeaves;
  });

  // Persistent payroll records state
  const [payroll, setPayroll] = useState<PayrollRecord[]>(() => {
    const raw = localStorage.getItem('hrms_payroll');
    if (raw) return JSON.parse(raw);
    localStorage.setItem('hrms_payroll', JSON.stringify(defaultPayroll));
    return defaultPayroll;
  });

  // Persistent documents compliance state
  const [documents, setDocuments] = useState<Document[]>(() => {
    const raw = localStorage.getItem('hrms_documents');
    if (raw) return JSON.parse(raw);
    localStorage.setItem('hrms_documents', JSON.stringify(defaultDocuments));
    return defaultDocuments;
  });

  // Persistent SaaS plans state
  const [plans, setPlans] = useState<SubscriptionPlan[]>(() => {
    const raw = localStorage.getItem('hrms_plans');
    if (raw) return JSON.parse(raw);
    localStorage.setItem('hrms_plans', JSON.stringify(defaultPlans));
    return defaultPlans;
  });

  // Persistent SaaS transaction history state
  const [payments, setPayments] = useState<PaymentRecord[]>(() => {
    const raw = localStorage.getItem('hrms_payments');
    if (raw) return JSON.parse(raw);
    localStorage.setItem('hrms_payments', JSON.stringify(defaultPayments));
    return defaultPayments;
  });

  const handleUpdatePlans = (updater: SubscriptionPlan[] | ((prev: SubscriptionPlan[]) => SubscriptionPlan[])) => {
    const next = typeof updater === 'function' ? updater(plans) : updater;
    setPlans(next);
    localStorage.setItem('hrms_plans', JSON.stringify(next));
  };

  const handleUpdatePayments = (updater: PaymentRecord[] | ((prev: PaymentRecord[]) => PaymentRecord[])) => {
    const next = typeof updater === 'function' ? updater(payments) : updater;
    setPayments(next);
    localStorage.setItem('hrms_payments', JSON.stringify(next));
  };

  // Persistent notifications state
  const [notifications, setNotifications] = useState<Notification[]>(() => {
    const raw = localStorage.getItem('hrms_notifications');
    if (raw) return JSON.parse(raw);
    const initialList: Notification[] = [
      { id: 'n1', companyId: 'c-ahmedabad', type: 'system', message: 'Welcome to GCRI Ahmedabad Enterprise HRMS Platform!', timestamp: '2026-05-22 09:00', read: false, priority: 'medium' }
    ];
    localStorage.setItem('hrms_notifications', JSON.stringify(initialList));
    return initialList;
  });

  const handleUpdateNotifications = (updater: Notification[] | ((prev: Notification[]) => Notification[])) => {
    const next = typeof updater === 'function' ? updater(notifications) : updater;
    setNotifications(next);
    localStorage.setItem('hrms_notifications', JSON.stringify(next));
  };

  const handleUpdateAccounts = (updater: UserAccount[] | ((prev: UserAccount[]) => UserAccount[])) => {
    const next = typeof updater === 'function' ? updater(userAccounts) : updater;
    setUserAccounts(next);
    localStorage.setItem('hrms_accounts', JSON.stringify(next));

    if (authProfile) {
      const updatedProfile = next.find(u => u.id === authProfile.id);
      if (updatedProfile) {
        if (updatedProfile.status === 'Disabled') {
          handleLogout();
        } else {
          setAuthProfile(updatedProfile);
          setRole(updatedProfile.role);
          localStorage.setItem('hrms_profile', JSON.stringify(updatedProfile));
        }
      }
    }
  };

  const handleUpdateCompanies = (updater: Company[] | ((prev: Company[]) => Company[])) => {
    const next = typeof updater === 'function' ? updater(companies) : updater;
    setCompanies(next);
    localStorage.setItem('hrms_companies', JSON.stringify(next));
  };

  const handleUpdateEmployees = (updater: Employee[] | ((prev: Employee[]) => Employee[])) => {
    const nextEmployees = typeof updater === 'function' ? updater(employees) : updater;
    setEmployees(nextEmployees);
    localStorage.setItem('hrms_employees', JSON.stringify(nextEmployees));

    // Reactive sync to Payroll: If employee salary changed, recalculate
    setPayroll(prevPayroll => {
      let changed = false;
      const nextPayroll = prevPayroll.map(p => {
        const emp = nextEmployees.find(e => e.id === p.employeeId);
        if (emp && emp.salary !== p.salary) {
          const comp = companies.find(c => c.id === emp.companyId) || SAFE_COMPANY_FALLBACK;
          const basicPercent = comp.basicPercent || 50;
          const ctcMonthly = Math.round(emp.salary / 12);
          const basicSalary = Math.round(ctcMonthly * (basicPercent / 100));
          const hra = Math.round(basicSalary * 0.4);
          const special = Math.max(0, ctcMonthly - basicSalary - hra);
          const allowances = hra + special;
          const pfRate = comp.pfRate || 12;
          const esicRate = comp.esicRate || 0.75;
          const profTax = comp.profTaxRate || 200;

          // Unpaid leaves deduction
          const empUnpaidLeaves = leaves.filter(l => 
            l.employeeId === emp.id && 
            l.status === 'Approved' && 
            l.leaveType === 'Unpaid' &&
            l.fromDate.includes('-06-')
          );
          const unpaidDays = empUnpaidLeaves.reduce((sum, l) => sum + l.days, 0);
          const unpaidDeduction = Math.round((ctcMonthly / 30) * unpaidDays);

          const pfDeduction = Math.round(basicSalary * (pfRate / 100));
          const esicDeduction = Math.round(basicSalary * (esicRate / 100));
          const baseDeductions = pfDeduction + esicDeduction + profTax;
          const deductions = baseDeductions + unpaidDeduction;
          
          const bonus = p.bonus || 0;
          const tax = p.tax || 0;
          const netSalary = basicSalary + allowances + bonus - deductions - tax;

          changed = true;
          return {
            ...p,
            salary: emp.salary,
            basicSalary,
            allowances,
            deductions,
            netSalary
          };
        }
        return p;
      });
      if (changed) {
        localStorage.setItem('hrms_payroll', JSON.stringify(nextPayroll));
      }
      return nextPayroll;
    });
  };

  const handleUpdateAttendance = (updater: AttendanceRecord[] | ((prev: AttendanceRecord[]) => AttendanceRecord[])) => {
    const next = typeof updater === 'function' ? updater(attendance) : updater;
    setAttendance(next);
    localStorage.setItem('hrms_attendance', JSON.stringify(next));
  };

  const handleUpdateLeaves = (updater: LeaveRequest[] | ((prev: LeaveRequest[]) => LeaveRequest[])) => {
    const nextLeaves = typeof updater === 'function' ? updater(leaves) : updater;
    setLeaves(nextLeaves);
    localStorage.setItem('hrms_leaves', JSON.stringify(nextLeaves));

    // Reactive sync to Payroll: If leaves updated, recalculate unpaid leave deductions
    setPayroll(prevPayroll => {
      let changed = false;
      const nextPayroll = prevPayroll.map(p => {
        const emp = employees.find(e => e.id === p.employeeId);
        if (!emp) return p;
        const comp = companies.find(c => c.id === emp.companyId) || SAFE_COMPANY_FALLBACK;
        const basicPercent = comp.basicPercent || 50;
        const ctcMonthly = Math.round(emp.salary / 12);
        const basicSalary = Math.round(ctcMonthly * (basicPercent / 100));
        const hra = Math.round(basicSalary * 0.4);
        const special = Math.max(0, ctcMonthly - basicSalary - hra);
        const allowances = hra + special;
        const pfRate = comp.pfRate || 12;
        const esicRate = comp.esicRate || 0.75;
        const profTax = comp.profTaxRate || 200;
        
        // Unpaid leave deduction
        const empUnpaidLeaves = nextLeaves.filter(l => 
          l.employeeId === emp.id && 
          l.status === 'Approved' && 
          l.leaveType === 'Unpaid' &&
          l.fromDate.includes('-06-')
        );
        const unpaidDays = empUnpaidLeaves.reduce((sum, l) => sum + l.days, 0);
        const unpaidDeduction = Math.round((ctcMonthly / 30) * unpaidDays);

        const pfDeduction = Math.round(basicSalary * (pfRate / 100));
        const esicDeduction = Math.round(basicSalary * (esicRate / 100));
        const baseDeductions = pfDeduction + esicDeduction + profTax;
        const deductions = baseDeductions + unpaidDeduction;

        const bonus = p.bonus || 0;
        const tax = p.tax || 0;
        const netSalary = basicSalary + allowances + bonus - deductions - tax;

        if (p.deductions !== deductions || p.netSalary !== netSalary) {
          changed = true;
          return {
            ...p,
            deductions,
            netSalary
          };
        }
        return p;
      });
      if (changed) {
        localStorage.setItem('hrms_payroll', JSON.stringify(nextPayroll));
      }
      return nextPayroll;
    });
  };

  const handleUpdatePayroll = (updater: PayrollRecord[] | ((prev: PayrollRecord[]) => PayrollRecord[])) => {
    const nextPayroll = typeof updater === 'function' ? updater(payroll) : updater;
    setPayroll(nextPayroll);
    localStorage.setItem('hrms_payroll', JSON.stringify(nextPayroll));

    // Reactive sync to Employees: Update employee profiles with new derived salary
    setEmployees(prevEmployees => {
      let changed = false;
      const nextEmployees = prevEmployees.map(emp => {
        const pay = nextPayroll.find(p => p.employeeId === emp.id && p.month === 'June');
        if (pay) {
          const derivedAnnualSalary = (pay.basicSalary + pay.allowances) * 12;
          if (emp.salary !== derivedAnnualSalary) {
            changed = true;
            return {
              ...emp,
              salary: derivedAnnualSalary
            };
          }
        }
        return emp;
      });
      if (changed) {
        localStorage.setItem('hrms_employees', JSON.stringify(nextEmployees));
      }
      return nextEmployees;
    });
  };

  const handleUpdateDocuments = (updater: Document[] | ((prev: Document[]) => Document[])) => {
    const next = typeof updater === 'function' ? updater(documents) : updater;
    setDocuments(next);
    localStorage.setItem('hrms_documents', JSON.stringify(next));
  };

  // Authentication states
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem('hrms_auth') === 'true';
  });
  const [authProfile, setAuthProfile] = useState<UserAccount | null>(() => {
    const raw = localStorage.getItem('hrms_profile');
    return raw ? JSON.parse(raw) : null;
  });

  const [currentPage, setCurrentPage] = useState<PageId>(() => {
    const raw = localStorage.getItem('hrms_current_page');
    return (raw as PageId) || 'dashboard';
  });
  const [role, setRole] = useState<Role>(() => {
    const rawProfile = localStorage.getItem('hrms_profile');
    if (rawProfile) {
      const profile = JSON.parse(rawProfile);
      return profile.role;
    }
    return 'Super Admin';
  });
  const [activeCompanyId, setActiveCompanyId] = useState<string>(() => {
    const persisted = localStorage.getItem('hrms_active_company_id');
    if (persisted) return persisted;
    const rawProfile = localStorage.getItem('hrms_profile');
    if (rawProfile) {
      const profile = JSON.parse(rawProfile);
      return profile.companyId || 'c-ahmedabad';
    }
    return 'c-ahmedabad';
  }); 
  const [isMasquerading, setIsMasquerading] = useState<boolean>(() => {
    return localStorage.getItem('hrms_is_masquerading') === 'true';
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const handleLogin = (profile: UserAccount) => {
    setAuthProfile(profile);
    setIsAuthenticated(true);
    localStorage.setItem('hrms_auth', 'true');
    localStorage.setItem('hrms_profile', JSON.stringify(profile));
    setRole(profile.role);
    const initialCompanyId = profile.companyId || 'c-ahmedabad';
    setActiveCompanyId(initialCompanyId);
    localStorage.setItem('hrms_active_company_id', initialCompanyId);
    setCurrentPage('dashboard');
    localStorage.setItem('hrms_current_page', 'dashboard');
    setIsMasquerading(false);
    localStorage.setItem('hrms_is_masquerading', 'false');
  };

  const handleLogout = () => {
    localStorage.removeItem('hrms_auth');
    localStorage.removeItem('hrms_profile');
    localStorage.removeItem('hrms_current_page');
    localStorage.removeItem('hrms_active_company_id');
    localStorage.removeItem('hrms_is_masquerading');
    setAuthProfile(null);
    setIsAuthenticated(false);
    setIsMasquerading(false);
  };

  const handleNavigate = (page: PageId) => {
    setCurrentPage(page);
    localStorage.setItem('hrms_current_page', page);
  };

  const handleCompanyChange = (companyId: string) => {
    // Only allow Super Admin to switch active company directly (masquerade overrides)
    if (resolvedRole !== 'Super Admin') return;
    setActiveCompanyId(companyId);
    localStorage.setItem('hrms_active_company_id', companyId);
    setCurrentPage('dashboard');
    localStorage.setItem('hrms_current_page', 'dashboard');
  };

  const handleStartMasquerade = (companyId: string) => {
    setActiveCompanyId(companyId);
    localStorage.setItem('hrms_active_company_id', companyId);
    setIsMasquerading(true);
    localStorage.setItem('hrms_is_masquerading', 'true');
    setRole('Company Head');
    setCurrentPage('dashboard');
    localStorage.setItem('hrms_current_page', 'dashboard');
  };

  const handleExitMasquerade = () => {
    setIsMasquerading(false);
    localStorage.setItem('hrms_is_masquerading', 'false');
    setRole('Super Admin');
    setActiveCompanyId('c-ahmedabad');
    localStorage.setItem('hrms_active_company_id', 'c-ahmedabad');
    setCurrentPage('companies');
    localStorage.setItem('hrms_current_page', 'companies');
  };

  const resolvedRole = isMasquerading ? 'Company Head' : role;

  const resolvedCompanyId = (authProfile?.role !== 'Super Admin' && !isMasquerading)
    ? (authProfile?.companyId || 'c-ahmedabad')
    : activeCompanyId;

  // Synchronous auto-seeding deactivated for clean SaaS startup environment

  useEffect(() => {
    if (resolvedRole === 'Super Admin' && ['employees', 'leaves', 'payroll', 'documents', 'reports'].includes(currentPage)) {
      setCurrentPage('dashboard');
      localStorage.setItem('hrms_current_page', 'dashboard');
    } else if ((resolvedRole === 'Company Head' || resolvedRole === 'HR') && ['companies', 'billing'].includes(currentPage)) {
      setCurrentPage('dashboard');
      localStorage.setItem('hrms_current_page', 'dashboard');
    } else if (resolvedRole === 'Employee' && currentPage !== 'payroll') {
      setCurrentPage('payroll');
      localStorage.setItem('hrms_current_page', 'payroll');
    }
  }, [resolvedRole, currentPage]);

  if (!isAuthenticated || !authProfile) {
    return <Login userAccounts={userAccounts} companies={companies} onLogin={handleLogin} />;
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return (
          <Dashboard
            role={resolvedRole}
            onNavigate={handleNavigate}
            activeCompanyId={resolvedCompanyId}
            onStartMasquerade={handleStartMasquerade}
            companies={companies}
            employees={employees}
            attendance={attendance}
            leaves={leaves}
            payroll={payroll}
            documents={documents}
            plans={plans}
            notifications={notifications}
            onUpdateNotifications={handleUpdateNotifications}
            onUpdateCompanies={handleUpdateCompanies}
            onUpdatePayments={handleUpdatePayments}
            onUpdateEmployees={handleUpdateEmployees}
            onUpdatePayroll={handleUpdatePayroll}
          />
        );
      case 'companies':
        return (
          <Companies
            _role={resolvedRole}
            companies={companies}
            onUpdateCompanies={handleUpdateCompanies}
            userAccounts={userAccounts}
            onUpdateAccounts={handleUpdateAccounts}
            onStartMasquerade={handleStartMasquerade}
            plans={plans}
            employees={employees}
          />
        );
      case 'billing':
        return (
          <Billing
            companies={companies}
            onUpdateCompanies={handleUpdateCompanies}
            plans={plans}
            onUpdatePlans={handleUpdatePlans}
            payments={payments}
            onUpdatePayments={handleUpdatePayments}
          />
        );
      case 'employees':
        return (
          <Employees
            role={resolvedRole}
            activeCompanyId={resolvedCompanyId}
            userAccounts={userAccounts}
            onUpdateAccounts={handleUpdateAccounts}
            employees={employees}
            onUpdateEmployees={handleUpdateEmployees}
            leaves={leaves}
          />
        );
      case 'leaves':
        return (
          <Leaves
            role={resolvedRole}
            activeCompanyId={resolvedCompanyId}
            leaves={leaves}
            onUpdateLeaves={handleUpdateLeaves}
            _employees={employees}
            authProfile={authProfile}
          />
        );
      case 'attendance':
        return (
          <Attendance
            role={resolvedRole}
            activeCompanyId={resolvedCompanyId}
            attendance={attendance}
            onUpdateAttendance={handleUpdateAttendance}
            employees={employees}
          />
        );
      case 'payroll':
        return (
          <Payroll
            role={resolvedRole}
            activeCompanyId={resolvedCompanyId}
            companies={companies}
            payroll={payroll}
            onUpdatePayroll={handleUpdatePayroll}
            employees={employees}
            authProfile={authProfile}
          />
        );
      case 'documents':
        return (
          <Documents
            role={resolvedRole}
            activeCompanyId={resolvedCompanyId}
            companies={companies}
            documents={documents}
            onUpdateDocuments={handleUpdateDocuments}
            employees={employees}
          />
        );
      case 'reports':
        return (
          <Reports
            role={resolvedRole}
            activeCompanyId={resolvedCompanyId}
            companies={companies}
            employees={employees}
            attendance={attendance}
            payroll={payroll}
            leaves={leaves}
          />
        );
      case 'settings':
        return (
          <Settings
            role={resolvedRole}
            activeCompanyId={resolvedCompanyId}
            companies={companies}
            onUpdateCompanies={handleUpdateCompanies}
          />
        );
      default:
        return (
          <Dashboard
            role={resolvedRole}
            onNavigate={handleNavigate}
            activeCompanyId={resolvedCompanyId}
            onStartMasquerade={handleStartMasquerade}
            companies={companies}
            employees={employees}
            attendance={attendance}
            leaves={leaves}
            payroll={payroll}
            documents={documents}
            plans={plans}
            onUpdateCompanies={handleUpdateCompanies}
            onUpdatePayments={handleUpdatePayments}
            onUpdateEmployees={handleUpdateEmployees}
            onUpdatePayroll={handleUpdatePayroll}
          />
        );
    }
  };

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden font-sans antialiased text-gray-800">
      <Sidebar
        currentPage={currentPage}
        onNavigate={handleNavigate}
        role={resolvedRole}
        collapsed={sidebarCollapsed}
        isMasquerading={isMasquerading}
        onExitMasquerade={handleExitMasquerade}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Topbar
          onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
          role={resolvedRole}
          onRoleChange={(newRole) => setRole(newRole)}
          activeCompanyId={resolvedCompanyId}
          onCompanyChange={handleCompanyChange}
          isMasquerading={isMasquerading}
          onExitMasquerade={handleExitMasquerade}
          userName={authProfile.name}
          userAvatar={authProfile.avatar}
          pageTitle={pageTitles[currentPage] || 'HRMS'}
          companies={companies}
          notifications={notifications}
          onUpdateNotifications={handleUpdateNotifications}
        />

        <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-gray-50">
          <div className="max-w-7xl mx-auto">
            {renderPage()}
          </div>
        </main>
      </div>
    </div>
  );
}
export { App };
