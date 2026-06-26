import React, { useState, useEffect } from 'react';
import { api, type SuperAdminStats } from '@/api/apiClient';
import { getAccessibleWorkspaceIds, buildWorkspaceHierarchy } from '@/utils/workspaceUtils';
import { motion, AnimatePresence } from 'framer-motion';
import { Sidebar, type PageId } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
const Dashboard = React.lazy(() => import('@/pages/Dashboard').then(m => ({ default: m.Dashboard })));
const SelectWorkspace = React.lazy(() => import('@/pages/SelectWorkspace').then(m => ({ default: m.SelectWorkspace })));
const Employees = React.lazy(() => import('@/pages/Employees').then(m => ({ default: m.Employees })));
const LeaveManagement = React.lazy(() => import('@/pages/LeaveManagement').then(m => ({ default: m.LeaveManagement })));
const Attendance = React.lazy(() => import('@/pages/Attendance').then(m => ({ default: m.Attendance })));
const AttendanceDevices = React.lazy(() => import('@/pages/AttendanceDevices').then(m => ({ default: m.AttendanceDevices })));
const Payroll = React.lazy(() => import('@/pages/Payroll').then(m => ({ default: m.Payroll })));
const BonusManagement = React.lazy(() => import('@/pages/BonusManagement').then(m => ({ default: m.BonusManagement })));
const Companies = React.lazy(() => import('@/pages/Companies').then(m => ({ default: m.Companies })));
const EmployeeCards = React.lazy(() => import('@/pages/EmployeeCards').then(m => ({ default: m.EmployeeCards })));
const Documents = React.lazy(() => import('@/pages/Documents').then(m => ({ default: m.Documents })));
const ComplianceReports = React.lazy(() => import('@/pages/ComplianceReports').then(m => ({ default: m.ComplianceReports })));
const Settings = React.lazy(() => import('@/pages/Settings').then(m => ({ default: m.Settings })));
const Billing = React.lazy(() => import('@/pages/Billing').then(m => ({ default: m.Billing })));
const Users = React.lazy(() => import('@/pages/Users').then(m => ({ default: m.Users })));
const AuditTrail = React.lazy(() => import('@/pages/AuditTrail').then(m => ({ default: m.AuditTrail })));
const TaskManager = React.lazy(() => import('@/pages/TaskManager').then(m => ({ default: m.TaskManager })));
const Tenders = React.lazy(() => import('@/pages/Tenders').then(m => ({ default: m.Tenders })));
const Contracts = React.lazy(() => import('@/pages/Contracts').then(m => ({ default: m.Contracts })));
const Login = React.lazy(() => import('@/pages/Login').then(m => ({ default: m.Login })));
import type { UserAccount, AppModules } from '@/pages/Login';
import { authStorage } from '@/utils/authStorage';
import { safeSetJSON, pruneLargeLegacyCaches } from '@/utils/safeStorage';
import { PermissionProvider, checkCanView, checkCanEdit } from '@/context/PermissionContext';
import { isCompanyArchived } from '@/utils/companyStatus';
import { ShieldAlert } from 'lucide-react';
import {
  Role,
  Company,
  companies as defaultCompanies,
  Employee,
  employees as defaultEmployees,
  AttendanceRecord,
  attendanceRecords as defaultAttendance,
  LeaveRequest,
  leaveRequests as defaultLeaves,
  PayrollRecord,
  payrollRecords as defaultPayroll,
  Document,
  documents as defaultDocuments,
  SubscriptionPlan,
  PaymentRecord,
  Notification,
  PLAN_LIMITS
} from '@/data/mockData';
import { calculateBranchBilling } from '@/utils/subscriptionUtils';
import { isActiveEmployee } from '@/utils/employeeStatus';

const pageTitles: Record<PageId, string> = {
  dashboard: 'Dashboard',
  companies: 'Companies',
  'employee-cards': 'Employee Cards',
  audit: 'Audit Trail',
  employees: 'Employees',
  leaves: 'Leave Management',
  payroll: 'Payroll',
  bonus: 'Bonus Management',
  attendance: 'Attendance',
  'attendance-devices': 'Attendance Devices',
  documents: 'Documents',
  reports: 'Reports',
  settings: 'Settings',
  billing: 'Billing & Subscriptions',
  users: 'User Management',
  tasks: 'Task Manager',
  tenders: 'Tender Management',
  contracts: 'Contract Management',
  'select-workspace': 'Select Workspace'
};

// Page ids that map 1:1 to a URL path (/dashboard, /users, …) for real SPA
// routing: refresh, deep links and the browser Back button all work.
const PAGE_IDS = [
  'dashboard', 'companies', 'employee-cards', 'employees', 'leaves', 'payroll', 'bonus', 'attendance',
  'attendance-devices', 'documents', 'reports', 'settings', 'billing', 'users', 'tasks', 'tenders', 'contracts', 'audit',
  'select-workspace',
] as const;
const pathToPage = (pathname: string): PageId | null => {
  const seg = (pathname || '').replace(/^\/+/, '').split('/')[0];
  return (PAGE_IDS as readonly string[]).includes(seg) ? (seg as PageId) : null;
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
    // One-time purge of legacy large datasets older builds cached in localStorage
    // (employees / payroll / leaves / documents / attendance). They are never read
    // back — all such state is hydrated from the backend — so a stale multi-MB blob
    // here only wastes the storage quota and was the cause of the QuotaExceededError
    // seen right after offboarding. Pruning frees that space for essential keys.
    if (!localStorage.getItem('hrms_storage_cleanup_v1')) {
      pruneLargeLegacyCaches();
      try { localStorage.setItem('hrms_storage_cleanup_v1', 'true'); } catch { /* ignore */ }
    }
  }


  // Users come EXCLUSIVELY from the live MySQL database via hydrateAll()
  // (api.users.getAll). Initialized strictly empty — no mock/localStorage seed —
  // so the user list and counts can never show stale or mock ("defaultUsers")
  // data. This mirrors the companies/employees models above.
  const [userAccounts, setUserAccounts] = useState<UserAccount[]>([]);

  const handleUpdateUserAccounts = (updater: UserAccount[] | ((prev: UserAccount[]) => UserAccount[])) => {
    const next = typeof updater === 'function' ? updater(userAccounts) : updater;
    setUserAccounts(next);
  };

  // Database models initialized strictly empty to enforce live DB queries (No stale localStorage caching)
  const [companies, setCompanies] = useState<Company[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  // ACTIVE employee dataset for operational modules (attendance, payroll, leave,
  // shift, selection dropdowns, cards, documents). Offboarded employees
  // (Archived/Resigned/Terminated/Inactive/Offboarded) are excluded so they can
  // never appear in active workflows. The full `employees` list is still used by
  // the Employees directory (archive tab), Reports, and Dashboard.
  const activeEmployees = React.useMemo(() => employees.filter(isActiveEmployee), [employees]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [payroll, setPayroll] = useState<PayrollRecord[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);

  // Live, database-driven Super Admin KPI counts (single source of truth).
  const [superAdminStats, setSuperAdminStats] = useState<SuperAdminStats | null>(null);

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
          safeSetJSON('hrms_plans', merged);
          return merged;
        }

        return sanitized;
      } catch (e) {
        safeSetJSON('hrms_plans', defaultPlans);
        return defaultPlans;
      }
    }
    safeSetJSON('hrms_plans', defaultPlans);
    return defaultPlans;
  });

  // Persistent SaaS transaction history state
  const [payments, setPayments] = useState<PaymentRecord[]>(() => {
    const raw = localStorage.getItem('hrms_payments');
    if (raw) return JSON.parse(raw);
    safeSetJSON('hrms_payments', defaultPayments);
    return defaultPayments;
  });

  const handleUpdatePlans = (updater: SubscriptionPlan[] | ((prev: SubscriptionPlan[]) => SubscriptionPlan[])) => {
    if (permissionRole !== 'Super Admin' && !checkCanEdit('billing', authProfile, permissionRole)) {
      showToast("Unauthorized: API blocked. You do not have edit permissions for SaaS Subscriptions.");
      return;
    }
    const next = typeof updater === 'function' ? updater(plans) : updater;
    setPlans(next);
    safeSetJSON('hrms_plans', next);
  };

  const handleUpdatePayments = (updater: PaymentRecord[] | ((prev: PaymentRecord[]) => PaymentRecord[])) => {
    if (permissionRole !== 'Super Admin' && !checkCanEdit('billing', authProfile, permissionRole)) {
      showToast("Unauthorized: API blocked. You do not have edit permissions for SaaS Subscriptions.");
      return;
    }
    const next = typeof updater === 'function' ? updater(payments) : updater;
    setPayments(next);
    safeSetJSON('hrms_payments', next);
  };

  // Persistent notifications state
  const [notifications, setNotifications] = useState<Notification[]>(() => {
    const raw = localStorage.getItem('hrms_notifications');
    if (raw) return JSON.parse(raw);
    const initialList: Notification[] = [
      { id: 'n1', companyId: 'c-ahmedabad', type: 'system', message: 'Welcome to GCRI Ahmedabad Enterprise HRMS Platform!', timestamp: '2026-05-22 09:00', read: false, priority: 'medium' }
    ];
    safeSetJSON('hrms_notifications', initialList);
    return initialList;
  });

  const handleUpdateNotifications = (updater: Notification[] | ((prev: Notification[]) => Notification[])) => {
    const next = typeof updater === 'function' ? updater(notifications) : updater;
    setNotifications(next);
    safeSetJSON('hrms_notifications', next);
  };

  const handleUpdateAccounts = (updater: UserAccount[] | ((prev: UserAccount[]) => UserAccount[])) => {
    if (permissionRole !== 'Super Admin' && !checkCanEdit('users', authProfile, permissionRole)) {
      showToast("Unauthorized: API blocked. You do not have edit permissions for User Management.");
      return;
    }
    const next = typeof updater === 'function' ? updater(userAccounts) : updater;
    setUserAccounts(next);

    if (authProfile) {
      const updatedProfile = next.find(u => u.id === authProfile.id);
      if (updatedProfile) {
        if (updatedProfile.status === 'Disabled') {
          handleLogout();
        } else {
          setStoredAuthProfile(updatedProfile);
          setRole(updatedProfile.role);
          authStorage.set('hrms_profile', JSON.stringify(updatedProfile));
        }
      }
    }
  };

  const handleUpdateCompanies = (updater: Company[] | ((prev: Company[]) => Company[])) => {
    if (permissionRole !== 'Super Admin' && !checkCanEdit('companies', authProfile, permissionRole)) {
      showToast("Unauthorized: API blocked. You do not have edit permissions for Companies.");
      return;
    }
    const next = typeof updater === 'function' ? updater(companies) : updater;
    const billingResult = calculateBranchBilling(next, 'c-gcri', plans);
    setCompanies(billingResult.updatedCompanies);
    // Companies/branches are small master data still read back by isCompanyIdMatch's
    // fallback (workspace scoping). Persist it guarded so it can never crash the UI.
    safeSetJSON('hrms_companies', billingResult.updatedCompanies);
  };

  const handleUpdateEmployees = (updater: Employee[] | ((prev: Employee[]) => Employee[])) => {
    if (permissionRole !== 'Super Admin' && !checkCanEdit('employees', authProfile, permissionRole)) {
      showToast("Unauthorized: API blocked. You do not have edit permissions for Employees.");
      return;
    }
    const nextEmployees = typeof updater === 'function' ? updater(employees) : updater;
    setEmployees(nextEmployees);
    // NOTE: the employee dataset is NOT persisted to localStorage (it can be many
    // MB and overflows the quota). It is the source-of-truth in memory and is
    // reloaded from the backend via hydrateAll() on login / workspace change.

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
      // Recalculated payroll is kept in memory only (not persisted — datasets are
      // reloaded from the backend; persisting them overflowed the storage quota).
      void changed;
      return nextPayroll;
    });
  };

  const handleUpdateAttendance = async (updater: AttendanceRecord[] | ((prev: AttendanceRecord[]) => AttendanceRecord[])) => {
    if (permissionRole !== 'Super Admin' && !checkCanEdit('attendance', authProfile, permissionRole)) {
      showToast("Unauthorized: API blocked. You do not have edit permissions for Attendance.");
      return;
    }
    const next = typeof updater === 'function' ? updater(attendance) : updater;
    setAttendance(next);
    
    // Auto-sync entire array changes to DB
    // Assuming updates are synced individually from the Attendance component directly, 
    // but if App.tsx updates it, we might need a bulk sync. For safety, we only update local state here
    // and rely on Attendance.tsx to make the granular `api.attendance.create/update` calls.
  };

  const handleUpdateLeaves = (updater: LeaveRequest[] | ((prev: LeaveRequest[]) => LeaveRequest[])) => {
    if (permissionRole !== 'Super Admin' && !checkCanEdit('leaves', authProfile, permissionRole)) {
      showToast("Unauthorized: API blocked. You do not have edit permissions for Leave Management.");
      return;
    }
    const nextLeaves = typeof updater === 'function' ? updater(leaves) : updater;
    setLeaves(nextLeaves);
    // Not persisted to localStorage — reloaded from the backend (avoids quota bloat).

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
      // Recalculated payroll is kept in memory only (not persisted — datasets are
      // reloaded from the backend; persisting them overflowed the storage quota).
      void changed;
      return nextPayroll;
    });
  };

  const handleUpdatePayroll = (updater: PayrollRecord[] | ((prev: PayrollRecord[]) => PayrollRecord[])) => {
    if (permissionRole !== 'Super Admin' && !checkCanEdit('payroll', authProfile, permissionRole)) {
      showToast("Unauthorized: API blocked. You do not have edit permissions for Payroll.");
      return;
    }
    const nextPayroll = typeof updater === 'function' ? updater(payroll) : updater;
    setPayroll(nextPayroll);
    // Not persisted to localStorage — payroll can be many MB and overflowed the
    // quota; it is reloaded from the backend via hydrateAll().

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
      // Synced employee salaries kept in memory only (not persisted — reloaded
      // from the backend; persisting the full list overflowed the storage quota).
      void changed;
      return nextEmployees;
    });
  };

  const handleUpdateDocuments = (updater: Document[] | ((prev: Document[]) => Document[])) => {
    if (permissionRole !== 'Super Admin' && !checkCanEdit('documents', authProfile, permissionRole)) {
      showToast("Unauthorized: API blocked. You do not have edit permissions for Documents.");
      return;
    }
    const next = typeof updater === 'function' ? updater(documents) : updater;
    setDocuments(next);
    // Not persisted to localStorage — reloaded from the backend (avoids quota bloat).
  };

  // Authentication states
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return authStorage.get('hrms_auth') === 'true';
  });
  // Message shown on the Login page after an auto-logout (inactivity / expiry).
  const [sessionMessage, setSessionMessage] = useState<string | null>(null);
  const [isHydrating, setIsHydrating] = useState(true);
  // Names of critical datasets whose fetch failed — drives a visible banner so a
  // backend/DB error never again silently looks like "all records are gone".
  const [loadError, setLoadError] = useState<string | null>(null);

    // Data hydration from backend MySQL
  const hydrateAll = async () => {
    setIsHydrating(true);
    const failed: string[] = [];
    try {
      const catchApi = (apiCall: Promise<any>, name: string) =>
        apiCall.catch((e: any) => {
          if (e.status === 401 || e.message?.includes('Not authorized')) throw e;
          console.warn(`[Hydration] API error (${name}):`, e);
          failed.push(name);
          return null;
        });

      const [fetchedCompanies, fetchedBranches, fetchedEmployees, fetchedUsers, fetchedPayroll, fetchedDocuments, fetchedLeaves, fetchedAttendance] = await Promise.all([
        catchApi(api.companies.getAll(), 'companies'),
        catchApi(api.branches.getAll(), 'branches'),
        catchApi(api.employees.getAll('?include=all'), 'employees'),
        catchApi(api.users.getAll(), 'users'),
        catchApi(api.payroll.getAll(), 'payroll'),
        catchApi(api.documents.getAll(), 'documents'),
        catchApi(api.leaves.getAll(), 'leaves'),
        catchApi(api.attendance.getAll(), 'attendance')
      ]);
      
      // Only overwrite a dataset when its fetch SUCCEEDED. Never blank good data
      // to [] because of a transient backend/DB error — that is what made past
      // outages look like "every record was deleted" when the data was intact.
      if (fetchedCompanies) {
        let allEntities: any[] = [...fetchedCompanies];
        if (fetchedBranches) {
          const mappedBranches = fetchedBranches.map((b: any) => ({
             ...b,
             name: b.branchName || b.name,
             isHeadOffice: false,
             parentCompanyId: b.companyId,
             parentCompanyName: b.parentCompanyName
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

      // Surface critical failures instead of silently rendering empty modules.
      const critical = failed.filter(n => n === 'companies' || n === 'employees');
      setLoadError(
        critical.length
          ? `Couldn't load ${critical.join(' & ')} from the server. The records still exist — this is a connection/backend error, not deleted data.`
          : null
      );

      // Live Super Admin KPI counts straight from MySQL.
      // Only fetch for Super Admin — other roles are denied by the backend.
      // Read role directly from localStorage so we don't reference authProfile
      // before it is declared (authProfile useMemo is defined further below).
      const storedRole = (() => {
        try { return JSON.parse(authStorage.get('hrms_profile') || '{}').role; } catch { return null; }
      })();
      if (storedRole === 'Super Admin') {
        try {
          const stats = await api.statistics.getSuperAdmin();
          setSuperAdminStats(stats);
        } catch (statsErr) {
          console.error('Failed to load Super Admin statistics:', statsErr);
        }
      }
    } catch (err: any) {
      console.error('Hydration failed:', err);
      if (err.status === 401 || err.message?.includes('Not authorized')) {
         authStorage.clearSession();
         setIsAuthenticated(false);
         setStoredAuthProfile(null);
         return;
      }
    } finally {
      setIsHydrating(false);
    }
  };


const [storedAuthProfile, setStoredAuthProfile] = useState<UserAccount | null>(() => {
    const raw = authStorage.get('hrms_profile');
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
    // Deep link / refresh: honour the URL path first, then the last-visited page.
    const fromUrl = pathToPage(window.location.pathname);
    if (fromUrl) return fromUrl;
    const raw = localStorage.getItem('hrms_current_page');
    return (raw as PageId) || 'dashboard';
  });
  const [role, setRole] = useState<Role>(() => {
    const rawProfile = authStorage.get('hrms_profile');
    if (rawProfile) {
      const profile = JSON.parse(rawProfile);
      return profile.role;
    }
    return 'Super Admin';
  });
  const [activeCompanyId, setActiveCompanyId] = useState<string>(() => {
    const persisted = localStorage.getItem('hrms_active_company_id');
    if (persisted) return persisted;
    const rawProfile = authStorage.get('hrms_profile');
    if (rawProfile) {
      const profile = JSON.parse(rawProfile);
      return profile.role === 'Employee' ? (profile.companyId || 'c-gcri') : '';
    }
    return '';
  });

  // Whether the active workspace is a company or a branch. Held in React state
  // (not just localStorage) so a company→branch switch RE-RENDERS even when the
  // numeric id is identical — branch id 2 (Bhavnagar) collides with company id 2
  // (HealthPlus), so without this the view would never refresh on that switch.
  const [activeWorkspaceKind, setActiveWorkspaceKind] = useState<'company' | 'branch'>(() => {
    return (localStorage.getItem('hrms_active_workspace_kind') as any) || 'company';
  });

  useEffect(() => {
    if (isAuthenticated) hydrateAll();
  }, [isAuthenticated, activeCompanyId]);

  // Real-time notification bell: poll the server every 20s (and immediately on
  // login / workspace change) so newly created notifications appear without a
  // page refresh. The backend scopes the list to the current user/company.
  useEffect(() => {
    if (!isAuthenticated) return;
    let alive = true;
    const fetchNotifs = () => {
      api.notifications.getAll().then((rows: any) => {
        if (alive && Array.isArray(rows)) {
          setNotifications(rows as any);
          safeSetJSON('hrms_notifications', rows);
        }
      }).catch(() => {});
    };
    fetchNotifs();
    const t = setInterval(fetchNotifs, 20000);
    return () => { alive = false; clearInterval(t); };
  }, [isAuthenticated, activeCompanyId]);

  // Real-time Super Admin KPI sync: whenever companies or employees change
  // (create / update / delete / suspend / activate / transfer from any page),
  // re-fetch live counts from MySQL. Debounced to coalesce rapid mutations.
  // Skipped entirely for non-Super Admin roles — they cannot call this endpoint.
  // NOTE: We intentionally use storedAuthProfile?.role here (declared above)
  // rather than permissionRole (declared below) to avoid a TDZ crash.
  useEffect(() => {
    if (!isAuthenticated || storedAuthProfile?.role !== 'Super Admin') return;
    const timer = setTimeout(() => {
      api.statistics.getSuperAdmin()
        .then((stats: SuperAdminStats) => {
          console.log('[SuperAdminStats][API]', stats);
          setSuperAdminStats(stats);
        })
        .catch((err) => console.error('Super Admin statistics refresh failed:', err));
    }, 500);
    return () => clearTimeout(timer);
  }, [companies, employees, isAuthenticated, storedAuthProfile?.role]);
  const [isMasquerading, setIsMasquerading] = useState<boolean>(() => {
    return localStorage.getItem('hrms_is_masquerading') === 'true';
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('hrms_theme') as 'dark' | 'light') || 'light';
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
    authStorage.markActivity();
    setSessionMessage(null);
    setStoredAuthProfile(profile);
    setIsAuthenticated(true);
    // authStorage routes these to localStorage or sessionStorage depending on
    // the Remember Me choice recorded by the Login page.
    authStorage.set('hrms_auth', 'true');
    authStorage.set('hrms_profile', JSON.stringify(profile));
    setRole(profile.role);
    const initialCompanyId = selectedCompanyId !== undefined ? selectedCompanyId : (profile.role === 'Employee' ? profile.companyId || 'c-gcri' : '');
    setActiveCompanyId(initialCompanyId);
    if (initialCompanyId) {
      localStorage.setItem('hrms_active_company_id', initialCompanyId);
    } else {
      localStorage.removeItem('hrms_active_company_id');
    }
    // A direct login lands on the user's own company workspace (branch-admins are
    // re-derived when they pick a workspace). Reset so a stale 'branch' kind from
    // a previous masquerade session can't mis-scope a fresh login.
    localStorage.setItem('hrms_active_workspace_kind', 'company');
    setActiveWorkspaceKind('company');
    setCurrentPage('dashboard');
    localStorage.setItem('hrms_current_page', 'dashboard');
    setIsMasquerading(false);
    localStorage.setItem('hrms_is_masquerading', 'false');
  };

  // Single exit path for ending a session — manual logout, inactivity timeout,
  // an expired/invalid token, or a logout signalled from another tab. Pass
  // broadcast=false only when reacting to another tab's signal (avoids an echo).
  const endSession = (reason: 'logout' | 'inactivity' | 'expired' = 'logout', broadcast = true) => {
    authStorage.clearSession(); // clears hrms_auth, hrms_profile, hrms_jwt_token + last-activity
    if (broadcast) authStorage.broadcastLogout(reason);
    localStorage.removeItem('hrms_current_page');
    localStorage.removeItem('hrms_active_company_id');
    localStorage.removeItem('hrms_is_masquerading');
    setStoredAuthProfile(null);
    setIsMasquerading(false);
    setSessionMessage(
      reason === 'inactivity' ? 'Your session has expired due to inactivity. Please login again.'
        : reason === 'expired' ? 'Your session has expired. Please login again.'
          : null
    );
    setIsAuthenticated(false);
  };
  const handleLogout = () => endSession('logout');

  // ── Auto-logout after 60 minutes of inactivity ─────────────────────────────
  // Activity = mouse / keyboard / scroll / touch / navigation / API requests.
  useEffect(() => {
    if (!isAuthenticated) return;
    authStorage.markActivity();
    let lastMark = Date.now();
    const onActivity = () => {
      if (authStorage.isExpiredByInactivity()) { endSession('inactivity'); return; }
      const now = Date.now();
      if (now - lastMark > 5000) { lastMark = now; authStorage.markActivity(); } // throttle writes
    };
    const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'click', 'keydown', 'scroll', 'wheel', 'touchstart'];
    ACTIVITY_EVENTS.forEach((ev) => window.addEventListener(ev, onActivity, { passive: true }));
    const check = () => {
      if (authStorage.isExpiredByInactivity()) endSession('inactivity');
      else if (!authStorage.get('hrms_jwt_token')) endSession('expired'); // token deleted/cleared
    };
    const interval = window.setInterval(check, 10000);
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', check);
    return () => {
      ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, onActivity));
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', check);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // ── Global 401 (expired/invalid token) → end session immediately ───────────
  useEffect(() => {
    const onUnauthorized = () => { if (isAuthenticated) endSession('expired', false); };
    window.addEventListener('hrms:unauthorized', onUnauthorized as EventListener);
    return () => window.removeEventListener('hrms:unauthorized', onUnauthorized as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // ── Multi-tab: a logout/expiry in any tab logs out every tab ───────────────
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (!isAuthenticated) return;
      const loggedOutElsewhere =
        e.key === 'hrms_logout_event' ||
        (e.key === 'hrms_auth' && e.newValue !== 'true') ||
        (e.key === 'hrms_jwt_token' && !e.newValue);
      if (loggedOutElsewhere) {
        let reason: 'logout' | 'inactivity' | 'expired' = 'logout';
        try { const d = e.newValue ? JSON.parse(e.newValue) : null; if (d && d.reason) reason = d.reason; } catch (_) { /* ignore */ }
        endSession(reason, false); // already broadcast by the originating tab
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const handleNavigate = (page: PageId) => {
    setCurrentPage(page);
    localStorage.setItem('hrms_current_page', page);
    // Push a history entry so the browser Back button returns to the previous
    // in-app page (instead of leaving the application).
    const path = '/' + page;
    if (window.location.pathname !== path) {
      window.history.pushState({ page }, '', path);
    }
  };

  // Browser Back/Forward → switch the in-app page (never exit the app).
  useEffect(() => {
    const onPop = () => {
      const p = pathToPage(window.location.pathname);
      if (p) { setCurrentPage(p); localStorage.setItem('hrms_current_page', p); }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Keep the URL in sync when the page changes programmatically (login, workspace
  // entry, RBAC fallback). replaceState so these don't clutter the back history.
  useEffect(() => {
    if (!isAuthenticated) return;
    const path = '/' + currentPage;
    if (window.location.pathname !== path) {
      window.history.replaceState({ page: currentPage }, '', path);
    }
  }, [currentPage, isAuthenticated]);

  // Record whether the entered workspace is a company or a branch. Branch ids
  // overlap company ids in the DB, so this hint is what lets the scoping layer
  // (isCompanyIdMatch / resolveActiveWorkspace) tell "Company 1" from "Branch 1".
  const persistWorkspaceKind = (id: string, hint?: 'company' | 'branch') => {
    let kind: 'company' | 'branch' = hint || 'company';
    if (!hint) {
      const matches = companies.filter(c => String(c.id) === String(id));
      // Unambiguous → derive; ambiguous (collision) without a hint → default to
      // company (top-level), which is the safe back-compatible behaviour.
      if (matches.length === 1) kind = (matches[0] as any).parentCompanyId ? 'branch' : 'company';
      else if (matches.length > 1) kind = matches.some(m => !(m as any).parentCompanyId) ? 'company' : 'branch';
    }
    localStorage.setItem('hrms_active_workspace_kind', kind);
    setActiveWorkspaceKind(kind); // React state → forces re-render even when the id is unchanged
    return kind;
  };

  const handleCompanyChange = async (companyId: string, kind?: 'company' | 'branch') => {
    console.log('Navigation Started');
    console.log('Workspace Selected:', companyId);
    
    // Check if the user is authorized to switch to this workspace.
    // authProfile.accessibleCompanyIds is ALREADY the fully-resolved set of
    // workspace ids the user may enter (App.tsx computes it via
    // getAccessibleWorkspaceIds). We must NOT resolve it a second time — doing so
    // would treat the resolved branch ids as "specific branches" and drop the
    // company-level id, wrongly denying a company-wide user from entering their
    // company. Compare as strings (ids may be number or legacy string like
    // "c-gcri"), so ['5'].includes(5) can't wrongly reject a valid workspace.
    if (permissionRole !== 'Super Admin' && !isMasquerading) {
      const accessibleIds = (authProfile?.accessibleCompanyIds || []).map(String);
      if (!accessibleIds.includes(String(companyId))) {
        console.error(`Access Denied: Workspace ${companyId} is not in accessible list:`, accessibleIds);
        throw new Error('You do not have permission to enter this workspace. Please contact your administrator.');
      }
    }
    
    try {
      console.log('Permissions Loaded');
      setActiveCompanyId(companyId);
      localStorage.setItem('hrms_active_company_id', companyId);
      persistWorkspaceKind(companyId, kind);
      console.log('Redirecting to Dashboard');
      setCurrentPage('dashboard');
      localStorage.setItem('hrms_current_page', 'dashboard');
    } catch (err) {
      console.error('Error during workspace navigation:', err);
      throw new Error('Failed to create session context. Please check console for details.');
    }
  };

  const handleStartMasquerade = (companyId: string, kind?: 'company' | 'branch', targetPage: PageId = 'dashboard') => {
    // Normalize to a string so the active workspace id matches the value that is
    // rehydrated from localStorage on reload (avoids number-vs-string `===`
    // drift that would otherwise drop the selected branch context). The id may
    // be a branch id — masquerading into a branch is fully supported and scopes
    // every module to that branch via isCompanyIdMatch. `kind` disambiguates the
    // shared company/branch id space.
    const wsId = String(companyId);
    setActiveCompanyId(wsId);
    localStorage.setItem('hrms_active_company_id', wsId);
    persistWorkspaceKind(wsId, kind);
    setIsMasquerading(true);
    localStorage.setItem('hrms_is_masquerading', 'true');
    setRole('Company Head');
    setCurrentPage(targetPage);
    localStorage.setItem('hrms_current_page', targetPage);
  };

  const handleExitMasquerade = () => {
    setIsMasquerading(false);
    localStorage.setItem('hrms_is_masquerading', 'false');
    setRole('Super Admin');
    setActiveCompanyId('1');
    localStorage.setItem('hrms_active_company_id', '1');
    localStorage.setItem('hrms_active_workspace_kind', 'company');
    setActiveWorkspaceKind('company');
    setCurrentPage('companies');
    localStorage.setItem('hrms_current_page', 'companies');
  };

  // `resolvedRole` drives which workspace VIEW is rendered (a masquerading
  // Super Admin sees the Company Head dashboard/menus).
  const resolvedRole = isMasquerading ? 'Company Head' : role;

  // `permissionRole` drives ACCESS decisions. The real signed-in user
  // (authProfile.role) is the source of truth — a Super Admin keeps full
  // access even while masquerading, so tenant/branch/module restrictions are
  // bypassed and no "Access Denied" page can appear in masquerade mode.
  const permissionRole = authProfile?.role === 'Super Admin' ? 'Super Admin' : resolvedRole;

  const userAccessibleCompanies = React.useMemo(() => {
    if (!authProfile) return [];
    if (permissionRole === 'Super Admin' || isMasquerading) return companies;
    const accessibleIds = (authProfile.accessibleCompanyIds || []).map(String);
    return companies.filter(c => accessibleIds.includes(String(c.id)));
  }, [companies, authProfile, permissionRole, isMasquerading]);

  const userHierarchy = React.useMemo(() => buildWorkspaceHierarchy(userAccessibleCompanies), [userAccessibleCompanies]);

  // Auto-redirect on login/refresh if only one logical workspace scope exists
  useEffect(() => {
    if (!isAuthenticated || !authProfile || activeCompanyId || isHydrating) return;
    if (permissionRole === 'Super Admin') return;

    const accessibleIds = (authProfile.accessibleCompanyIds || []).map(String);
    if (accessibleIds.length === 0) return;

    if (userHierarchy.length === 1) {
      const group = userHierarchy[0];
      const companyLevelAccess = accessibleIds.includes(String(group.companyId));
      if (companyLevelAccess) {
        // Company-level access → open the consolidated company workspace by default.
        handleCompanyChange(group.companyId, 'company').catch(err => console.error(err));
      } else if (group.cards.length === 1) {
        // Branch-only access with exactly one authorized branch → open it directly.
        handleCompanyChange(group.cards[0].id, 'branch').catch(err => console.error(err));
      }
      // Branch-only with multiple branches → fall through to the SelectWorkspace
      // picker so the user chooses one of their authorized branches.
    }
  }, [isAuthenticated, authProfile, activeCompanyId, isHydrating, permissionRole, userHierarchy]);

  const resolvedCompanyId = activeCompanyId;
  // Archived-company read-only banner: shown to company users (not Super Admin)
  // when the active workspace's company is archived.
  const archivedCompanyReadOnly = permissionRole !== 'Super Admin'
    && isCompanyArchived(companies.find(c => String(c.id) === String(resolvedCompanyId)) as any);

  // Synchronous auto-seeding deactivated for clean SaaS startup environment

  useEffect(() => {
    if (!authProfile) return;
    
    // Explicit RBAC Enforcement for Modules. Employee Cards is gated on the
    // Employees module permission (no dedicated matrix row).
    if (permissionRole !== 'Super Admin') {
      const permCurrent = (currentPage === 'employee-cards' ? 'employees'
        : currentPage === 'attendance-devices' ? 'attendance'
        : currentPage === 'bonus' ? 'payroll'
        : currentPage) as AppModules;
      const isAllowed = checkCanView(permCurrent, authProfile, permissionRole);
      
      if (!isAllowed) {
        // Fallback sequentially to a safe route if the current is blocked
        if (currentPage !== 'dashboard' && checkCanView('dashboard' as AppModules, authProfile, permissionRole)) {
          setCurrentPage('dashboard');
          localStorage.setItem('hrms_current_page', 'dashboard');
        } else if (currentPage !== 'settings' && checkCanView('settings' as AppModules, authProfile, permissionRole)) {
          setCurrentPage('settings');
          localStorage.setItem('hrms_current_page', 'settings');
        } else if (currentPage !== 'payroll' && checkCanView('payroll' as AppModules, authProfile, permissionRole)) {
          setCurrentPage('payroll');
          localStorage.setItem('hrms_current_page', 'payroll');
        }
        return;
      }
    }
  }, [resolvedRole, currentPage, authProfile]);

  if (!isAuthenticated || !authProfile) {
    return (
      <React.Suspense fallback={<div className="flex items-center justify-center h-screen bg-slate-50"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>}>
        <Login userAccounts={userAccounts} companies={companies} onLogin={handleLogin} sessionMessage={sessionMessage} />
      </React.Suspense>
    );
  }

  if (!activeCompanyId && authProfile.role !== 'Super Admin') {
    return (
      <React.Suspense fallback={<div className="flex items-center justify-center h-screen bg-slate-50"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>}>
        <SelectWorkspace companies={userAccessibleCompanies} user={authProfile} onSelect={handleCompanyChange} isLoading={isHydrating} />
      </React.Suspense>
    );
  }

  const renderPage = () => {
    // Employee Cards is gated on the Employees module permission (it has no
    // dedicated permission-matrix row).
    const permPage = (currentPage === 'employee-cards' ? 'employees'
      : currentPage === 'attendance-devices' ? 'attendance'
      : currentPage === 'bonus' ? 'payroll'
      : currentPage) as AppModules;
    // Governance modules (Tender / Contract Management) are restricted to
    // Super Admin + Company Head ONLY — enforced here independently of the
    // permission matrix so HR/Employees can't reach them via direct navigation
    // even if a stale matrix grant exists. Mirrors the backend leadership gate.
    const LEADERSHIP_ONLY_PAGES = ['tenders', 'contracts'];
    const isLeadership = permissionRole === 'Super Admin' || permissionRole === 'Company Head';
    // Secondary render-level check to completely block unauthorized rendering
    if (
      (LEADERSHIP_ONLY_PAGES.includes(currentPage) && !isLeadership) ||
      (permissionRole !== 'Super Admin' && !checkCanView(permPage, authProfile, permissionRole))
    ) {
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
            employees={activeEmployees}
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
            superAdminStats={superAdminStats}
          />
        );
      case 'companies':
        // Hard frontend gate — even if routing is bypassed, non-Super Admin
        // users see the Access Denied screen and no company data is rendered.
        if (permissionRole !== 'Super Admin') {
          return (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center" style={{ minHeight: '60vh' }}>
              <div className="w-24 h-24 rounded-full flex items-center justify-center mb-6" style={{ background: 'linear-gradient(135deg, #fee2e2, #fecaca)' }}>
                <ShieldAlert className="w-12 h-12" style={{ color: '#dc2626' }} />
              </div>
              <h2 className="text-2xl font-bold mb-2" style={{ color: '#111827' }}>Access Denied</h2>
              <p className="max-w-md" style={{ color: '#6b7280' }}>
                The <span className="font-bold" style={{ color: '#374151' }}>Company Management</span> module is exclusively
                available to <span className="font-bold" style={{ color: '#2563eb' }}>Super Admin</span> accounts.
                Please contact your system administrator if you require elevated access.
              </p>
              <div className="mt-6 px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
                Your role: {permissionRole}
              </div>
            </div>
          );
        }
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
            superAdminStats={superAdminStats}
            onRefresh={hydrateAll}
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
      case 'employee-cards':
        return (
          <EmployeeCards
            role={resolvedRole}
            activeCompanyId={resolvedCompanyId}
            companies={companies}
            employees={activeEmployees}
          />
        );
      case 'leaves':
        return (
          <LeaveManagement
            role={resolvedRole}
            activeCompanyId={resolvedCompanyId}
            leaves={leaves}
            onUpdateLeaves={handleUpdateLeaves}
            employees={activeEmployees}
            companies={companies}
            authProfile={authProfile}
          />
        );
      case 'tasks':
        return (
          <TaskManager
            role={resolvedRole}
            activeCompanyId={resolvedCompanyId}
            companies={companies}
            authProfile={authProfile}
          />
        );
      case 'tenders':
        return (
          <Tenders
            role={resolvedRole}
            activeCompanyId={resolvedCompanyId}
            authProfile={authProfile}
            companies={companies}
            onStartMasquerade={handleStartMasquerade}
          />
        );
      case 'contracts':
        return (
          <Contracts
            role={resolvedRole}
            activeCompanyId={resolvedCompanyId}
            authProfile={authProfile}
            companies={companies}
            onStartMasquerade={handleStartMasquerade}
          />
        );
      case 'attendance':
        return (
          <Attendance
            role={resolvedRole}
            activeCompanyId={resolvedCompanyId}
            attendance={attendance}
            onUpdateAttendance={handleUpdateAttendance}
            employees={activeEmployees}
            companies={companies}
            leaves={leaves}
            onRefresh={hydrateAll}
          />
        );
      case 'attendance-devices':
        return (
          <AttendanceDevices
            role={resolvedRole}
            activeCompanyId={resolvedCompanyId}
            companies={companies}
            authProfile={authProfile}
          />
        );
      case 'bonus':
        return (
          <BonusManagement
            role={resolvedRole}
            activeCompanyId={resolvedCompanyId}
            companies={companies}
            authProfile={authProfile}
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
            employees={activeEmployees}
            attendance={attendance}
            leaves={leaves}
            authProfile={authProfile}
            onNavigate={(p) => setCurrentPage(p as PageId)}
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
            employees={activeEmployees}
          />
        );
      case 'reports':
        return (
          <ComplianceReports
            role={resolvedRole}
            activeCompanyId={resolvedCompanyId}
            companies={companies}
            authProfile={authProfile}
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
            onRefresh={hydrateAll}
          />
        );
      case 'audit':
        return <AuditTrail role={permissionRole} />;
      default:
        return (
          <Dashboard
            role={resolvedRole}
            onNavigate={handleNavigate}
            activeCompanyId={resolvedCompanyId}
            onStartMasquerade={handleStartMasquerade}
            companies={companies}
            employees={activeEmployees}
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
            superAdminStats={superAdminStats}
          />
        );
    }
  };

  return (
    <PermissionProvider authProfile={authProfile} role={permissionRole} companies={companies} activeCompanyId={resolvedCompanyId}>
      {/* Global Wavy Background (Second Image Style) */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden bg-[#F8FBFF]">
        {/* Soft floating circles */}
        <div className="absolute top-[20%] left-[35%] w-16 h-16 bg-[#E0F2FE] rounded-full opacity-60"></div>
        <div className="absolute bottom-[10%] right-[10%] w-[350px] h-[350px] bg-[#E0F2FE] rounded-full opacity-70"></div>
        <div className="absolute top-[-10%] right-[15%] w-[250px] h-[250px] bg-[#E0F2FE] rounded-full opacity-40"></div>
        
        {/* Wavy shape at bottom */}
        <svg className="absolute bottom-0 left-0 w-full text-[#E0F2FE]/50" viewBox="0 0 1440 320" preserveAspectRatio="none" style={{ height: '40vh' }}>
          <path fill="currentColor" d="M0,160L48,170.7C96,181,192,203,288,197.3C384,192,480,160,576,149.3C672,139,768,149,864,170.7C960,192,1056,224,1152,213.3C1248,203,1344,149,1392,122.7L1440,96L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"></path>
        </svg>
      </div>

      {loadError && (
        <div className="fixed top-0 inset-x-0 z-[60] bg-rose-600 text-white text-xs sm:text-sm font-semibold px-4 py-2 flex items-center justify-center gap-3 shadow-lg">
          <span>⚠️ {loadError}</span>
          <button
            onClick={() => hydrateAll()}
            disabled={isHydrating}
            className="px-3 py-0.5 rounded-md bg-white/20 hover:bg-white/30 font-bold transition disabled:opacity-50"
          >
            {isHydrating ? 'Retrying…' : 'Retry'}
          </button>
          <button onClick={() => setLoadError(null)} className="px-2 font-bold hover:text-rose-200" title="Dismiss">✕</button>
        </div>
      )}

      <div className="flex h-screen overflow-hidden font-sans antialiased relative z-10">
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
          pageTitle={
            currentPage === 'tenders' && resolvedRole === 'Super Admin' ? 'Tender Overview'
              : currentPage === 'contracts' && resolvedRole === 'Super Admin' ? 'Contract Overview'
                : pageTitles[currentPage] || 'HRMS'
          }
          companies={userAccessibleCompanies}
          notifications={notifications}
          onUpdateNotifications={handleUpdateNotifications}
          theme={theme}
          toggleTheme={toggleTheme}
          authProfile={authProfile}
        />

        <main className="flex-1 overflow-y-auto bg-transparent p-4 md:p-6">
          {archivedCompanyReadOnly && (
            <div className="max-w-[1800px] mx-auto mb-4">
              <div className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-800 text-sm font-semibold flex items-center gap-2 shadow-sm">
                <span aria-hidden className="text-base leading-none">🔒</span>
                <span>This company has been archived. Viewing historical records only — no modifications are permitted.</span>
              </div>
            </div>
          )}
          {/* Full-width content: fill the viewport, capped at 1800px so it does
              not sprawl on ultrawide monitors. Previously max-w-7xl (1280px)
              wasted ~340px of width on a 1920 display. */}
          <div className="max-w-[1800px] mx-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={`${currentPage}::${resolvedCompanyId}::${activeWorkspaceKind}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
              >
                <React.Suspense fallback={<div className="flex items-center justify-center h-full min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>}>
                  {renderPage()}
                </React.Suspense>
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
