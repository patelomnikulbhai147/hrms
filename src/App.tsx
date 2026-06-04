import React, { useState, useEffect } from 'react';
import { api } from './api/apiClient';
import { getAccessibleWorkspaceIds } from './utils/workspaceUtils';
import { motion, AnimatePresence } from 'framer-motion';
import { Sidebar, type PageId } from './components/layout/Sidebar';
import { Topbar } from './components/layout/Topbar';
import { Dashboard } from './pages/Dashboard';
import { SelectWorkspace } from './pages/SelectWorkspace';
import { Employees } from './pages/Employees';
import { Leaves } from './pages/Leaves';
import { Attendance } from './pages/Attendance';
import { Payroll } from './pages/Payroll';
import { Companies } from './pages/Companies';
import { Documents } from './pages/Documents';
import { Reports } from './pages/Reports';
import { Settings } from './pages/Settings';
import { Billing } from './pages/Billing';
import { Users } from './pages/Users';
import { Login, type UserAccount, type AppModules } from './pages/Login';
import { PermissionProvider, checkCanView, checkCanEdit } from './context/PermissionContext';
import { ShieldAlert } from 'lucide-react';
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
  billing: 'Billing & Subscriptions',
  users: 'User Management'
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

  const handleUpdateUserAccounts = (updater: UserAccount[] | ((prev: UserAccount[]) => UserAccount[])) => {
    const next = typeof updater === 'function' ? updater(userAccounts) : updater;
    setUserAccounts(next);
    localStorage.setItem('hrms_accounts', JSON.stringify(next));
  };

  // Database models initialized strictly empty to enforce live DB queries (No stale localStorage caching)
  const [companies, setCompanies] = useState<Company[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [payroll, setPayroll] = useState<PayrollRecord[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);

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
    if (resolvedRole !== 'Super Admin' && !checkCanEdit('billing', authProfile, resolvedRole)) {
      showToast("Unauthorized: API blocked. You do not have edit permissions for SaaS Subscriptions.");
      return;
    }
    const next = typeof updater === 'function' ? updater(plans) : updater;
    setPlans(next);
    localStorage.setItem('hrms_plans', JSON.stringify(next));
  };

  const handleUpdatePayments = (updater: PaymentRecord[] | ((prev: PaymentRecord[]) => PaymentRecord[])) => {
    if (resolvedRole !== 'Super Admin' && !checkCanEdit('billing', authProfile, resolvedRole)) {
      showToast("Unauthorized: API blocked. You do not have edit permissions for SaaS Subscriptions.");
      return;
    }
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
    if (resolvedRole !== 'Super Admin' && !checkCanEdit('users', authProfile, resolvedRole)) {
      showToast("Unauthorized: API blocked. You do not have edit permissions for User Management.");
      return;
    }
    const next = typeof updater === 'function' ? updater(userAccounts) : updater;
    setUserAccounts(next);
    localStorage.setItem('hrms_accounts', JSON.stringify(next));

    if (authProfile) {
      const updatedProfile = next.find(u => u.id === authProfile.id);
      if (updatedProfile) {
        if (updatedProfile.status === 'Disabled') {
          handleLogout();
        } else {
          setStoredAuthProfile(updatedProfile);
          setRole(updatedProfile.role);
          localStorage.setItem('hrms_profile', JSON.stringify(updatedProfile));
        }
      }
    }
  };

  const handleUpdateCompanies = (updater: Company[] | ((prev: Company[]) => Company[])) => {
    if (resolvedRole !== 'Super Admin' && !checkCanEdit('companies', authProfile, resolvedRole)) {
      showToast("Unauthorized: API blocked. You do not have edit permissions for Companies.");
      return;
    }
    const next = typeof updater === 'function' ? updater(companies) : updater;
    const billingResult = calculateBranchBilling(next, 'c-gcri', plans);
    setCompanies(billingResult.updatedCompanies);
    localStorage.setItem('hrms_companies', JSON.stringify(billingResult.updatedCompanies));
  };

  const handleUpdateEmployees = (updater: Employee[] | ((prev: Employee[]) => Employee[])) => {
    if (resolvedRole !== 'Super Admin' && !checkCanEdit('employees', authProfile, resolvedRole)) {
      showToast("Unauthorized: API blocked. You do not have edit permissions for Employees.");
      return;
    }
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
    if (resolvedRole !== 'Super Admin' && !checkCanEdit('attendance', authProfile, resolvedRole)) {
      showToast("Unauthorized: API blocked. You do not have edit permissions for Attendance.");
      return;
    }
    const next = typeof updater === 'function' ? updater(attendance) : updater;
    setAttendance(next);
    localStorage.setItem('hrms_attendance', JSON.stringify(next));
  };

  const handleUpdateLeaves = (updater: LeaveRequest[] | ((prev: LeaveRequest[]) => LeaveRequest[])) => {
    if (resolvedRole !== 'Super Admin' && !checkCanEdit('leaves', authProfile, resolvedRole)) {
      showToast("Unauthorized: API blocked. You do not have edit permissions for Leave Management.");
      return;
    }
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
    if (resolvedRole !== 'Super Admin' && !checkCanEdit('payroll', authProfile, resolvedRole)) {
      showToast("Unauthorized: API blocked. You do not have edit permissions for Payroll.");
      return;
    }
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
    if (resolvedRole !== 'Super Admin' && !checkCanEdit('documents', authProfile, resolvedRole)) {
      showToast("Unauthorized: API blocked. You do not have edit permissions for Documents.");
      return;
    }
    const next = typeof updater === 'function' ? updater(documents) : updater;
    setDocuments(next);
    localStorage.setItem('hrms_documents', JSON.stringify(next));
  };

  // Authentication states
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem('hrms_auth') === 'true';
  });
    // Data hydration from backend PostgreSQL
  const hydrateAll = async () => {
    try {
      const [fetchedCompanies, fetchedBranches, fetchedEmployees, fetchedUsers, fetchedPayroll, fetchedDocuments, fetchedLeaves, fetchedAttendance] = await Promise.all([
        api.companies.getAll().catch(() => null),
        api.branches.getAll().catch(() => null),
        api.employees.getAll().catch(() => null),
        api.users.getAll().catch(() => null),
        api.payroll.getAll().catch(() => null),
        api.documents.getAll().catch(() => null),
        api.leaves.getAll().catch(() => null),
        api.attendance.getAll().catch(() => null)
      ]);
      
      if (fetchedCompanies) {
        let allEntities = [...fetchedCompanies];
        if (fetchedBranches) {
          const mappedBranches = fetchedBranches.map((b: any) => ({
             ...b,
             name: b.branchName || b.name,
             isHeadOffice: false,
             parentCompanyId: b.companyId
          }));
          allEntities = [...allEntities, ...mappedBranches];
        }
        setCompanies(allEntities);
      }
      
      if (fetchedEmployees) setEmployees(fetchedEmployees);
      if (fetchedUsers) setUserAccounts(fetchedUsers);
      if (fetchedPayroll) setPayroll(fetchedPayroll);
      if (fetchedDocuments) setDocuments(fetchedDocuments);
      if (fetchedLeaves) setLeaves(fetchedLeaves);
      if (fetchedAttendance) setAttendance(fetchedAttendance);
    } catch (err) {
      console.error('Hydration failed:', err);
    }
  };


const [storedAuthProfile, setStoredAuthProfile] = useState<UserAccount | null>(() => {
    const raw = localStorage.getItem('hrms_profile');
    return raw ? JSON.parse(raw) : null;
  });

  const authProfile = React.useMemo(() => {
    if (!storedAuthProfile) return null;
    
    const latestProfile = userAccounts.find(u => u.id === storedAuthProfile.id) || storedAuthProfile;
    const computedAccess = getAccessibleWorkspaceIds(latestProfile, companies);
    
    return {
      ...latestProfile,
      accessibleCompanyIds: computedAccess
    };
  }, [storedAuthProfile, userAccounts, companies]);

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
      return profile.role === 'Employee' ? (profile.companyId || 'c-gcri') : '';
    }
    return '';
  }); 

  useEffect(() => {
    if (isAuthenticated) hydrateAll();
  }, [isAuthenticated, activeCompanyId]);
  const [isMasquerading, setIsMasquerading] = useState<boolean>(() => {
    return localStorage.getItem('hrms_is_masquerading') === 'true';
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('hrms_theme') as 'dark' | 'light') || 'dark';
  });

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('hrms_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };
  const handleLogin = (profile: UserAccount, selectedCompanyId?: string) => {
    setStoredAuthProfile(profile);
    setIsAuthenticated(true);
    localStorage.setItem('hrms_auth', 'true');
    localStorage.setItem('hrms_profile', JSON.stringify(profile));
    setRole(profile.role);
    const initialCompanyId = selectedCompanyId !== undefined ? selectedCompanyId : (profile.role === 'Employee' ? profile.companyId || 'c-gcri' : '');
    setActiveCompanyId(initialCompanyId);
    if (initialCompanyId) {
      localStorage.setItem('hrms_active_company_id', initialCompanyId);
    } else {
      localStorage.removeItem('hrms_active_company_id');
    }
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
    setStoredAuthProfile(null);
    setIsAuthenticated(false);
    setIsMasquerading(false);
  };

  const handleNavigate = (page: PageId) => {
    setCurrentPage(page);
    localStorage.setItem('hrms_current_page', page);
  };

  const handleCompanyChange = (companyId: string) => {
    // Check if the user is authorized to switch to this company
    if (resolvedRole !== 'Super Admin' && !isMasquerading) {
      const accessibleIds = getAccessibleWorkspaceIds(authProfile, companies);
      if (!accessibleIds.includes(companyId)) {
        return;
      }
    }
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

  const resolvedCompanyId = activeCompanyId;

  // Synchronous auto-seeding deactivated for clean SaaS startup environment

  useEffect(() => {
    if (!authProfile) return;
    
    // Explicit RBAC Enforcement for Modules
    if (resolvedRole !== 'Super Admin') {
      const isAllowed = checkCanView(currentPage as AppModules, authProfile, resolvedRole);
      
      if (!isAllowed) {
        // Fallback sequentially to a safe route if the current is blocked
        if (currentPage !== 'dashboard' && checkCanView('dashboard' as AppModules, authProfile, resolvedRole)) {
          setCurrentPage('dashboard');
          localStorage.setItem('hrms_current_page', 'dashboard');
        } else if (currentPage !== 'settings' && checkCanView('settings' as AppModules, authProfile, resolvedRole)) {
          setCurrentPage('settings');
          localStorage.setItem('hrms_current_page', 'settings');
        } else if (currentPage !== 'payroll' && checkCanView('payroll' as AppModules, authProfile, resolvedRole)) {
          setCurrentPage('payroll');
          localStorage.setItem('hrms_current_page', 'payroll');
        }
        return;
      }
    }
  }, [resolvedRole, currentPage, authProfile]);

  if (!isAuthenticated || !authProfile) {
    return <Login userAccounts={userAccounts} companies={companies} onLogin={handleLogin} />;
  }

  if (!activeCompanyId && authProfile.role !== 'Super Admin') {
    return <SelectWorkspace companies={companies} user={authProfile} onSelect={handleCompanyChange} />;
  }

  const renderPage = () => {
    // Secondary render-level check to completely block unauthorized rendering
    if (resolvedRole !== 'Super Admin' && !checkCanView(currentPage as AppModules, authProfile, resolvedRole)) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-slate-50">
          <div className="w-24 h-24 bg-rose-100 rounded-full flex items-center justify-center mb-6">
            <ShieldAlert className="text-rose-600 w-12 h-12" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Access Denied</h2>
          <p className="text-slate-500 max-w-md">You do not have permission to view the <span className="font-bold text-slate-700">{currentPage}</span> module. Please contact your system administrator if you believe this is an error.</p>
        </div>
      );
    }

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

      case 'users':
        return (
          <Users 
            userAccounts={userAccounts} 
            companies={companies} 
            onUpdateAccounts={handleUpdateUserAccounts} 
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
    <PermissionProvider authProfile={authProfile} role={resolvedRole} companies={companies}>
      <div className="flex h-screen overflow-hidden font-sans antialiased">
        <Sidebar
          currentPage={currentPage}
          onNavigate={handleNavigate}
          role={resolvedRole}
          collapsed={sidebarCollapsed}
          isMasquerading={isMasquerading}
          onExitMasquerade={handleExitMasquerade}
          theme={theme}
          toggleTheme={toggleTheme}
          authProfile={authProfile}
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
          theme={theme}
          toggleTheme={toggleTheme}
          authProfile={authProfile}
        />

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
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

      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="fixed bottom-6 right-6 z-[200] flex items-center gap-3 px-5 py-3.5 bg-rose-500 text-white rounded-xl shadow-2xl font-semibold tracking-wide border border-rose-400/50"
          >
            <ShieldAlert size={20} className="text-rose-100" />
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>

    </div>
    </PermissionProvider>
  );
}
export { App };
