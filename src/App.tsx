import React, { useState, useEffect } from 'react';
import { Sidebar, type PageId } from './components/layout/Sidebar';
import { Topbar } from './components/layout/Topbar';
import { Dashboard } from './pages/Dashboard';
import { Employees } from './pages/Employees';
import { Leaves } from './pages/Leaves';
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
  employees as defaultEmployees,
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
  PaymentRecord
} from './data/mockData';

const pageTitles: Record<PageId, string> = {
  dashboard: 'Dashboard',
  companies: 'Companies',
  employees: 'Employees',
  leaves: 'Leave Management',
  payroll: 'Payroll',
  documents: 'Documents',
  reports: 'Reports',
  settings: 'Settings',
  billing: 'SaaS Subscriptions',
};

const defaultUsers: UserAccount[] = [
  { id: 'u1', name: 'Super Admin', email: 'admin@platform.in', username: 'superadmin', passwordStr: 'admin123', role: 'Super Admin', companyId: '', status: 'Active', avatar: 'SA' },
  { id: 'u2', name: 'Vikram Singh', email: 'vikram.singh@technova.in', username: 'vikram', passwordStr: 'head123', role: 'Company Head', companyId: 'c1', status: 'Active', avatar: 'VS' },
  { id: 'u3', name: 'Priya Sharma', email: 'priya.sharma@technova.in', username: 'priya', passwordStr: 'hr123', role: 'HR', companyId: 'c1', status: 'Active', avatar: 'PS' },
  { id: 'u4', name: 'Sneha Patel', email: 'sneha.patel@quantumdatalabs.ai', username: 'sneha', passwordStr: 'head123', role: 'Company Head', companyId: 'c2', status: 'Active', avatar: 'SP' },
  { id: 'u5', name: 'Sunita Joshi', email: 'sunita.joshi@healthfirst.in', username: 'sunita', passwordStr: 'hr123', role: 'HR', companyId: 'c3', status: 'Active', avatar: 'SJ' },
];

const defaultPlans: SubscriptionPlan[] = [
  { id: 'sp1', name: 'Starter', priceMonthly: 1999, priceYearly: 19999, employeeLimit: 25, hrLimit: 2, storageLimit: '5 GB', payrollAccess: true, documentAccess: false },
  { id: 'sp2', name: 'Professional', priceMonthly: 4999, priceYearly: 49999, employeeLimit: 100, hrLimit: 5, storageLimit: '25 GB', payrollAccess: true, documentAccess: true },
  { id: 'sp3', name: 'Enterprise', priceMonthly: 12999, priceYearly: 129999, employeeLimit: 9999, hrLimit: 9999, storageLimit: '100 GB', payrollAccess: true, documentAccess: true }
];

const defaultPayments: PaymentRecord[] = [
  { id: 'tx1', companyId: 'c1', companyName: 'TechNova Solutions', amount: 4999, paymentDate: '2026-05-10 14:30', invoiceNumber: 'INV-2026-001', planType: 'Professional', paymentMode: 'UPI', transactionStatus: 'Success' },
  { id: 'tx2', companyId: 'c2', companyName: 'Quantum Data Labs', amount: 12999, paymentDate: '2026-05-12 11:15', invoiceNumber: 'INV-2026-002', planType: 'Enterprise', paymentMode: 'Bank Transfer', transactionStatus: 'Success' },
  { id: 'tx3', companyId: 'c3', companyName: 'HealthFirst Ltd', amount: 1999, paymentDate: '2026-04-18 16:45', invoiceNumber: 'INV-2026-003', planType: 'Starter', paymentMode: 'Card', transactionStatus: 'Success' },
  { id: 'tx4', companyId: 'c3', companyName: 'HealthFirst Ltd', amount: 1999, paymentDate: '2026-05-18 09:00', invoiceNumber: 'INV-2026-004', planType: 'Starter', paymentMode: 'Card', transactionStatus: 'Failed' }
];

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
    const next = typeof updater === 'function' ? updater(employees) : updater;
    setEmployees(next);
    localStorage.setItem('hrms_employees', JSON.stringify(next));
  };

  const handleUpdateAttendance = (updater: AttendanceRecord[] | ((prev: AttendanceRecord[]) => AttendanceRecord[])) => {
    const next = typeof updater === 'function' ? updater(attendance) : updater;
    setAttendance(next);
    localStorage.setItem('hrms_attendance', JSON.stringify(next));
  };

  const handleUpdateLeaves = (updater: LeaveRequest[] | ((prev: LeaveRequest[]) => LeaveRequest[])) => {
    const next = typeof updater === 'function' ? updater(leaves) : updater;
    setLeaves(next);
    localStorage.setItem('hrms_leaves', JSON.stringify(next));
  };

  const handleUpdatePayroll = (updater: PayrollRecord[] | ((prev: PayrollRecord[]) => PayrollRecord[])) => {
    const next = typeof updater === 'function' ? updater(payroll) : updater;
    setPayroll(next);
    localStorage.setItem('hrms_payroll', JSON.stringify(next));
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
      return profile.companyId || 'c1';
    }
    return 'c1';
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
    const initialCompanyId = profile.companyId || 'c1';
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
    setActiveCompanyId('c1');
    localStorage.setItem('hrms_active_company_id', 'c1');
    setCurrentPage('companies');
    localStorage.setItem('hrms_current_page', 'companies');
  };

  const resolvedRole = isMasquerading ? 'Company Head' : (authProfile?.role || 'Super Admin');

  const resolvedCompanyId = (authProfile?.role !== 'Super Admin' && !isMasquerading)
    ? (authProfile?.companyId || 'c1')
    : activeCompanyId;

  // Synchronous auto-seeding hook for registered companies (including newly created ones!)
  useEffect(() => {
    let employeesChanged = false;
    let leavesChanged = false;
    let attendanceChanged = false;
    let payrollChanged = false;

    const nextEmployees = [...employees];
    const nextLeaves = [...leaves];
    const nextAttendance = [...attendance];
    const nextPayroll = [...payroll];

    companies.forEach(company => {
      // If a company has 0 employees, seed full starter pack data for it!
      const hasEmployees = employees.some(e => e.companyId === company.id);
      if (!hasEmployees) {
        const { seededEmployees, seededLeaves, seededAttendance } = seedDataForCompany(company.id, company.name);
        
        nextEmployees.push(...seededEmployees);
        employeesChanged = true;

        // Only seed leaves and attendance if they don't already have records for this company
        const hasLeaves = leaves.some(l => l.companyId === company.id);
        if (!hasLeaves) {
          nextLeaves.push(...seededLeaves);
          leavesChanged = true;
        }

        const hasAttendance = attendance.some(a => a.companyId === company.id);
        if (!hasAttendance) {
          nextAttendance.push(...seededAttendance);
          attendanceChanged = true;
        }
      }

      // Automatically generate active payroll records for June 2026 if none exist
      const hasPayroll = payroll.some(p => p.companyId === company.id && p.month === 'June');
      if (!hasPayroll) {
        // Calculate payroll for the employees of this company
        const compEmps = nextEmployees.filter(e => e.companyId === company.id);
        compEmps.forEach((emp, index) => {
          const basicPercent = company.basicPercent || 50;
          const ctcMonthly = Math.round(emp.salary / 12);
          const basicSalary = Math.round(ctcMonthly * (basicPercent / 100));
          
          const hra = Math.round(basicSalary * 0.4);
          const special = Math.max(0, ctcMonthly - basicSalary - hra);
          const allowances = hra + special;

          const pfRate = company.pfRate || 12;
          const esicRate = company.esicRate || 0.75;
          const profTax = company.profTaxRate || 200;

          const pfDeduction = Math.round(basicSalary * (pfRate / 100));
          const esicDeduction = Math.round(basicSalary * (esicRate / 100));
          const deductions = pfDeduction + esicDeduction + profTax;
          const netSalary = ctcMonthly - deductions;

          let initialStatus: 'draft' | 'prepared' | 'verified' | 'paid' = 'draft';
          if (index === 0) initialStatus = 'draft';
          else if (index === 1) initialStatus = 'prepared'; 
          else if (index === 2) initialStatus = 'verified'; 
          else if (index === 3) initialStatus = 'paid'; 

          nextPayroll.push({
            id: `p-init-${company.id}-${emp.id}`,
            companyId: company.id,
            employeeId: emp.id,
            employeeName: emp.name,
            department: emp.department,
            month: 'June',
            year: 2026,
            basicSalary,
            allowances,
            deductions,
            netSalary,
            status: initialStatus,
            salary: netSalary,
            payrollStatus: initialStatus,
            paymentStatus: initialStatus === 'paid' ? 'paid' : 'pending',
            payslipGenerated: false
          });
          payrollChanged = true;
        });
      }
    });

    if (employeesChanged) {
      setEmployees(nextEmployees);
      localStorage.setItem('hrms_employees', JSON.stringify(nextEmployees));
    }
    if (leavesChanged) {
      setLeaves(nextLeaves);
      localStorage.setItem('hrms_leaves', JSON.stringify(nextLeaves));
    }
    if (attendanceChanged) {
      setAttendance(nextAttendance);
      localStorage.setItem('hrms_attendance', JSON.stringify(nextAttendance));
    }
    if (payrollChanged) {
      setPayroll(nextPayroll);
      localStorage.setItem('hrms_payroll', JSON.stringify(nextPayroll));
    }
  }, [companies, employees, leaves, attendance, payroll]);

  useEffect(() => {
    if (resolvedRole === 'Super Admin' && ['employees', 'leaves', 'payroll', 'documents', 'reports'].includes(currentPage)) {
      setCurrentPage('dashboard');
      localStorage.setItem('hrms_current_page', 'dashboard');
    } else if ((resolvedRole === 'Company Head' || resolvedRole === 'HR') && ['companies', 'billing'].includes(currentPage)) {
      setCurrentPage('dashboard');
      localStorage.setItem('hrms_current_page', 'dashboard');
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
