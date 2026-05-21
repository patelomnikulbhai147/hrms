// ─── Types ────────────────────────────────────────────────────────────────────
import { excelSeededEmployees } from './excelSeededData';

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
    id: 'c1', 
    name: 'TechNova Solutions', 
    domain: 'technova.in', 
    adminName: 'Vikram Singh', 
    adminEmail: 'vikram@technova.in', 
    phone: '+91 98001 12345', 
    industry: 'Technology', 
    status: 'Active', 
    employeeCount: 4, 
    joinDate: '2024-12-01', 
    plan: 'Professional', 
    logo: 'TN', 
    pfRate: 12, 
    esicRate: 3.25, 
    basicPercent: 50, 
    overtimeRate: 1.5, 
    profTaxRate: 200,
    address: 'Sector 62, Noida, Uttar Pradesh 201301',
    email: 'contact@technova.in',
    primaryColor: '#3b82f6', // Bright Blue
    headerText: 'TECHNOVA SOLUTIONS PRIVATE LIMITED',
    footerText: 'TechNova Tower, Noida · Confidential Document · www.technova.in',
    signatureText: 'Vikram Singh, Operations Director',
    themeStyle: 'Modern',
    paymentStatus: 'Paid',
    renewalDate: '2026-06-25',
    gstNumber: '09AAACT1234T1Z3',
    billingAddress: 'Sector 62, Noida, Uttar Pradesh 201301',
    subscriptionPrice: 4999,
    billingCycle: 'Monthly',
    accountStatus: 'Active'
  },
  { 
    id: 'c2', 
    name: 'Quantum Data Labs', 
    domain: 'quantumdatalabs.ai', 
    adminName: 'Sneha Patel', 
    adminEmail: 'sneha.patel@quantumdatalabs.ai', 
    phone: '+91 98123 45678', 
    industry: 'Analytics', 
    status: 'Active', 
    employeeCount: 4, 
    joinDate: '2025-02-15', 
    plan: 'Enterprise', 
    logo: 'QD', 
    pfRate: 14, 
    esicRate: 3.25, 
    basicPercent: 55, 
    overtimeRate: 1.5, 
    profTaxRate: 200,
    address: 'Bandra Kurla Complex, Mumbai, Maharashtra 400051',
    email: 'ops@quantumdatalabs.ai',
    primaryColor: '#0a74a3', // Deep Blue
    headerText: 'QUANTUM DATA LABS',
    footerText: 'BKC, Mumbai · Data-driven Intelligence · www.quantumdatalabs.ai',
    signatureText: 'Sneha Patel, Managing Director',
    themeStyle: 'Modern',
    paymentStatus: 'Paid',
    renewalDate: '2026-07-15',
    gstNumber: '27AAAAC5678A1Z5',
    billingAddress: 'Bandra Kurla Complex, Mumbai, Maharashtra 400051',
    subscriptionPrice: 12999,
    billingCycle: 'Monthly',
    accountStatus: 'Active'
  },
  { 
    id: 'c3', 
    name: 'Gujarat Cancer & Research Institute (GCRI)', 
    domain: 'gcri.org.in', 
    adminName: 'Dr. Suresh Babu', 
    adminEmail: 'director@gcri.org.in', 
    phone: '+91 79226 80000', 
    industry: 'Healthcare & Research', 
    status: 'Active', 
    employeeCount: 64, 
    joinDate: '2025-01-20', 
    plan: 'Enterprise', 
    logo: 'GC', 
    pfRate: 12, 
    esicRate: 3.25, 
    basicPercent: 50, 
    overtimeRate: 1.5, 
    profTaxRate: 200,
    address: 'Asarwa, Ahmedabad, Gujarat 380016',
    email: 'info@gcri.org.in',
    primaryColor: '#0891b2', // Cyan / Medical Teal
    headerText: 'THE GUJARAT CANCER & RESEARCH INSTITUTE',
    footerText: 'M.P. Shah Cancer Hospital, Ahmedabad · State Cancer Institute · www.gcri.org.in',
    signatureText: 'Dr. Suresh Babu, Director & Chief Medical Officer',
    themeStyle: 'Elegant',
    paymentStatus: 'Paid',
    renewalDate: '2026-11-30',
    gstNumber: '24AAAAG1234G1Z1',
    billingAddress: 'Asarwa, Ahmedabad, Gujarat 380016',
    subscriptionPrice: 12999,
    billingCycle: 'Yearly',
    accountStatus: 'Active'
  },
  { 
    id: 'c4', 
    name: 'BuildRight Constructions', 
    domain: 'buildright.in', 
    adminName: 'Sanjay Mehta', 
    adminEmail: 'sanjay@buildright.in', 
    phone: '+91 98001 67890', 
    industry: 'Construction', 
    status: 'Pending', 
    employeeCount: 0, 
    joinDate: '2025-07-10', 
    plan: 'Starter', 
    logo: 'BR', 
    pfRate: 12, 
    esicRate: 3.25, 
    basicPercent: 50, 
    overtimeRate: 1.5, 
    profTaxRate: 200,
    address: 'DLF Phase 3, Gurugram, Haryana 122002',
    email: 'contact@buildright.in',
    primaryColor: '#ea580c', // Bright Orange
    headerText: 'BUILDRIGHT CONSTRUCTIONS & INFRA',
    footerText: 'DLF Cybercity, Gurugram · Building the Future · www.buildright.in',
    signatureText: 'Sanjay Mehta, Managing Partner',
    themeStyle: 'Minimalist',
    paymentStatus: 'Trial Active',
    renewalDate: '2026-06-10',
    gstNumber: '07AAAAB1234A1Z9',
    billingAddress: 'DLF Phase 3, Gurugram, Haryana 122002',
    subscriptionPrice: 1999,
    billingCycle: 'Monthly',
    accountStatus: 'Active'
  },
  { 
    id: 'c5', 
    name: 'AutoDrive Motors', 
    domain: 'autodrive.in', 
    adminName: 'Ravi Shankar', 
    adminEmail: 'ravi@autodrive.in', 
    phone: '+91 98001 89012', 
    industry: 'Automotive', 
    status: 'Inactive', 
    employeeCount: 0, 
    joinDate: '2024-05-01', 
    plan: 'Starter', 
    logo: 'AD', 
    pfRate: 12, 
    esicRate: 3.25, 
    basicPercent: 50, 
    overtimeRate: 1.5, 
    profTaxRate: 200,
    address: 'Industrial Estate, Guindy, Chennai, Tamil Nadu 600032',
    email: 'admin@autodrive.in',
    primaryColor: '#e11d48', // Vibrant Rose Red
    headerText: 'AUTODRIVE MOTORS AND PARTS',
    footerText: 'Guindy Industrial Hub, Chennai · Engineered Excellence · www.autodrive.in',
    signatureText: 'Ravi Shankar, Operations Executive',
    themeStyle: 'Modern',
    paymentStatus: 'Expired',
    renewalDate: '2026-04-30',
    gstNumber: '33AAAAA5678A1Z0',
    billingAddress: 'Industrial Estate, Guindy, Chennai, Tamil Nadu 600032',
    subscriptionPrice: 1999,
    billingCycle: 'Monthly',
    accountStatus: 'Suspended'
  }
];

// ─── Employees ─────────────────────────────────────────────────────────────────

export const employees: Employee[] = [
  // TechNova Solutions (c1)
  { id: 'e1', employeeId: 'EMP001', companyId: 'c1', name: 'Rajesh Kumar', email: 'rajesh.kumar@technova.in', phone: '+91 98765 43210', department: 'Engineering', designation: 'Senior Developer', role: 'Staff', status: 'Active', joinDate: '2021-03-15', salary: 85000, manager: 'Vikram Singh', location: 'Bangalore', avatar: 'RK' },
  { id: 'e2', employeeId: 'EMP002', companyId: 'c1', name: 'Priya Sharma', email: 'priya.sharma@technova.in', phone: '+91 98765 43211', department: 'HR', designation: 'HR Manager', role: 'HR', status: 'Active', joinDate: '2020-06-01', salary: 75000, manager: 'Vikram Singh', location: 'Mumbai', avatar: 'PS' },
  { id: 'e3', employeeId: 'EMP003', companyId: 'c1', name: 'Vikram Singh', email: 'vikram.singh@technova.in', phone: '+91 98765 43212', department: 'Management', designation: 'Operations Director', role: 'Company Head', status: 'Active', joinDate: '2019-01-10', salary: 120000, manager: 'Super Admin', location: 'Delhi', avatar: 'VS' },
  { id: 'e4', employeeId: 'EMP004', companyId: 'c1', name: 'Anita Verma', email: 'anita.verma@technova.in', phone: '+91 98765 43213', department: 'Accounts', designation: 'Payroll Officer', role: 'Staff', status: 'Active', joinDate: '2021-08-20', salary: 65000, manager: 'Vikram Singh', location: 'Hyderabad', avatar: 'AV' },

  // Quantum Data Labs (c2)
  { id: 'e5', employeeId: 'EMP005', companyId: 'c2', name: 'Nikhil Sharma', email: 'nikhil.sharma@quantumdatalabs.ai', phone: '+91 98765 43214', department: 'Finance', designation: 'Senior Accountant', role: 'Staff', status: 'Active', joinDate: '2022-02-14', salary: 90000, manager: 'Sneha Patel', location: 'Chennai', avatar: 'NS' },
  { id: 'e6', employeeId: 'EMP006', companyId: 'c2', name: 'Sneha Patel', email: 'sneha.patel@quantumdatalabs.ai', phone: '+91 98765 43215', department: 'Operations', designation: 'Company Head', role: 'Company Head', status: 'Active', joinDate: '2022-05-10', salary: 110000, manager: 'Super Admin', location: 'Pune', avatar: 'SP' },
  { id: 'e7', employeeId: 'EMP007', companyId: 'c2', name: 'Arjun Nair', email: 'arjun.nair@quantumdatalabs.ai', phone: '+91 98765 43216', department: 'Analytics', designation: 'Insights Specialist', role: 'Staff', status: 'Active', joinDate: '2023-01-05', salary: 70000, manager: 'Nikhil Sharma', location: 'Bangalore', avatar: 'AN' },
  { id: 'e8', employeeId: 'EMP008', companyId: 'c2', name: 'Divya Menon', email: 'divya.menon@quantumdatalabs.ai', phone: '+91 98765 43217', department: 'Operations', designation: 'Operations Executive', role: 'Staff', status: 'On Leave', joinDate: '2022-11-15', salary: 58000, manager: 'Sneha Patel', location: 'Kochi', avatar: 'DM' },

  // HealthFirst Ltd (c3)
  { id: 'e9', employeeId: 'EMP009', companyId: 'c3', name: 'Karthik Reddy', email: 'karthik.reddy@healthfirst.in', phone: '+91 98765 43218', department: 'Engineering', designation: 'Software Lead', role: 'Staff', status: 'Active', joinDate: '2021-07-01', salary: 95000, manager: 'Dr. Suresh Babu', location: 'Hyderabad', avatar: 'KR' },
  { id: 'e10', employeeId: 'EMP010', companyId: 'c3', name: 'Sunita Joshi', email: 'sunita.joshi@healthfirst.in', phone: '+91 98765 43219', department: 'HR', designation: 'HR Coordinator', role: 'HR', status: 'Active', joinDate: '2023-03-20', salary: 50000, manager: 'Dr. Suresh Babu', location: 'Mumbai', avatar: 'SJ' },
  { id: 'e11', employeeId: 'EMP011', companyId: 'c3', name: 'Rahul Gupta', email: 'rahul.gupta@healthfirst.in', phone: '+91 98765 43220', department: 'Engineering', designation: 'React Developer', role: 'Staff', status: 'Active', joinDate: '2022-09-01', salary: 68000, manager: 'Karthik Reddy', location: 'Bangalore', avatar: 'RG' },
  { id: 'e12', employeeId: 'EMP012', companyId: 'c3', name: 'Meera Iyer', email: 'meera.iyer@healthfirst.in', phone: '+91 98765 43221', department: 'Operations', designation: 'Office Coordinator', role: 'Staff', status: 'Inactive', joinDate: '2021-04-15', salary: 45000, manager: 'Dr. Suresh Babu', location: 'Chennai', avatar: 'MI' },

  ...excelSeededEmployees
];

// ─── Attendance ─────────────────────────────────────────────────────────────────

const today = new Date().toISOString().split('T')[0];
const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

export const attendanceRecords: AttendanceRecord[] = [
  // TechNova Solutions (c1)
  { id: 'a1', companyId: 'c1', employeeId: 'e1', employeeName: 'Rajesh Kumar', department: 'Engineering', date: today, clockIn: '09:02', clockOut: '18:15', status: 'Present', hoursWorked: 9.2 },
  { id: 'a2', companyId: 'c1', employeeId: 'e2', employeeName: 'Priya Sharma', department: 'HR', date: today, clockIn: '08:55', clockOut: '18:00', status: 'Present', hoursWorked: 9.1 },
  { id: 'a3', companyId: 'c1', employeeId: 'e3', employeeName: 'Vikram Singh', department: 'Management', date: today, clockIn: '09:30', clockOut: '19:00', status: 'Late', hoursWorked: 9.5 },
  { id: 'a4', companyId: 'c1', employeeId: 'e4', employeeName: 'Anita Verma', department: 'Accounts', date: today, clockIn: '08:50', clockOut: '17:50', status: 'Present', hoursWorked: 9.0 },
  { id: 'a13', companyId: 'c1', employeeId: 'e1', employeeName: 'Rajesh Kumar', department: 'Engineering', date: yesterday, clockIn: '09:00', clockOut: '18:00', status: 'Present', hoursWorked: 9.0 },
  { id: 'a14', companyId: 'c1', employeeId: 'e2', employeeName: 'Priya Sharma', department: 'HR', date: yesterday, clockIn: '08:50', clockOut: '17:50', status: 'Present', hoursWorked: 9.0 },

  // Quantum Data Labs (c2)
  { id: 'a5', companyId: 'c2', employeeId: 'e5', employeeName: 'Nikhil Sharma', department: 'Finance', date: today, clockIn: '08:45', clockOut: '18:00', status: 'Present', hoursWorked: 9.25 },
  { id: 'a6', companyId: 'c2', employeeId: 'e6', employeeName: 'Sneha Patel', department: 'Operations', date: today, clockIn: '09:15', clockOut: '14:00', status: 'Half Day', hoursWorked: 4.75 },
  { id: 'a7', companyId: 'c2', employeeId: 'e7', employeeName: 'Arjun Nair', department: 'Analytics', date: today, clockIn: '09:00', clockOut: '18:00', status: 'WFH', hoursWorked: 9.0 },
  { id: 'a8', companyId: 'c2', employeeId: 'e8', employeeName: 'Divya Menon', department: 'Operations', date: today, clockIn: '', clockOut: '', status: 'Absent', hoursWorked: 0 },
  { id: 'a15', companyId: 'c2', employeeId: 'e5', employeeName: 'Nikhil Sharma', department: 'Finance', date: yesterday, clockIn: '09:00', clockOut: '18:00', status: 'Present', hoursWorked: 9.0 },

  // HealthFirst Ltd (c3)
  { id: 'a9', companyId: 'c3', employeeId: 'e9', employeeName: 'Karthik Reddy', department: 'Engineering', date: today, clockIn: '08:45', clockOut: '18:10', status: 'Present', hoursWorked: 9.4 },
  { id: 'a10', companyId: 'c3', employeeId: 'e10', employeeName: 'Sunita Joshi', department: 'HR', date: today, clockIn: '09:05', clockOut: '18:05', status: 'Present', hoursWorked: 9.0 },
  { id: 'a11', companyId: 'c3', employeeId: 'e11', employeeName: 'Rahul Gupta', department: 'Engineering', date: today, clockIn: '10:15', clockOut: '19:20', status: 'Late', hoursWorked: 9.1 },
  { id: 'a12', companyId: 'c3', employeeId: 'e12', employeeName: 'Meera Iyer', department: 'Operations', date: today, clockIn: '', clockOut: '', status: 'Absent', hoursWorked: 0 }
];

// ─── Leaves ─────────────────────────────────────────────────────────────────────

export const leaveRequests: LeaveRequest[] = [
  // TechNova (c1)
  { id: 'l1', companyId: 'c1', employeeId: 'e4', employeeName: 'Anita Verma', department: 'Accounts', leaveType: 'Sick', fromDate: '2026-05-24', toDate: '2026-05-25', days: 2, reason: 'Severe viral fever and migraine', status: 'Approved', appliedOn: '2026-05-19' },
  { id: 'l2', companyId: 'c1', employeeId: 'e1', employeeName: 'Rajesh Kumar', department: 'Engineering', leaveType: 'Annual', fromDate: '2026-06-10', toDate: '2026-06-17', days: 6, reason: 'Pre-planned family vacation', status: 'Approved', appliedOn: '2026-05-01', approvedBy: 'Vikram Singh' },
  { id: 'l3', companyId: 'c1', employeeId: 'e1', employeeName: 'Rajesh Kumar', department: 'Engineering', leaveType: 'Casual', fromDate: '2026-05-30', toDate: '2026-05-30', days: 1, reason: 'Personal domestic chore', status: 'Rejected', appliedOn: '2026-05-28', approvedBy: 'Vikram Singh' },

  // Quantum Data Labs (c2)
  { id: 'l4', companyId: 'c2', employeeId: 'e8', employeeName: 'Divya Menon', department: 'Operations', leaveType: 'Sick', fromDate: '2026-05-20', toDate: '2026-05-22', days: 3, reason: 'Scheduled medical appointment and recovery', status: 'Approved', appliedOn: '2026-05-18', approvedBy: 'Sneha Patel' },
  { id: 'l5', companyId: 'c2', employeeId: 'e7', employeeName: 'Arjun Nair', department: 'Analytics', leaveType: 'Casual', fromDate: '2026-06-01', toDate: '2026-06-02', days: 2, reason: 'Family celebration out of town', status: 'Pending', appliedOn: '2026-05-19' },

  // HealthFirst (c3)
  { id: 'l6', companyId: 'c3', employeeId: 'e11', employeeName: 'Rahul Gupta', department: 'Engineering', leaveType: 'Annual', fromDate: '2026-06-15', toDate: '2026-06-19', days: 5, reason: 'Sister\'s wedding ceremony', status: 'Approved', appliedOn: '2026-05-18' }
];

export const leaveBalances: LeaveBalance[] = [
  { employeeId: 'e1', annual: 18, sick: 10, casual: 8, used: 6, remaining: 20 },
  { employeeId: 'e2', annual: 18, sick: 10, casual: 8, used: 2, remaining: 24 },
  { employeeId: 'e5', annual: 18, sick: 10, casual: 8, used: 4, remaining: 22 },
  { employeeId: 'e7', annual: 18, sick: 10, casual: 8, used: 1, remaining: 25 },
  { employeeId: 'e9', annual: 18, sick: 10, casual: 8, used: 0, remaining: 28 },
  { employeeId: 'e11', annual: 18, sick: 10, casual: 8, used: 3, remaining: 23 }
];

// ─── Payroll ─────────────────────────────────────────────────────────────────────

export const payrollRecords: PayrollRecord[] = [
  // TechNova (c1)
  { id: 'p1', companyId: 'c1', employeeId: 'e1', employeeName: 'Rajesh Kumar', department: 'Engineering', month: 'June', year: 2026, basicSalary: 85000, allowances: 12000, deductions: 8500, netSalary: 88500, status: 'draft', salary: 88500, payrollStatus: 'draft', paymentStatus: 'pending', payslipGenerated: false },
  { id: 'p2', companyId: 'c1', employeeId: 'e2', employeeName: 'Priya Sharma', department: 'HR', month: 'June', year: 2026, basicSalary: 75000, allowances: 10000, deductions: 7500, netSalary: 77500, status: 'prepared', salary: 77500, payrollStatus: 'prepared', paymentStatus: 'pending', payslipGenerated: false },
  { id: 'p3', companyId: 'c1', employeeId: 'e3', employeeName: 'Vikram Singh', department: 'Management', month: 'June', year: 2026, basicSalary: 120000, allowances: 20000, deductions: 15000, netSalary: 125000, status: 'verified', salary: 125000, payrollStatus: 'verified', paymentStatus: 'pending', payslipGenerated: false },
  { id: 'p4', companyId: 'c1', employeeId: 'e4', employeeName: 'Anita Verma', department: 'Accounts', month: 'June', year: 2026, basicSalary: 65000, allowances: 8000, deductions: 6500, netSalary: 66500, status: 'paid', salary: 66500, payrollStatus: 'paid', paymentStatus: 'paid', payslipGenerated: false, paymentDate: '2026-05-20', paymentMethod: 'Bank Transfer', paidBy: 'Finance Admin' },

  // Quantum Data Labs (c2)
  { id: 'p5', companyId: 'c2', employeeId: 'e5', employeeName: 'Nikhil Sharma', department: 'Finance', month: 'June', year: 2026, basicSalary: 90000, allowances: 14000, deductions: 9000, netSalary: 95000, status: 'payslip_generated', salary: 95000, payrollStatus: 'payslip_generated', paymentStatus: 'paid', payslipGenerated: true, processedOn: '2026-05-20', paymentDate: '2026-05-20', paymentMethod: 'Bank Transfer', paidBy: 'Finance Admin' },
  { id: 'p6', companyId: 'c2', employeeId: 'e6', employeeName: 'Sneha Patel', department: 'Operations', month: 'June', year: 2026, basicSalary: 110000, allowances: 18000, deductions: 11000, netSalary: 117000, status: 'payslip_generated', salary: 117000, payrollStatus: 'payslip_generated', paymentStatus: 'paid', payslipGenerated: true, processedOn: '2026-05-20', paymentDate: '2026-05-20', paymentMethod: 'UPI Payout', paidBy: 'Finance Admin' },
  { id: 'p7', companyId: 'c2', employeeId: 'e7', employeeName: 'Arjun Nair', department: 'Analytics', month: 'June', year: 2026, basicSalary: 70000, allowances: 9000, deductions: 7000, netSalary: 72000, status: 'verified', salary: 72000, payrollStatus: 'verified', paymentStatus: 'pending', payslipGenerated: false },
  { id: 'p8', companyId: 'c2', employeeId: 'e8', employeeName: 'Divya Menon', department: 'Operations', month: 'June', year: 2026, basicSalary: 58000, allowances: 7500, deductions: 5800, netSalary: 59700, status: 'failed', salary: 59700, payrollStatus: 'failed', paymentStatus: 'failed', payslipGenerated: false },

  // HealthFirst (c3)
  { id: 'p9', companyId: 'c3', employeeId: 'e9', employeeName: 'Karthik Reddy', department: 'Engineering', month: 'June', year: 2026, basicSalary: 95000, allowances: 13000, deductions: 9500, netSalary: 98500, status: 'draft', salary: 98500, payrollStatus: 'draft', paymentStatus: 'pending', payslipGenerated: false },
  { id: 'p10', companyId: 'c3', employeeId: 'e10', employeeName: 'Sunita Joshi', department: 'HR', month: 'June', year: 2026, basicSalary: 50000, allowances: 5000, deductions: 5000, netSalary: 50000, status: 'prepared', salary: 50000, payrollStatus: 'prepared', paymentStatus: 'pending', payslipGenerated: false },
  { id: 'p11', companyId: 'c3', employeeId: 'e11', employeeName: 'Rahul Gupta', department: 'Engineering', month: 'June', year: 2026, basicSalary: 68000, allowances: 8000, deductions: 6800, netSalary: 69200, status: 'verified', salary: 69200, payrollStatus: 'verified', paymentStatus: 'pending', payslipGenerated: false },
  { id: 'p12', companyId: 'c3', employeeId: 'e12', employeeName: 'Meera Iyer', department: 'Operations', month: 'June', year: 2026, basicSalary: 45000, allowances: 4000, deductions: 4500, netSalary: 44500, status: 'paid', salary: 44500, payrollStatus: 'paid', paymentStatus: 'paid', payslipGenerated: false, paymentDate: '2026-05-20', paymentMethod: 'Direct Transfer', paidBy: 'Finance Admin' }
];

// ─── Documents ───────────────────────────────────────────────────────────────────

export const documents: Document[] = [
  // TechNova (c1)
  { id: 'doc1', companyId: 'c1', name: 'TechNova_CompanyStatutes_2026.pdf', type: 'Contract', uploadedBy: 'Priya Sharma', uploadedOn: '2026-01-15', size: '2.4 MB', status: 'Verified' },
  { id: 'doc2', companyId: 'c1', name: 'RajeshKumar_Resume.pdf', type: 'Resume', employeeId: 'e1', employeeName: 'Rajesh Kumar', uploadedBy: 'Priya Sharma', uploadedOn: '2021-03-10', size: '512 KB', status: 'Verified' },
  { id: 'doc3', companyId: 'c1', name: 'AnitaVerma_AadhaarCard.pdf', type: 'Aadhaar', employeeId: 'e4', employeeName: 'Anita Verma', uploadedBy: 'Priya Sharma', uploadedOn: '2021-08-20', size: '1.1 MB', status: 'Verified' },
  { id: 'doc3b', companyId: 'c1', name: 'AnitaVerma_PANCard.pdf', type: 'PAN', employeeId: 'e4', employeeName: 'Anita Verma', uploadedBy: 'Priya Sharma', uploadedOn: '2021-08-20', size: '670 KB', status: 'Pending' },

  // Quantum Data Labs (c2)
  { id: 'doc4', companyId: 'c2', name: 'QuantumDataLabs_NDAAgreement.pdf', type: 'Contract', uploadedBy: 'Sneha Patel', uploadedOn: '2025-02-15', size: '1.8 MB', status: 'Verified' },
  { id: 'doc5', companyId: 'c2', name: 'ArjunNair_Resume.pdf', type: 'Resume', employeeId: 'e7', employeeName: 'Arjun Nair', uploadedBy: 'Sneha Patel', uploadedOn: '2023-01-20', size: '890 KB', status: 'Pending' },
  { id: 'doc6', companyId: 'c2', name: 'NikhilSharma_June2026_Payslip.pdf', type: 'Payslip', employeeId: 'e5', employeeName: 'Nikhil Sharma', uploadedBy: 'Sneha Patel', uploadedOn: '2026-07-01', size: '256 KB', status: 'Verified' }
];

// ─── Notifications ───────────────────────────────────────────────────────────────

export const notifications: Notification[] = [
  { id: 'n1', companyId: 'c1', type: 'leave', message: 'Anita Verma has scheduled Sick Leave (May 24-25)', timestamp: '2026-05-19 10:30', read: false, priority: 'high' },
  { id: 'n2', companyId: 'c2', type: 'leave', message: 'Arjun Nair scheduled Casual Leave (Jun 1-2)', timestamp: '2026-05-19 09:15', read: false, priority: 'medium' },
  { id: 'n3', companyId: 'c1', type: 'payroll', message: 'June payroll cycle is open and pending processing', timestamp: '2026-05-18 08:00', read: false, priority: 'high' },
  { id: 'n4', type: 'company', message: 'New company registration: BuildRight Constructions is pending approval', timestamp: '2026-05-18 14:20', read: false, priority: 'medium' },
  { id: 'n5', companyId: 'c2', type: 'payroll', message: 'Divya Menon payroll transaction failed - payment declined', timestamp: '2026-05-20 09:00', read: false, priority: 'high' }
];

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
