export type Role = 'Super Admin' | 'Company Head' | 'HR' | 'Finance' | 'Employee' | 'Staff';

export type EmployeeStatus = 'Active' | 'Inactive' | 'On Leave' | 'Terminated' | 'Archived';
export type LeaveStatus = 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
export type LeaveType = 'Annual' | 'Sick' | 'Casual' | 'Maternity' | 'Paternity' | 'Unpaid';
export type PayrollStatus = 'draft' | 'prepared' | 'verified' | 'payment_pending' | 'approved' | 'paid' | 'locked' | 'payslip_generated' | 'failed';
export type AttendanceStatus = 'Present' | 'Absent' | 'Half Day' | 'Weekly Off' | 'Holiday' | 'Leave' | 'Work From Home' | 'On Duty';
export type AttendanceFlag = 'Late Mark' | 'Early Exit' | 'Overtime' | 'Night Shift' | 'Missed Punch' | 'Double Shift' | 'Field Work';

export interface Company {
  id: string;
  name: string;
  domain: string;
  adminName: string;
  adminEmail: string;
  phone: string;
  industry: string;
  status: 'Active' | 'Pending' | 'Inactive' | 'Expiring Soon' | 'Renewal Pending' | 'Offboarding In Progress' | 'Tender Completed' | 'Archived';
  employeeCount: number;
  joinDate: string;
  plan: 'Starter' | 'Professional' | 'Enterprise';
  logo: string;
  logoImage?: string;
  
  offboardingState?: {
    initiatedOn?: string;
    payrollVerified?: boolean;
    invoiceCleared?: boolean;
    complianceVerified?: boolean;
    assetCheckCompleted?: boolean;
    employeesOffboarded?: boolean;
    financialSettlement?: boolean;
    completedOn?: string;
  };
  
  pfRate: number;
  esicRate: number;
  basicPercent: number;
  profTaxRate: number;
  overtimeRate: number;

  primaryColor: string;
  headerText: string;
  footerText: string;
  signatureText: string;
  themeStyle: 'Modern' | 'Classic' | 'Elegant' | 'Minimalist';

  paymentStatus: 'Paid' | 'Pending' | 'Overdue' | 'Expired' | 'Trial Active';
  renewalDate: string;
  gstNumber?: string;
  billingAddress?: string;
  subscriptionPrice: number;
  priceMonthly?: number;
  priceYearly?: number;
  billingCycle: 'Monthly' | 'Yearly';
  accountStatus: 'Active' | 'Suspended';

  parentCompanyId?: string;
  branchName?: string;
  branchCode?: string;
  isHeadOffice?: boolean;
  isArchived?: boolean;

  purchasedAdditionalBranches?: number;
  branchLicenseStatus?: 'Active License' | 'Pending Upgrade' | 'Suspended';
  branchRenewalDate?: string;
  employeeCapacity?: number;
  payrollLoad?: number;
  storageUsed?: string;
  activeHrUsers?: number;
  monthlyUsage?: number;
  branchPriceAddon?: number;

  branchLicenseActive?: boolean;
  branchPortalActive?: boolean;
  licensedEmployeeLimit?: number;
  monthlyBranchCost?: number;
  billingIncluded?: boolean;

  companyIndustry?: string;
  departmentTemplateType?: string;
  customDepartments?: string[];
  inheritParentDepartments?: boolean;
}

export interface Employee {
  id: string;
  employeeId: string;
  companyId: string;
  name: string;
  email: string;
  phone: string;
  department: string;
  designation: string;
  role: Role; 
  status: EmployeeStatus;
  joinDate: string;
  location: string;
  avatar: string;
  salary: number;
  manager: string;

  firstName?: string;
  middleName?: string;
  lastName?: string;
  aadhaarName?: string;
  gender?: string;
  dob?: string;
  maritalStatus?: string;
  nationality?: string;
  photo?: string;
  signature?: string;

  fatherSpouseName?: string;
  relationType?: string;
  emergencyContact?: string;

  category?: string;
  employmentType?: string;
  exitDate?: string;
  exitReason?: string;
  branchLocation?: string;
  biometricId?: string;
  branchId?: string;
  shiftId?: number | string | null;

  aadhaar?: string;
  pan?: string;
  pfNumber?: string;
  uan?: string;
  esic?: string;

  bankName?: string;
  accountNumber?: string;
  ifsc?: string;

  presentAddress?: string;
  permanentAddress?: string;
  state?: string;
  city?: string;

  aadhaarUpload?: string;
  panUpload?: string;
  photoUpload?: string;
  signatureUpload?: string;

  offboardingState?: {
    initiatedOn?: string;
    documentClearance?: boolean;
    assetReturn?: boolean;
    payrollSettled?: boolean;
    attendanceCleared?: boolean;
    managerApproved?: boolean;
    hrApproved?: boolean;
    completedOn?: string;
    workflowStatus?: 'INITIATED' | 'DOCUMENT_PENDING' | 'PAYROLL_PENDING' | 'ACCESS_REVOCATION_PENDING' | 'HR_APPROVAL_PENDING' | 'COMPLETED' | 'ARCHIVED';
  };
  
  employmentHistory?: {
    companyId: string;
    companyName: string;
    branchName?: string;
    role: string;
    designation: string;
    startDate: string;
    endDate: string;
    reason: string;
  }[];
}

export interface AttendanceRecord {
  id: string;
  companyId: string;
  employeeId: string;
  employeeName: string;
  department: string;
  date: string;
  clockIn: string;
  clockOut: string;
  status: AttendanceStatus;
  hoursWorked: number;
  flags?: AttendanceFlag[];
  leaveType?: string;
  shift?: string;
}

export interface LeaveRequest {
  id: string;
  companyId: string;
  employeeId: string;
  employeeName: string;
  department: string;
  leaveType: LeaveType;
  fromDate: string;
  toDate: string;
  days: number;
  reason: string;
  status: LeaveStatus;
  appliedOn: string;
  approvedBy?: string;
  approvedOn?: string;
}

export interface LeaveBalance {
  employeeId: string;
  annual: number;
  sick: number;
  casual: number;
  used: number;
  remaining: number;
}

export interface PayrollRecord {
  employee?: Employee;
  id: string;
  companyId: string;
  employeeId: string;
  employeeName: string;
  department: string;
  month: string;
  year: number;
  basicSalary: number;
  allowances: number;
  deductions: number;
  netSalary: number;
  status: PayrollStatus;
  
  salary: number;
  payrollStatus: PayrollStatus;
  paymentStatus: 'pending' | 'paid' | 'failed';
  payslipGenerated: boolean;

  processedOn?: string;
  paymentDate?: string;
  dueDate?: string;
  paymentMethod?: string;
  paidBy?: string;

  bonus?: number;
  tax?: number;
  notes?: string;
}

export interface Document {
  id: string;
  companyId: string;
  branchId?: string;
  name: string;
  // NOTE: kept as the original narrow union for now to stay structurally
  // compatible with the parallel mockData.Document. The full supported set
  // (see DOCUMENT_TYPES in pages/Documents.tsx) is stored at runtime regardless;
  // Phase 2 will widen this together with mockData.Document.
  type: 'Contract' | 'Resume' | 'BGV' | 'Payslip' | 'Offer Letter' | 'Appointment Letter' | 'Experience Letter' | 'Relieving Letter' | 'Aadhaar' | 'PAN' | 'Other';
  employeeId?: string;
  employeeName?: string;
  uploadedBy: string;
  uploadedOn: string;
  size: string;
  status: 'Verified' | 'Pending' | 'Rejected';
  // ── File storage (base64 in DB + external link) ──
  url?: string;        // external link (Google Drive / OneDrive / Dropbox / direct PDF)
  fileData?: string;   // base64 data-URL of the uploaded file (device / drag-drop / camera)
  mimeType?: string;   // drives the preview viewer (image vs PDF vs download-only)
  // ── Identity / validity ──
  documentNumber?: string;
  issueDate?: string;
  expiryDate?: string;
  remarks?: string;
  // ── Audit trail ──
  verifiedBy?: string;
  verifiedOn?: string;
  editedBy?: string;
  editedOn?: string;
}

export interface Notification {
  id: string;
  companyId?: string; 
  type: 'leave' | 'payroll' | 'attendance' | 'company' | 'system';
  message: string;
  timestamp: string;
  read: boolean;
  priority: 'high' | 'medium' | 'low';
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  priceMonthly: number;
  priceYearly: number;
  employeeLimit: number | 'Unlimited';
  hrLimit: number | 'Unlimited';
  storageLimit: string;
  payrollAccess: boolean;
  documentAccess: boolean;
  includedBranchLimit: number;
}

export interface PaymentRecord {
  id: string;
  companyId: string;
  companyName: string;
  amount: number;
  paymentDate: string;
  invoiceNumber: string;
  planType: string;
  billingCycle?: 'Monthly' | 'Yearly' | string;
  paymentMode: 'Card' | 'UPI' | 'Bank Transfer' | 'Net Banking' | 'Manual' | 'System Change';
  transactionStatus: 'Success' | 'Failed' | 'Refunded';
}

export interface LetterTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
}

export const PLAN_LIMITS = {
  Starter: {
    employees: 100,
    hrAdmins: 3
  },
  Professional: {
    employees: 1000,
    hrAdmins: 15
  },
  Enterprise: {
    employees: 'Unlimited' as const,
    hrAdmins: 'Unlimited' as const
  }
};

export const getCompanyIdFromBranchName = (branchName: string, activeCompanyId: string, companies: Company[]): string => {
  if (!branchName) return activeCompanyId;
  const match = companies.find(c => 
    (c.branchName?.toLowerCase() === branchName.toLowerCase()) || 
    (c.name.toLowerCase().includes(branchName.toLowerCase()))
  );
  return match ? match.id : activeCompanyId;
};

// The workspace "kind" hint disambiguates the shared company/branch id space.
// Branch ids (1..N) overlap company ids (1..N) in the database, so an id alone
// is ambiguous — id 1 may be Company "Vishv" OR Branch "Ahmedabad". The active
// workspace's kind is recorded when it is entered (see App.tsx) and read here.
const getActiveWorkspaceKind = (): 'company' | 'branch' | null => {
  if (typeof window === 'undefined') return null;
  try { return localStorage.getItem('hrms_active_workspace_kind') as any; } catch { return null; }
};

// Resolve which entity `activeId` refers to, using the kind hint to break a
// company/branch id collision (prefer the branch when kind === 'branch').
export const resolveActiveWorkspace = (list: any[] | undefined, activeId: any, kind?: 'company' | 'branch' | null): any => {
  const eq = (a: any, b: any) => a != null && b != null && String(a) === String(b);
  if (!list || !list.length) return null;
  const matches = list.filter(c => eq(c.id, activeId));
  if (matches.length <= 1) return matches[0] || null;
  const k = kind ?? getActiveWorkspaceKind();
  if (k === 'branch') return matches.find(c => !!c.parentCompanyId) || matches[0];
  if (k === 'company') return matches.find(c => !c.parentCompanyId) || matches[0];
  return matches[0];
};

// Company/Branch ids are integers but may arrive as numeric strings ("1") from
// the workspace/localStorage layer — compare them type-insensitively via `eq`.
//
// Because branch ids overlap company ids, scoping is driven by the active
// workspace KIND (resolved via resolveActiveWorkspace), never by a bare
// `recordCompanyId === activeId` shortcut that would leak a sibling company's
// rows into a branch view (and vice-versa).
export const isCompanyIdMatch = (recordCompanyId: any, activeId: any, companiesList?: Company[], recordBranchLocation?: string, recordEmployeeBranchId?: any): boolean => {
  const eq = (a: any, b: any) => a != null && b != null && String(a) === String(b);

  let list: any[] | undefined = companiesList;
  if (!list || list.length === 0) {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem('hrms_companies');
      if (raw) {
        try { list = JSON.parse(raw); } catch (e) {}
      }
    }
  }

  const kind = getActiveWorkspaceKind();
  const activeComp = resolveActiveWorkspace(list, activeId, kind);
  const activeIsBranch = activeComp
    ? (!!activeComp.parentCompanyId && !activeComp.isHeadOffice)
    : (kind === 'branch');

  if (activeIsBranch) {
    // BRANCH scope — a record belongs here only if it is tied to THIS branch.
    // Employee rows carry branchId; child rows (attendance/payroll/leave) carry
    // no branchId and are scoped elsewhere by employee membership, so they
    // correctly fall through to `false` here.
    if (eq(recordEmployeeBranchId, activeId)) return true;
    if (activeComp && recordBranchLocation && eq(recordCompanyId, activeComp.parentCompanyId)) {
      const activeBranchName = (activeComp.name || activeComp.branchName || '').toUpperCase().trim();
      if (String(recordBranchLocation).toUpperCase().trim() === activeBranchName) return true;
    }
    return false;
  }

  // COMPANY scope — the company itself plus any sub-companies that roll up to it.
  // (Branch employees already carry the parent companyId, so they are included.)
  if (eq(recordCompanyId, activeId)) return true;
  if (list && list.length) {
    const recordComp = list.find(c => eq(c.id, recordCompanyId));
    if (activeComp && eq(recordComp?.parentCompanyId, activeComp.id)) return true;
  } else {
    // No list available — fall back to the legacy direct comparisons.
    return eq(recordCompanyId, activeId) || eq(recordEmployeeBranchId, activeId);
  }
  return false;
};

/**
 * buildScopedEmployeeIdSet
 *
 * Returns the set of employee identifiers (both the uuid `id` and the business
 * `employeeId`) that belong to the active company/branch workspace. This is the
 * single source of truth used to scope CHILD records (attendance, leaves,
 * payroll, documents) — those records carry an `employeeId` but no `branchId`,
 * so they can only be scoped to a branch through employee membership.
 */
export const buildScopedEmployeeIdSet = (
  employees: Array<{ id?: string; employeeId?: string; companyId: string; branchLocation?: string; branchId?: string }>,
  activeId: string,
  companiesList?: Company[]
): Set<string> => {
  const ids = new Set<string>();
  for (const e of employees) {
    if (isCompanyIdMatch(e.companyId, activeId, companiesList, e.branchLocation, e.branchId)) {
      if (e.id) ids.add(e.id);
      if (e.employeeId) ids.add(e.employeeId);
    }
  }
  return ids;
};

/**
 * isRecordInWorkspace
 *
 * True when a child record belongs to the active workspace — by employee
 * membership first (works for both company and branch workspaces), falling back
 * to a direct company match for company-level records with no employee link.
 */
export const isRecordInWorkspace = (
  record: { employeeId?: string; companyId?: string },
  activeId: string,
  scopedEmployeeIds: Set<string>,
  companiesList?: Company[]
): boolean => {
  if (record.employeeId && scopedEmployeeIds.has(record.employeeId)) return true;
  if (record.companyId) return isCompanyIdMatch(record.companyId, activeId, companiesList);
  return false;
};

