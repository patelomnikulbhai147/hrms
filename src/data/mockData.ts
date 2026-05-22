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
  billingCycle: 'Monthly' | 'Yearly';
  accountStatus: 'Active' | 'Suspended';
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

export interface SubscriptionPlan {
  id: string;
  name: string;
  priceMonthly: number;
  priceYearly: number;
  employeeLimit: number;
  hrLimit: number;
  storageLimit: string;
  payrollAccess: boolean;
  documentAccess: boolean;
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
    id: 'c-ahmedabad',
    name: 'GCRI Ahmedabad',
    domain: 'ahmedabad.gcri.in',
    adminName: 'Dr. Nilesh Patel',
    adminEmail: 'admin@ahmedabad.gcri.in',
    phone: '+91 9876543210',
    industry: 'Healthcare',
    status: 'Active',
    employeeCount: 0,
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
    accountStatus: 'Active'
  },
  {
    id: 'c-rajkot',
    name: 'GCRI Rajkot',
    domain: 'rajkot.gcri.in',
    adminName: 'Dr. Rajesh Patel',
    adminEmail: 'admin@rajkot.gcri.in',
    phone: '+91 9876543211',
    industry: 'Healthcare',
    status: 'Active',
    employeeCount: 0,
    joinDate: '2026-05-22',
    plan: 'Enterprise',
    logo: 'GCRI',
    pfRate: 12,
    esicRate: 3.25,
    basicPercent: 50,
    profTaxRate: 200,
    overtimeRate: 1.5,
    address: 'Rajkot Gujarat',
    email: 'admin@rajkot.gcri.in',
    primaryColor: '#0f766e',
    headerText: 'GCRI RAJKOT ONCOLOGY CENTER',
    footerText: 'Curing Cancer, Inspiring Hope',
    signatureText: 'Medical Superintendent, GCRI Rajkot',
    themeStyle: 'Elegant',
    paymentStatus: 'Paid',
    renewalDate: '2027-05-22',
    gstNumber: '24AAACG1234F1Z2',
    billingAddress: 'Rajkot Gujarat',
    subscriptionPrice: 12999,
    billingCycle: 'Monthly',
    accountStatus: 'Active'
  },
  {
    id: 'c-bhavnagar',
    name: 'GCRI Bhavnagar',
    domain: 'bhavnagar.gcri.in',
    adminName: 'Dr. Bipin Patel',
    adminEmail: 'admin@bhavnagar.gcri.in',
    phone: '+91 9876543212',
    industry: 'Healthcare',
    status: 'Active',
    employeeCount: 0,
    joinDate: '2026-05-22',
    plan: 'Enterprise',
    logo: 'GCRI',
    pfRate: 12,
    esicRate: 3.25,
    basicPercent: 50,
    profTaxRate: 200,
    overtimeRate: 1.5,
    address: 'Bhavnagar Gujarat',
    email: 'admin@bhavnagar.gcri.in',
    primaryColor: '#65a30d',
    headerText: 'GCRI BHAVNAGAR BRANCH',
    footerText: 'Compassionate Cancer Care',
    signatureText: 'Superintendent, GCRI Bhavnagar',
    themeStyle: 'Classic',
    paymentStatus: 'Paid',
    renewalDate: '2027-05-22',
    gstNumber: '24AAACG1234F1Z3',
    billingAddress: 'Bhavnagar Gujarat',
    subscriptionPrice: 12999,
    billingCycle: 'Monthly',
    accountStatus: 'Active'
  },
  {
    id: 'c-siddhpur',
    name: 'GCRI Siddhpur',
    domain: 'siddhpur.gcri.in',
    adminName: 'Dr. Satish Patel',
    adminEmail: 'admin@siddhpur.gcri.in',
    phone: '+91 9876543213',
    industry: 'Healthcare',
    status: 'Active',
    employeeCount: 0,
    joinDate: '2026-05-22',
    plan: 'Enterprise',
    logo: 'GCRI',
    pfRate: 12,
    esicRate: 3.25,
    basicPercent: 50,
    profTaxRate: 200,
    overtimeRate: 1.5,
    address: 'Siddhpur Gujarat',
    email: 'admin@siddhpur.gcri.in',
    primaryColor: '#ea580c',
    headerText: 'GCRI SIDDHPUR CANCER CENTER',
    footerText: 'Advanced Therapeutics',
    signatureText: 'Officer In-charge, GCRI Siddhpur',
    themeStyle: 'Minimalist',
    paymentStatus: 'Paid',
    renewalDate: '2027-05-22',
    gstNumber: '24AAACG1234F1Z4',
    billingAddress: 'Siddhpur Gujarat',
    subscriptionPrice: 12999,
    billingCycle: 'Monthly',
    accountStatus: 'Active'
  }
];

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
export const designations = ['Software Developer', 'Senior Developer', 'Software Lead', 'HR Manager', 'HR Coordinator', 'Operations Manager', 'Operations Director', 'Operations Executive', 'Payroll Officer', 'Senior Accountant', 'Accounts Specialist', 'Admin Executive', 'Office Coordinator'];

export const currentUser: { id: string; name: string; role: Role; employeeId: string; avatar: string; email: string } = {
  id: 'e2',
  name: 'Priya Sharma',
  role: 'Super Admin',
  employeeId: 'EMP002',
  avatar: 'PS',
  email: 'priya.sharma@technova.in',
};
