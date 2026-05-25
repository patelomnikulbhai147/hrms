import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  Notification,
  PLAN_LIMITS,
  getCompanyIdFromBranchName
} from './data/mockData';
import { allExcelParsedEmployees } from './data/excelSeededData';
import { calculateBranchBilling } from './utils/subscriptionUtils';

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
  billing: 'Billing & Subscriptions'
};

const defaultUsers: UserAccount[] = [
  { id: 'u1', name: 'Super Admin', email: 'admin@platform.in', username: 'superadmin', passwordStr: 'admin123', role: 'Super Admin', companyId: '', status: 'Active', avatar: 'SA' }
];

const defaultPlans: SubscriptionPlan[] = [
  { id: 'sp1', name: 'Starter', priceMonthly: 1999, priceYearly: 19999, employeeLimit: PLAN_LIMITS.Starter.employees, hrLimit: PLAN_LIMITS.Starter.hrAdmins, storageLimit: '5 GB', payrollAccess: true, documentAccess: false, includedBranchLimit: 0 },
  { id: 'sp2', name: 'Professional', priceMonthly: 4999, priceYearly: 49999, employeeLimit: PLAN_LIMITS.Professional.employees, hrLimit: PLAN_LIMITS.Professional.hrAdmins, storageLimit: '25 GB', payrollAccess: true, documentAccess: true, includedBranchLimit: 1 },
  { id: 'sp3', name: 'Enterprise', priceMonthly: 12999, priceYearly: 129999, employeeLimit: PLAN_LIMITS.Enterprise.employees, hrLimit: PLAN_LIMITS.Enterprise.hrAdmins, storageLimit: '100 GB', payrollAccess: true, documentAccess: true, includedBranchLimit: 2 }
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
  headerText: 'GLOBAL SYSTEM INTEGRATION',
  footerText: 'Powering Enterprise Productivity',
  signatureText: 'Authorized Signatory',
  themeStyle: 'Modern',
  paymentStatus: 'Trial Active',
  renewalDate: '',
  gstNumber: '',
  billingAddress: '',
  subscriptionPrice: 0,
  billingCycle: 'Monthly',
  accountStatus: 'Active'
};



export default function App() {
  // Auto-migration: check if browser has cached the old mock database or is missing our new branch seeding, and clear it for a clean slate
  if (typeof window !== 'undefined') {
    const realMigrated = localStorage.getItem('hrms_real_migration_v6');
    if (!realMigrated) {
      localStorage.removeItem('hrms_accounts');
      localStorage.removeItem('hrms_companies');
      localStorage.removeItem('hrms_employees');
      localStorage.removeItem('hrms_attendance');
      localStorage.removeItem('hrms_leaves');
      localStorage.removeItem('hrms_payroll');
      localStorage.removeItem('hrms_documents');
      localStorage.removeItem('hrms_payments');
      localStorage.removeItem('hrms_active_company_id');
      localStorage.setItem('hrms_real_migration_v6', 'true');
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
        // sanitize renewalDate fields and pre-seed monthly/yearly pricing
        const sanitized = parsed.map(c => {
          const planObj = defaultPlans.find(p => p.name === c.plan);
          const basePriceMonthly = planObj ? planObj.priceMonthly : (c.plan === 'Enterprise' ? 12999 : (c.plan === 'Professional' ? 4999 : 1999));
          const basePriceYearly = planObj ? planObj.priceYearly : (c.plan === 'Enterprise' ? 129999 : (c.plan === 'Professional' ? 49999 : 19999));

          const nextCompany = {
            ...c,
            priceMonthly: c.priceMonthly || basePriceMonthly,
            priceYearly: c.priceYearly || basePriceYearly
          };

          if (!c.renewalDate) return nextCompany;
          const d = new Date(c.renewalDate);
          if (isNaN(d.getTime())) {
            return { ...nextCompany, renewalDate: '' };
          }
          return nextCompany;
        });
        // validate and recalculate billing for the parent company
        const billingResult = calculateBranchBilling(sanitized, 'c-gcri', defaultPlans);
        localStorage.setItem('hrms_companies', JSON.stringify(billingResult.updatedCompanies));
        return billingResult.updatedCompanies;
      } catch (e) {
        const preCalculated = defaultCompanies.map(c => {
          const planObj = defaultPlans.find(p => p.name === c.plan);
          return {
            ...c,
            priceMonthly: planObj ? planObj.priceMonthly : 12999,
            priceYearly: planObj ? planObj.priceYearly : 129999
          };
        });
        const billingResult = calculateBranchBilling(preCalculated, 'c-gcri', defaultPlans);
        localStorage.setItem('hrms_companies', JSON.stringify(billingResult.updatedCompanies));
        return billingResult.updatedCompanies;
      }
    }
    const preCalculated = defaultCompanies.map(c => {
      const planObj = defaultPlans.find(p => p.name === c.plan);
      return {
        ...c,
        priceMonthly: planObj ? planObj.priceMonthly : 12999,
        priceYearly: planObj ? planObj.priceYearly : 129999
      };
    });
    const billingResult = calculateBranchBilling(preCalculated, 'c-gcri', defaultPlans);
    localStorage.setItem('hrms_companies', JSON.stringify(billingResult.updatedCompanies));
    return billingResult.updatedCompanies;
  });

  // Persistent employees state
  const [employees, setEmployees] = useState<Employee[]>(() => {
    const raw = localStorage.getItem('hrms_employees');
    let loaded = defaultEmployees;
    if (raw) loaded = JSON.parse(raw);

    // Auto-deduplicate on load to fix accidental double-adds and migrate branch mapping
    const uniqueEmployees: Employee[] = [];
    const seen = new Set<string>();
    for (let emp of loaded) {
      const key = emp.employeeId;
      if (!seen.has(key)) {
        seen.add(key);
        // MIGRATION PATCH: Fix stale localStorage data mapped only to parent 'c-gcri'
        if (emp.companyId === 'c-gcri') {
          let derivedName = emp.branchLocation || '';
          if (!derivedName && emp.location) {
             const locParts = emp.location.split(',');
             derivedName = locParts[0].trim();
          }
          if (derivedName) {
            // Re-resolve the companyId using the branch name mapping
            const resolvedId = getCompanyIdFromBranchName(derivedName, 'c-gcri', defaultCompanies);
            if (resolvedId && resolvedId !== 'c-gcri') {
              emp = { ...emp, companyId: resolvedId };
            }
          }
        }
        uniqueEmployees.push(emp);
      }
    }
    
    localStorage.setItem('hrms_employees', JSON.stringify(uniqueEmployees));
    return uniqueEmployees;
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
    if (raw) {
      try {
        const parsed: SubscriptionPlan[] = JSON.parse(raw);
        let updated = false;
        const sanitized = parsed.map(plan => {
          const limits = PLAN_LIMITS[plan.name as keyof typeof PLAN_LIMITS];
          if (limits) {
            if (plan.employeeLimit !== limits.employees || plan.hrLimit !== limits.hrAdmins) {
              updated = true;
              return {
                ...plan,
                employeeLimit: limits.employees,
                hrLimit: limits.hrAdmins
              };
            }
          }
          return plan;
        });

        const hasAll = defaultPlans.every(dp => sanitized.some(p => p.name === dp.name));
        if (updated || !hasAll) {
          const merged = defaultPlans.map(dp => {
            const existing = sanitized.find(p => p.name === dp.name);
            return existing ? { ...existing, employeeLimit: PLAN_LIMITS[existing.name as keyof typeof PLAN_LIMITS].employees, hrLimit: PLAN_LIMITS[existing.name as keyof typeof PLAN_LIMITS].hrAdmins } : dp;
          });
          localStorage.setItem('hrms_plans', JSON.stringify(merged));
          return merged;
        }

        return sanitized;
      } catch (e) {
        localStorage.setItem('hrms_plans', JSON.stringify(defaultPlans));
        return defaultPlans;
      }
    }
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
    const billingResult = calculateBranchBilling(next, 'c-gcri', plans);
    setCompanies(billingResult.updatedCompanies);
    localStorage.setItem('hrms_companies', JSON.stringify(billingResult.updatedCompanies));
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
      return profile.companyId || 'c-gcri';
    }
    return 'c-gcri';
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
    const initialCompanyId = profile.companyId || 'c-gcri';
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
    setActiveCompanyId('c-gcri');
    localStorage.setItem('hrms_active_company_id', 'c-gcri');
    setCurrentPage('companies');
    localStorage.setItem('hrms_current_page', 'companies');
  };

  const resolvedRole = isMasquerading ? 'Company Head' : role;

  const resolvedCompanyId = (authProfile?.role !== 'Super Admin' && !isMasquerading)
    ? (authProfile?.companyId || 'c-gcri')
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
            onUpdateEmployees={handleUpdateEmployees}
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
            employees={employees}
            onUpdateEmployees={handleUpdateEmployees}
            userAccounts={userAccounts}
            onUpdateAccounts={handleUpdateAccounts}
            onStartMasquerade={handleStartMasquerade}
          />
        );
      case 'employees':
        return (
          <Employees
            role={resolvedRole}
            activeCompanyId={resolvedCompanyId}
            companies={companies}
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
            notifications={notifications}
            onUpdateNotifications={setNotifications}
            onUpdateCompanies={handleUpdateCompanies}
            onUpdatePayments={handleUpdatePayments}
            onUpdateEmployees={handleUpdateEmployees}
            onUpdatePayroll={handleUpdatePayroll}
          />
        );
    }
  };

  return (
    <div className="flex h-screen bg-[#080b11] overflow-hidden font-sans antialiased text-slate-100">
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

        <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-[#080b11]">
          <div className="max-w-7xl mx-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentPage}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
              >
                {renderPage()}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  );
}
export { App };
