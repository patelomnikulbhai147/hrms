// ─── Types ────────────────────────────────────────────────────────────────────

export type Role = 'Super Admin' | 'Company Head' | 'HR' | 'Finance' | 'Employee';

export type EmployeeStatus = 'Active' | 'Inactive' | 'On Leave' | 'Terminated';
export type LeaveStatus = 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
export type LeaveType = 'Annual' | 'Sick' | 'Casual' | 'Maternity' | 'Paternity' | 'Unpaid';
export type PayrollStatus = 'draft' | 'prepared' | 'verified' | 'payment_pending' | 'paid' | 'payslip_generated' | 'failed';
export type AttendanceStatus = 'Present' | 'Absent' | 'Late' | 'Half Day' | 'WFH';

export interface Company {
  id: string;
  name: string;
  domain: string;
  adminName: string;
  adminEmail: string;
  phone: string;
  industry: string;
  status: 'Active' | 'Pending' | 'Inactive';
  employeeCount: number;
  joinDate: string;
  plan: 'Starter' | 'Professional' | 'Enterprise';
  logo: string;
  
  // Scoped Payroll settings
  pfRate: number; // e.g. 12%
  esicRate: number; // e.g. 3.25%
  basicPercent: number; // e.g. 50% of CTC
  profTaxRate: number; // e.g. 200 INR
  overtimeRate: number;

  // Multi-Company Branding & Custom Templates
  address: string;
  email: string;
  primaryColor: string; // e.g. '#3b82f6'
  headerText: string;
  footerText: string;
  signatureText: string;
  themeStyle: 'Modern' | 'Classic' | 'Elegant' | 'Minimalist';

  // Subscription & Billing details
  paymentStatus: 'Paid' | 'Pending' | 'Overdue' | 'Expired' | 'Trial Active';
  renewalDate: string; // YYYY-MM-DD
  gstNumber?: string;
  billingAddress?: string;
  subscriptionPrice: number;
  priceMonthly?: number;
  priceYearly?: number;
  billingCycle: 'Monthly' | 'Yearly';
  accountStatus: 'Active' | 'Suspended';

  // Parent Company & Branch Architecture fields
  parentCompanyId?: string;
  branchName?: string;
  branchCode?: string;
  isHeadOffice?: boolean;

  // Subscription Add-ons and usage telemetry fields
  purchasedAdditionalBranches?: number;
  branchLicenseStatus?: 'Active License' | 'Pending Upgrade' | 'Suspended';
  branchRenewalDate?: string;
  employeeCapacity?: number;
  payrollLoad?: number;
  storageUsed?: string;
  activeHrUsers?: number;
  monthlyUsage?: number;
  branchPriceAddon?: number;

  // Branch Billing Status Engine fields
  branchLicenseActive?: boolean;
  branchPortalActive?: boolean;
  licensedEmployeeLimit?: number;
  monthlyBranchCost?: number;
  billingIncluded?: boolean;

  // Dynamic Industry Departments Mapping fields
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
  role: Role | 'Staff'; 
  status: EmployeeStatus;
  joinDate: string;
  location: string;
  avatar: string;
  salary: number;
  manager: string;

  // Real Enterprise Master fields from Excel:
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

  category?: string; // HS/S/SS/US
  employmentType?: string;
  exitDate?: string;
  exitReason?: string;
  serviceBookNo?: string;
  branchLocation?: string;

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
  
  // New unified schema columns
  salary: number;
  payrollStatus: PayrollStatus;
  paymentStatus: 'pending' | 'paid' | 'failed';
  payslipGenerated: boolean;

  processedOn?: string;
  paymentDate?: string;
  dueDate?: string;
  paymentMethod?: string;
  paidBy?: string;

  // Custom Interactive Extensions
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
  paymentMode: 'Card' | 'UPI' | 'Bank Transfer' | 'Net Banking' | 'Manual';
  transactionStatus: 'Success' | 'Failed' | 'Refunded';
}

export interface LetterTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
}

// ─── SaaS Companies ────────────────────────────────────────────────────────────

export const companies: Company[] = [
  {
    id: 'c-gcri',
    name: 'GCRI',
    domain: 'gcri.in',
    adminName: 'Dr. Nilesh Patel',
    adminEmail: 'admin@gcri.in',
    phone: '+91 9876543210',
    industry: 'Healthcare',
    status: 'Active',
    employeeCount: 835,
    joinDate: '2026-05-22',
    plan: 'Enterprise',
    logo: 'GCRI',
    pfRate: 12,
    esicRate: 3.25,
    basicPercent: 50,
    profTaxRate: 200,
    overtimeRate: 1.5,
    address: 'Civil Hospital Campus, Asarwa, Ahmedabad, Gujarat 380016',
    email: 'admin@gcri.in',
    primaryColor: '#4f46e5', // Deep premium indigo theme
    headerText: 'GUJARAT CANCER RESEARCH INSTITUTE (GCRI)',
    footerText: 'Providing Quality Cancer Care',
    signatureText: 'Director, GCRI',
    themeStyle: 'Modern',
    paymentStatus: 'Paid',
    renewalDate: '2027-05-22',
    gstNumber: '24AAACG1234F1Z1',
    billingAddress: 'Civil Hospital Campus, Asarwa, Ahmedabad, Gujarat 380016',
    subscriptionPrice: 12999,
    billingCycle: 'Monthly',
    accountStatus: 'Active',
    isHeadOffice: true,
    purchasedAdditionalBranches: 2,
    companyIndustry: 'Healthcare',
    departmentTemplateType: 'Healthcare'
  },
  {
    id: 'c-ahmedabad',
    name: 'GCRI Ahmedabad',
    domain: 'ahmedabad.gcri.in',
    adminName: 'Dr. Nilesh Patel',
    adminEmail: 'admin@ahmedabad.gcri.in',
    phone: '+91 9876543210',
    industry: 'Healthcare',
    status: 'Active',
    employeeCount: 780,
    joinDate: '2026-05-22',
    plan: 'Enterprise',
    logo: 'GCRI',
    pfRate: 12,
    esicRate: 3.25,
    basicPercent: 50,
    profTaxRate: 200,
    overtimeRate: 1.5,
    address: 'Civil Hospital Campus, Asarwa, Ahmedabad, Gujarat 380016',
    email: 'admin@ahmedabad.gcri.in',
    primaryColor: '#3b82f6',
    headerText: 'GCRI AHMEDABAD CANCER RESEARCH INSTITUTE',
    footerText: 'Providing Quality Cancer Care',
    signatureText: 'Director, GCRI Ahmedabad',
    themeStyle: 'Modern',
    paymentStatus: 'Paid',
    renewalDate: '2027-05-22',
    gstNumber: '24AAACG1234F1Z1',
    billingAddress: 'Civil Hospital Campus, Asarwa, Ahmedabad, Gujarat 380016',
    subscriptionPrice: 12999,
    billingCycle: 'Monthly',
    accountStatus: 'Active',
    parentCompanyId: 'c-gcri',
    branchName: 'Ahmedabad',
    branchCode: 'GCRI-AMD',
    isHeadOffice: false,
    branchLicenseStatus: 'Active License',
    companyIndustry: 'Healthcare',
    departmentTemplateType: 'Healthcare',
    inheritParentDepartments: true,
    branchRenewalDate: '2027-05-22',
    employeeCapacity: 1000,
    payrollLoad: 4250000,
    storageUsed: '45.2 GB',
    activeHrUsers: 4,
    monthlyUsage: 94,
    branchPriceAddon: 0,
    branchLicenseActive: true,
    branchPortalActive: true,
    licensedEmployeeLimit: 1000,
    monthlyBranchCost: 0,
    billingIncluded: true
  },
  {
    id: 'c-rajkot',
    name: 'GCRI Rajkot',
    domain: 'rajkot.gcri.in',
    adminName: 'Dr. Nilesh Patel',
    adminEmail: 'admin@rajkot.gcri.in',
    phone: '+91 9876543210',
    industry: 'Healthcare',
    status: 'Active',
    employeeCount: 22,
    joinDate: '2026-05-22',
    plan: 'Enterprise',
    logo: 'GCRI',
    pfRate: 12,
    esicRate: 3.25,
    basicPercent: 50,
    profTaxRate: 200,
    overtimeRate: 1.5,
    address: 'GCRI Rajkot Branch, Rajkot, Gujarat 360001',
    email: 'admin@rajkot.gcri.in',
    primaryColor: '#10b981',
    headerText: 'GCRI RAJKOT CANCER RESEARCH INSTITUTE',
    footerText: 'Providing Quality Cancer Care',
    signatureText: 'Director, GCRI Rajkot',
    themeStyle: 'Modern',
    paymentStatus: 'Paid',
    renewalDate: '2027-05-22',
    gstNumber: '24AAACG1234F1Z2',
    billingAddress: 'GCRI Rajkot Branch, Rajkot, Gujarat 360001',
    subscriptionPrice: 12999,
    billingCycle: 'Monthly',
    accountStatus: 'Active',
    parentCompanyId: 'c-gcri',
    branchName: 'Rajkot',
    branchCode: 'GCRI-RJT',
    isHeadOffice: false,
    branchLicenseStatus: 'Active License',
    companyIndustry: 'Healthcare',
    departmentTemplateType: 'Healthcare',
    inheritParentDepartments: true,
    branchRenewalDate: '2027-06-15',
    employeeCapacity: 200,
    payrollLoad: 185000,
    storageUsed: '3.4 GB',
    activeHrUsers: 2,
    monthlyUsage: 72,
    branchPriceAddon: 0,
    branchLicenseActive: true,
    branchPortalActive: true,
    licensedEmployeeLimit: 200,
    monthlyBranchCost: 0,
    billingIncluded: true
  },
  {
    id: 'c-bhavnagar',
    name: 'GCRI Bhavnagar',
    domain: 'bhavnagar.gcri.in',
    adminName: 'Dr. Nilesh Patel',
    adminEmail: 'admin@bhavnagar.gcri.in',
    phone: '+91 9876543210',
    industry: 'Healthcare',
    status: 'Active',
    employeeCount: 16,
    joinDate: '2026-05-22',
    plan: 'Enterprise',
    logo: 'GCRI',
    pfRate: 12,
    esicRate: 3.25,
    basicPercent: 50,
    profTaxRate: 200,
    overtimeRate: 1.5,
    address: 'GCRI Bhavnagar Branch, Bhavnagar, Gujarat 364001',
    email: 'admin@bhavnagar.gcri.in',
    primaryColor: '#8b5cf6',
    headerText: 'GCRI BHAVNAGAR CANCER RESEARCH INSTITUTE',
    footerText: 'Providing Quality Cancer Care',
    signatureText: 'Director, GCRI Bhavnagar',
    themeStyle: 'Modern',
    paymentStatus: 'Paid',
    renewalDate: '2027-05-22',
    gstNumber: '24AAACG1234F1Z3',
    billingAddress: 'GCRI Bhavnagar Branch, Bhavnagar, Gujarat 364001',
    subscriptionPrice: 12999,
    billingCycle: 'Monthly',
    accountStatus: 'Active',
    parentCompanyId: 'c-gcri',
    branchName: 'Bhavnagar',
    branchCode: 'GCRI-BHV',
    isHeadOffice: false,
    branchLicenseStatus: 'Active License',
    companyIndustry: 'Healthcare',
    departmentTemplateType: 'Healthcare',
    inheritParentDepartments: true,
    branchRenewalDate: '2027-07-20',
    employeeCapacity: 200,
    payrollLoad: 124000,
    storageUsed: '1.8 GB',
    activeHrUsers: 2,
    monthlyUsage: 64,
    branchPriceAddon: 999,
    branchLicenseActive: true,
    branchPortalActive: true,
    licensedEmployeeLimit: 200,
    monthlyBranchCost: 999,
    billingIncluded: false
  },
  {
    id: 'c-siddhpur',
    name: 'GCRI Siddhpur',
    domain: 'siddhpur.gcri.in',
    adminName: 'Dr. Nilesh Patel',
    adminEmail: 'admin@siddhpur.gcri.in',
    phone: '+91 9876543210',
    industry: 'Healthcare',
    status: 'Active',
    employeeCount: 17,
    joinDate: '2026-05-22',
    plan: 'Enterprise',
    logo: 'GCRI',
    pfRate: 12,
    esicRate: 3.25,
    basicPercent: 50,
    profTaxRate: 200,
    overtimeRate: 1.5,
    address: 'GCRI Siddhpur Branch, Siddhpur, Gujarat 384151',
    email: 'admin@siddhpur.gcri.in',
    primaryColor: '#f59e0b',
    headerText: 'GCRI SIDDHPUR CANCER RESEARCH INSTITUTE',
    footerText: 'Providing Quality Cancer Care',
    signatureText: 'Director, GCRI Siddhpur',
    themeStyle: 'Modern',
    paymentStatus: 'Paid',
    renewalDate: '2027-05-22',
    gstNumber: '24AAACG1234F1Z4',
    billingAddress: 'GCRI Siddhpur Branch, Siddhpur, Gujarat 384151',
    subscriptionPrice: 12999,
    billingCycle: 'Monthly',
    accountStatus: 'Active',
    parentCompanyId: 'c-gcri',
    branchName: 'Siddhpur',
    branchCode: 'GCRI-SDP',
    isHeadOffice: false,
    branchLicenseStatus: 'Active License',
    companyIndustry: 'Healthcare',
    departmentTemplateType: 'Healthcare',
    inheritParentDepartments: true,
    branchRenewalDate: '2027-08-12',
    employeeCapacity: 200,
    payrollLoad: 135000,
    storageUsed: '2.1 GB',
    activeHrUsers: 1,
    monthlyUsage: 58,
    branchPriceAddon: 999,
    branchLicenseActive: true,
    branchPortalActive: true,
    licensedEmployeeLimit: 200,
    monthlyBranchCost: 999,
    billingIncluded: false
  }
];

export const isCompanyIdMatch = (recordCompanyId: string, activeId: string, companiesList?: Company[]): boolean => {
  if (recordCompanyId === activeId) return true;
  
  let list = companiesList;
  if (!list && typeof window !== 'undefined') {
    const raw = localStorage.getItem('hrms_companies');
    if (raw) {
      try { list = JSON.parse(raw); } catch (e) {}
    }
  }
  if (!list) {
    const branches = ['c-ahmedabad', 'c-rajkot', 'c-bhavnagar', 'c-siddhpur'];
    if (activeId === 'c-gcri') {
      return recordCompanyId === 'c-gcri' || branches.includes(recordCompanyId);
    }
    return recordCompanyId === activeId;
  }

  const activeComp = list.find(c => c.id === activeId);
  if (activeComp && activeComp.id === 'c-gcri') {
    const recordComp = list.find(c => c.id === recordCompanyId);
    return recordComp?.parentCompanyId === 'c-gcri';
  }
  return false;
};

// ─── Employees ─────────────────────────────────────────────────────────────────

export const employees: Employee[] = [];

// ─── Attendance ─────────────────────────────────────────────────────────────────

export const attendanceRecords: AttendanceRecord[] = [];

// ─── Leaves ─────────────────────────────────────────────────────────────────────

export const leaveRequests: LeaveRequest[] = [];

export const leaveBalances: LeaveBalance[] = [];

// ─── Payroll ─────────────────────────────────────────────────────────────────────

export const payrollRecords: PayrollRecord[] = [];

// ─── Documents ───────────────────────────────────────────────────────────────────

export const documents: Document[] = [];

// ─── Notifications ───────────────────────────────────────────────────────────────

export const notifications: Notification[] = [];

// ─── Document Letter Templates ───────────────────────────────────────────────────

export const defaultTemplates: LetterTemplate[] = [
  {
    id: 'offer-letter',
    name: 'Offer Letter Template',
    subject: 'Offer of Employment',
    body: `Dear {{NAME}},

We are pleased to offer you employment with {{COMPANY_NAME}} as a {{DESIGNATION}}. 

Your annual cost to company (CTC) will be INR {{SALARY}}. Your scheduled join date is {{JOIN_DATE}}. 

You will be under probation for a period of {{PROBATION}} months. Please sign and return a copy of this letter as acceptance of this offer.

Sincerely,
HR Department, {{COMPANY_NAME}}`
  },
  {
    id: 'appointment-letter',
    name: 'Appointment Letter Template',
    subject: 'Letter of Appointment',
    body: `Dear {{NAME}},

With reference to your application and subsequent interview, we are pleased to appoint you as {{DESIGNATION}} at {{COMPANY_NAME}} under the following terms:

1. Commencement: Your appointment is effective from {{JOIN_DATE}}.
2. Salary: Your gross compensation will be INR {{SALARY}} per annum.
3. Office Timing: Office hours are {{OFFICE_HOURS}} hours a day, {{OFFICE_DAYS}} days a week.
4. Notice Period: In case of resignation, you are required to serve a notice period of {{NOTICE_PERIOD}} days.

Welcome to {{COMPANY_NAME}}!

Best Regards,
Management, {{COMPANY_NAME}}`
  },
  {
    id: 'experience-letter',
    name: 'Experience Letter Template',
    subject: 'To Whom It May Concern',
    body: `This is to certify that {{NAME}} was employed with {{COMPANY_NAME}} as a {{DESIGNATION}} from {{JOIN_DATE}} to {{RELIEVING_DATE}}.

During their tenure, they have demonstrated high professional standards, dedication, and active contribution to our projects. They possess strong technical and team skills.

We wish {{NAME}} all the success in their future endeavors.

Regards,
HR Manager, {{COMPANY_NAME}}`
  },
  {
    id: 'relieving-letter',
    name: 'Relieving Letter Template',
    subject: 'Relieving Order',
    body: `Dear {{NAME}},

This has reference to your resignation letter dated {{RESIGNATION_DATE}}. We would like to inform you that you are relieved from the services of {{COMPANY_NAME}} at the close of business hours on {{RELIEVING_DATE}}.

Your final dues and settlements have been fully cleared as of {{RELIEVING_DATE}}. We appreciate your services during your tenure of employment and wish you the best in your future career.

Sincerely,
Operations Admin, {{COMPANY_NAME}}`
  }
];

// ─── Helper Data ─────────────────────────────────────────────────────────────────

export const departments = ['Engineering', 'HR', 'Management', 'Accounts', 'Operations', 'Finance'];

export const getCompanyDepartments = (companyId: string, companies: Company[]): string[] => {
  const comp = companies.find(c => c.id === companyId);
  if (!comp) return departments;

  // If it's a branch and inherits parent departments
  if (comp.parentCompanyId && (comp.inheritParentDepartments !== false)) {
    const parent = companies.find(c => c.id === comp.parentCompanyId);
    if (parent) {
      return getCompanyDepartments(parent.id, companies);
    }
  }

  // If it has custom departments, return them!
  if (comp.customDepartments && comp.customDepartments.length > 0) {
    return comp.customDepartments;
  }

  // Predefined templates
  const template = comp.departmentTemplateType || comp.companyIndustry || comp.industry || 'Generic';
  switch (template) {
    case 'Healthcare':
    case 'Hospital':
      return [
        'Medical Oncology',
        'Radiation Oncology',
        'Surgical Oncology',
        'Nursing',
        'Pathology',
        'Radiology',
        'Pharmacy',
        'ICU / Critical Care',
        'Laboratory Services',
        'Blood Bank',
        'OPD Services',
        'Administration',
        'HR & Compliance',
        'Accounts & Billing',
        'Medical Records',
        'Housekeeping',
        'Security',
        'Biomedical Engineering',
        'Patient Care Services',
        'IT Support',
        'Operations'
      ];
    case 'IT':
    case 'IT Company':
    case 'Technology':
      return [
        'Software Engineering',
        'Product Management',
        'Quality Assurance',
        'IT & DevOps',
        'UX/UI Design',
        'Sales & Marketing',
        'Customer Success',
        'HR & Talent Acquisition',
        'Operations & Facilities',
        'Finance & Legal'
      ];
    case 'Manufacturing':
    case 'Factory':
      return [
        'Production & Assembly',
        'Plant Operations',
        'Quality Control',
        'Maintenance',
        'Supply Chain & Logistics',
        'Procurement',
        'Health & Safety (EHS)',
        'Warehouse & Inventory',
        'R&D & Engineering',
        'Administration & HR'
      ];
    case 'Education':
      return [
        'Academic Faculty',
        'School Administration',
        'Admissions & Registrar',
        'Student Services',
        'Finance & Billing',
        'Human Resources',
        'Facilities & Maintenance',
        'Athletics & Sports',
        'Library Services',
        'IT & Educational Tech'
      ];
    case 'Retail':
      return [
        'Store Operations',
        'Sales & Customer Service',
        'Inventory Control',
        'Merchandising',
        'Cash & Billing',
        'Warehouse & Logistics',
        'Loss Prevention & Security',
        'Marketing & Promotions',
        'HR & Training',
        'Finance & Administration'
      ];
    case 'Generic':
    default:
      return departments;
  }
};

export const getCompanyIdFromBranchName = (branchName: string, activeCompanyId: string, companies: Company[]): string => {
  if (!branchName) return activeCompanyId;
  const activeCompany = companies.find(c => c.id === activeCompanyId);
  if (!activeCompany) return activeCompanyId;

  // Find if there is a branch company belonging to the active company's corporate family
  const parentId = activeCompany.parentCompanyId || activeCompany.id;
  const matchedBranch = companies.find(c => 
    (c.id === parentId || c.parentCompanyId === parentId) && 
    (c.branchName?.toUpperCase() === branchName.toUpperCase() || c.name.toUpperCase().includes(branchName.toUpperCase()))
  );

  return matchedBranch ? matchedBranch.id : activeCompanyId;
};
export const designations = ['Software Developer', 'Senior Developer', 'Software Lead', 'HR Manager', 'HR Coordinator', 'Operations Manager', 'Operations Director', 'Operations Executive', 'Payroll Officer', 'Senior Accountant', 'Accounts Specialist', 'Admin Executive', 'Office Coordinator'];

export const currentUser: { id: string; name: string; role: Role; employeeId: string; avatar: string; email: string } = {
  id: 'e2',
  name: 'Priya Sharma',
  role: 'Super Admin',
  employeeId: 'EMP002',
  avatar: 'PS',
  email: 'priya.sharma@technova.in',
};
