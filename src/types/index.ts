export type Role = 'Super Admin' | 'Company Head' | 'HR' | 'Finance' | 'Employee' | 'Staff';

export type EmployeeStatus = 'Active' | 'Inactive' | 'On Leave' | 'Terminated' | 'Archived';
export type LeaveStatus = 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
export type LeaveType = 'Annual' | 'Sick' | 'Casual' | 'Maternity' | 'Paternity' | 'Unpaid';
export type PayrollStatus = 'draft' | 'prepared' | 'verified' | 'payment_pending' | 'paid' | 'payslip_generated' | 'failed';
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
  serviceBookNo?: string;
  branchLocation?: string;
  branchId?: string;

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
  name: string;
  type: 'Contract' | 'Resume' | 'BGV' | 'Payslip' | 'Offer Letter' | 'Appointment Letter' | 'Experience Letter' | 'Relieving Letter' | 'Aadhaar' | 'PAN' | 'Other';
  employeeId?: string;
  employeeName?: string;
  uploadedBy: string;
  uploadedOn: string;
  size: string;
  status: 'Verified' | 'Pending' | 'Rejected';
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

export const isCompanyIdMatch = (recordCompanyId: string, activeId: string, companiesList?: Company[], recordBranchLocation?: string, recordEmployeeBranchId?: string): boolean => {
  if (recordCompanyId === activeId) return true;
  
  let list = companiesList;
  if (!list || list.length === 0) {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem('hrms_companies');
      if (raw) {
        try { list = JSON.parse(raw); } catch (e) {}
      }
    }
  }
  if (!list || list.length === 0) return false;
  
  const activeComp = list.find(c => c.id === activeId);
  
  // Branch mode: If active is a branch (has parentCompanyId and not head office)
  if (activeComp && activeComp.parentCompanyId && !activeComp.isHeadOffice) {
     // If the record specifically belongs to this branch's ID, it's a match
     if (recordEmployeeBranchId && recordEmployeeBranchId === activeId) return true;
     
     // Record must belong to the parent company
     if (recordCompanyId === activeComp.parentCompanyId && recordBranchLocation) {
       const activeBranchName = (activeComp.name || activeComp.branchName || '').toUpperCase().trim();
       if (recordBranchLocation.toUpperCase().trim() === activeBranchName) return true;
     }
     
     // Fallback: If it's a branch but record only has parentCompanyId, it belongs to head office, so don't show it in branch
     return false;
  }
  
  // Parent mode: active is a head office
  if (activeComp && (!activeComp.parentCompanyId || activeComp.isHeadOffice)) {
    const recordComp = list.find(c => c.id === recordCompanyId);
    return recordCompanyId === activeId || recordComp?.parentCompanyId === activeComp.id;
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

