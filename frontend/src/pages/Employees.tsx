import { api } from '@/api/apiClient';
import { getApiErrorMessage, getApiFieldErrors } from '@/utils/apiError';
import { formatDate } from '@/utils/formatDate';
import { normalizeField, validateField } from '@/utils/fieldFormats';
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Plus, Search, Eye, Edit2,
  EyeOff, ShieldCheck, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle,
  Users, UserCheck, LogOut, ChevronRight, Lock, FileText, IndianRupee, Archive, Gift, XCircle, Trash2,
  Send, RotateCcw, Download, Clock, ThumbsUp, ChevronDown, FileDown, UserPlus, Fingerprint, Building2, Printer, ArrowLeft
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  type Employee, type EmployeeStatus, type Role, type Company,
  isCompanyIdMatch,
  resolveActiveWorkspace
} from '@/types';
import { Badge, statusBadge } from '@/components/ui/Badge';
import { printEmployeeProfile, downloadEmployeeProfilePdf } from '@/utils/employeeProfileExport';
import { Table, Thead, Tbody, Th, Td, Tr } from '@/components/ui/Table';
import { Card, StatCard } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ActionConfirmationModal } from '@/components/ui/ActionConfirmationModal';
import { Input, Select } from '@/components/ui/Input';
import { SearchSelect } from '@/components/ui/SearchSelect';
import { useFormGate, type GateFields } from '@/hooks/useFormGate';
import {
  validatePhone, validateName, validateEmail,
  validateSalary
} from '@/utils/validation';
import { type UserAccount } from '@/pages/Login';
import { getUniqueEmployees } from '@/utils/deduplication';
import { type ExportColumn, exportRowsToExcel, exportRowsToPDF } from '@/utils/exportUtils';
import { useDismissable } from '@/hooks/useDismissable';
import { BiometricImportModal } from '@/components/attendance/BiometricImportModal';
import { CreatableSelect } from '@/components/ui/CreatableSelect';
import { NomineesTab } from '@/components/employee/NomineesTab';
import { TempEmployeeOnboarding } from '@/components/employee/TempEmployeeOnboarding';
import { NomineeWizardStep } from '@/components/employee/NomineeWizardStep';
import { AddressSection, buildAddressString, validatePresentAddress, BLANK_ADDRESS_VALUES } from '@/components/employee/AddressSection';
import { INDIAN_STATES, citiesForState } from '@/data/indianStatesCities';
import { NATIONALITY_COUNTRIES, DEFAULT_COUNTRY } from '@/data/countries';
import { byEmployeeCode } from '@/utils/employeeSort';
import { isActiveEmployee, isOffboarded, isRecordLocked, LOCKED_RECORD_MESSAGE } from '@/utils/employeeStatus';
import { formatAadhaar, formatPan, rawAadhaar, rawPan, isValidAadhaar, isValidPan, AADHAAR_ERROR, PAN_ERROR } from '@/utils/idFormat';
import { BankDetails } from '@/components/employee/BankDetails';
import { BonusConfigSection } from '@/components/employee/BonusConfigSection';
import { MinimumWageAdvisory } from '@/components/employee/MinimumWageAdvisory';
import { usePermissions } from '@/context/PermissionContext';
import { ui } from '@/components/ui/feedback';

const EMPLOYEE_EXPORT_COLUMNS: ExportColumn[] = [
  { header: 'Sr No', key: 'srNo', width: 8 },
  { header: 'Employee Code', key: 'employeeId', width: 18 },
  { header: 'Name', key: 'name', width: 26 },
  { header: 'Designation', key: 'designation', width: 22 },
  { header: 'Department', key: 'department', width: 20 },
  { header: 'Branch', key: 'branchLocation', width: 18 },
  { header: 'Mobile', key: 'mobileNumber', width: 16 },
  { header: 'Email', key: 'email', width: 28 },
  { header: 'Salary', key: 'salary', width: 14 },
  { header: 'Status', key: 'status', width: 14 },
  { header: 'PAN', key: 'pan', width: 16 },
  { header: 'UAN', key: 'uan', width: 16 },
  { header: 'ESIC Number', key: 'esiNumber', width: 18 },
  { header: 'WC Policy Number', key: 'wcPolicyNumber', width: 20 },
];

// ── Temporary-employee approval gate (mirrors the backend; keep in sync) ──────
// A temp cannot be submitted for approval — and thus cannot be activated — until
// all of these are present. Used for the live checklist in the Complete Profile
// modal and to enable the Submit-for-Approval button.
// Employee self-onboarding gate — PERSONAL + verification only. Department,
// Designation and other employment fields are assigned by HR at approval, so
// they are deliberately NOT required from the employee here.
const TEMP_MANDATORY_FIELDS: { key: string; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'mobile', label: 'Mobile' },
  { key: 'presentAddress', label: 'Address' },
  { key: 'aadhaar', label: 'Aadhaar' },
  { key: 'pan', label: 'PAN' },
  { key: 'accountNumber', label: 'Bank Account' },
];
const TEMP_MANDATORY_DOCS: { key: string; label: string }[] = [
  { key: 'photo', label: 'Photo' },
  { key: 'aadhaarDoc', label: 'Aadhaar Copy' },
  { key: 'panDoc', label: 'PAN Copy' },
  { key: 'bankProof', label: 'Bank Proof' },
];
const hasTempVal = (v: any) => v != null && String(v).trim() !== '';
const tempDocPresent = (t: any, key: string) => {
  if (key === 'photo') return hasTempVal(t?.photoUpload);
  const d = t?.documents;
  if (!d || typeof d !== 'object') return false;
  const entry = d[key];
  if (!entry) return false;
  if (typeof entry === 'string') return entry.trim() !== '';
  return !!(entry.dataUrl || entry.data || entry.url || entry.name);
};
function validateTempMandatory(t: any): { ok: boolean; missingFields: string[]; missingDocs: string[] } {
  const missingFields = TEMP_MANDATORY_FIELDS.filter(f => !hasTempVal(t?.[f.key])).map(f => f.label);
  if (!hasTempVal(t?.branchId) && !hasTempVal(t?.branchLocation)) missingFields.push('Branch');
  const missingDocs = TEMP_MANDATORY_DOCS.filter(d => !tempDocPresent(t, d.key)).map(d => d.label);
  return { ok: missingFields.length === 0 && missingDocs.length === 0, missingFields, missingDocs };
}
// Badge colour per temp lifecycle status.
const tempStatusBadge = (status: string): string => {
  switch (status) {
    case 'Converted': return 'green';
    case 'Rejected': return 'red';
    case 'Pending Approval':
    case 'Awaiting Approval': return 'blue';
    case 'Changes Requested': return 'amber';
    case 'Partially Completed': return 'amber';
    default: return 'amber'; // Pending Profile
  }
};
// Group temp statuses into the two live queues + history.
const TEMP_APPROVAL_STATUSES = ['Pending Approval', 'Awaiting Approval'];
const TEMP_INPROGRESS_STATUSES = ['Pending Profile', 'Partially Completed', 'Changes Requested'];



interface EmployeesProps {
  role: Role;
  activeCompanyId: string;
  companies: Company[];
  userAccounts: UserAccount[];
  onUpdateAccounts: (accounts: UserAccount[]) => void;
  employees: Employee[];
  onUpdateEmployees: (employees: Employee[]) => void;
  leaves?: any[];
  /** Deep-link: open this employee's profile on arrival (e.g. from Employee Cards). */
  focusEmployeeId?: string | null;
  /** Called once the deep-link has been consumed, so a later re-render does not reopen it. */
  onFocusHandled?: () => void;
}

const capitalize = (str: string) => {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

// ── Aadhaar name comparison ──
// Normalize a name for comparison ONLY (never for storage): trim, collapse
// internal whitespace, uppercase — so "rutv  sunilkumar   soni" == "RUTV SUNILKUMAR SONI".
const normalizeName = (s?: string) => (s || '').trim().replace(/\s+/g, ' ').toUpperCase();
// First + Middle (optional) + Surname → a single-spaced full name. Middle name is
// optional: empty parts are dropped, so First+Last works too.
const buildFullName = (first?: string, middle?: string, last?: string) =>
  [first, middle, last].map(p => (p || '').trim()).filter(Boolean).join(' ');

// Employee lifecycle: Active operations vs Archived (offboarded — retained for
// history, excluded from payroll/attendance/leave credits). 'Inactive' is
// retired in favour of 'Archived'.
// ── Employee editor route ────────────────────────────────────────────────────
// The full-page editor has its own URL, /employees/:id/edit, so Back, refresh
// and shared links all behave. App.tsx's pathToPage only reads the FIRST path
// segment, so this deeper path still resolves to the Employees page — the id and
// the /edit suffix are interpreted here.
const editPathFor = (id: string | number) => `/employees/${encodeURIComponent(String(id))}/edit`;
const editIdFromPath = (): string | null => {
  const m = (typeof window === 'undefined' ? '' : window.location.pathname).match(/^\/employees\/([^/]+)\/edit\/?$/);
  return m ? decodeURIComponent(m[1]) : null;
};

// Shown when a user clicks a registration step they have not yet earned.
const LOCKED_STEP_MESSAGE = 'Please complete and save the current step before proceeding.';

const statusOptions: EmployeeStatus[] = ['Active', 'Archived', 'On Leave'];
const categoryOptions = ['Skilled', 'Semi-skilled', 'Unskilled', 'Highly skilled'];
const employmentTypeOptions = ['PERMANENT', 'CONTRACTUAL', 'PROBATION', 'INTERN'];

// ── Structured exit reasons for the Final HR Approval step. Stored on the
// employee (exitReason column + offboardingState JSON) so Offboarding / Attrition
// / HR-analytics reports can group by a consistent, reportable value. ──
const EXIT_REASONS = [
  'Better Salary / Better Package',
  'Better Career Opportunity',
  'Higher Education',
  'Relocation / Transfer to Another City',
  'Personal Reasons',
  'Family Responsibilities',
  'Health / Medical Reasons',
  'Marriage',
  'Retirement',
  'End of Contract',
  'Performance Issues',
  'Attendance / Discipline Issues',
  'Policy Violation / Misconduct',
  'Company Restructuring',
  'Layoff / Workforce Reduction',
  'Business Closure',
  'Mutual Separation',
  'Absconding',
  'Other',
];
const EXIT_CHECKLIST: Array<{ key: string; label: string }> = [
  { key: 'exitInterview', label: 'Exit Interview Completed' },
  { key: 'exitFeedback', label: 'Exit Feedback Collected' },
  { key: 'assetsReturned', label: 'Assets Returned' },
  { key: 'knowledgeTransfer', label: 'Knowledge Transfer Completed' },
  { key: 'managerApproval', label: 'Manager Approval Completed' },
  { key: 'itAccessRevoked', label: 'IT Access Revoked' },
  { key: 'payrollSettlement', label: 'Payroll Settlement Completed' },
  { key: 'finalDocuments', label: 'Final Documents Issued' },
];

export const Employees: React.FC<EmployeesProps> = ({
  role,
  activeCompanyId,
  companies,
  userAccounts: _userAccounts,
  onUpdateAccounts: _onUpdateAccounts,
  employees,
  onUpdateEmployees,
  leaves = [],
  focusEmployeeId = null,
  onFocusHandled,
}) => {
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Server-Side Pagination State
  const [page, setPage] = useState(1);
  const limit = 15;
  const [paginatedData, setPaginatedData] = useState<Employee[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [isTableLoading, setIsTableLoading] = useState(false);
  // Authoritative real-employee counts — read from the SAME server query that
  // drives the table (single source of truth), so the count cards can never
  // disagree with the employee list. Temporary/Pending come from a separate table.
  const [serverCounts, setServerCounts] = useState<{ all: number; active: number; previous: number } | null>(null);

  // Kind-aware: a plain find returns the parent company when a branch shares
  // its id, which would wrongly flip isBranchWorkspace to false and mis-scope
  // the whole page. resolveActiveWorkspace honours the active workspace kind.
  const currentComp = resolveActiveWorkspace(companies as any[], activeCompanyId)
    || companies.find(c => String(c.id) === String(activeCompanyId));
  const isBranchWorkspace = !!currentComp?.parentCompanyId && !currentComp?.isHeadOffice;
  const parentCompanyId = isBranchWorkspace ? currentComp.parentCompanyId : activeCompanyId;
  const dynamicBranches = useMemo(() => companies.filter(c => c.parentCompanyId === parentCompanyId && c.status !== 'Archived'), [companies, parentCompanyId]);
  const branchOptions = useMemo(() => dynamicBranches.map(b => b.branchName || b.name), [dynamicBranches]);
  // When the top-right scope selector points at a branch, that branch is the
  // single source of truth for any new temporary employee — auto-assigned and
  // not user-changeable. At company scope this is blank and the user must pick.
  const activeBranchName = isBranchWorkspace ? String(currentComp?.branchName || currentComp?.name || '').trim() : '';

  const { canEdit: canEditModule, canCreate: canCreateModule } = usePermissions();
  const canEdit = canEditModule('employees');
  const canCreate = canCreateModule('employees');
  // Optional Biometric Code column in the roster table (hidden by default).
  const [showBiometric, setShowBiometric] = useState(false);
  // Biometric Code bulk-import modal.
  const [bioImportOpen, setBioImportOpen] = useState(false);
  const refreshAfterBiometric = async () => {
    try {
      const all: any = await api.employees.getAll();
      const list = Array.isArray(all) ? all : (all?.employees || null);
      if (list) onUpdateEmployees(list);
    } catch { /* ignore — list stays as-is */ }
  };

  // Drawer & Modals state
  const [viewEmp, setViewEmp] = useState<Employee | null>(null);
  // True when the profile currently open belongs to a PREVIOUS employee whose
  // record is locked for this user. Every write affordance inside the profile
  // (bonus, document upload/replace) is gated on this in addition to `canEdit`;
  // the server enforces the same rule, so this only removes dead buttons.
  const isViewLocked = isRecordLocked(viewEmp, role);
  // Document upload/replace inside the profile. Viewing and downloading stay
  // available on a locked record — only writes are withdrawn.
  const canEditDocs = canEdit && !isViewLocked;

  // Deep-link from Employee Cards → "View Profile". Opens the real profile modal
  // once the employee list has loaded, then clears the request so closing the
  // modal does not immediately reopen it.
  useEffect(() => {
    if (!focusEmployeeId) return;
    const target = employees.find(e => String(e.id) === String(focusEmployeeId));
    if (!target) return;
    setViewEmp(target);
    onFocusHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusEmployeeId, employees]);
  const [editEmp, setEditEmp] = useState<Employee | null>(null);
  // Full-page Edit support: baseline snapshot (for Reset) + post-save banner state
  // (so the user can stay on the page and continue editing after Save).
  const [editOriginal, setEditOriginal] = useState<Employee | null>(null);
  const [editSaved, setEditSaved] = useState(false);
  // True while the authoritative record is being fetched for the editor.
  const [editLoading, setEditLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  // When set, the registration wizard is running in RE-ONBOARD mode: it is
  // prefilled from this previous (locked) employee and submits to the
  // re-onboard endpoint, which creates a new record instead of editing this one.
  const [reOnboardSource, setReOnboardSource] = useState<Employee | null>(null);
  const [wizardNominees, setWizardNominees] = useState<any[]>([]); // staged nominees during registration
  const [deleteEmp, setDeleteEmp] = useState<Employee | null>(null);

  // Excel Importer states
  const [importOpen, setImportOpen] = useState(false);
  const [importedRows, setImportedRows] = useState<any[]>([]);
  const [importLogs, setImportLogs] = useState<string[]>([]);
  // Honest post-commit outcome (created/updated/skipped/failed + per-row log).
  // Non-null → the importer modal shows the completion summary instead of a toast.
  const [importResult, setImportResult] = useState<{
    total: number; createdN: number; updatedN: number; skippedN: number; failedN: number;
    results: { row: number; name: string; employeeId?: string | null; status: string; reason?: string }[];
    limitReached?: boolean;
  } | null>(null);
  // Set when the backend rejected the ENTIRE file up-front on the plan employee
  // cap. Nothing was written, so the parsed rows stay on screen and the user can
  // trim the file (or upgrade) and commit again.
  const [importBlocked, setImportBlocked] = useState<{
    plan: string; limit: number; current: number; importCount: number; availableSlots: number;
  } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tabs in drawer
  const [activeTab, setActiveTab] = useState<'personal' | 'job' | 'banking' | 'compliance' | 'documents' | 'leaves' | 'address' | 'nominees' | 'bonus' | 'review'>('personal');

  // Unmasking state for sensitive fields
  const [unmaskedField, setUnmaskedField] = useState<Record<string, boolean>>({});

  // Dynamic Leave History filtering for the currently viewed employee

  // Enterprise Lifecycle & Export
  const [activeMainTab, setActiveMainTab] = useState<'all' | 'active' | 'previous' | 'temporary' | 'approvals'>('all');

  // ── Temporary Employees (Quick Registration) — additive, separate dataset ──
  const [temps, setTemps] = useState<any[]>([]);
  const [tempBusy, setTempBusy] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickForm, setQuickForm] = useState({ name: '', mobile: '', branch: '', department: '' });
  // Unique-mobile enforcement: live duplicate descriptor + in-flight flag for Quick Add.
  const [mobileDup, setMobileDup] = useState<any | null>(null);
  const [mobileChecking, setMobileChecking] = useState(false);
  // Shape validity of the Quick Add mobile, from the shared field registry — the
  // same rule the backend applies, so the button can't offer a save the API will
  // refuse. (Blank is "not yet valid" here because the field is required.)
  const quickMobileCheck = validateField('mobile', quickForm.mobile);
  const quickMobileValid = !!quickForm.mobile.trim() && quickMobileCheck.isValid;
  const quickMobileError = quickMobileCheck.isValid ? '' : (quickMobileCheck.error || 'Invalid mobile number.');
  // Quick Registration gate. Branch is only the user's to choose at company
  // scope — inside a branch workspace it is auto-assigned, so it cannot block.
  const quickGate = useFormGate(useMemo(() => {
    const f: GateFields = {
      quickName: { type: 'name', value: quickForm.name, required: true, label: 'Employee Name' },
      quickMobile: { type: 'mobile', value: quickForm.mobile, required: true, label: 'Mobile Number', focusId: 'field-quickMobile' },
    };
    if (!isBranchWorkspace) {
      f.quickBranch = { type: 'text', value: quickForm.branch, required: true, label: 'Branch' };
    }
    return f;
  }, [quickForm.name, quickForm.mobile, quickForm.branch, isBranchWorkspace]));
  const [editTemp, setEditTemp] = useState<any | null>(null);   // Complete-profile modal
  const [reviewTemp, setReviewTemp] = useState<any | null>(null); // Approval review modal
  // HR Employment Assignment screen (opened on approve — HR assigns official details).
  const [assignTemp, setAssignTemp] = useState<any | null>(null);
  const EMPTY_ASSIGN = {
    // Organization
    department: '', designation: '', reportingManager: '',
    // Employment
    employmentType: 'Permanent', employeeCategory: '', joinDate: '', confirmationDate: '', probationPeriod: '', grade: '', level: '',
    // Payroll
    salary: '', basicSalary: '', grossSalary: '', ctc: '', wageCategory: '', skillCategory: '', pf: '', esi: '', professionalTax: '', bonusEligibility: '',
    // Attendance
    shift: '', weeklyOff: '', attendancePolicy: '', leavePolicy: '', holidayCalendar: '',
  };
  const [assignForm, setAssignForm] = useState<any>(EMPTY_ASSIGN);

  // ── Toolbar dropdowns (Actions ▼ / Add Employee ▼) — declutter, no h-scroll ──
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const actionsMenuRef = useRef<HTMLDivElement>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);
  useDismissable(actionsMenuOpen, () => setActionsMenuOpen(false), actionsMenuRef);
  useDismissable(addMenuOpen, () => setAddMenuOpen(false), addMenuRef);
  // Export uses the SAME export utils as before (logic unchanged) on the current
  // filtered, on-screen rows.
  const runExport = (format: 'excel' | 'pdf') => {
    setActionsMenuOpen(false);
    try {
      const data = filtered.map((e, i) => ({ ...e, srNo: i + 1 }));
      if (!data.length) { ui.toast.info('There is no data to export for the current view.'); return; }
      const stamp = new Date().toISOString().slice(0, 10);
      if (format === 'excel') exportRowsToExcel(`Employees_${stamp}`, EMPLOYEE_EXPORT_COLUMNS, data, 'Employees');
      else exportRowsToPDF(`Employees_${stamp}`, 'Employee Directory', EMPLOYEE_EXPORT_COLUMNS, data);
    } catch (err: any) { ui.toast.error('Export failed: ' + (err?.message || 'Unknown error')); }
  };
  // A blank header-only workbook the user fills in for Bulk Import.
  // Professional, self-documenting Sample File: a styled data sheet pre-filled with
  // two complete demo employees (importable as-is if the branch exists) + an
  // Instructions sheet. Built with ExcelJS for real formatting (bold header, fill,
  // borders, frozen header, auto width, preserved text/number types).
  const downloadSampleFile = async () => {
    setActionsMenuOpen(false);
    try {
      const ExcelJS: any = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      wb.creator = 'ZeniaHR';

      // The data sheet is named after the branch so the importer maps it to the
      // Head Office branch; the "Branch" column carries the same value.
      const ws = wb.addWorksheet('Head Office', { views: [{ state: 'frozen', ySplit: 1 }] });
      const headers = ['Employee Code', 'Employee Name', 'Gender', 'Mobile', 'Email', 'Date of Birth', 'Joining Date', 'Department', 'Designation', 'Branch', 'Shift', 'Salary', 'Status', 'WC Policy Number'];
      ws.columns = headers.map((h) => ({ header: h, key: h, width: Math.max(14, h.length + 4) }));
      ws.addRow(['EMP0001', 'Rahul Sharma', 'Male', '9876543210', 'rahul.sharma@example.com', '15/08/1995', '01/01/2026', 'HR', 'HR Executive', 'Head Office', 'General Shift', 25000, 'Active', 'WC-2026/0001']);
      ws.addRow(['EMP0002', 'Priya Patel', 'Female', '9876501234', 'priya.patel@example.com', '22/05/1997', '15/01/2026', 'Accounts', 'Accountant', 'Head Office', 'General Shift', 32000, 'Active', 'WC-2026/0002']);

      // Preserve data types: text for code/mobile/dates/WC-policy (no auto-coercion), number for salary.
      [1, 4, 6, 7, 14].forEach((c) => { ws.getColumn(c).numFmt = '@'; });
      ws.getColumn(12).numFmt = '#,##0';

      const thin = { style: 'thin', color: { argb: 'FFD1D5DB' } };
      ws.eachRow((row: any, rowNumber: number) => {
        row.eachCell((cell: any) => { cell.border = { top: thin, left: thin, bottom: thin, right: thin }; });
        if (rowNumber === 1) {
          row.height = 22;
          row.eachCell((cell: any) => {
            cell.font = { bold: true, color: { argb: 'FF3730A3' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDE9FE' } }; // light purple
            cell.alignment = { vertical: 'middle', horizontal: 'left' };
          });
        } else {
          row.eachCell((cell: any) => { cell.alignment = { vertical: 'middle' }; });
        }
      });

      // Instructions sheet — the import guide.
      const ins = wb.addWorksheet('Instructions');
      ins.getColumn(1).width = 108;
      const notes: [string, boolean][] = [
        ['Employee Import — Instructions', true],
        ['', false],
        ['1. Do not change the column names in the "Head Office" sheet.', false],
        ['2. Do not delete required columns (Employee Code, Employee Name, Branch).', false],
        ['3. Date format must be DD/MM/YYYY (e.g. 01/01/2026).', false],
        ['4. Mobile number should contain only digits (10 digits).', false],
        ['5. Email must be a valid email address.', false],
        ['6. Salary must be numeric (no symbols or commas).', false],
        ['7. Employee Code must be unique — an existing code updates that employee instead of duplicating.', false],
        ['8. Department, Branch, Designation and Shift should already exist in the system (or follow the application’s import rules).', false],
        ['9. WC Policy Number is OPTIONAL (max 100 chars; letters, numbers and - / allowed). Leave blank if not applicable. UAN, PF and ESIC are optional too.', false],
        ['10. Remove the two sample rows before importing your real data if you do not want them imported.', false],
        ['', false],
        ['Tip: rename the "Head Office" sheet to your branch name to import into a different branch.', false],
      ];
      notes.forEach(([text, header], i) => {
        const r = ins.addRow([text]);
        if (i === 0) { r.getCell(1).font = { bold: true, size: 14, color: { argb: 'FF6D28D9' } }; r.height = 24; }
        else if (header) r.getCell(1).font = { bold: true };
        else r.getCell(1).alignment = { wrapText: true, vertical: 'top' };
      });

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Employee_Import_Sample_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      ui.toast.success('Sample file downloaded — includes 2 demo employees + an Instructions sheet.');
    } catch (err: any) {
      ui.toast.error('Could not generate the sample file: ' + (err?.message || 'Unknown error'));
    }
  };
  const refreshTemps = async () => {
    try { const list: any = await api.temporaryEmployees.getAll(); const arr = Array.isArray(list) ? list : []; setTemps(arr); return arr; }
    catch { /* leave as-is */ return temps; }
  };
  useEffect(() => { if (isHR) refreshTemps(); /* eslint-disable-next-line */ }, [activeCompanyId]);
  // Temp employees scoped to the active workspace (company or branch), excluding converted/rejected from the live count.
  const scopedTemps = useMemo(() => temps.filter(t => isCompanyIdMatch(t.companyId, activeCompanyId, companies, t.branchLocation, t.branchId) || (t.branchLocation && branchOptions.some(b => b.toLowerCase() === String(t.branchLocation).toLowerCase()))), [temps, activeCompanyId, companies, branchOptions]);
  // Two distinct queues: still-being-completed (Temporary tab) vs submitted &
  // awaiting an HR/Head decision (Pending Approvals tab). Converted records have
  // left to Active Employees and never appear in either count.
  const pendingApprovals = useMemo(() => scopedTemps.filter(t => TEMP_APPROVAL_STATUSES.includes(t.status)), [scopedTemps]);
  const inProgressTemps = useMemo(() => scopedTemps.filter(t => TEMP_INPROGRESS_STATUSES.includes(t.status)), [scopedTemps]);
  // The Temporary table shows everything that is NOT awaiting approval (those
  // live in the approvals queue) — i.e. in-progress, changes-requested, rejected
  // and converted-history — so each record sits in exactly one active place.
  const temporaryTableRows = useMemo(() => scopedTemps.filter(t => !TEMP_APPROVAL_STATUSES.includes(t.status)), [scopedTemps]);

  // Open Quick Add honouring the active scope: at branch scope the branch is
  // pre-assigned (and locked in the modal); at company scope it starts blank.
  const openQuickAdd = () => {
    setQuickForm({ name: '', mobile: '', branch: activeBranchName, department: '' });
    setMobileDup(null);
    setQuickOpen(true);
  };

  // ── Unique mobile enforcement (one mobile = one employee identity) ──────────
  // Open the existing record a duplicate mobile belongs to: a still-editable temp
  // can be continued; a converted/real employee is shown in its status tab.
  const openExistingForDuplicate = async (dup: any) => {
    setQuickOpen(false);
    if (dup.kind === 'temporary' && dup.editable && dup.inScope) {
      const full = temps.find(t => t.id === dup.tempId) || (await refreshTemps()).find((t: any) => t.id === dup.tempId);
      setActiveMainTab(TEMP_APPROVAL_STATUSES.includes(dup.status) ? 'approvals' : 'temporary');
      if (full) setEditTemp(full);
      else ui.toast.info(`Open the ${dup.code} record from the Temporary tab to continue its profile.`);
    } else {
      // Real / converted employee — surface where it lives.
      setActiveMainTab(dup.kind === 'employee' && /previous|exit|archive|inactive/i.test(dup.status || '') ? 'previous' : 'active');
      ui.toast.info(`${dup.code} (${dup.status || 'Active'}) already uses this mobile number.`);
    }
  };

  // Present the "mobile already registered" dialog with the right call-to-action.
  const presentDuplicateMobile = async (dup: any) => {
    const noun = dup.kind === 'employee' ? 'employee' : 'temporary employee';
    const canContinue = dup.kind === 'temporary' && dup.editable && dup.inScope;
    const message = (
      <div className="space-y-2 text-left text-sm">
        <p>This mobile number is already linked to an existing {noun}.</p>
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs space-y-0.5">
          <div><span className="text-slate-500">Employee ID:</span> <strong className="text-slate-800">{dup.code || '—'}</strong></div>
          {dup.name && <div><span className="text-slate-500">Name:</span> <strong className="text-slate-800">{dup.name}</strong></div>}
          {dup.status && <div><span className="text-slate-500">Status:</span> <strong className="text-slate-800">{dup.status}</strong></div>}
        </div>
        <p className="font-medium text-rose-600">Duplicate employee creation is not allowed.</p>
        {canContinue && <p className="text-[11px] text-slate-500">You can continue completing this pending profile instead of creating a new record.</p>}
      </div>
    );
    const go = await ui.confirm({
      title: 'Mobile number already registered',
      message,
      variant: canContinue ? 'warning' : 'error',
      confirmText: canContinue ? 'Continue Profile Completion' : 'View Existing',
      cancelText: 'Cancel',
    });
    if (go) await openExistingForDuplicate(dup);
  };

  // Live check on blur — gives immediate feedback before the user submits.
  const checkMobileLive = async (mobileRaw: string) => {
    const mobile = (mobileRaw || '').trim();
    if (!mobile) { setMobileDup(null); return; }
    setMobileChecking(true);
    try {
      const r: any = await api.temporaryEmployees.checkMobile(mobile);
      setMobileDup(r?.exists ? r.duplicate : null);
    } catch { /* non-blocking — the create call re-enforces server-side */ }
    finally { setMobileChecking(false); }
  };

  // Resolve the active workspace's branch id (company-record id) for the quick form.
  const handleQuickCreate = async () => {
    if (!quickForm.name.trim()) { ui.toast.warning('Employee Name is required.'); return; }
    if (!quickForm.mobile.trim()) { ui.toast.warning('Mobile Number is required.'); return; }
    // Re-checked here, not just on the button: the handler is also reachable by
    // Enter, and a disabled button is a hint, never an enforcement point.
    if (!quickMobileValid) { ui.toast.warning(quickMobileError); return; }
    // Branch scope: the active branch is authoritative — ignore any stale form value.
    // Company scope: the user must have chosen a branch.
    const effectiveBranch = isBranchWorkspace ? activeBranchName : quickForm.branch.trim();
    if (!effectiveBranch) { ui.toast.warning('Branch is required.'); return; }
    setTempBusy(true);
    try {
      // One mobile = one identity — authoritative pre-check before creating.
      const chk: any = await api.temporaryEmployees.checkMobile(quickForm.mobile.trim()).catch(() => null);
      if (chk?.exists) { setMobileDup(chk.duplicate); setTempBusy(false); await presentDuplicateMobile(chk.duplicate); return; }
      const br = dynamicBranches.find(b => (b.branchName || b.name) === effectiveBranch);
      const created: any = await api.temporaryEmployees.create({
        name: quickForm.name.trim(), mobile: quickForm.mobile.trim(),
        branchId: br?.id, branchLocation: effectiveBranch,
        department: quickForm.department.trim() || undefined,
        companyId: parentCompanyId,
      });
      await refreshTemps();
      setQuickOpen(false);
      setQuickForm({ name: '', mobile: '', branch: '', department: '' });
      setMobileDup(null);
      setActiveMainTab('temporary');
      ui.toast.success(`Temporary employee created — ${created?.tempEmployeeId}. Complete the profile & documents, then submit for approval.`);
    } catch (e: any) {
      // Backstop: the server also rejects duplicates (race / direct API call).
      if (e?.status === 409 && e?.data?.duplicate) { setMobileDup(e.data.duplicate); await presentDuplicateMobile(e.data.duplicate); }
      else ui.toast.error(getApiErrorMessage(e, 'Could not create the temporary employee.'));
    }
    finally { setTempBusy(false); }
  };

  // Submit-for-approval: validate the mandatory gate (server is the authority).
  // On success the record moves to the Pending Approvals queue.
  const handleSubmitTemp = async (t: any) => {
    const v = validateTempMandatory(t);
    if (!v.ok) {
      const miss = [...v.missingFields, ...v.missingDocs].join(', ');
      ui.toast.warning(`Cannot submit — missing: ${miss}. Open Complete Profile to finish.`);
      return;
    }
    setTempBusy(true);
    try {
      await api.temporaryEmployees.submit(t.id);
      await refreshTemps();
      setActiveMainTab('approvals');
      ui.toast.success(`${t.name} submitted for approval — now in the Pending Approvals queue.`);
    } catch (e: any) {
      const data = e?.data || e?.response?.data;
      const miss = [...(data?.missingFields || []), ...(data?.missingDocs || [])].join(', ');
      ui.toast.error(miss ? `Cannot submit — missing: ${miss}.` : getApiErrorMessage(e, 'Could not submit for approval.'));
    } finally { setTempBusy(false); }
  };

  // Approval is the ONLY path to activation (no direct conversion). Generates the
  // official Employee ID and creates the Active employee.
  // Approval opens the HR Employment Assignment screen (HR/Company Head/Super
  // Admin assign the official employment details there — the employee never
  // entered them). Activation happens on submit of that screen.
  const openAssign = (t: any) => {
    setReviewTemp(null);
    setAssignForm({ ...EMPTY_ASSIGN, department: t.department || '', designation: t.designation || '', joinDate: new Date().toISOString().slice(0, 10) });
    setAssignTemp(t);
  };

  const submitAssignment = async () => {
    if (!assignTemp) return;
    if (!assignForm.department.trim() || !assignForm.designation.trim()) {
      ui.toast.warning('Department and Designation are required to approve.');
      return;
    }
    setTempBusy(true);
    try {
      const f = assignForm;
      const clean = (v: any) => (typeof v === 'string' ? (v.trim() || undefined) : (v ?? undefined));
      const res: any = await api.temporaryEmployees.approve(assignTemp.id, {
        // Organization
        department: f.department.trim(), designation: f.designation.trim(), reportingManager: clean(f.reportingManager),
        // Employment
        employmentType: f.employmentType, employeeCategory: clean(f.employeeCategory), joinDate: clean(f.joinDate),
        confirmationDate: clean(f.confirmationDate), probationPeriod: clean(f.probationPeriod), grade: clean(f.grade), level: clean(f.level),
        // Payroll
        salary: f.salary !== '' ? f.salary : undefined, basicSalary: clean(f.basicSalary), grossSalary: clean(f.grossSalary), ctc: clean(f.ctc),
        wageCategory: clean(f.wageCategory), skillCategory: clean(f.skillCategory), pf: clean(f.pf), esi: clean(f.esi), professionalTax: clean(f.professionalTax), bonusEligibility: clean(f.bonusEligibility),
        // Attendance
        shift: clean(f.shift), weeklyOff: clean(f.weeklyOff), attendancePolicy: clean(f.attendancePolicy), leavePolicy: clean(f.leavePolicy), holidayCalendar: clean(f.holidayCalendar),
      });
      await refreshTemps();
      await refreshAfterBiometric(); // reload the real employee roster so the new hire appears
      setAssignTemp(null);
      ui.toast.success(`Approved — ${res?.employee?.employeeId}. Now an Active Employee.`);
    } catch (e: any) { ui.toast.error(getApiErrorMessage(e, 'Approval failed.')); }
    finally { setTempBusy(false); }
  };

  const handleRequestChangesTemp = async (t: any) => {
    const note = await ui.prompt({ message: `Request changes for "${t.name}" (${t.tempEmployeeId}). What needs to be corrected?`, defaultValue: '' });
    if (note === null) return;
    setTempBusy(true);
    try {
      await api.temporaryEmployees.requestChanges(t.id, note || '');
      await refreshTemps();
      setReviewTemp(null);
      ui.toast.success('Sent back for changes. The record returns to the Temporary list for edits.');
    } catch (e: any) { ui.toast.error(getApiErrorMessage(e, 'Could not request changes.')); }
    finally { setTempBusy(false); }
  };

  const handleRejectTemp = async (t: any) => {
    const reason = await ui.prompt({ message: `Reject "${t.name}" (${t.tempEmployeeId})? Add a reason (visible to HR & the employee):`, defaultValue: '' });
    if (reason === null) return;
    setTempBusy(true);
    try { await api.temporaryEmployees.reject(t.id, reason || ''); await refreshTemps(); setReviewTemp(null); ui.toast.success('Temporary employee rejected.'); }
    catch (e: any) { ui.toast.error(getApiErrorMessage(e, 'Could not reject.')); }
    finally { setTempBusy(false); }
  };

  const handleDeleteTemp = async (t: any) => {
    const ok = await ui.confirm({ message: `Delete temporary record "${t.name}" (${t.tempEmployeeId})? This cannot be undone.`, variant: 'danger', confirmText: 'Delete' });
    if (!ok) return;
    setTempBusy(true);
    try { await api.temporaryEmployees.remove(t.id); await refreshTemps(); ui.toast.success('Temporary record deleted.'); }
    catch (e: any) { ui.toast.error(getApiErrorMessage(e, 'Could not delete.')); }
    finally { setTempBusy(false); }
  };

  // Completing a temp profile now happens in the dedicated full-screen
  // TempEmployeeOnboarding wizard (no modal) — it owns its own draft state,
  // save, document upload and submit-for-approval flow, calling back to refresh
  // the list. The Temporary table's quick "Submit for Approval" action below
  // remains for records that are already complete.

  const [offboardEmp, setOffboardEmp] = useState<Employee | null>(null);

  // Active shifts for the optional shift-assignment dropdown on the employee form.
  const [shiftOptions, setShiftOptions] = useState<any[]>([]);
  useEffect(() => {
    if (!activeCompanyId) return;
    api.shifts.getAll()
      .then((rows: any[]) => setShiftOptions((rows || []).filter((s: any) => s.status === 'Active')))
      .catch(() => setShiftOptions([]));
  }, [activeCompanyId]);
  const shiftSelectOptions = useMemo(
    () => [{ value: '', label: 'No shift (assign later)' }, ...shiftOptions.map((s: any) => ({ value: String(s.id), label: `${s.name}${s.start ? ` (${s.start}–${s.end})` : ''}` }))],
    [shiftOptions]
  );

  const empLeavesHistory = useMemo(() => {
    if (!viewEmp) return [];
    return leaves.filter(
      l => (l.employeeId === viewEmp.id || l.employeeName.toLowerCase() === viewEmp.name.toLowerCase()) &&
        l.companyId === activeCompanyId
    );
  }, [leaves, viewEmp, activeCompanyId]);

  // One-time / historical bonus ledger for the profile being viewed.
  const [empBonusHistory, setEmpBonusHistory] = useState<any[]>([]);
  const loadBonusHistory = useCallback(async (empId: any) => {
    try { const rows = await api.employeeBonuses.list(`?employeeId=${empId}`); setEmpBonusHistory(Array.isArray(rows) ? rows : []); }
    catch { setEmpBonusHistory([]); }
  }, []);
  useEffect(() => {
    if (!viewEmp) { setEmpBonusHistory([]); return; }
    loadBonusHistory(viewEmp.id);
  }, [viewEmp, loadBonusHistory]);

  // ── Bonus tab quick actions (Add one-time bonus / Disable recurring bonus) ──
  const [addBonusOpen, setAddBonusOpen] = useState(false);
  const [bonusBusy, setBonusBusy] = useState(false);
  const [bonusForm, setBonusForm] = useState({ bonusType: 'Festival', calcMethod: 'Fixed Amount', value: '', reason: '' });

  const handleAddBonus = async () => {
    if (!viewEmp) return;
    const num = Number(bonusForm.value);
    if (!num || num <= 0) { ui.toast.warning('Enter a bonus amount or percentage greater than zero.'); return; }
    const isPct = bonusForm.calcMethod.toLowerCase().includes('percent');
    const amount = isPct ? Math.round((viewEmp.salary || 0) * num / 100) : Math.round(num);
    setBonusBusy(true);
    try {
      await api.employeeBonuses.create({
        companyId: viewEmp.companyId, employeeId: viewEmp.id, source: 'employee',
        bonusType: bonusForm.bonusType, calcMethod: bonusForm.calcMethod,
        amount, percent: isPct ? num : null, reason: bonusForm.reason || null, status: 'Active',
      });
      ui.toast.success('Bonus added to the employee history.');
      await loadBonusHistory(viewEmp.id);
      setAddBonusOpen(false);
      setBonusForm({ bonusType: 'Festival', calcMethod: 'Fixed Amount', value: '', reason: '' });
    } catch (e: any) {
      ui.toast.error(`Failed to add bonus: ${e?.message || 'Unknown error'}`);
    } finally { setBonusBusy(false); }
  };

  const handleDisableBonus = async () => {
    if (!viewEmp) return;
    if (!viewEmp.bonusApplicable) { ui.toast.info('Recurring bonus is already disabled for this employee.'); return; }
    const ok = await ui.confirm({ title: 'Disable Bonus', message: `Disable the recurring bonus for ${viewEmp.name}? Existing bonus history is kept; future payrolls will not auto-include it.`, confirmText: 'Disable', variant: 'warning' });
    if (!ok) return;
    try {
      const updated = { ...viewEmp, bonusApplicable: false } as Employee;
      const saved = await api.employees.update(viewEmp.id, updated);
      onUpdateEmployees(employees.map(e => e.id === saved.id ? saved : e));
      setViewEmp(saved);
      ui.toast.success('Recurring bonus disabled.');
    } catch (e: any) {
      ui.toast.error(`Failed to disable bonus: ${e?.message || 'Unknown error'}`);
    }
  };

  // Handlers for premium document upload and base64 parsing
  const handleUploadDocType = async (docType: 'photoUpload' | 'aadhaarUpload' | 'panUpload' | 'signatureUpload' | 'otherUpload', fileUrl: string) => {
    if (!viewEmp) return;
    const updatedEmp = {
      ...viewEmp,
      [docType]: fileUrl
    };
    try {
      const savedEmp = await api.employees.update(updatedEmp.id, updatedEmp);
      onUpdateEmployees(employees.map(e => e.id === savedEmp.id ? savedEmp : e));
      setViewEmp(savedEmp);
    } catch (err) {
      console.error('Failed to upload document:', err);
      ui.toast.error('Failed to upload document. Please try again.');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, docType: 'photoUpload' | 'aadhaarUpload' | 'panUpload' | 'signatureUpload' | 'otherUpload') => {
    if (!viewEmp || !e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      handleUploadDocType(docType, dataUrl);
    };
    reader.readAsDataURL(file);
  };

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Add-wizard "Save & Continue" success message (per-step).
  const [stepMsg, setStepMsg] = useState('');

  // Location masters: canonical lists are static (instant load); custom additions
  // (saved in DB) are merged on top. CITY is DEPENDENT on STATE — the city dropdown
  // only ever shows the cities of the selected state (static + custom-for-that-state).
  // Nationality uses a searchable country master; custom countries are Super-Admin only.
  const isSuperAdmin = role === 'Super Admin';
  const [customCitiesByState, setCustomCitiesByState] = useState<Record<string, string[]>>({});
  const [customStates, setCustomStates] = useState<string[]>([]);
  const [customCountries, setCustomCountries] = useState<string[]>([]);
  useEffect(() => {
    api.locationMasters.getAll().then((r: any) => {
      setCustomStates(Array.isArray(r?.states) ? r.states : []);
      setCustomCountries(Array.isArray(r?.countries) ? r.countries : []);
      // citiesByState: { [stateName]: string[] }. Tolerates older API shapes.
      setCustomCitiesByState(r?.citiesByState && typeof r.citiesByState === 'object' ? r.citiesByState : {});
    }).catch(() => { /* dropdowns still work with the static lists */ });
  }, []);
  const uniqSort = (arr: string[]) => Array.from(new Set(arr.filter(Boolean))).sort();
  const stateOptions = useMemo(() => uniqSort([...INDIAN_STATES, ...customStates]), [customStates]);
  const countryOptions = useMemo(() => {
    // Keep India pinned first (default), the rest sorted; merge any custom countries.
    const rest = uniqSort([...NATIONALITY_COUNTRIES.filter(c => c !== DEFAULT_COUNTRY), ...customCountries]);
    return [DEFAULT_COUNTRY, ...rest];
  }, [customCountries]);
  // Cities for a given state = static cities of that state + custom ones saved for it.
  const cityOptionsFor = (state?: string): string[] => {
    const st = (state || '').trim();
    if (!st) return [];
    return uniqSort([...citiesForState(st), ...(customCitiesByState[st] || [])]);
  };
  const rememberState = (name: string) => { const n = (name || '').trim(); if (!n) return; setCustomStates(p => uniqSort([...p, n])); api.locationMasters.add('state', n).catch(() => { }); };
  // A custom city is always stored linked to its state, so it only resurfaces for
  // that state in future (req: "store custom cities for future use", per state).
  const rememberCity = (state: string, name: string) => {
    const st = (state || '').trim(); const n = (name || '').trim();
    if (!st || !n) return;
    setCustomCitiesByState(p => ({ ...p, [st]: uniqSort([...(p[st] || []), n]) }));
    api.locationMasters.addCity(st, n).catch(() => { });
  };
  const rememberCountry = (name: string) => { const n = (name || '').trim(); if (!n) return; setCustomCountries(p => uniqSort([...p, n])); api.locationMasters.addCountry(n).catch(() => { }); };

  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  // Final HR Approval — structured exit reason + clearance checklist + remarks.
  const [offReason, setOffReason] = useState('');
  const [offReasonOther, setOffReasonOther] = useState('');
  const [offChecklist, setOffChecklist] = useState<Record<string, boolean>>({});
  const [offRemarks, setOffRemarks] = useState('');
  const [isOffboardingExecuting, setIsOffboardingExecuting] = useState(false);
  const [isConfirmingBulk, setIsConfirmingBulk] = useState(false);

  const [form, setForm] = useState({
    name: '',
    email: '',
    countryCode: '+91',
    mobileNumber: '',
    department: 'Nursing',
    designation: 'Staff Nurse',
    role: 'Staff' as Role | 'Staff',
    status: 'Active' as EmployeeStatus,
    location: 'Ahmedabad, Gujarat',
    salary: '32000',
    joinDate: '2026-05-20',
    manager: 'Dr. Suresh Babu',
    employeeId: '[ Auto Generated ]',
    codeMode: 'auto' as 'auto' | 'custom',

    // Expanded master fields
    firstName: '',
    middleName: '',
    lastName: '',
    aadhaarName: '',
    gender: 'Female',
    dob: '1998-08-10',
    maritalStatus: 'UNMARRIED',
    nationality: DEFAULT_COUNTRY,
    fatherSpouseName: '',
    relationType: 'FATHER',
    emergencyContact: '',
    category: 'Skilled',
    employmentType: 'CONTRACTUAL',
    exitDate: '',
    exitReason: '',
    branchLocation: 'AHMEDABAD',
    biometricId: '',
    aadhaar: '',
    pan: '',
    pfNumber: '',
    uan: '',
    esic: '',
    wcPolicyNumber: '',
    bankName: '',
    accountNumber: '',
    confirmAccountNumber: '',
    ifsc: '',
    accountHolderName: '',
    bankBranch: '',
    bankAddress: '',
    bankCity: '',
    bankDistrict: '',
    bankState: '',
    presentAddress: '',
    permanentAddress: '',
    ...BLANK_ADDRESS_VALUES,
    state: '',
    city: '',
    shiftId: '' as number | string,

    // Bonus configuration
    bonusApplicable: false,
    bonusType: '' as string,
    bonusCalcMethod: 'Fixed Amount' as string,
    bonusValue: null as number | null,
    bonusEffectiveDate: '' as string,
    bonusEndDate: '' as string,
    bonusNotes: '' as string,
  });


  const [editMobileNumber, setEditMobileNumber] = useState('');

  // Employee Edit gate — the same mandatory set the registration wizard enforces,
  // so a record cannot be edited INTO an invalid state that could not have been
  // created in the first place.
  const editGate = useFormGate(useMemo(() => {
    const e: any = editEmp || {};
    return {
      name: { type: 'name', value: e.name, required: true, label: 'Full Name' },
      phone: { type: 'mobile', value: editMobileNumber, required: true, label: 'Mobile Number' },
      email: { type: 'email', value: e.email, required: false, label: 'Email' },
      department: { type: 'text', value: e.department, required: true, label: 'Department' },
      designation: { type: 'text', value: e.designation, required: true, label: 'Designation' },
      joinDate: { type: 'text', value: e.joinDate, required: true, label: 'Date of Joining' },
      salary: { type: 'salary', value: e.salary, required: true, label: 'Salary' },
      aadhaar: { type: 'aadhaar', value: e.aadhaar, label: 'Aadhaar Number' },
      pan: { type: 'pan', value: e.pan, label: 'PAN' },
    } as GateFields;
  }, [editEmp, editMobileNumber]));

  // Auto-generate employee code on add open
  // Proactive subscription-cap guard: before opening the Add form, check seat
  // capacity. If the plan is full, show the upgrade dialog (via the same global
  // event apiClient fires) instead of the form. The backend still enforces the
  // cap on submit, so this is a UX shortcut, not the security boundary.
  const guardCapacityThenAdd = async (open: () => void) => {
    try {
      const s: any = await api.onboarding.status();
      const cap = s?.capacity;
      if (cap && cap.limit != null && cap.remaining != null && cap.remaining <= 0) {
        window.dispatchEvent(new CustomEvent('hrms:employee-limit', { detail: { plan: cap.plan, limit: cap.limit, current: cap.current } }));
        return;
      }
    } catch (_) { /* company-scope only / transient — let the submit-time 403 handle it */ }
    open();
  };

  const handleStartAdd = () => {
    const initialBranch = isBranchWorkspace ? (currentComp?.branchName || currentComp?.name || '') : (branchOptions[0] || '');

    setForm({
      name: '', email: '', countryCode: '+91', mobileNumber: '',
      department: 'Nursing', designation: 'Staff Nurse', role: 'Staff',
      status: 'Active', location: 'Ahmedabad, Gujarat', salary: '32000',
      joinDate: '2026-05-20', manager: 'Dr. Suresh Babu',
      employeeId: '[ Auto Generated ]', codeMode: 'auto',
      firstName: '', middleName: '', lastName: '', aadhaarName: '',
      gender: 'Female', dob: '1998-08-10', maritalStatus: 'UNMARRIED',
      nationality: DEFAULT_COUNTRY, fatherSpouseName: '', relationType: 'FATHER',
      emergencyContact: '', category: 'Skilled', employmentType: 'CONTRACTUAL',
      exitDate: '', exitReason: '', branchLocation: initialBranch, biometricId: '',
      aadhaar: '', pan: '', pfNumber: '', uan: '', esic: '', wcPolicyNumber: '',
      bankName: '', accountNumber: '', confirmAccountNumber: '', ifsc: '', accountHolderName: '', bankBranch: '', bankAddress: '', bankCity: '', bankDistrict: '', bankState: '', presentAddress: '', permanentAddress: '',
      ...BLANK_ADDRESS_VALUES,
      state: '', city: '',
      shiftId: '',
      bonusApplicable: false, bonusType: '', bonusCalcMethod: 'Fixed Amount', bonusValue: null, bonusEffectiveDate: '', bonusEndDate: '', bonusNotes: '',
    });
    setErrors({});
    setWizardNominees([]);
    setActiveTab('personal');
    setAddStepsSaved([]);          // a fresh wizard starts locked at step 1
    setReOnboardSource(null);
    setAddOpen(true);
  };

  /** Close the registration/re-onboarding wizard, clearing the re-onboard mode
   *  so the next "Add Employee" opens a blank form rather than the last copy. */
  const closeAddWizard = () => {
    setAddOpen(false);
    setReOnboardSource(null);
    setAddStepsSaved([]);
  };

  // ── Re-onboard a PREVIOUS employee ───────────────────────────────────────────
  // Opens the registration wizard prefilled from the locked historical record.
  // Nothing is written until the wizard is submitted, and even then the write
  // goes to the NEW record — the previous one is never touched.
  const handleStartReOnboard = async (emp: Employee) => {
    const ok = await ui.confirm({
      title: 'Re-onboard employee',
      message: `Do you want to re-onboard ${emp.name}?\n\n` +
        `This creates a NEW active employment record with a new employee code. ` +
        `The previous record (${emp.employeeId}) stays locked as historical data, ` +
        `along with its attendance and payroll history.`,
      confirmText: 'Re-onboard',
      cancelText: 'Cancel',
      variant: 'info',
    });
    if (!ok) return;

    // Split "+91 98765 43210" back into the two controls the wizard uses.
    const rawPhone = String(emp.phone || '').trim();
    const phoneMatch = rawPhone.match(/^(\+\d{1,4})\s*(.*)$/);
    const countryCode = phoneMatch ? phoneMatch[1] : '+91';
    const mobileNumber = (phoneMatch ? phoneMatch[2] : rawPhone).replace(/\D/g, '');

    setForm(f => ({
      ...f,
      ...emp as any,
      // Identity of the NEW employment — never inherited from the locked record.
      employeeId: '[ Auto Generated ]', codeMode: 'auto',
      status: 'Active',
      joinDate: new Date().toISOString().split('T')[0],
      exitDate: '', exitReason: '',
      // The device enrolment belongs to the old record and is unique per company.
      biometricId: '',
      countryCode, mobileNumber,
      salary: String(emp.salary ?? ''),
      shiftId: emp.shiftId ?? '',
      confirmAccountNumber: (emp as any).accountNumber || '',
      esic: (emp as any).esic || (emp as any).esiNumber || '',
    }));
    setErrors({});
    setWizardNominees([]);
    setActiveTab('personal');
    setAddStepsSaved([]);          // re-onboarding walks the same gated steps
    setReOnboardSource(emp);
    setViewEmp(null);
    setAddOpen(true);
  };

  // ── Add-wizard multi-step "Save & Continue" flow ──────────────────────────
  // Bonus is a dedicated step placed immediately after Employment Details
  // (which carries the Salary field), so compensation → bonus → payroll reads
  // in the order HR thinks about pay.
  const ADD_STEPS = ['personal', 'job', 'bonus', 'banking', 'address', 'nominees', 'review'] as const;
  const ADD_STEP_LABELS: Record<string, string> = { personal: 'Personal Info', job: 'Employment Details', bonus: 'Compensation Configuration', banking: 'Compliance & Bank', address: 'Addresses', nominees: 'Nominees', review: 'Review & Submit' };

  // Validate ONLY the fields owned by the given step, so the user can advance.
  const validateAddSection = (tab: string): Record<string, string> => {
    const e: Record<string, string> = {};
    if (tab === 'personal') {
      const nm = (form.aadhaarName || form.name || '').trim();
      if (nm.length < 3) e.aadhaarName = 'Name as per Aadhaar is required';
      if (!form.gender) e.gender = 'Gender is required';
      if (!form.dob) e.dob = 'Date of Birth is required';
      if (!form.maritalStatus) e.maritalStatus = 'Marital Status is required';
      if (!form.nationality) e.nationality = 'Nationality is required';
      if (!form.state) e.state = 'State is required';
      if (!form.city) e.city = 'City is required';
      if (!form.mobileNumber || form.mobileNumber.trim().length < 10) e.phone = 'A valid 10-digit mobile number is required';
      if (form.codeMode === 'custom' && !form.employeeId.trim()) e.employeeId = 'Employee code is required';
    } else if (tab === 'job') {
      if (!isBranchWorkspace && !form.branchLocation) e.branchLocation = 'Branch location is required';
      if (!form.department) e.department = 'Department is required';
      if (!form.designation) e.designation = 'Designation is required';
      if (!form.category) e.category = 'Category is required';
      if (!form.employmentType) e.employmentType = 'Employment type is required';
      if (!form.joinDate) e.joinDate = 'Joining date is required';
      if (!form.salary || Number(form.salary) <= 0) e.salary = 'A valid salary is required';
    }
    // 'banking' fields are fully validated at the final "Complete Registration".
    return e;
  };

  // ── Declarative required-field map, per wizard step ───────────────────────
  // The single description of what "complete" means for each step. It drives
  // BOTH the live Save & Continue gate and the red-* markers, so the button and
  // the asterisks can never disagree. Key order is screen order, which is what
  // makes "scroll to the FIRST invalid field" land on the right one.
  //
  // Rules themselves come from the shared FIELD_SPECS registry — this map only
  // says which fields are mandatory on which step.
  const addGateFields: GateFields = useMemo(() => {
    if (activeTab === 'personal') {
      const f: GateFields = {
        aadhaarName: { type: 'name', value: form.aadhaarName || form.name, required: true, label: 'Name as per Aadhaar' },
        gender: { type: 'text', value: form.gender, required: true, label: 'Gender' },
        dob: { type: 'text', value: form.dob, required: true, label: 'Date of Birth' },
        maritalStatus: { type: 'text', value: form.maritalStatus, required: true, label: 'Marital Status' },
        nationality: { type: 'text', value: form.nationality, required: true, label: 'Nationality' },
        state: { type: 'text', value: form.state, required: true, label: 'State' },
        city: { type: 'text', value: form.city, required: true, label: 'City' },
        // 'mobile' enforces the exact 10-digit rule centrally.
        phone: { type: 'mobile', value: form.mobileNumber, required: true, label: 'Mobile Number', focusId: 'field-phone' },
      };
      // Only mandatory when the user opted out of the auto-generated code.
      if (form.codeMode === 'custom') {
        f.employeeId = { type: 'employeeCode', value: form.employeeId, required: true, label: 'Employee Code' };
      }
      // Optional, but must be well-formed if supplied.
      f.email = { type: 'email', value: form.email, required: false, label: 'Email' };
      return f;
    }
    if (activeTab === 'job') {
      // Declared in screen order, so "first invalid" is the topmost one.
      const f: GateFields = {};
      // At branch scope the branch is fixed by the workspace, so it is not
      // something the user can (or must) choose.
      if (!isBranchWorkspace) {
        f.branchLocation = { type: 'text', value: form.branchLocation, required: true, label: 'Branch Location' };
      }
      f.department = { type: 'text', value: form.department, required: true, label: 'Department' };
      f.designation = { type: 'text', value: form.designation, required: true, label: 'Designation' };
      f.category = { type: 'text', value: form.category, required: true, label: 'Employment Class' };
      f.employmentType = { type: 'text', value: form.employmentType, required: true, label: 'Employment Type' };
      f.joinDate = { type: 'text', value: form.joinDate, required: true, label: 'Date of Joining' };
      f.salary = { type: 'salary', value: form.salary, required: true, label: 'Salary' };
      return f;
    }
    // Remaining steps carry no mandatory fields of their own; anything supplied
    // is still format-checked by the specs below.
    if (activeTab === 'banking') {
      return {
        aadhaar: { type: 'aadhaar', value: form.aadhaar, label: 'Aadhaar Number' },
        pan: { type: 'pan', value: form.pan, label: 'PAN' },
        uan: { type: 'uan', value: form.uan, label: 'UAN' },
        accountNumber: { type: 'bankAccount', value: form.accountNumber, label: 'Account Number' },
        ifsc: { type: 'ifsc', value: form.ifsc, label: 'IFSC' },
      };
    }
    return {};
  }, [activeTab, form, isBranchWorkspace]);

  // The live gate for the CURRENT step. Recomputes on every keystroke.
  const addGate = useFormGate(addGateFields);

  // What the wizard's fields render as their error. Live gate errors first, with
  // anything the submit path recorded layered on top (duplicate code, server
  // rejections). Untouched empty fields are absent, so the form does not open
  // covered in red.
  const addErrors: Record<string, string> = { ...addGate.visibleErrors, ...errors };

  // The final step submits the whole form, so it is gated on every step's rules
  // rather than just its own — a user who jumped straight to Review by clicking
  // the tab header must still complete Personal Info and Employment Details.
  const addAllStepsValid = useMemo(() => {
    const missing = { ...validateAddSection('personal'), ...validateAddSection('job') };
    return Object.keys(missing).length === 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, isBranchWorkspace]);

  // Which error keys belong to which step — so the top summary only lists the
  // currently-visible step's missing fields (and they remain scroll/focusable).
  const ADD_STEP_FIELD_KEYS: Record<string, string[]> = {
    personal: ['aadhaarName', 'name', 'gender', 'dob', 'maritalStatus', 'nationality', 'state', 'city', 'phone', 'employeeId'],
    job: ['branchLocation', 'department', 'designation', 'category', 'employmentType', 'joinDate', 'salary'],
  };
  // Scroll the field into view and focus its control (works for Input/Select and
  // the CreatableSelect container).
  const focusField = (key: string) => {
    const el = document.getElementById(`field-${key}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const focusable = (el.matches('input,select,textarea') ? el : el.querySelector('input,select,textarea')) as HTMLElement | null;
    setTimeout(() => focusable?.focus(), 250);
  };

  // ── Sequential step lock ────────────────────────────────────────────────
  // Steps the user has confirmed with "Save & Continue". Confirmation alone is
  // not completion: a step counts as complete only while it ALSO still passes
  // its own validation, so going back and emptying a required field re-locks
  // every later step by itself.
  const [addStepsSaved, setAddStepsSaved] = useState<string[]>([]);

  const isAddStepComplete = useCallback((step: string) => (
    addStepsSaved.includes(step) && Object.keys(validateAddSection(step)).length === 0
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [addStepsSaved, form, isBranchWorkspace]);

  // Step 1 is always open. Every other step needs all of its predecessors done.
  const isAddStepUnlocked = useCallback((step: string) => {
    const idx = ADD_STEPS.indexOf(step as any);
    if (idx <= 0) return true;
    return ADD_STEPS.slice(0, idx).every(isAddStepComplete);
  }, [isAddStepComplete]);

  // Clicking a locked step must not navigate — it explains why and stays put.
  const goToAddStep = (step: typeof ADD_STEPS[number]) => {
    if (!isAddStepUnlocked(step)) { ui.toast.warning(LOCKED_STEP_MESSAGE); return; }
    setActiveTab(step);
    setErrors({});
  };

  // If the active step ever becomes unreachable (an earlier step was corrected
  // into an invalid state), fall back to the first incomplete step rather than
  // leaving the user on a screen they are no longer entitled to.
  useEffect(() => {
    if (!addOpen) return;
    if (isAddStepUnlocked(activeTab)) return;
    const firstIncomplete = ADD_STEPS.find(s => !isAddStepComplete(s)) || ADD_STEPS[0];
    setActiveTab(firstIncomplete);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addOpen, activeTab, isAddStepUnlocked, isAddStepComplete]);

  // Advance a step. Routed through the gate, so a click on the blocked button
  // reveals what is missing and focuses it instead of silently doing nothing.
  const handleSaveContinue = () => {
    const idx = ADD_STEPS.indexOf(activeTab as any);
    if (idx === -1) return;
    addGate.attemptSubmit(() => {
      setErrors({});
      addGate.reset();
      setAddStepsSaved(prev => (prev.includes(activeTab) ? prev : [...prev, activeTab]));
      setStepMsg(`${ADD_STEP_LABELS[activeTab]} completed — continuing to ${ADD_STEP_LABELS[ADD_STEPS[idx + 1]]}.`);
      setTimeout(() => setStepMsg(''), 2500);
      setActiveTab(ADD_STEPS[idx + 1]);
    });
  };

  // Load the editor's working copy from a record.
  const seedEditor = (source: any) => {
    // Pre-fill Confirm Account Number with the stored value so editing an
    // existing record doesn't trip the "numbers must match" check.
    const seeded = { ...source, confirmAccountNumber: source.accountNumber || '' } as any;
    setEditEmp(seeded);
    setEditOriginal(seeded);   // baseline for Reset AND for the dirty check
    setEditSaved(false);
    const parts = (source.phone || '').split(' ');
    setEditMobileNumber(parts.length > 1 ? parts.slice(1).join('') : (source.phone || ''));
    setActiveTab('personal');
    setErrors({});
  };

  /**
   * Open the editor for an employee id, reading the COMMITTED database record.
   * `fallback` is the list row the user clicked, used to paint the page instantly
   * while the authoritative read is in flight — on a deep link or a refresh there
   * is no row to fall back on, which is when the skeleton shows.
   */
  const openEditorById = useCallback(async (id: string | number, fallback?: Employee) => {
    setEditLoading(true);
    if (fallback) seedEditor(fallback);
    try {
      const fresh: any = await api.employees.getById(id);
      if (fresh && fresh.id != null) {
        seedEditor(fresh);
        onUpdateEmployees(employees.map(e => (String(e.id) === String(fresh.id) ? fresh : e)));
      } else if (!fallback) {
        ui.toast.error('That employee could not be found.');
        exitEditor(false);
      }
    } catch (err) {
      // A list row is better than nothing; with no row at all the editor would be
      // empty, so leave rather than showing a blank form.
      console.error('[employee:edit] could not read the record:', err);
      if (!fallback) {
        ui.toast.error('Could not load that employee.');
        exitEditor(false);
      }
    } finally {
      setEditLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees]);

  const handleStartEdit = (emp: Employee) => {
    // The editor is a real route: /employees/:id/edit. Pushing it means the
    // browser Back button leaves the editor (instead of leaving the Employees
    // page entirely), and a refresh or a shared link reopens the same record.
    const path = editPathFor(emp.id);
    if (window.location.pathname !== path) {
      window.history.pushState({ employeeEdit: String(emp.id) }, '', path);
    }
    openEditorById(emp.id, emp);
  };

  // Has the user changed anything since the editor opened (or since the last save)?
  const isEditDirty = useCallback(() => {
    if (!editEmp || !editOriginal) return false;
    return JSON.stringify(editEmp) !== JSON.stringify(editOriginal);
  }, [editEmp, editOriginal]);

  /** Tear down the editor. `restoreUrl` puts the address bar back on the list. */
  const exitEditor = (restoreUrl = true) => {
    setEditEmp(null);
    setEditOriginal(null);
    setEditSaved(false);
    setErrors({});
    // replace (not push) so pressing Back from the list doesn't re-open the editor.
    if (restoreUrl && editIdFromPath()) window.history.replaceState({}, '', '/employees');
  };

  /** The single guarded exit — Cancel, breadcrumb, close button and Escape. */
  const closeEditor = async () => {
    if (isEditDirty()) {
      const ok = await ui.confirm({
        title: 'Unsaved changes',
        message: 'You have unsaved changes. Leave without saving?',
        confirmText: 'Leave',
        cancelText: 'Stay',
        variant: 'warning',
      });
      if (!ok) return;
    }
    exitEditor();
  };

  // ── Keep the editor and the URL in step ────────────────────────────────────
  // Deep link / refresh: /employees/:id/edit opens that employee on mount.
  useEffect(() => {
    const id = editIdFromPath();
    if (id) openEditorById(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Browser Back/Forward. A popstate has already happened by the time we see it,
  // so an unsaved-changes "Stay" has to push the editor URL back on.
  useEffect(() => {
    const onPop = () => {
      const id = editIdFromPath();
      if (id) {
        if (!editEmp || String(editEmp.id) !== id) openEditorById(id);
        return;
      }
      if (!editEmp) return;
      if (!isEditDirty()) { exitEditor(false); return; }
      const target = editPathFor(editEmp.id);
      ui.confirm({
        title: 'Unsaved changes',
        message: 'You have unsaved changes. Leave without saving?',
        confirmText: 'Leave',
        cancelText: 'Stay',
        variant: 'warning',
      }).then((ok) => {
        if (ok) exitEditor(false);
        else window.history.pushState({ employeeEdit: String(editEmp.id) }, '', target);
      });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [editEmp, isEditDirty, openEditorById]);

  // Closing the tab / reloading with unsaved edits gets the browser's own prompt.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isEditDirty()) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isEditDirty]);

  // Revert every field back to the values loaded when editing began.
  const handleResetEdit = () => {
    if (!editOriginal) return;
    setEditEmp({ ...editOriginal });
    setEditMobileNumber((editOriginal.phone || '').split(' ').slice(1).join('') || editOriginal.phone || '');
    setErrors({});
    setEditSaved(false);
  };

  // central company scope filtering
  const companyEmployees = useMemo(() => {
    const filtered = employees.filter(e => isCompanyIdMatch(e.companyId, activeCompanyId, companies, e.branchLocation, e.branchId));
    const unique = getUniqueEmployees(filtered);
    console.log('DEBUG EMPLOYEES: activeCompanyId:', activeCompanyId, 'filtered length:', filtered.length, 'unique length:', unique.length);
    return unique;
  }, [employees, activeCompanyId, companies]);

  // A compact fingerprint of the client roster. It changes on any add / delete /
  // archive / offboard / status-edit / import / temp-conversion / FIELD EDIT —
  // every mutation flows through onUpdateEmployees — so using it as a fetch
  // dependency re-pulls the authoritative table AND counts together, keeping them
  // synchronized in real time without a page refresh.
  //
  // `updatedAt` is load-bearing, not decoration. The fingerprint used to be
  // `id:status` alone, and editing personal details changes neither: the roster
  // looked identical, the effect below never re-ran, and `paginatedData` kept the
  // PRE-EDIT server rows. Since the table renders from `paginatedData` — and
  // opening an employee seeds the form from the row object it was given — a saved
  // change appeared to vanish the moment you went back to the list and reopened
  // the person, even though the database had committed it correctly.
  const rosterSignature = useMemo(
    () => companyEmployees.map(e => `${e.id}:${e.status}:${(e as any).updatedAt || ''}`).join('|'),
    [companyEmployees]
  );

  const filterDepartments = useMemo(() => {
    const set = new Set<string>();
    const branchEmps = employees.filter(e =>
      isCompanyIdMatch(e.companyId, activeCompanyId, companies, e.branchLocation, e.branchId)
    );
    branchEmps.forEach(e => {
      if (e.department) set.add(e.department.trim().toUpperCase());
      if (e.designation) set.add(e.designation.trim().toUpperCase());
    });
    return Array.from(set).sort();
  }, [employees, activeCompanyId, companies]);

  // Built once per roster change, not on every keystroke in the combobox.
  const deptFilterOptions = useMemo(
    () => filterDepartments.map(d => ({ value: d, label: d })),
    [filterDepartments]
  );

  const formDepartments = useMemo(() => {
    const set = new Set<string>();
    const branchName = form.branchLocation;
    const branchEmps = employees.filter(e =>
      isCompanyIdMatch(e.companyId, activeCompanyId, companies, e.branchLocation, e.branchId) &&
      (!branchName || (e.branchLocation || '').toUpperCase() === branchName.toUpperCase())
    );
    branchEmps.forEach(e => {
      if (e.department) set.add(e.department.trim());
    });
    if (set.size === 0) {
      set.add('Clinical');
      set.add('Nursing');
      set.add('Administration');
    }
    return Array.from(set).sort();
  }, [employees, form.branchLocation, activeCompanyId, companies]);

  const editFormDepartments = useMemo(() => {
    const set = new Set<string>();
    const branchName = editEmp?.branchLocation;
    const branchEmps = employees.filter(e =>
      isCompanyIdMatch(e.companyId, activeCompanyId, companies, e.branchLocation, e.branchId) &&
      (!branchName || (e.branchLocation || '').toUpperCase() === branchName.toUpperCase())
    );
    branchEmps.forEach(e => {
      if (e.department) set.add(e.department.trim());
    });
    if (set.size === 0) {
      set.add('Clinical');
      set.add('Nursing');
      set.add('Administration');
    }
    return Array.from(set).sort();
  }, [employees, editEmp?.branchLocation, activeCompanyId, companies]);

  const dynamicDesignations = useMemo(() => {
    const set = new Set<string>();
    companyEmployees.forEach(e => {
      if (e.designation) set.add(e.designation.trim());
    });
    if (set.size === 0) {
      set.add('DATA ENTRY OPERATOR');
      set.add('STAFF NURSE');
      set.add('RADIOTHERAPY TECHNICIAN');
    }
    return Array.from(set).sort();
  }, [companyEmployees]);

  // Keep form department in sync with branch options
  useEffect(() => {
    if (formDepartments.length > 0 && !formDepartments.includes(form.department)) {
      setForm(f => ({ ...f, department: formDepartments[0] }));
    }
  }, [formDepartments, form.department]);

  // Keep edit department in sync with branch options
  useEffect(() => {
    if (editEmp && editFormDepartments.length > 0 && !editFormDepartments.includes(editEmp.department)) {
      setEditEmp(e => e ? ({ ...e, department: editFormDepartments[0] }) : null);
    }
  }, [editFormDepartments, editEmp?.department]);

  const filtered = useMemo(() => {
    return companyEmployees.filter(emp => {
      // Offboarded = Archived/Resigned/Terminated/Inactive/Offboarded. The active
      // roster tab hides them; the "previous" (archive) tab shows only them.
      const isArchived = isOffboarded(emp.status);
      if (activeMainTab === 'active' && isArchived) return false;
      if (activeMainTab === 'previous' && !isArchived) return false;

      const matchesSearch = (emp.name || '').toLowerCase().includes(search.toLowerCase()) ||
        (emp.employeeId || '').toLowerCase().includes(search.toLowerCase()) ||
        (emp.designation || '').toLowerCase().includes(search.toLowerCase());
      const matchesDept = !deptFilter || emp.department === deptFilter || emp.designation === deptFilter;
      const matchesStatus = !statusFilter || emp.status === statusFilter;
      return matchesSearch && matchesDept && matchesStatus;
    })
      // Default ordering: Employee ID ascending (Company → Branch → numeric seq).
      .sort(byEmployeeCode(e => e.employeeId));
  }, [companyEmployees, search, deptFilter, statusFilter, activeMainTab]);

  // Reset page to 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [search, deptFilter, statusFilter, activeMainTab]);

  // Fetch server-side paginated data + authoritative counts for the current view.
  // The Temporary/Approvals tabs render their own dataset, but we still refresh the
  // real-employee counts (using tab='all') so the Active/Previous/All cards stay
  // correct while those tabs are open. rosterSignature in the deps re-runs this on
  // every mutation, so the table and the cards always refresh together.
  useEffect(() => {
    let isMounted = true;
    const isTempView = activeMainTab === 'temporary' || activeMainTab === 'approvals';
    const fetchPaginated = async () => {
      setIsTableLoading(true);
      try {
        const params: Record<string, any> = {
          page,
          limit,
          companyId: activeCompanyId,
          tab: isTempView ? 'all' : activeMainTab
        };
        if (search) params.search = search;
        if (deptFilter) params.department = deptFilter;
        if (statusFilter) params.status = statusFilter;

        const res = await api.employees.getPaginated(params) as any;
        if (!isMounted || !res) return;
        // Counts come from the same query as the table → the single source of truth.
        if (res.counts) {
          setServerCounts({
            all: res.counts.all || 0,
            active: res.counts.active || 0,
            previous: res.counts.previous || 0,
          });
        }
        // Only drive the real-employee table on the real tabs.
        if (!isTempView && Array.isArray(res.data)) {
          setPaginatedData(res.data);
          setTotalRows(res.total || 0);
        }
      } catch (err) {
        console.error("Error fetching paginated employees:", err);
      } finally {
        if (isMounted) setIsTableLoading(false);
      }
    };

    fetchPaginated();
    return () => { isMounted = false; };
  }, [page, limit, search, deptFilter, statusFilter, activeCompanyId, activeMainTab, rosterSignature]);

  // Master Statistics Calculations
  const stats = useMemo(() => {
    const activeRoster = companyEmployees.filter(isActiveEmployee);
    // Total Staff Strength = every employee assigned to this workspace (COUNT),
    // Active Roster = the non-offboarded subset. They must not collapse to 0 just
    // because a branch's staff are archived.
    const total = companyEmployees.length;
    const active = activeRoster.length;
    const pendingExits = activeRoster.filter(e => e.exitDate && !e.exitReason).length;
    return { total, active, pendingExits };
  }, [companyEmployees]);

  // ── Canonical workforce reconciliation (single source of truth) ──────────────
  // ONE rule used by every counter so the totals always add up:
  //   All Staff = Active + Previous + Temporary + Pending Approval
  // Active/Previous come from the real Employee table; Temporary/Pending Approval
  // from the isolated TemporaryEmployee table (Converted temps have already
  // become real employees, so they are excluded there — never double counted).
  // The audit independently re-derives each bucket and flags any integrity drift
  // (a status that is BOTH active & offboarded, or NEITHER) instead of silently
  // losing or double-counting a record.
  const countAudit = useMemo(() => {
    // Active / Previous / All Staff are the REAL employee roster and come straight
    // from the server counts that also produced the table rows — so each tab's card
    // exactly equals the rows that tab shows. (Before the first fetch, fall back to
    // the client roster so the cards aren't blank on the very first paint.)
    const active = serverCounts ? serverCounts.active
      : companyEmployees.filter(isActiveEmployee).length;
    const previous = serverCounts ? serverCounts.previous
      : (companyEmployees.length - companyEmployees.filter(isActiveEmployee).length);
    // "All Staff" = the real roster shown by the All-Staff tab table (active +
    // previous). Temporary / Pending Approval are a SEPARATE dataset with their own
    // tabs and counts, so they are not folded into All Staff (that folding was the
    // reason the All-Staff card never matched the list).
    const allStaff = serverCounts ? serverCounts.all : (active + previous);
    const temporary = inProgressTemps.length;
    const pendingApproval = pendingApprovals.length;
    // Integrity guard on the loaded prop: a status that is BOTH active & offboarded
    // (or NEITHER) would indicate bad data. The headline counts no longer depend on
    // this, but we still surface it.
    const both = companyEmployees.filter(e => isActiveEmployee(e) && isOffboarded(e.status)).length;
    const neither = companyEmployees.filter(e => !isActiveEmployee(e) && !isOffboarded(e.status)).length;
    const reconciles = allStaff === active + previous;
    const partitionOk = both === 0 && neither === 0;
    const ok = reconciles && partitionOk;
    if (!ok) {
      // eslint-disable-next-line no-console
      console.error('[Employee Count Mismatch Detected]', {
        scope: activeCompanyId, active, previous, allStaff, temporary, pendingApproval,
        anomalies: { bothActiveAndOffboarded: both, neither }, reconciles, partitionOk,
      });
    }
    return { ok, allStaff, active, previous, temporary, pendingApproval, both, neither };
  }, [companyEmployees, inProgressTemps, pendingApprovals, activeCompanyId, serverCounts]);

  // Add Validation & Execution
  const handleAddSubmit = async () => {
    // The gate blocks the button, but the click still arrives (by design) — and
    // the Review tab can be reached directly from the tab header. Refuse here,
    // send the user to the step that is actually incomplete, and never let a
    // partial record reach the API.
    if (!addAllStepsValid) {
      const stepErrors = { personal: validateAddSection('personal'), job: validateAddSection('job') };
      const firstBadStep = (['personal', 'job'] as const).find(s => Object.keys(stepErrors[s]).length);
      if (firstBadStep) {
        setErrors(prev => ({ ...prev, ...stepErrors[firstBadStep] }));
        setActiveTab(firstBadStep);
        setTimeout(() => focusField(Object.keys(stepErrors[firstBadStep])[0]), 80);
      }
      return;
    }

    const effectiveAadhaarName = form.aadhaarName || form.name;
    const effectiveEmail = form.email || '';

    const nameErr = validateName(form.name).error;
    const emailErr = effectiveEmail ? validateEmail(effectiveEmail).error : '';
    const phoneErr = validatePhone(form.mobileNumber).error;
    const salaryErr = validateSalary(form.salary).error;

    const activeErrors: Record<string, string> = {
      name: nameErr || '',
      email: emailErr || '',
      phone: phoneErr || '',
      salary: salaryErr || ''
    };

    if (!effectiveAadhaarName || effectiveAadhaarName.trim().length < 3) {
      activeErrors.aadhaarName = 'Name as per Aadhaar is required';
    }
    if (!form.dob) activeErrors.dob = 'Date of Birth is required';
    if (!form.gender) activeErrors.gender = 'Gender is required';
    if (!form.maritalStatus) activeErrors.maritalStatus = 'Marital Status is required';
    if (!form.nationality) activeErrors.nationality = 'Nationality is required';
    if (!form.state) activeErrors.state = 'State is required';
    if (!form.city) activeErrors.city = 'City is required';
    if (!form.fatherSpouseName) activeErrors.fatherSpouseName = 'Father/Spouse Name is required';

    if (!form.designation || form.designation.trim().length === 0) {
      activeErrors.designation = 'Designation is required';
    }
    if (!form.category || form.category.trim().length === 0) {
      activeErrors.category = 'Category is required';
    }
    if (!form.joinDate) {
      activeErrors.joinDate = 'Date of Joining is required';
    }
    if (!form.employmentType) {
      activeErrors.employmentType = 'Type of Employment is required';
    }
    if (!isValidPan(form.pan)) {
      activeErrors.pan = PAN_ERROR;
    }
    if (!isValidAadhaar(form.aadhaar)) {
      activeErrors.aadhaar = AADHAAR_ERROR;
    }
    if (!form.ifsc || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(form.ifsc.trim().toUpperCase())) {
      activeErrors.ifsc = 'Valid 11-character IFSC is required';
    }
    if (!form.bankName || form.bankName.trim().length < 3) {
      activeErrors.bankName = 'Verify the IFSC to fetch bank details (or enter them manually).';
    }
    if (!form.accountNumber || form.accountNumber.trim().length < 9) {
      activeErrors.accountNumber = 'Valid Bank Account Number is required';
    }
    if (form.confirmAccountNumber !== form.accountNumber) {
      activeErrors.confirmAccountNumber = 'Account numbers do not match.';
    }

    if (form.pfNumber && form.pfNumber.trim().length < 5) {
      activeErrors.pfNumber = 'Valid PF Number is required if entered';
    }
    if (form.uan && !/^\d{12}$/.test(form.uan.trim())) {
      activeErrors.uan = 'Valid 12-digit UAN is required if entered';
    }
    if (form.esic && form.esic.trim().length < 10) {
      activeErrors.esic = 'Valid ESIC IP Number is required if entered';
    }

    // Structured present-address required fields (permanent is optional / mirrors).
    Object.assign(activeErrors, validatePresentAddress(form));

    const hasErrors = Object.values(activeErrors).some(val => val !== '');
    if (hasErrors) {
      setErrors(activeErrors);
      const firstErrorKey = Object.keys(activeErrors).find(k => activeErrors[k] !== '') || '';

      // Map error key to tab
      if (['name', 'email', 'phone', 'aadhaarName', 'dob', 'gender', 'maritalStatus', 'nationality', 'state', 'city', 'fatherSpouseName'].includes(firstErrorKey)) setActiveTab('personal');
      else if (['designation', 'category', 'joinDate', 'employmentType', 'salary'].includes(firstErrorKey)) setActiveTab('job');
      else if (['pan', 'aadhaar', 'bankName', 'accountNumber', 'ifsc', 'pfNumber', 'uan', 'esic'].includes(firstErrorKey)) setActiveTab('banking');
      else if (firstErrorKey.startsWith('p_') || firstErrorKey.startsWith('q_') || ['presentAddress', 'permanentAddress'].includes(firstErrorKey)) setActiveTab('address');

      setTimeout(() => {
        const element = document.getElementById(`field-${firstErrorKey}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          element.focus();
        } else {
          const modalContainer = document.querySelector('.modal-content') || document.querySelector('[role="dialog"]');
          if (modalContainer) modalContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 50);
      return;
    }

    let resolvedCompanyId = parentCompanyId || activeCompanyId;
    let resolvedBranchId: string | undefined = undefined;

    if (isBranchWorkspace) {
      resolvedBranchId = activeCompanyId;
    } else {
      if (form.branchLocation) {
        const matchingBranch = dynamicBranches.find(b => (b.branchName || b.name) === form.branchLocation);
        if (matchingBranch) {
          resolvedBranchId = matchingBranch.id;
        }
      }
    }

    const newEmp: any = {
      id: `emp-${Date.now()}`,
      employeeId: form.codeMode === 'custom' ? (form.employeeId || '').trim() : '[ Auto Generated ]',
      codeMode: form.codeMode,
      companyId: resolvedCompanyId,
      branchId: resolvedBranchId,
      name: form.name,
      email: effectiveEmail,
      phone: `${form.countryCode} ${form.mobileNumber}`,
      department: form.department,
      designation: form.designation,
      role: form.role as any,
      status: form.status,
      joinDate: form.joinDate || '2026-05-20',
      location: `${capitalize(form.branchLocation)}, Gujarat`,
      avatar: form.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase(),
      salary: parseInt(form.salary) || 0,
      manager: form.manager || 'Dr. Suresh Babu',

      // Master compliance columns
      firstName: form.firstName,
      middleName: form.middleName,
      lastName: form.lastName,
      aadhaarName: effectiveAadhaarName,
      gender: form.gender,
      dob: form.dob,
      maritalStatus: form.maritalStatus,
      nationality: form.nationality,
      state: form.state,
      city: form.city,
      fatherSpouseName: form.fatherSpouseName,
      relationType: form.relationType,
      emergencyContact: form.emergencyContact,
      category: form.category,
      employmentType: form.employmentType,
      exitDate: form.exitDate,
      exitReason: form.exitReason,
      branchLocation: form.branchLocation,
      biometricId: form.biometricId,
      aadhaar: form.aadhaar,
      pan: form.pan,
      pfNumber: form.pfNumber,
      uan: form.uan,
      esic: form.esic,
      wcPolicyNumber: form.wcPolicyNumber,
      bankName: form.bankName,
      accountNumber: form.accountNumber,
      ifsc: form.ifsc,
      accountHolderName: form.accountHolderName,
      bankBranch: form.bankBranch,
      bankAddress: form.bankAddress,
      bankCity: form.bankCity,
      bankDistrict: form.bankDistrict,
      bankState: form.bankState,
      // Structured fields joined into the same master-schema string columns, so the
      // DB mapping is unchanged (Quick Add onboarding assembles addresses identically).
      presentAddress: buildAddressString(form, 'p_'),
      permanentAddress: (form as any).sameAsPresent ? buildAddressString(form, 'p_') : buildAddressString(form, 'q_'),
      shiftId: form.shiftId ? Number(form.shiftId) : null,

      // Bonus configuration
      bonusApplicable: form.bonusApplicable,
      bonusType: form.bonusApplicable ? form.bonusType : null,
      bonusCalcMethod: form.bonusApplicable ? form.bonusCalcMethod : null,
      bonusValue: form.bonusApplicable ? form.bonusValue : null,
      bonusEffectiveDate: form.bonusApplicable ? (form.bonusEffectiveDate || null) : null,
      bonusEndDate: form.bonusApplicable ? (form.bonusEndDate || null) : null,
      bonusNotes: form.bonusApplicable ? (form.bonusNotes || null) : null,
    };

    // Validate staged nominee allocation BEFORE creating the employee, so we never
    // end up with an employee saved but nominees rejected (no partial state).
    const nomTotal = wizardNominees.reduce((s, n) => s + Number(n.percentage || 0), 0);
    if (wizardNominees.length && nomTotal > 100.01) {
      await ui.alert({ message: `Total nominee allocation is ${nomTotal}% — it cannot exceed 100%. Fix it in the Nominees step.`, variant: 'warning' });
      setActiveTab('nominees');
      return;
    }

    try {
      // Step 1 — create the employee (nominee records are created ONLY after this succeeds).
      // Re-onboarding goes to its own endpoint: it creates a second, brand-new
      // employment record from this reviewed copy and leaves the previous record
      // locked. Anything the wizard does not collect is inherited server-side
      // from the old record, so the returning employee keeps their history of
      // compliance IDs, bank details and addresses without re-keying.
      const savedEmp = reOnboardSource
        ? (await api.employees.reOnboard(reOnboardSource.id, newEmp)).employee
        : await api.employees.create(newEmp);
      onUpdateEmployees([savedEmp, ...employees]);

      // Step 2 — save the staged nominees together, in a single transaction (all-or-none).
      let nomineeNote = '';
      if (wizardNominees.length) {
        try {
          await api.nominees.bulkCreate(savedEmp.id, wizardNominees);
          nomineeNote = ` with ${wizardNominees.length} nominee(s)`;
        } catch (ne: any) {
          nomineeNote = ` — but nominees could not be saved (${ne?.message || 'error'}). Add them from the profile.`;
        }
      }
      setAddOpen(false);
      ui.toast.success(
        reOnboardSource
          ? `${form.name} re-onboarded as ${savedEmp.employeeId}. The previous record (${reOnboardSource.employeeId}) stays locked.`
          : `${form.name} registered successfully${nomineeNote}.`
      );
      // Open the profile on the Nominees tab so the saved nominees are visible and
      // any remaining ones can be completed.
      setActiveTab('nominees');
      setViewEmp(savedEmp);
      setWizardNominees([]);
      // Land on Active: the person now lives there, and leaving the user on the
      // Previous tab would make the re-onboarding look like it did nothing.
      if (reOnboardSource) setActiveMainTab('active');
      setReOnboardSource(null);
    } catch (err: any) {
      console.error(err);
      // A server-side mandatory-field rejection comes back per field — mark the
      // exact inputs and jump to the first one, rather than a single vague toast.
      const fieldErrors = getApiFieldErrors(err);
      if (Object.keys(fieldErrors).length) {
        setErrors(prev => ({ ...prev, ...fieldErrors }));
        const firstBadStep = (['personal', 'job'] as const)
          .find(s => (ADD_STEP_FIELD_KEYS[s] || []).some(k => fieldErrors[k]));
        if (firstBadStep) setActiveTab(firstBadStep);
        setTimeout(() => focusField(Object.keys(fieldErrors)[0]), 80);
        ui.toast.error(getApiErrorMessage(err, 'Some required fields are missing or invalid.'));
        return;
      }
      ui.toast.error(getApiErrorMessage(err, 'Failed to save to database.'));
    }
  };

  const today = new Date().toISOString().split('T')[0];
  const handleConfirmInitialOffboarding = () => {
    setWizardStep(1);
    setOffReason(''); setOffReasonOther(''); setOffChecklist({}); setOffRemarks('');
    setIsWizardOpen(true);
  };
  const handleDelete = () => {
    if (!deleteEmp) return;
    api.employees.archive(deleteEmp.id).then(() => {
      onUpdateEmployees(employees.map(e => e.id === deleteEmp.id ? { ...e, status: 'Archived', exitDate: today, exitReason: 'Admin Archived' } : e));
      setDeleteEmp(null);
      setIsConfirmingDelete(false);
      ui.toast.success('Employee archived successfully.');
    }).catch(err => {
      console.error(err);
      ui.toast.error('Failed to archive employee');
    });
  };
  const handleWizardStepComplete = (step: number) => setWizardStep(step + 1);
  const handleFinalArchive = async () => {
    setIsOffboardingExecuting(true);
    handleOffboardSubmit();
  };
  const setIsConfirmingOffboard = (_val: boolean) => { };

  // Edit Submission. `mode` only changes the post-save UX (draft = quiet toast,
  // save = success banner + continue). Both persist through the SAME update API.
  const handleEditSubmit = async (mode: 'draft' | 'save' = 'save') => {
    if (!editEmp) return;

    // The editor is a real route, so it can be reached by URL even when the
    // buttons that open it are hidden. Refuse the save here too — otherwise the
    // user fills in a whole form only to meet a 403 from the server.
    if (isRecordLocked(editEmp, role)) {
      await ui.alert({ title: 'Record locked', message: LOCKED_RECORD_MESSAGE, variant: 'warning' });
      return;
    }
    setEditSaved(false);

    const nameErr = validateName(editEmp.name).error;
    const emailErr = editEmp.email ? validateEmail(editEmp.email).error : '';
    const phoneErr = validatePhone(editMobileNumber).error;

    const activeErrors: Record<string, string> = {
      name: nameErr || '',
      email: emailErr || '',
      phone: phoneErr || '',
    };

    // The "Aadhaar Full Name" field IS editEmp.name (aadhaarName is only a stored
    // mirror). Validate the field the user actually edits — otherwise a filled
    // name still errors when the legacy aadhaarName mirror is empty. A name/parts
    // MISMATCH is a soft warning (shown inline), never a blocking error.
    if (normalizeName(editEmp.name).length < 3) {
      activeErrors.aadhaarName = 'Please enter Aadhaar Full Name.';
    }
    if (!editEmp.dob) activeErrors.dob = 'Date of Birth is required';
    if (!editEmp.gender) activeErrors.gender = 'Gender is required';
    if (!editEmp.maritalStatus) activeErrors.maritalStatus = 'Marital Status is required';
    if (!editEmp.nationality) activeErrors.nationality = 'Nationality is required';
    if (!(editEmp as any).state) activeErrors.state = 'State is required';
    if (!(editEmp as any).city) activeErrors.city = 'City is required';
    if (!editEmp.fatherSpouseName) activeErrors.fatherSpouseName = 'Father/Spouse Name is required';

    if (!isValidPan(editEmp.pan)) {
      activeErrors.pan = PAN_ERROR;
    }
    if (!isValidAadhaar(editEmp.aadhaar)) {
      activeErrors.aadhaar = AADHAAR_ERROR;
    }
    if (!editEmp.ifsc || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(editEmp.ifsc.trim().toUpperCase())) {
      activeErrors.ifsc = 'Valid 11-character IFSC is required';
    }
    if (!editEmp.bankName || editEmp.bankName.trim().length < 3) {
      activeErrors.bankName = 'Verify the IFSC to fetch bank details (or enter them manually).';
    }
    if (!editEmp.accountNumber || editEmp.accountNumber.trim().length < 9) {
      activeErrors.accountNumber = 'Valid Bank Account Number is required';
    }
    if ((editEmp as any).confirmAccountNumber !== editEmp.accountNumber) {
      activeErrors.confirmAccountNumber = 'Account numbers do not match.';
    }
    if (editEmp.pfNumber && editEmp.pfNumber.trim().length < 5) {
      activeErrors.pfNumber = 'Valid PF Number is required if entered';
    }
    if (editEmp.uan && !/^\d{12}$/.test(editEmp.uan.trim())) {
      activeErrors.uan = 'Valid 12-digit UAN is required if entered';
    }
    if (editEmp.esic && editEmp.esic.trim().length < 10) {
      activeErrors.esic = 'Valid ESIC IP Number is required if entered';
    }

    if (!editEmp.presentAddress || editEmp.presentAddress.trim().length < 5) {
      activeErrors.presentAddress = 'Present Address is required (min 5 characters)';
    }
    if (!editEmp.permanentAddress || editEmp.permanentAddress.trim().length < 5) {
      activeErrors.permanentAddress = 'Permanent Address is required (min 5 characters)';
    }

    const hasErrors = Object.values(activeErrors).some(val => val !== '');
    if (hasErrors) {
      setErrors(activeErrors);
      const firstErrorKey = Object.keys(activeErrors).find(k => activeErrors[k] !== '') || '';

      // Map error key to tab
      if (['name', 'email', 'phone', 'aadhaarName', 'dob', 'gender', 'maritalStatus', 'nationality', 'state', 'city', 'fatherSpouseName'].includes(firstErrorKey)) setActiveTab('personal');
      else if (['designation', 'category', 'joinDate', 'employmentType', 'salary'].includes(firstErrorKey)) setActiveTab('job');
      else if (['pan', 'aadhaar', 'bankName', 'accountNumber', 'ifsc', 'pfNumber', 'uan', 'esic'].includes(firstErrorKey)) setActiveTab('banking');
      else if (firstErrorKey.startsWith('p_') || firstErrorKey.startsWith('q_') || ['presentAddress', 'permanentAddress'].includes(firstErrorKey)) setActiveTab('address');

      setTimeout(() => {
        const element = document.getElementById(`field-${firstErrorKey}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          element.focus();
        } else {
          const modalContainer = document.querySelector('.modal-content') || document.querySelector('[role="dialog"]');
          if (modalContainer) modalContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 50);
      return;
    }

    let resolvedCompanyId = parentCompanyId || activeCompanyId;
    let resolvedBranchId: string | undefined = undefined;

    if (isBranchWorkspace) {
      resolvedBranchId = activeCompanyId;
    } else {
      if (editEmp.branchLocation) {
        const matchingBranch = dynamicBranches.find(b => (b.branchName || b.name) === editEmp.branchLocation);
        if (matchingBranch) {
          resolvedBranchId = matchingBranch.id;
        }
      }
    }

    const updatedEmp = {
      ...editEmp,
      // Keep the stored Aadhaar-name mirror in sync with the entered Aadhaar Full
      // Name (saved EXACTLY as entered — no case/space changes), so it never goes
      // stale and re-trigger this validation. Mirrors the Add flow.
      aadhaarName: (editEmp.name || '').trim() || editEmp.aadhaarName,
      companyId: resolvedCompanyId,
      branchId: resolvedBranchId
    };

    try {
      api.employees.update(updatedEmp.id, updatedEmp).then(savedEmp => {
        onUpdateEmployees(employees.map(e => e.id === updatedEmp.id ? savedEmp : e));
        // The table renders from `paginatedData`, so patch that row too. The
        // roster fingerprint also re-pulls the page from the server, but this
        // makes the list correct the instant the user navigates back instead of
        // one round-trip later.
        setPaginatedData(rows => rows.map(r => (String(r.id) === String(updatedEmp.id) ? (savedEmp as any) : r)));
        // If the read-only profile panel is open on this person, refresh it too.
        setViewEmp(v => (v && String(v.id) === String(updatedEmp.id) ? (savedEmp as any) : v));
        // Stay on the full-page editor. Refresh the working copy + baseline with
        // the saved record so the user can keep editing from a clean state.
        const seeded = { ...savedEmp, confirmAccountNumber: (savedEmp as any).accountNumber || '' } as any;
        setEditEmp(seeded);
        setEditOriginal(seeded);
        if (mode === 'save') { setEditSaved(true); ui.toast.success('Employee updated successfully.'); }
        else ui.toast.success('Draft saved.');
      }).catch(err => {
        console.error(err);
        ui.toast.error(`Failed to save to the database: ${err.message}`);
      });
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleOffboardSubmit = () => {
    if (!offboardEmp) return;

    // Structured exit reason chosen in the Final HR Approval step. Falls back to
    // the previous generic label if HR skipped selection, so behaviour is safe.
    const reasonLabel = offReason === 'Other'
      ? (offReasonOther.trim() || 'Other')
      : (offReason || 'Formal Offboarding Completed');

    const historyItem = {
      companyId: offboardEmp.companyId,
      companyName: currentComp?.name || 'Company',
      role: offboardEmp.role || 'Staff',
      designation: offboardEmp.designation,
      startDate: offboardEmp.joinDate,
      endDate: today,
      reason: reasonLabel
    };

    const updated: Employee = {
      ...offboardEmp,
      status: 'Archived',
      exitDate: today,
      // Store the SELECTED reason in the reportable column so Offboarding /
      // Attrition / HR-analytics reports can group by it.
      exitReason: reasonLabel,
      offboardingState: {
        ...offboardEmp.offboardingState,
        workflowStatus: 'ARCHIVED',
        completedOn: new Date().toISOString(),
        // Full structured detail for richer HR analytics.
        exitReasonCode: offReason || '',
        exitReasonLabel: reasonLabel,
        exitReasonOther: offReason === 'Other' ? offReasonOther.trim() : '',
        exitChecklist: offChecklist,
        hrRemarks: offRemarks.trim(),
      },
      employmentHistory: [...(offboardEmp.employmentHistory || []), historyItem]
    };

    // Persist FIRST; only mutate local state if the DB actually accepted it.
    // Applying the change locally on failure (the old behaviour) made the UI
    // show an "archived" employee that wasn't archived in the database — the
    // change vanished on refresh/relogin. Now a failure surfaces the real
    // reason and leaves the list untouched, so frontend === database.
    //
    // Uses the standard update API (not archive) because the archive endpoint
    // hardcodes exitReason='Admin Archived'. The update sets status→Archived
    // itself, so the employee is archived identically while the selected exit
    // reason + checklist are persisted to the database.
    api.employees.update(offboardEmp.id, updated).then(() => {
      onUpdateEmployees(employees.map(e => e.id === offboardEmp.id ? updated : e));
      setOffboardEmp(null);
      setIsWizardOpen(false);
      setIsOffboardingExecuting(false);
      ui.toast.success('Employee successfully archived and removed from active workforce.');
    }).catch(err => {
      console.error(err);
      setIsOffboardingExecuting(false);
      ui.toast.error(getApiErrorMessage(err, 'Could not archive the employee. No changes were saved.'));
    });
  };

  // Toggling secure field values
  const toggleFieldMask = (empId: string, fieldName: string) => {
    const key = `${empId}-${fieldName}`;
    setUnmaskedField(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const getMaskedValue = (val: string | undefined, fieldName: string, empId: string, formatter?: (v: string) => string) => {
    if (!val) return '—';
    const key = `${empId}-${fieldName}`;
    const show = unmaskedField[key];
    if (show) return formatter ? formatter(val) : val;

    // Standard security masking models
    if (fieldName === 'aadhaar') {
      return `•••• •••• ${val.slice(-4)}`;
    }
    if (fieldName === 'pan') {
      return `••••••${val.slice(-4)}`;
    }
    if (fieldName === 'accountNumber') {
      return `••••••••${val.slice(-4)}`;
    }
    return `••••${val.slice(-3)}`;
  };

  // Client-Side Excel File Parser
  const handleExcelDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      parseExcelFile(files[0]);
    }
  };

  const handleExcelSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      parseExcelFile(files[0]);
    }
  };

  const cleanExcelValue = (val: any): string => {
    if (val === undefined || val === null) return '-';
    const str = String(val).trim();
    if (str === '' || str.toLowerCase() === 'nan' || str.toLowerCase() === 'null' || str.toLowerCase() === 'undefined') {
      return '-';
    }
    return str;
  };

  const parseExcelFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });

        const logs: string[] = [];
        const allRows: any[] = [];
        logs.push(`Successfully loaded file: ${file.name}`);
        logs.push(`Detected branch sheets: ${workbook.SheetNames.filter(n => n !== 'Sheet1').join(', ')}`);

        // DD/MM/YYYY (or D/M/YYYY, dot/dash separators) → ISO YYYY-MM-DD so the
        // backend's `new Date()` parses it correctly (JS would mis-read 15/08/1995).
        const toISO = (s: string): string => {
          const v = String(s ?? '').trim();
          const m = v.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
          if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
          return v === '-' ? '' : v;
        };
        // Friendly "Sample File" layout detection: map header NAMES → column index.
        // Requires a strong signal (code+name+salary+status) so a legacy GCRI sheet
        // is never mis-detected as the friendly format.
        const HEADER_PATTERNS: [string, RegExp][] = [
          ['code', /employee\s*code|emp\s*code|^code$|employee\s*id/i],
          ['name', /employee\s*name|full\s*name|^name$/i],
          ['gender', /gender|sex/i],
          ['mobile', /mobile|phone|contact/i],
          ['email', /e-?mail/i],
          ['dob', /birth|dob/i],
          ['joindate', /join/i],
          ['department', /department|dept/i],
          ['designation', /designation|title|^role$/i],
          ['branch', /branch/i],
          ['shift', /shift/i],
          ['salary', /salary|ctc|wage|gross/i],
          ['status', /status/i],
          ['wcpolicy', /wc\s*policy|workmen|wc\s*no|compensation/i],
        ];
        const mapFriendlyHeaders = (hdr: string[]): Record<string, number> | null => {
          const map: Record<string, number> = {};
          hdr.forEach((cell, idx) => {
            for (const [key, re] of HEADER_PATTERNS) {
              if (map[key] === undefined && re.test(cell)) { map[key] = idx; break; }
            }
          });
          const strong = map.code !== undefined && map.name !== undefined && map.salary !== undefined && map.status !== undefined;
          return strong ? map : null;
        };

        workbook.SheetNames.forEach(sheetName => {
          if (sheetName === 'Sheet1' || sheetName.trim().toLowerCase() === 'instructions') return;
          const worksheet = workbook.Sheets[sheetName];
          const json: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

          if (json.length < 2) return;

          // ── Friendly named-column format (the downloadable Sample File) ────────
          const friendly = mapFriendlyHeaders((json[0] || []).map((h: any) => String(h ?? '').trim()));
          if (friendly) {
            let vc = 0, dc = 0;
            const get = (row: any[], key: string) => (friendly[key] !== undefined ? cleanExcelValue(row[friendly[key]]) : '');
            for (let i = 1; i < json.length; i++) {
              const row = json[i];
              if (!row || row.length === 0) continue;
              const empCode = get(row, 'code');
              const fullName = get(row, 'name');
              if ((empCode === '-' || !empCode) && (fullName === '-' || !fullName)) continue;

              const isDup = (!!empCode && employees.some(e => String(e.employeeId).toUpperCase() === empCode.toUpperCase()))
                || (!!empCode && allRows.some(e => String(e.employeeId).toUpperCase() === empCode.toUpperCase()));
              if (isDup) { dc++; continue; }

              const branchName = get(row, 'branch') || sheetName;
              const matchedBranch = companies.find(c => c.parentCompanyId === parentCompanyId && c.status !== 'Archived'
                && String(c.branchName || c.name).toLowerCase() === branchName.toLowerCase());
              const gender = get(row, 'gender');
              const statusVal = get(row, 'status');
              const emailVal = get(row, 'email');

              allRows.push({
                id: `emp-sample-${empCode || i}`,
                employeeId: empCode || `TEMP-${i}`,
                companyId: parentCompanyId,
                branchId: matchedBranch?.id || null,
                name: fullName || 'Unknown Employee',
                firstName: (fullName || '').split(/\s+/)[0] || fullName,
                lastName: (fullName || '').split(/\s+/).slice(1).join(' ') || '',
                email: emailVal && emailVal !== '-' ? emailVal : undefined,
                phone: get(row, 'mobile'),
                gender: /^f/i.test(gender) ? 'Female' : (/^m/i.test(gender) ? 'Male' : gender),
                dob: toISO(get(row, 'dob')),
                joinDate: toISO(get(row, 'joindate')),
                department: get(row, 'department'),
                designation: get(row, 'designation'),
                role: 'Staff' as Role,
                status: (/(archiv|inactive|exit|left|resign)/i.test(statusVal) ? 'Archived' : 'Active') as EmployeeStatus,
                salary: Number(String(get(row, 'salary')).replace(/[^0-9.]/g, '')) || 0,
                wcPolicyNumber: (() => { const v = get(row, 'wcpolicy'); return v && v !== '-' ? v.slice(0, 100) : undefined; })(),
                shift: get(row, 'shift') || undefined,
                branchLocation: branchName,
                location: branchName,
                avatar: (fullName || 'EM').slice(0, 2).toUpperCase(),
              });
              vc++;
            }
            logs.push(`Sheet [${sheetName}] (sample format): parsed ${vc} employees${dc ? `, skipped ${dc} duplicates` : ''}.`);
            return;
          }

          // ── Legacy fixed-column (branch-master) format ────────────────────────
          let validCount = 0;
          let dupCount = 0;

          for (let i = 2; i < json.length; i++) {
            const row = json[i];
            if (!row || row.length === 0) continue;

            let empCode = cleanExcelValue(row[1]);
            let fullName = cleanExcelValue(row[2]);

            // Skip completely empty rows
            if (empCode === '-' && fullName === '-' && (!row[3] || String(row[3]).trim() === '')) {
              continue;
            }

            // Fallback for missing empCode or fullName to guarantee zero skipped records
            if (empCode === '-') {
              empCode = `TEMP-GCRI-${i}`;
            }
            if (fullName === '-') {
              fullName = 'Unknown Employee';
            }

            // Check duplicate against existing AND newly parsed rows
            const isDup = employees.some(e => e.employeeId.toUpperCase() === empCode.toUpperCase()) ||
              allRows.some(e => e.employeeId.toUpperCase() === empCode.toUpperCase());
            if (isDup) {
              dupCount++;
              continue;
            }

            // Standard parsing
            const firstName = cleanExcelValue(row[5]);
            const surname = cleanExcelValue(row[4]);
            const gender = cleanExcelValue(row[6]);
            const designation = cleanExcelValue(row[14]);
            const category = cleanExcelValue(row[15]);

            let baseSalary = 18000;
            if (designation !== '-' && (designation.toLowerCase().includes('nurse') || designation.toLowerCase().includes('sister'))) {
              baseSalary = 38000;
            } else if (category !== '-' && category.toLowerCase() === 'skilled') {
              baseSalary = 32000;
            } else if (category !== '-' && category.toLowerCase() === 'semi-skilled') {
              baseSalary = 24000;
            } else if (category !== '-' && category.toLowerCase() === 'highly skilled') {
              baseSalary = 48000;
            }

            const emailVal = cleanExcelValue(row[36]);
            const email = emailVal !== '-' ? emailVal : `${firstName !== '-' ? firstName.toLowerCase() : 'employee'}@${sheetName.toLowerCase()}.gcri.in`;

            const parsedEmp = {
              id: `emp-gcri-${empCode}`,
              employeeId: empCode,
              companyId: parentCompanyId,
              branchId: companies.find(c => c.parentCompanyId === parentCompanyId && c.status !== 'Archived' && (c.branchName || c.name).toLowerCase() === sheetName.toLowerCase())?.id || null,
              name: fullName,
              email: email,
              phone: cleanExcelValue(row[17]),
              department: designation !== '-' && designation.toLowerCase().includes('nurse') ? 'Nursing' : 'Clinical',
              designation: designation,
              role: 'Staff' as Role,
              status: cleanExcelValue(row[29]) !== '-' ? 'Archived' : 'Active' as EmployeeStatus,
              joinDate: cleanExcelValue(row[13]),
              location: `${capitalize(sheetName)}, Gujarat`,
              avatar: firstName !== '-' ? firstName.slice(0, 2).toUpperCase() : 'EM',
              salary: baseSalary,
              manager: 'Dr. Suresh Babu',

              firstName,
              middleName: surname,
              lastName: surname,
              aadhaarName: cleanExcelValue(row[3]),
              gender: gender.toUpperCase() === 'F' ? 'Female' : 'Male',
              dob: cleanExcelValue(row[9]),
              maritalStatus: cleanExcelValue(row[10]),
              nationality: cleanExcelValue(row[11]),
              fatherSpouseName: cleanExcelValue(row[7]),
              relationType: cleanExcelValue(row[8]),
              category: category,
              employmentType: cleanExcelValue(row[16]),
              exitDate: cleanExcelValue(row[29]),
              exitReason: cleanExcelValue(row[30]),
              branchLocation: sheetName,
              aadhaar: cleanExcelValue(row[22]),
              pan: cleanExcelValue(row[20]),
              pfNumber: cleanExcelValue(row[18]),
              uan: cleanExcelValue(row[19]),
              esic: cleanExcelValue(row[21]),
              bankName: cleanExcelValue(row[24]),
              accountNumber: cleanExcelValue(row[23]),
              ifsc: cleanExcelValue(row[25]),
              presentAddress: cleanExcelValue(row[26]),
              permanentAddress: cleanExcelValue(row[27]),
            };

            allRows.push(parsedEmp);
            validCount++;
          }
          logs.push(`Sheet [${sheetName}]: successfully parsed ${validCount} valid employees. Skipped ${dupCount} duplicates.`);
        });

        setImportedRows(allRows);
        setImportLogs(logs);
      } catch (err) {
        ui.toast.error('Error parsing Excel file. Please ensure it matches standard branch templates.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleBulkCommit = async () => {
    setIsConfirmingBulk(false);
    if (importedRows.length === 0) return;
    setImportBlocked(null);

    try {
      const response = await api.employees.bulkCreate(importedRows);
      const createdN = Number(response.createdCount ?? response.count ?? 0);
      const updatedN = Number(response.mergedCount ?? response.updatedCount ?? 0);
      const skippedN = Number(response.skippedCount ?? 0);
      const failedN = Number(response.failedCount ?? 0);

      // AUTO-REFRESH from the database (source of truth) so BOTH newly-created and
      // updated employees appear immediately and every count reflects reality.
      // We re-fetch the whole roster instead of trusting the client-side array —
      // this is what makes the list, counts and dashboard update without a manual
      // reload. Branch/department/headcount are synced server-side during import.
      await refreshAfterBiometric();

      setImportResult({
        total: Number(response.total ?? importedRows.length),
        createdN, updatedN, skippedN, failedN,
        results: Array.isArray(response.results) ? response.results : [],
        limitReached: !!response.limitReached,
      });
      setImportedRows([]);

      // HONEST messaging — NEVER claim success when nothing was committed.
      if (createdN + updatedN === 0) {
        ui.toast.error(`Import completed but NO employees were added (${skippedN} skipped, ${failedN} failed). See the import log.`);
      } else if (skippedN + failedN > 0) {
        ui.toast.warning(`Import completed: ${createdN} added, ${updatedN} updated, ${skippedN} skipped, ${failedN} failed.`);
      } else {
        ui.toast.success(`Import completed: ${createdN} added${updatedN ? `, ${updatedN} updated` : ''} — all committed to the database.`);
      }
      if (response.limitReached) {
        ui.toast.error('Some rows were skipped: the plan employee limit was reached. Upgrade the subscription to add more.');
      }
    } catch (error: any) {
      console.error('Bulk commit failed:', error);
      // The plan cap rejects the WHOLE file before anything is written, and tells
      // us exactly how many seats are left — surface that instead of a generic
      // failure so the user knows precisely what to trim (or to upgrade).
      if (error?.code === 'EMPLOYEE_LIMIT_REACHED') {
        const d = error.data || {};
        const slots = Number(d.availableSlots ?? 0);
        setImportBlocked({
          plan: d.plan || 'Free',
          limit: Number(d.limit ?? 100),
          current: Number(d.current ?? 0),
          importCount: Number(d.importCount ?? importedRows.length),
          availableSlots: slots,
        });
        ui.toast.error(
          slots > 0
            ? `Import blocked — only ${slots} more employee${slots === 1 ? '' : 's'} can be added on your ${d.plan || 'Free'} plan.`
            : `Import blocked — your ${d.plan || 'Free'} plan employee limit has been reached.`,
        );
        return;
      }
      ui.toast.error(getApiErrorMessage(error, 'Could not save the imported employees.'));
    }
  };

  // Build + download a per-row CSV import log (Row, Name, Employee Code, Status, Reason).
  const downloadImportLog = () => {
    const rows = importResult?.results || [];
    const head = 'Row,Employee Name,Employee Code,Status,Reason';
    const body = rows.map((r) => [r.row, r.name, r.employeeId || '', r.status, r.reason || '']
      .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([`${head}\n${body}`], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `employee_import_log_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Reset the importer to a clean state (used by the completion screen's Done/close).
  const resetImporter = () => { setImportResult(null); setImportBlocked(null); setImportedRows([]); setImportLogs([]); setImportOpen(false); };


  const isHR = role === 'HR' || role === 'Company Head' || role === 'Super Admin';

  return (
    <div className="space-y-3 font-sans text-left">
      {/* Compact single-row enterprise toolbar: title + counters + actions all on
          one line on desktop; wraps only on tablet/mobile. */}
      <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
        <div className="shrink-0">
          <h2 className="text-base font-bold text-gray-900 leading-tight">Employee Management</h2>

        </div>
        <div className="flex items-center gap-2 flex-wrap xl:flex-nowrap">
          {/* Counters */}
          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 shrink-0">
            <button
              onClick={() => setActiveMainTab('all')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${activeMainTab === 'all' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              All Staff ({countAudit.allStaff})
            </button>
            <button
              onClick={() => setActiveMainTab('active')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${activeMainTab === 'active' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Active ({countAudit.active})
            </button>
            <button
              onClick={() => setActiveMainTab('previous')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${activeMainTab === 'previous' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Previous ({countAudit.previous})
            </button>
            {isHR && (
              <button
                onClick={() => setActiveMainTab('temporary')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${activeMainTab === 'temporary' ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-500 hover:text-amber-700'}`}
              >
                Temporary ({countAudit.temporary})
              </button>
            )}
            {isHR && (
              <button
                onClick={() => setActiveMainTab('approvals')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${activeMainTab === 'approvals' ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-brand-700'} ${countAudit.pendingApproval ? 'relative' : ''}`}
              >
                Pending Approvals ({countAudit.pendingApproval})
              </button>
            )}
          </div>

          {/* ── Actions ▼ (Export / Imports / Template) — consolidates the
              former Export + Bulk Import + Import Biometric buttons so the
              toolbar never overflows. ── */}
          <div className="relative shrink-0" ref={actionsMenuRef}>
            <Button size="sm" variant="outline" className="whitespace-nowrap" onClick={() => { setActionsMenuOpen(o => !o); setAddMenuOpen(false); }}>
              <span className="flex items-center gap-1.5"><Download size={14} /> Actions <ChevronDown size={13} className={`transition-transform ${actionsMenuOpen ? 'rotate-180' : ''}`} /></span>
            </Button>
            {actionsMenuOpen && (
              <div className="absolute right-0 z-50 mt-1.5 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-200/60">
                <div className="px-3.5 pt-2 pb-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">Export</div>
                <button onClick={() => runExport('excel')} className="flex w-full items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-slate-600 text-left transition-colors hover:bg-emerald-50 hover:text-emerald-700"><FileSpreadsheet size={15} className="text-emerald-600" /> Export to Excel</button>
                <button onClick={() => runExport('pdf')} className="flex w-full items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-slate-600 text-left transition-colors hover:bg-rose-50 hover:text-rose-700"><FileText size={15} className="text-rose-600" /> Export to PDF</button>
                {isHR && canCreate && (
                  <>
                    <div className="h-px bg-slate-100" />
                    <div className="px-3.5 pt-2 pb-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">Import</div>
                    <button onClick={() => { setActionsMenuOpen(false); setImportOpen(true); }} className="flex w-full items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-slate-600 text-left transition-colors hover:bg-slate-50 hover:text-slate-900"><Upload size={15} className="text-slate-400" /> Bulk Import Employees</button>
                    <button onClick={() => { setActionsMenuOpen(false); setBioImportOpen(true); }} className="flex w-full items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-slate-600 text-left transition-colors hover:bg-slate-50 hover:text-slate-900"><Fingerprint size={15} className="text-slate-400" /> Import Biometric Codes</button>
                    <button onClick={downloadSampleFile} className="flex w-full items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-slate-600 text-left transition-colors hover:bg-slate-50 hover:text-slate-900"><FileDown size={15} className="text-slate-400" /> Download Sample File</button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* ── Add Employee ▼ (Full / Quick-Temp) ── */}
          {isHR && canCreate && (
            <div className="relative shrink-0" ref={addMenuRef}>
              <Button size="sm" className="whitespace-nowrap" onClick={() => { setAddMenuOpen(o => !o); setActionsMenuOpen(false); }}>
                <span className="flex items-center gap-1.5"><Plus size={14} /> Add Employee <ChevronDown size={13} className={`transition-transform ${addMenuOpen ? 'rotate-180' : ''}`} /></span>
              </Button>
              {addMenuOpen && (
                <div className="absolute right-0 z-50 mt-1.5 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-200/60">
                  <button onClick={() => { setAddMenuOpen(false); guardCapacityThenAdd(handleStartAdd); }} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-xs font-semibold text-slate-600 text-left transition-colors hover:bg-brand-50 hover:text-brand-700"><UserPlus size={15} className="text-brand-600" /> Add Full Employee</button>
                  <div className="h-px bg-slate-100" />
                  <button onClick={() => { setAddMenuOpen(false); guardCapacityThenAdd(openQuickAdd); }} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-xs font-semibold text-slate-600 text-left transition-colors hover:bg-amber-50 hover:text-amber-700"><Plus size={15} className="text-amber-600" /> Quick Add (Temp)</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Automated reconciliation alert — surfaces (and logs) any data-integrity
          drift where All Staff ≠ Active + Previous + Temporary + Pending Approval. */}
      {!countAudit.ok && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-rose-800">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <div className="text-[11px] leading-snug">
            <p className="font-bold">Employee Count Mismatch Detected</p>
            <p>All Staff ({countAudit.allStaff}) ≠ Active ({countAudit.active}) + Previous ({countAudit.previous}).
            {countAudit.both > 0 && ` ${countAudit.both} record(s) are both Active & Offboarded.`}
            {countAudit.neither > 0 && ` ${countAudit.neither} record(s) have an unrecognised status.`} Details logged to the console.</p>
          </div>
        </div>
      )}

      {/* Metrics Row — three cards, so the grid is 3-up from `sm` and they widen
          to fill the row rather than leaving a hole where the fourth used to be.
          Deliberately NOT 2-up on phones: three items in a 2-column grid drop the
          last card into a half-width row of its own, which is exactly the ragged
          gap this change was meant to remove. Full-width stacked reads cleanly. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label="Total Staff Strength" value={countAudit.allStaff} icon={<Users size={16} className="text-brand-600" />} color="bg-brand-50" />
        <StatCard label="Active Personnel" value={countAudit.active} icon={<UserCheck size={16} className="text-emerald-500" />} color="bg-emerald-50" />
        <StatCard label="Pending Exits" value={stats.pendingExits} icon={<LogOut size={16} className="text-amber-600" />} color="bg-amber-50" />
      </div>

      {/* Filters — overflow-visible so the department combobox panel can hang
          outside the card instead of being clipped by Card's overflow-hidden. */}
      <Card className="overflow-visible">
        {/* Branch is already chosen by the workspace scope selector in the top
            bar, so a second branch dropdown here only duplicated it. */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input placeholder="Search code, name, designation..." value={search} onChange={e => setSearch(e.target.value)} icon={<Search size={14} />} />

          {/* Searchable: a company can carry 100+ departments/designations, and a
              native <select> only key-matches the first characters. */}
          <SearchSelect
            value={deptFilter}
            onChange={setDeptFilter}
            options={deptFilterOptions}
            allLabel="All Departments"
            ariaLabel="Filter by department"
            placeholder="Search departments…"
            emptyText="No departments found."
          />

          <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            options={[{ value: '', label: 'All Status' }, ...statusOptions.map(s => ({ value: s, label: s }))]}
          />
        </div>
      </Card>

      {/* ── Temporary Employees table (Quick Registration dataset) ── */}
      {activeMainTab === 'temporary' && (
        <Card padding={false}>
          <div className="px-4 py-3 border-b border-amber-100 bg-amber-50/50 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-amber-800">Temporary Employees</p>
              <p className="text-[11px] text-amber-600">Quick-registered staff completing their profile. They reach Active only after <strong>Submit&nbsp;for&nbsp;Approval</strong> → HR/Company&nbsp;Head approval.</p>
            </div>
            <span className="text-[11px] font-semibold text-amber-700 bg-white border border-amber-200 rounded-full px-2.5 py-1">{temporaryTableRows.length} record(s)</span>
          </div>
          <Table>
            <Thead>
              <tr>
                <Th className="px-2 py-1.5 text-[10px] tracking-wider font-bold">Temp ID</Th>
                <Th className="px-2 py-1.5 text-[10px] tracking-wider font-bold">Employee Name</Th>
                <Th className="px-2 py-1.5 text-[10px] tracking-wider font-bold">Mobile</Th>
                <Th className="px-2 py-1.5 text-[10px] tracking-wider font-bold">Branch</Th>
                <Th className="px-2 py-1.5 text-[10px] tracking-wider font-bold">Created</Th>
                <Th className="px-2 py-1.5 text-[10px] tracking-wider font-bold w-[16%]">Profile</Th>
                <Th className="px-2 py-1.5 text-[10px] tracking-wider font-bold">Status</Th>
                <Th className="px-2 py-1.5 text-[10px] tracking-wider font-bold text-center">Actions</Th>
              </tr>
            </Thead>
            <Tbody>
              {temporaryTableRows.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-10 text-xs text-gray-400">No temporary employees in progress. Use <strong>Quick Add (Temp)</strong> to register one in seconds.</td></tr>
              ) : temporaryTableRows.map(t => {
                const sb = tempStatusBadge(t.status);
                const terminal = t.status === 'Converted' || t.status === 'Rejected';
                const editable = TEMP_INPROGRESS_STATUSES.includes(t.status);
                const mand = validateTempMandatory(t);
                return (
                  <Tr key={t.id} className="hover:bg-amber-50/30">
                    <Td className="px-2 py-1.5"><span className="text-[11px] font-bold text-amber-700">{t.tempEmployeeId}</span></Td>
                    <Td className="px-2 py-1.5"><span className="text-[11px] font-semibold text-slate-800">{t.name}</span>{t.convertedEmployeeCode && <span className="block text-[9px] text-emerald-600 font-semibold">→ {t.convertedEmployeeCode}</span>}{t.status === 'Rejected' && t.rejectedReason && <span className="block text-[9px] text-rose-500" title={t.rejectedReason}>Reason: {t.rejectedReason}</span>}{t.status === 'Changes Requested' && t.changeRequestNote && <span className="block text-[9px] text-orange-500" title={t.changeRequestNote}>Changes: {t.changeRequestNote}</span>}</Td>
                    <Td className="px-2 py-1.5"><span className="text-[11px] text-slate-600">{t.mobile}</span></Td>
                    <Td className="px-2 py-1.5"><span className="text-[11px] text-slate-600">{t.branchLocation || '—'}</span></Td>
                    <Td className="px-2 py-1.5"><span className="text-[11px] text-slate-500">{formatDate(t.createdAt)}</span></Td>
                    <Td className="px-2 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden min-w-[48px]"><div className={`h-full rounded-full ${mand.ok ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${t.profileCompletion || 0}%` }} /></div>
                        <span className="text-[10px] font-bold text-slate-600 w-8 text-right">{t.profileCompletion || 0}%</span>
                      </div>
                    </Td>
                    <Td className="px-2 py-1.5"><Badge variant={sb as any} className="text-[9px] px-1.5 py-0">{t.status}</Badge></Td>
                    <Td className="px-2 py-1.5">
                      <div className="flex items-center justify-center gap-1 whitespace-nowrap">
                        {editable && canEdit && (
                          <button onClick={() => setEditTemp({ ...t })} className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-brand-600 transition" title="Complete profile"><Edit2 size={13} /></button>
                        )}
                        {editable && canEdit && (
                          <button onClick={() => handleSubmitTemp(t)} disabled={tempBusy || !mand.ok} className="p-1 hover:bg-brand-50 rounded text-brand-600 transition disabled:opacity-30" title={mand.ok ? 'Submit for approval' : 'Complete all mandatory fields & documents first'}><Send size={13} /></button>
                        )}
                        {!terminal && canEdit && (
                          <button onClick={() => handleRejectTemp(t)} disabled={tempBusy} className="p-1 hover:bg-rose-50 rounded text-slate-400 hover:text-rose-600 transition disabled:opacity-40" title="Reject"><XCircle size={13} /></button>
                        )}
                        {canCreate && (
                          <button onClick={() => handleDeleteTemp(t)} disabled={tempBusy} className="p-1 hover:bg-rose-50 rounded text-slate-400 hover:text-rose-600 transition disabled:opacity-40" title="Delete record"><Trash2 size={13} /></button>
                        )}
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        </Card>
      )}

      {/* ── Pending Approvals queue (HR / Company Head / Super Admin) ── */}
      {activeMainTab === 'approvals' && (
        <Card padding={false}>
          <div className="px-4 py-3 border-b border-brand-100 bg-brand-50/50 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-brand-800">Pending Approvals</p>
              <p className="text-[11px] text-brand-600">Temporary employees who completed their profile &amp; documents and are awaiting activation. Approving generates the official Employee ID and creates the Active record.</p>
            </div>
            <span className="text-[11px] font-semibold text-brand-700 bg-white border border-brand-200 rounded-full px-2.5 py-1">{pendingApprovals.length} awaiting</span>
          </div>
          <Table>
            <Thead>
              <tr>
                <Th className="px-2 py-1.5 text-[10px] tracking-wider font-bold">Temp ID</Th>
                <Th className="px-2 py-1.5 text-[10px] tracking-wider font-bold">Employee Name</Th>
                <Th className="px-2 py-1.5 text-[10px] tracking-wider font-bold">Branch</Th>
                <Th className="px-2 py-1.5 text-[10px] tracking-wider font-bold">Department</Th>
                <Th className="px-2 py-1.5 text-[10px] tracking-wider font-bold">Submitted</Th>
                <Th className="px-2 py-1.5 text-[10px] tracking-wider font-bold w-[14%]">Profile</Th>
                <Th className="px-2 py-1.5 text-[10px] tracking-wider font-bold text-center">Actions</Th>
              </tr>
            </Thead>
            <Tbody>
              {pendingApprovals.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-10 text-xs text-gray-400">No employees awaiting approval. Completed temporary profiles appear here automatically.</td></tr>
              ) : pendingApprovals.map(t => (
                <Tr key={t.id} className="hover:bg-brand-50/30">
                  <Td className="px-2 py-1.5"><span className="text-[11px] font-bold text-amber-700">{t.tempEmployeeId}</span></Td>
                  <Td className="px-2 py-1.5"><span className="text-[11px] font-semibold text-slate-800">{t.name}</span><span className="block text-[9px] text-slate-400">{t.mobile} · {t.designation || '—'}</span></Td>
                  <Td className="px-2 py-1.5"><span className="text-[11px] text-slate-600">{t.branchLocation || '—'}</span></Td>
                  <Td className="px-2 py-1.5"><span className="text-[11px] text-slate-600">{t.department || '—'}</span></Td>
                  <Td className="px-2 py-1.5"><span className="text-[11px] text-slate-500">{t.submittedAt ? formatDate(t.submittedAt) : '—'}</span>{t.submittedBy && <span className="block text-[9px] text-slate-400">by {t.submittedBy}</span>}</Td>
                  <Td className="px-2 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden min-w-[40px]"><div className="h-full bg-brand-500 rounded-full" style={{ width: `${t.profileCompletion || 0}%` }} /></div>
                      <span className="text-[10px] font-bold text-slate-600 w-8 text-right">{t.profileCompletion || 0}%</span>
                    </div>
                  </Td>
                  <Td className="px-2 py-1.5">
                    <div className="flex items-center justify-center gap-1 whitespace-nowrap">
                      <button onClick={() => setReviewTemp({ ...t })} className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-brand-600 transition" title="Review profile & documents"><Eye size={13} /></button>
                      {canCreate && (
                        <button onClick={() => openAssign(t)} disabled={tempBusy} className="p-1 hover:bg-emerald-50 rounded text-emerald-600 transition disabled:opacity-40" title="Approve & activate"><ThumbsUp size={13} /></button>
                      )}
                      {canEdit && (
                        <button onClick={() => handleRequestChangesTemp(t)} disabled={tempBusy} className="p-1 hover:bg-orange-50 rounded text-orange-500 transition disabled:opacity-40" title="Request changes"><RotateCcw size={13} /></button>
                      )}
                      {canEdit && (
                        <button onClick={() => handleRejectTemp(t)} disabled={tempBusy} className="p-1 hover:bg-rose-50 rounded text-slate-400 hover:text-rose-600 transition disabled:opacity-40" title="Reject"><XCircle size={13} /></button>
                      )}
                    </div>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Card>
      )}

      {/* Optional column toggle */}
      {activeMainTab !== 'temporary' && activeMainTab !== 'approvals' && (<>
        <div className="flex items-center justify-end">
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer select-none">
            <input type="checkbox" checked={showBiometric} onChange={e => setShowBiometric(e.target.checked)} />
            Show Biometric Code column
          </label>
        </div>

        {/* Main Table */}
        <Card padding={false}>
          <Table>
            <Thead>
              <tr>
                <Th className="px-2 py-1.5 text-[10px] w-[4%] tracking-wider font-bold text-center">Sr No</Th>
                <Th className="px-2 py-1.5 text-[10px] w-[9%] tracking-wider font-bold">Emp Code</Th>
                <Th className={`px-2 py-1.5 text-[10px] tracking-wider font-bold ${activeMainTab !== 'active' ? 'w-[27%]' : 'w-[32%]'}`}>Employee Full Name</Th>
                <Th className="px-2 py-1.5 text-[10px] w-[12%] tracking-wider font-bold">Date of Joining</Th>
                <Th className={`px-2 py-1.5 text-[10px] tracking-wider font-bold ${activeMainTab !== 'active' ? 'w-[22%]' : 'w-[27%]'}`}>Designation</Th>
                <Th className="px-2 py-1.5 text-[10px] w-[10%] tracking-wider font-bold">Category</Th>
                {/* Date of Exit is meaningless for active staff — hidden on the Active tab, kept on All/Previous. */}
                {activeMainTab !== 'active' && <Th className="px-2 py-1.5 text-[10px] w-[10%] tracking-wider font-bold">Date of Exit</Th>}
                {showBiometric && <Th className="px-2 py-1.5 text-[10px] w-[10%] tracking-wider font-bold">Biometric Code</Th>}
                <Th className="px-2 py-1.5 text-[10px] w-[6%] tracking-wider font-bold text-center">ACTIONS</Th>
              </tr>
            </Thead>
            <Tbody>
              {isTableLoading ? (
                <tr><td colSpan={7 + (activeMainTab !== 'active' ? 1 : 0) + (showBiometric ? 1 : 0)} className="text-center py-10 text-xs text-slate-500"><div className="flex flex-col items-center gap-2"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-brand-600"></div>Loading...</div></td></tr>
              ) : totalRows === 0 ? (
                <tr><td colSpan={7 + (activeMainTab !== 'active' ? 1 : 0) + (showBiometric ? 1 : 0)} className="text-center py-10 text-xs text-gray-400">No employees found.</td></tr>
              ) : (
                paginatedData.map((emp, idx) => (
                  <Tr key={emp.id} className="hover:bg-slate-50/50">
                    <Td className="px-2 py-1 text-center"><span className="text-[11px] font-semibold text-slate-500">{(page - 1) * limit + idx + 1}</span></Td>
                    <Td className="px-2 py-1"><span className="text-[11px] font-bold text-slate-800">{emp.employeeId}</span></Td>
                    <Td className="px-2 py-1">
                      <div className="flex items-center gap-1.5 cursor-pointer" onClick={() => setViewEmp(emp)}>
                        <div className="h-6 w-6 rounded-full bg-slate-100 flex items-center justify-center font-bold text-[9px] text-slate-600 ring-1 ring-slate-200 shrink-0">
                          {emp.avatar || 'EM'}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold text-slate-900 hover:text-brand-600 truncate">{emp.name}</p>
                          <p className="text-[9px] text-gray-400 truncate">{emp.email}</p>
                        </div>
                      </div>
                    </Td>
                    <Td className="px-2 py-1"><span className="text-[11px] text-slate-600">{formatDate(emp.joinDate)}</span></Td>
                    <Td className="px-2 py-1"><span className="text-[11px] font-medium text-slate-800 truncate block max-w-[160px]">{emp.designation}</span></Td>
                    <Td className="px-2 py-1"><Badge variant="blue" className="text-[9px] px-1 py-0">{emp.category || 'SKILLED'}</Badge></Td>
                    {activeMainTab !== 'active' && <Td className="px-2 py-1"><span className="text-[11px] text-slate-500 font-medium">{emp.exitDate ? formatDate(emp.exitDate) : '—'}</span></Td>}
                    {showBiometric && <Td className="px-2 py-1"><span className="text-[11px] text-slate-600 font-medium">{emp.biometricId || '—'}</span></Td>}
                    <Td className="px-2 py-1 w-24">
                      <div className="flex items-center justify-center gap-1 whitespace-nowrap">
                        <button
                          onClick={() => setViewEmp(emp)}
                          className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-brand-600 transition"
                          title="View Master File"
                        >
                          <Eye size={13} />
                        </button>

                        {/* Active employees: full management actions. */}
                        {!isOffboarded(emp.status) && canEdit && (
                          <>
                            <button
                              onClick={() => handleStartEdit(emp)}
                              className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-brand-600 transition"
                              title="Edit File"
                            >
                              <Edit2 size={13} />
                            </button>
                            <button
                              onClick={() => { setOffboardEmp(emp); setIsConfirmingOffboard(true); }}
                              className="p-1 hover:bg-amber-50 rounded text-amber-500 hover:text-amber-600 transition"
                              title="Initiate Offboarding"
                            >
                              <LogOut size={13} />
                            </button>
                          </>
                        )}
                        {/* Previous employee = locked historical record. The only
                            write available is re-onboarding, which creates a NEW
                            record and leaves this one untouched. */}
                        {isOffboarded(emp.status) && (
                          <>
                            <button
                              onClick={() => { setViewEmp(emp); setActiveTab('documents'); }}
                              className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-brand-600 transition"
                              title="View / Download Documents"
                            >
                              <FileText size={13} />
                            </button>
                            {canCreate && (
                              <button
                                onClick={() => handleStartReOnboard(emp)}
                                className="p-1 hover:bg-emerald-50 rounded text-emerald-600 hover:text-emerald-700 transition"
                                title="Re-Onboard Employee"
                              >
                                <RotateCcw size={13} />
                              </button>
                            )}
                            {/* Break-glass data correction, Super Admin only —
                                the server enforces the same exception. */}
                            {role === 'Super Admin' && (
                              <button
                                onClick={() => handleStartEdit(emp)}
                                className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-700 transition"
                                title="Edit locked record (Super Admin override)"
                              >
                                <Edit2 size={13} />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </Td>
                  </Tr>
                ))
              )}
            </Tbody>
          </Table>

          {/* Pagination Controls */}
          {totalRows > 0 && (
            <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50 rounded-b-xl flex-wrap gap-3">
              <span className="text-xs text-slate-500 font-medium">
                Showing <span className="font-bold text-slate-700">{(page - 1) * limit + 1}</span> to <span className="font-bold text-slate-700">{Math.min(page * limit, totalRows)}</span> of <span className="font-bold text-slate-700">{totalRows}</span> employees
              </span>
              <div className="flex items-center gap-4">
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="text-xs py-1 px-3"
                  >
                    &lt;&lt; Previous
                  </Button>
                  <div className="hidden sm:flex items-center px-2">
                    <span className="text-xs text-slate-500">Page {page} of {Math.max(1, Math.ceil(totalRows / limit))}</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.min(Math.ceil(totalRows / limit), p + 1))}
                    disabled={page >= Math.ceil(totalRows / limit)}
                    className="text-xs py-1 px-3"
                  >
                    Next &gt;&gt;
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Card>
      </>)}

      {/* ── Quick (Temporary) Employee Registration ── */}
      <Modal open={quickOpen} onClose={() => setQuickOpen(false)} title="Quick Employee Registration (Temporary)" size="sm">
        <div className="space-y-3 text-left">
          <p className="text-[11px] text-slate-500">Create a temporary employee in seconds — only Name, Mobile &amp; Branch are required. Complete the rest later and convert to a permanent employee.</p>
          <Input id="field-quickName" label="Employee Name *" value={quickForm.name} onChange={e => setQuickForm(f => ({ ...f, name: e.target.value }))} onBlur={() => quickGate.touch('quickName')} error={quickGate.visibleErrors.quickName} placeholder="Full name" />
          <div>
            {/* Normalised through the shared field registry, so typing, pasting
                and validation behave exactly as they do everywhere else: digits
                only, capped at 10, and a pasted "+91 98765 43210" reduces to the
                subscriber number instead of being rejected. */}
            <Input id="field-quickMobile" label="Mobile Number *" value={quickForm.mobile}
              inputMode="tel" maxLength={10}
              onChange={e => { setMobileDup(null); setQuickForm(f => ({ ...f, mobile: normalizeField('mobile', e.target.value) })); }}
              onBlur={e => checkMobileLive(e.target.value)}
              placeholder="10-digit mobile"
              error={quickForm.mobile && !quickMobileValid ? quickMobileError : undefined} />
            {mobileChecking && <p className="mt-1 text-[10px] text-slate-400">Checking mobile number…</p>}
            {mobileDup && (
              <p className="mt-1 text-[11px] font-medium text-rose-600">
                Already linked to {mobileDup.code}{mobileDup.status ? ` (${mobileDup.status})` : ''} — duplicate creation is not allowed.
              </p>
            )}
          </div>
          {isBranchWorkspace ? (
            // Branch scope — branch is fixed by the active workspace, shown read-only.
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Branch</label>
              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="text-sm font-semibold text-slate-800">{activeBranchName}</span>
                <span className="text-[10px] font-medium uppercase tracking-wide text-emerald-600">Auto-assigned</span>
              </div>
              <p className="mt-1 text-[10px] text-slate-400">Set by the current workspace scope. Switch scope to assign a different branch.</p>
            </div>
          ) : (
            <Select id="field-quickBranch" label="Branch *" value={quickForm.branch} onChange={e => setQuickForm(f => ({ ...f, branch: e.target.value }))}
              onBlur={() => quickGate.touch('quickBranch')} error={quickGate.visibleErrors.quickBranch}
              options={[{ value: '', label: 'Select branch…' }, ...branchOptions.map(b => ({ value: b, label: b }))]} />
          )}
          <Input label="Department (optional)" value={quickForm.department} onChange={e => setQuickForm(f => ({ ...f, department: e.target.value }))} placeholder="e.g. Operations" />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => setQuickOpen(false)}>Cancel</Button>
            {/* Blocked until name, 10-digit mobile and branch are all valid.
                A duplicate mobile / in-flight check is a genuine hard disable —
                there is nothing for the user to fix by clicking. */}
            <Button
              size="sm"
              className="bg-amber-500 hover:bg-amber-600"
              loading={tempBusy}
              disabled={!!mobileDup || mobileChecking}
              blocked={!quickGate.isValid}
              blockedReason={quickGate.blockedReason}
              onClick={() => quickGate.attemptSubmit(handleQuickCreate)}
            >Create Temporary Employee</Button>
          </div>
        </div>
      </Modal>

      {/* ── Complete Temporary Employee Profile — dedicated FULL-SCREEN onboarding ── */}
      <TempEmployeeOnboarding
        open={!!editTemp}
        temp={editTemp}
        branchName={editTemp?.branchLocation}
        companyName={(companies.find(c => String(c.id) === String(parentCompanyId)) as any)?.name || (currentComp as any)?.parentCompanyName || (currentComp as any)?.name || ''}
        canSubmit={canEdit}
        onClose={() => setEditTemp(null)}
        onSaved={() => { refreshTemps(); }}
        onSubmitted={() => { setEditTemp(null); refreshTemps(); setActiveMainTab('approvals'); }}
      />

      {/* ── Approval Review (View Profile / Documents + Approve / Reject / Request Changes) ── */}
      <Modal open={!!reviewTemp} onClose={() => setReviewTemp(null)} title={reviewTemp ? `Review for Approval — ${reviewTemp.tempEmployeeId}` : ''} size="md">
        {reviewTemp && (
          <div className="space-y-3 text-left text-xs">
            <div className="flex items-center justify-between rounded-lg bg-brand-50 border border-brand-100 px-3 py-2">
              <div>
                <p className="text-[12px] font-bold text-brand-900">{reviewTemp.name}</p>
                <p className="text-[10px] text-brand-600">{reviewTemp.designation || '—'} · {reviewTemp.department || '—'} · {reviewTemp.branchLocation || '—'}</p>
              </div>
              <Badge variant={tempStatusBadge(reviewTemp.status) as any} className="text-[9px] px-1.5 py-0">{reviewTemp.status}</Badge>
            </div>

            {/* Profile summary */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {[
                ['Mobile', reviewTemp.mobile], ['Email', reviewTemp.email],
                ['Date of Birth', reviewTemp.dob], ['Gender', reviewTemp.gender],
                ['Father / Spouse', reviewTemp.fatherSpouseName], ['Aadhaar', reviewTemp.aadhaar],
                ['PAN', reviewTemp.pan], ['Bank', reviewTemp.bankName],
                ['Account No.', reviewTemp.accountNumber], ['IFSC', reviewTemp.ifsc],
                ['Emergency', reviewTemp.emergencyContact],
              ].map(([k, val]) => (
                <div key={k as string} className="flex flex-col">
                  <span className="text-[9px] uppercase tracking-wide text-slate-400">{k}</span>
                  <span className="text-[11px] font-medium text-slate-700">{val || '—'}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-col">
              <span className="text-[9px] uppercase tracking-wide text-slate-400">Present Address</span>
              <span className="text-[11px] font-medium text-slate-700">{reviewTemp.presentAddress || '—'}</span>
            </div>

            {/* Documents — view + download */}
            <div>
              <p className="text-[11px] font-bold text-slate-600 mb-1.5">Documents</p>
              <div className="grid grid-cols-2 gap-2">
                {TEMP_MANDATORY_DOCS.map(d => {
                  const present = tempDocPresent(reviewTemp, d.key);
                  const src = d.key === 'photo' ? reviewTemp.photoUpload : reviewTemp.documents?.[d.key]?.dataUrl;
                  const fname = d.key === 'photo' ? `${reviewTemp.tempEmployeeId}-photo` : (reviewTemp.documents?.[d.key]?.name || `${reviewTemp.tempEmployeeId}-${d.key}`);
                  return (
                    <div key={d.key} className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 ${present ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-slate-50'}`}>
                      <span className={`text-[11px] font-semibold flex items-center gap-1 ${present ? 'text-emerald-700' : 'text-slate-400'}`}>{present ? <CheckCircle2 size={12} /> : <XCircle size={12} />}{d.label}</span>
                      {present && src && (
                        <span className="flex items-center gap-1.5">
                          <a href={src} target="_blank" rel="noreferrer" className="text-[10px] font-semibold text-brand-600 hover:underline flex items-center gap-0.5"><Eye size={11} />View</a>
                          <a href={src} download={fname} className="text-[10px] font-semibold text-slate-500 hover:underline flex items-center gap-0.5"><Download size={11} />Download</a>
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Audit */}
            <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 text-[10px] text-slate-500 flex items-center gap-2 flex-wrap">
              <Clock size={12} className="text-slate-400" />
              {reviewTemp.submittedBy ? <span>Submitted by <strong className="text-slate-600">{reviewTemp.submittedBy}</strong> on {formatDate(reviewTemp.submittedAt)}</span> : <span>Awaiting submission details.</span>}
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setReviewTemp(null)}>Close</Button>
              {canEdit && <Button variant="outline" size="sm" className="text-orange-600 border-orange-200 hover:bg-orange-50" icon={<RotateCcw size={13} />} loading={tempBusy} onClick={() => handleRequestChangesTemp(reviewTemp)}>Request Changes</Button>}
              {canEdit && <Button variant="outline" size="sm" className="text-rose-600 border-rose-200 hover:bg-rose-50" icon={<XCircle size={13} />} loading={tempBusy} onClick={() => handleRejectTemp(reviewTemp)}>Reject</Button>}
              {canCreate && <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" icon={<ThumbsUp size={13} />} loading={tempBusy} onClick={() => openAssign(reviewTemp)}>Approve &amp; Assign</Button>}
            </div>
          </div>
        )}
      </Modal>

      {/* ── HR Employment Assignment screen — official details assigned at approval ── */}
      <Modal
        open={!!assignTemp}
        onClose={() => setAssignTemp(null)}
        variant="page"
        title={assignTemp ? `Employment Assignment — ${assignTemp.name}` : ''}
        subtitle={assignTemp ? `${assignTemp.tempEmployeeId} · Assign official employment details, then approve to create the Active Employee` : ''}
        breadcrumbs={[{ label: 'Employees', onClick: () => setAssignTemp(null) }, { label: 'Pending Approvals', onClick: () => setAssignTemp(null) }, { label: 'Assign Employment' }]}
        context={assignTemp ? <span>{(companies.find(c => String(c.id) === String(parentCompanyId)) as any)?.name || (currentComp as any)?.name || '—'}{assignTemp.branchLocation ? <span className="text-slate-400"> · {assignTemp.branchLocation}</span> : null}</span> : null}
        pageMaxWidth={1080}
        footer={
          <>
            <span className="mr-auto text-[11px] font-semibold text-slate-400">Department &amp; Designation are required.</span>
            <Button variant="outline" size="sm" onClick={() => setAssignTemp(null)}>Cancel</Button>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" icon={<ThumbsUp size={14} />} loading={tempBusy} onClick={submitAssignment}>Approve &amp; Create Employee</Button>
          </>
        }
      >
        {assignTemp && (
          <div className="space-y-5">
            <div className="rounded-xl border border-brand-100 bg-brand-50/50 px-4 py-3 text-[11px] text-brand-800">
              The employee completed their personal &amp; verification profile. As HR, assign the official employment details below — these are company-controlled and were not entered by the employee. Approving generates the permanent Employee ID and moves them to <strong>Active Employees</strong> (payroll, attendance &amp; leave then apply as for any active employee).
            </div>

            {/* Organization */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 md:p-5 shadow-sm">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-extrabold text-slate-800"><Building2 size={16} className="text-brand-600" /> Organization</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Company</label>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">{(companies.find(c => String(c.id) === String(parentCompanyId)) as any)?.name || (currentComp as any)?.name || '—'}</div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Branch</label>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">{assignTemp.branchLocation || '—'}</div>
                </div>
                <Input label="Reporting Manager" value={assignForm.reportingManager} onChange={e => setAssignForm((f: any) => ({ ...f, reportingManager: e.target.value }))} placeholder="e.g. Priya Sharma" />
                <Input label="Department *" value={assignForm.department} onChange={e => setAssignForm((f: any) => ({ ...f, department: e.target.value }))} placeholder="e.g. Operations" />
                <Input label="Designation *" value={assignForm.designation} onChange={e => setAssignForm((f: any) => ({ ...f, designation: e.target.value }))} placeholder="e.g. Field Officer" />
              </div>
            </div>

            {/* Employment */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 md:p-5 shadow-sm">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-extrabold text-slate-800"><ShieldCheck size={16} className="text-brand-600" /> Employment</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <Select label="Employment Type" value={assignForm.employmentType} onChange={e => setAssignForm((f: any) => ({ ...f, employmentType: e.target.value }))}
                  options={['Permanent', 'Contract', 'Probation', 'Internship', 'Temporary'].map(s => ({ value: s, label: s }))} />
                <Input label="Employee Category" value={assignForm.employeeCategory} onChange={e => setAssignForm((f: any) => ({ ...f, employeeCategory: e.target.value }))} placeholder="e.g. Skilled / Staff" />
                <Input label="Joining Date *" type="date" value={assignForm.joinDate} onChange={e => setAssignForm((f: any) => ({ ...f, joinDate: e.target.value }))} />
                <Input label="Confirmation Date" type="date" value={assignForm.confirmationDate} onChange={e => setAssignForm((f: any) => ({ ...f, confirmationDate: e.target.value }))} />
                <Input label="Probation Period" value={assignForm.probationPeriod} onChange={e => setAssignForm((f: any) => ({ ...f, probationPeriod: e.target.value }))} placeholder="e.g. 6 months" />
                <Input label="Grade" value={assignForm.grade} onChange={e => setAssignForm((f: any) => ({ ...f, grade: e.target.value }))} placeholder="e.g. G3" />
                <Input label="Level" value={assignForm.level} onChange={e => setAssignForm((f: any) => ({ ...f, level: e.target.value }))} placeholder="e.g. L2" />
              </div>
            </div>

            {/* Payroll */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 md:p-5 shadow-sm">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-extrabold text-slate-800"><IndianRupee size={16} className="text-brand-600" /> Payroll</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <Input label="Monthly Salary (₹)" value={assignForm.salary} onChange={e => setAssignForm((f: any) => ({ ...f, salary: e.target.value.replace(/[^\d.]/g, '') }))} placeholder="e.g. 25000" />
                <Input label="Basic Salary (₹)" value={assignForm.basicSalary} onChange={e => setAssignForm((f: any) => ({ ...f, basicSalary: e.target.value.replace(/[^\d.]/g, '') }))} />
                <Input label="Gross Salary (₹)" value={assignForm.grossSalary} onChange={e => setAssignForm((f: any) => ({ ...f, grossSalary: e.target.value.replace(/[^\d.]/g, '') }))} />
                <Input label="CTC (₹)" value={assignForm.ctc} onChange={e => setAssignForm((f: any) => ({ ...f, ctc: e.target.value.replace(/[^\d.]/g, '') }))} />
                <Input label="Wage Category" value={assignForm.wageCategory} onChange={e => setAssignForm((f: any) => ({ ...f, wageCategory: e.target.value }))} placeholder="e.g. Unskilled / Semi-skilled" />
                <Input label="Skill Category" value={assignForm.skillCategory} onChange={e => setAssignForm((f: any) => ({ ...f, skillCategory: e.target.value }))} />
                <Select label="PF Applicable" value={assignForm.pf} onChange={e => setAssignForm((f: any) => ({ ...f, pf: e.target.value }))} options={[{ value: '', label: '—' }, { value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }]} />
                <Select label="ESI Applicable" value={assignForm.esi} onChange={e => setAssignForm((f: any) => ({ ...f, esi: e.target.value }))} options={[{ value: '', label: '—' }, { value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }]} />
                <Select label="Professional Tax" value={assignForm.professionalTax} onChange={e => setAssignForm((f: any) => ({ ...f, professionalTax: e.target.value }))} options={[{ value: '', label: '—' }, { value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }]} />
                <Select label="Bonus Eligibility" value={assignForm.bonusEligibility} onChange={e => setAssignForm((f: any) => ({ ...f, bonusEligibility: e.target.value }))} options={[{ value: '', label: '—' }, { value: 'Eligible', label: 'Eligible' }, { value: 'Not Eligible', label: 'Not Eligible' }]} />
              </div>
            </div>

            {/* Attendance */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 md:p-5 shadow-sm">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-extrabold text-slate-800"><Clock size={16} className="text-brand-600" /> Attendance &amp; Leave</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <Input label="Shift" value={assignForm.shift} onChange={e => setAssignForm((f: any) => ({ ...f, shift: e.target.value }))} placeholder="e.g. General (9–6)" />
                <Input label="Weekly Off" value={assignForm.weeklyOff} onChange={e => setAssignForm((f: any) => ({ ...f, weeklyOff: e.target.value }))} placeholder="e.g. Sunday" />
                <Input label="Attendance Policy" value={assignForm.attendancePolicy} onChange={e => setAssignForm((f: any) => ({ ...f, attendancePolicy: e.target.value }))} />
                <Input label="Leave Policy" value={assignForm.leavePolicy} onChange={e => setAssignForm((f: any) => ({ ...f, leavePolicy: e.target.value }))} />
                <Input label="Holiday Calendar" value={assignForm.holidayCalendar} onChange={e => setAssignForm((f: any) => ({ ...f, holidayCalendar: e.target.value }))} />
              </div>
              <p className="mt-3 text-[10px] text-slate-400">These choices are recorded with the employee. Detailed payroll-structure, shift rosters and leave/holiday rules continue to be managed in the Payroll, Attendance &amp; Leave modules — those engines are unchanged.</p>
            </div>
          </div>
        )}
      </Modal>

      {/* View Master Drawer/Modal */}
      {/* ── Full-page Employee Profile (replaces the old popup) ── */}
      <Modal
        open={!!viewEmp}
        onClose={() => setViewEmp(null)}
        variant="page"
        title="Employee Profile"
        subtitle={viewEmp ? `${viewEmp.name} · ${viewEmp.employeeId || '—'}` : undefined}
        breadcrumbs={[
          { label: 'Employee Management', onClick: () => setViewEmp(null) },
          { label: 'Profile' },
          { label: viewEmp?.name || 'Employee' },
        ]}
        context={currentComp?.name || undefined}
        footer={viewEmp && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setViewEmp(null)}>Back</Button>
            {/* A locked record offers Re-Onboard where an active one offers Edit —
                the two are mutually exclusive by design. */}
            {isOffboarded(viewEmp.status) ? (
              canCreate && (
                <Button size="sm" icon={<RotateCcw size={13} />} onClick={() => handleStartReOnboard(viewEmp)}>Re-Onboard Employee</Button>
              )
            ) : (
              canEdit && (
                <Button size="sm" icon={<Edit2 size={13} />} onClick={() => { const emp = viewEmp; setViewEmp(null); handleStartEdit(emp); }}>Edit Employee</Button>
              )
            )}
            {isOffboarded(viewEmp.status) && role === 'Super Admin' && (
              <Button variant="outline" size="sm" icon={<Edit2 size={13} />} onClick={() => { const emp = viewEmp; setViewEmp(null); handleStartEdit(emp); }}>Edit (Super Admin)</Button>
            )}
            <Button variant="outline" size="sm" icon={<Printer size={13} />} onClick={() => printEmployeeProfile(viewEmp, currentComp?.name || 'Company')}>Print Profile</Button>
            <Button variant="outline" size="sm" icon={<Download size={13} />} onClick={() => downloadEmployeeProfilePdf(viewEmp, currentComp?.name || 'Company')}>Download PDF</Button>
          </div>
        )}
      >
        {viewEmp && (
          <div className="space-y-4 text-left text-xs font-sans">
            {isOffboarded(viewEmp.status) && (
              <div className="flex flex-wrap items-start gap-3 px-3.5 py-3 rounded-lg bg-amber-50 border border-amber-300 text-amber-900">
                <Lock size={15} className="mt-0.5 shrink-0 text-amber-600" />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-bold">Record Locked — Previous Employee</p>
                  <p className="text-[11px] font-medium mt-0.5">{LOCKED_RECORD_MESSAGE}</p>
                  {role === 'Super Admin' && (
                    <p className="text-[10px] mt-1 text-amber-700">
                      You are a Super Admin: you retain a break-glass edit on this record for data corrections. Every such edit is audited.
                    </p>
                  )}
                </div>
                {canCreate && (
                  <Button size="sm" icon={<RotateCcw size={13} />} onClick={() => handleStartReOnboard(viewEmp)}>Re-Onboard</Button>
                )}
              </div>
            )}
            {/* Profile header — photo, identity, status + key employment facts */}
            <div className="flex flex-wrap items-center gap-4 p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
              {viewEmp.photoUpload ? (
                <img src={viewEmp.photoUpload} alt={viewEmp.name} className="h-16 w-16 rounded-full object-cover ring-2 ring-brand-200" />
              ) : (
                <div className="h-16 w-16 rounded-full bg-brand-100 text-brand-800 font-bold flex items-center justify-center text-lg ring-2 ring-brand-200">
                  {viewEmp.avatar || (viewEmp.name || '?').slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-base font-bold text-slate-900">{viewEmp.name}</p>
                  <Badge variant={statusBadge(viewEmp.status)} dot>{viewEmp.status}</Badge>
                </div>
                <p className="text-[11px] text-gray-500 font-medium mt-0.5">{viewEmp.designation || '—'} · {viewEmp.department || '—'} · {viewEmp.employeeId || '—'}</p>
                <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-1.5">
                  <div><p className="text-[9px] uppercase tracking-wide text-gray-400 font-bold">Branch</p><p className="text-[11px] font-semibold text-slate-700 truncate">{viewEmp.branchLocation || '—'}</p></div>
                  <div><p className="text-[9px] uppercase tracking-wide text-gray-400 font-bold">Company</p><p className="text-[11px] font-semibold text-slate-700 truncate">{currentComp?.name || '—'}</p></div>
                  <div><p className="text-[9px] uppercase tracking-wide text-gray-400 font-bold">Joining Date</p><p className="text-[11px] font-semibold text-slate-700">{viewEmp.joinDate ? formatDate(viewEmp.joinDate) : '—'}</p></div>
                  <div><p className="text-[9px] uppercase tracking-wide text-gray-400 font-bold">Employee Type</p><p className="text-[11px] font-semibold text-slate-700 truncate">{viewEmp.employmentType || '—'}</p></div>
                  <div><p className="text-[9px] uppercase tracking-wide text-gray-400 font-bold">Employment Class</p><p className="text-[11px] font-semibold text-slate-700 truncate">{viewEmp.category || '—'}</p></div>
                </div>
              </div>
            </div>

            {/* Sub-Tabs Navigation */}
            <div className="flex border-b border-gray-200 gap-2.5 text-xs overflow-x-auto pb-1">
              <button onClick={() => setActiveTab('personal')} className={`pb-1.5 font-bold whitespace-nowrap transition ${activeTab === 'personal' ? 'border-b-2 border-brand-600 text-brand-600' : 'text-gray-400 hover:text-gray-600'}`}>Personal Details</button>
              <button onClick={() => setActiveTab('job')} className={`pb-1.5 font-bold whitespace-nowrap transition ${activeTab === 'job' ? 'border-b-2 border-brand-600 text-brand-600' : 'text-gray-400 hover:text-gray-600'}`}>Employment Details</button>
              <button onClick={() => setActiveTab('banking')} className={`pb-1.5 font-bold whitespace-nowrap transition ${activeTab === 'banking' ? 'border-b-2 border-brand-600 text-brand-600' : 'text-gray-400 hover:text-gray-600'}`}>Payroll & Banking</button>
              <button onClick={() => setActiveTab('bonus')} className={`pb-1.5 font-bold whitespace-nowrap transition ${activeTab === 'bonus' ? 'border-b-2 border-brand-600 text-brand-600' : 'text-gray-400 hover:text-gray-600'}`}>Bonus</button>
              <button onClick={() => setActiveTab('compliance')} className={`pb-1.5 font-bold whitespace-nowrap transition ${activeTab === 'compliance' ? 'border-b-2 border-brand-600 text-brand-600' : 'text-gray-400 hover:text-gray-600'}`}>Compliance IDs</button>
              <button onClick={() => setActiveTab('documents')} className={`pb-1.5 font-bold whitespace-nowrap transition ${activeTab === 'documents' ? 'border-b-2 border-brand-600 text-brand-600' : 'text-gray-400 hover:text-gray-600'}`}>Documents</button>
              <button onClick={() => setActiveTab('nominees')} className={`pb-1.5 font-bold whitespace-nowrap transition ${activeTab === 'nominees' ? 'border-b-2 border-brand-600 text-brand-600' : 'text-gray-400 hover:text-gray-600'}`}>Nominees</button>
              <button onClick={() => setActiveTab('leaves')} className={`pb-1.5 font-bold whitespace-nowrap transition ${activeTab === 'leaves' ? 'border-b-2 border-brand-600 text-brand-600' : 'text-gray-400 hover:text-gray-600'}`}>Leave History</button>
            </div>

            {/* Nominees tab — dedicated nominee management (separate tables) */}
            {activeTab === 'nominees' && (
              <NomineesTab employeeId={viewEmp.id} employeeName={viewEmp.name} role={role} />
            )}

            {/* Sub-Tabs View Content */}
            {activeTab === 'personal' && (
              <div className="space-y-3.5">
                <div className="grid grid-cols-2 gap-3 p-1">
                  <div><p className="text-[10px] text-gray-400">First Name</p><p className="font-semibold text-slate-800 mt-0.5">{viewEmp.firstName || viewEmp.name.split(' ')[0]}</p></div>
                  <div><p className="text-[10px] text-gray-400">Last Name / Surname</p><p className="font-semibold text-slate-800 mt-0.5">{viewEmp.lastName || '—'}</p></div>
                  <div><p className="text-[10px] text-gray-400">Name on Aadhaar</p><p className="font-semibold text-slate-800 mt-0.5">{viewEmp.aadhaarName || viewEmp.name}</p></div>
                  <div><p className="text-[10px] text-gray-400">Gender</p><p className="font-semibold text-slate-800 mt-0.5">{viewEmp.gender || 'Female'}</p></div>
                  <div><p className="text-[10px] text-gray-400">Date of Birth</p><p className="font-semibold text-slate-800 mt-0.5">{formatDate(viewEmp.dob)}</p></div>
                  <div><p className="text-[10px] text-gray-400">Marital Status</p><p className="font-semibold text-slate-800 mt-0.5">{viewEmp.maritalStatus || 'UNMARRIED'}</p></div>
                  <div><p className="text-[10px] text-gray-400">Nationality</p><p className="font-semibold text-slate-800 mt-0.5">{viewEmp.nationality || DEFAULT_COUNTRY}</p></div>
                  <div><p className="text-[10px] text-gray-400">Emergency Parent/Spouse</p><p className="font-semibold text-slate-800 mt-0.5">{viewEmp.fatherSpouseName || '—'} ({viewEmp.relationType || 'FATHER'})</p></div>
                </div>

                <div className="border-t border-slate-700/50 pt-3.5 space-y-3 p-1">
                  <div>
                    <p className="text-[10px] text-gray-400">Present Residential Address</p>
                    <p className="font-semibold text-slate-800 mt-1 leading-relaxed bg-slate-50 p-2 rounded border border-slate-200">{viewEmp.presentAddress || 'No present address recorded.'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400">Permanent Residential Address</p>
                    <p className="font-semibold text-slate-800 mt-1 leading-relaxed bg-slate-50 p-2 rounded border border-slate-200">{viewEmp.permanentAddress || 'No permanent address recorded.'}</p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'job' && (
              <div className="grid grid-cols-2 gap-3 p-1">
                <div><p className="text-[10px] text-gray-400">Branch Location</p><p className="font-semibold text-slate-800 mt-0.5">{viewEmp.branchLocation || 'AHMEDABAD'}</p></div>
                <div><p className="text-[10px] text-gray-400">Employment Class</p><p className="font-semibold text-slate-800 mt-0.5">{viewEmp.category || 'Skilled'}</p></div>
                <div><p className="text-[10px] text-gray-400">Type of Employment</p><p className="font-semibold text-slate-800 mt-0.5">{viewEmp.employmentType || 'CONTRACTUAL'}</p></div>
                <div><p className="text-[10px] text-gray-400">Date of Joining</p><p className="font-semibold text-slate-800 mt-0.5">{formatDate(viewEmp.joinDate)}</p></div>
                <div><p className="text-[10px] text-gray-400">Biometric Code</p><p className="font-semibold text-slate-800 mt-0.5">{viewEmp.biometricId || 'Not Assigned'}</p></div>
                <div><p className="text-[10px] text-gray-400">Monthly Basic Salary</p><p className="font-bold text-slate-800 mt-0.5">₹{(viewEmp.salary || 0).toLocaleString()}</p></div>
                {viewEmp.exitDate && (
                  <>
                    <div><p className="text-[10px] text-gray-400">Exit Date</p><p className="font-semibold text-red-600 mt-0.5">{formatDate(viewEmp.exitDate)}</p></div>
                    <div><p className="text-[10px] text-gray-400">Exit Reason</p><p className="font-semibold text-slate-800 mt-0.5">{viewEmp.exitReason || '—'}</p></div>
                  </>
                )}
              </div>
            )}

            {/* ── Dedicated Bonus tab — config snapshot + history + quick actions ── */}
            {activeTab === 'bonus' && (
              <div className="space-y-4 p-1">
                {/* Current Bonus Information */}
                <div className="rounded-xl border border-slate-200 bg-white p-3.5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Gift size={15} className="text-amber-600" />
                      <p className="text-sm font-bold text-slate-800">Current Bonus Information</p>
                    </div>
                    <Badge variant={viewEmp.bonusApplicable ? 'green' : 'gray'} dot>{viewEmp.bonusApplicable ? 'Active' : 'Not Applicable'}</Badge>
                  </div>
                  {viewEmp.bonusApplicable ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div><p className="text-[10px] text-gray-400">Bonus Type</p><p className="font-semibold text-slate-800 mt-0.5">{viewEmp.bonusType || '—'}</p></div>
                      <div><p className="text-[10px] text-gray-400">Calculation Method</p><p className="font-semibold text-slate-800 mt-0.5">{viewEmp.bonusCalcMethod || '—'}</p></div>
                      <div><p className="text-[10px] text-gray-400">{viewEmp.bonusCalcMethod === 'Percentage of Salary' ? 'Percentage' : 'Amount'}</p><p className="font-bold text-amber-700 mt-0.5">{viewEmp.bonusCalcMethod === 'Percentage of Salary' ? `${viewEmp.bonusValue || 0}%` : `₹${(viewEmp.bonusValue || 0).toLocaleString('en-IN')}`}</p></div>
                      <div><p className="text-[10px] text-gray-400">Effective Date</p><p className="font-semibold text-slate-800 mt-0.5">{viewEmp.bonusEffectiveDate ? formatDate(viewEmp.bonusEffectiveDate) : '—'}</p></div>
                      <div><p className="text-[10px] text-gray-400">End Date</p><p className="font-semibold text-slate-800 mt-0.5">{viewEmp.bonusEndDate ? formatDate(viewEmp.bonusEndDate) : '—'}</p></div>
                      <div><p className="text-[10px] text-gray-400">Status</p><p className="font-semibold text-emerald-600 mt-0.5">Active</p></div>
                      {viewEmp.bonusNotes && <div className="col-span-2 sm:col-span-3"><p className="text-[10px] text-gray-400">Notes</p><p className="font-medium text-slate-700 mt-0.5">{viewEmp.bonusNotes}</p></div>}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">No recurring bonus configured. Use “Edit Bonus” to set one up, or “Add Bonus” to issue a one-time bonus.</p>
                  )}
                </div>

                {/* Quick Actions — withdrawn on a locked previous employee. */}
                {canEdit && !isViewLocked && (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" icon={<Plus size={13} />} onClick={() => setAddBonusOpen(true)}>Add Bonus</Button>
                    <Button size="sm" variant="outline" icon={<Edit2 size={13} />} onClick={() => { const emp = viewEmp; setViewEmp(null); handleStartEdit(emp); }}>Edit Bonus</Button>
                    <Button size="sm" variant="outline" icon={<XCircle size={13} />} onClick={handleDisableBonus} disabled={!viewEmp.bonusApplicable}>Disable Bonus</Button>
                  </div>
                )}

                {/* Bonus History Table */}
                <div>
                  <p className="text-xs font-bold text-slate-700 mb-2">Bonus History ({empBonusHistory.length})</p>
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400">
                        <tr>
                          <th className="px-3 py-2 text-left">Date</th>
                          <th className="px-3 py-2 text-left">Bonus Type</th>
                          <th className="px-3 py-2 text-right">Amount</th>
                          <th className="px-3 py-2 text-left">Applied By</th>
                          <th className="px-3 py-2 text-left">Remarks</th>
                          <th className="px-3 py-2 text-left">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {empBonusHistory.length === 0 ? (
                          <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400 italic">No bonuses issued yet.</td></tr>
                        ) : empBonusHistory.map((b: any) => (
                          <tr key={b.id} className="hover:bg-slate-50">
                            <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{b.payrollMonth ? `${b.payrollMonth} ${b.payrollYear || ''}` : formatDate(b.createdAt)}</td>
                            <td className="px-3 py-2 font-semibold text-slate-800">{b.bonusType}</td>
                            <td className="px-3 py-2 text-right font-bold text-amber-700">₹{(b.amount || 0).toLocaleString('en-IN')}</td>
                            <td className="px-3 py-2 text-slate-600">{b.approvedByName || b.createdByName || '—'}</td>
                            <td className="px-3 py-2 text-slate-500">{b.reason || '—'}</td>
                            <td className="px-3 py-2"><Badge variant={b.status === 'Cancelled' ? 'red' : b.status === 'Paid' ? 'green' : 'blue'}>{b.status}</Badge></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'banking' && (
              <div className="space-y-3.5 p-1">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-[10px] text-gray-400">Bank Name</p>
                    <p className="font-bold text-slate-800 mt-0.5">{viewEmp.bankName || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400">Bank Account Number</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="font-semibold text-slate-800">{getMaskedValue(viewEmp.accountNumber, 'accountNumber', viewEmp.id)}</span>
                      {viewEmp.accountNumber && (
                        <button onClick={() => toggleFieldMask(viewEmp.id, 'accountNumber')} className="text-slate-400 p-0.5">
                          {unmaskedField[`${viewEmp.id}-accountNumber`] ? <EyeOff size={10} /> : <Eye size={10} />}
                        </button>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400">IFSC Code</p>
                    <p className="font-semibold text-slate-800 mt-0.5 font-mono">{viewEmp.ifsc || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400">Account Holder</p>
                    <p className="font-semibold text-slate-800 mt-0.5">{(viewEmp as any).accountHolderName || viewEmp.name || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400">Branch</p>
                    <p className="font-semibold text-slate-800 mt-0.5">{(viewEmp as any).bankBranch || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400">City</p>
                    <p className="font-semibold text-slate-800 mt-0.5">{(viewEmp as any).bankCity || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400">District</p>
                    <p className="font-semibold text-slate-800 mt-0.5">{(viewEmp as any).bankDistrict || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400">State</p>
                    <p className="font-semibold text-slate-800 mt-0.5">{(viewEmp as any).bankState || '—'}</p>
                  </div>
                </div>

                <div className="border-t border-slate-700/50 pt-3.5">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[10px] text-gray-400">Monthly Basic Salary</p>
                      <p className="font-bold text-slate-800 mt-0.5">₹{(viewEmp.salary || 0).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400">PF Contribution Target</p>
                      <p className="font-semibold text-slate-800 mt-0.5">Eligible (Under Master Scheme)</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'compliance' && (
              <div className="grid grid-cols-2 gap-3 p-1">
                <div>
                  <p className="text-[10px] text-gray-400">Aadhaar Number</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="font-semibold text-slate-800 font-mono tracking-wider">{getMaskedValue(viewEmp.aadhaar, 'aadhaar', viewEmp.id, formatAadhaar)}</span>
                    {viewEmp.aadhaar && (
                      <button onClick={() => toggleFieldMask(viewEmp.id, 'aadhaar')} className="text-slate-400 p-0.5">
                        {unmaskedField[`${viewEmp.id}-aadhaar`] ? <EyeOff size={10} /> : <Eye size={10} />}
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400">Permanent Account No (PAN)</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="font-semibold text-slate-800 font-mono">{getMaskedValue(viewEmp.pan, 'pan', viewEmp.id, formatPan)}</span>
                    {viewEmp.pan && (
                      <button onClick={() => toggleFieldMask(viewEmp.id, 'pan')} className="text-slate-400 p-0.5">
                        {unmaskedField[`${viewEmp.id}-pan`] ? <EyeOff size={10} /> : <Eye size={10} />}
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400">Provident Fund (PF) No</p>
                  <p className="font-semibold text-slate-800 mt-0.5">{viewEmp.pfNumber || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400">Universal Account No (UAN)</p>
                  <p className="font-semibold text-slate-800 mt-0.5">{viewEmp.uan || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400">ESIC IP Number</p>
                  <p className="font-semibold text-slate-800 mt-0.5">{viewEmp.esic || (viewEmp as any).esiNumber || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400">Workmen Compensation (WC) Policy No.</p>
                  <p className="font-semibold text-slate-800 mt-0.5">{(viewEmp as any).wcPolicyNumber || '—'}</p>
                </div>
              </div>
            )}

            {activeTab === 'documents' && (
              <div className="space-y-3 p-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {/* Photo Card */}
                  <div className="bg-slate-900/20 border border-slate-700/50 rounded-xl p-3 flex flex-col justify-between hover:shadow-md hover:border-brand-500/30 transition-all shadow-sm">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Passport Photo</span>
                        <Badge variant={viewEmp.photoUpload ? 'green' : 'amber'}>
                          {viewEmp.photoUpload ? 'Verified' : 'Pending'}
                        </Badge>
                      </div>
                      <p className="text-[9px] text-slate-400 mt-0.5">Primary photo identification</p>

                      <div className="my-3 flex justify-center bg-slate-900/40 border-2 border-dashed border-slate-700/50 rounded-lg h-20 items-center overflow-hidden transition-all">
                        {viewEmp.photoUpload ? (
                          <img src={viewEmp.photoUpload} alt="Passport Photo" className="h-full object-contain rounded" />
                        ) : (
                          <div className="text-center text-slate-500 py-2">
                            <Users size={20} className="mx-auto text-slate-500 opacity-60 block mb-1" />
                            <span className="text-[9px]">No photo uploaded</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex justify-between items-center gap-1.5 pt-2 border-t border-slate-700/50">
                      {viewEmp.photoUpload ? (
                        <>
                          <a href={viewEmp.photoUpload} download={`${viewEmp.name}_photo.jpg`} className="px-2 py-0.5 bg-slate-800/40 hover:bg-slate-700/60 border border-slate-700/50 hover:border-brand-500/50 text-slate-200 rounded text-[9px] font-bold transition">
                            Download
                          </a>
                          {canEditDocs && (
                            <button onClick={() => document.getElementById('upload-photoUpload')?.click()} className="px-2 py-0.5 bg-slate-800/40 hover:bg-slate-700/60 border border-slate-700/50 hover:border-brand-500/50 text-slate-200 rounded text-[9px] font-bold transition">
                              Replace
                            </button>
                          )}
                        </>
                      ) : (
                        canEditDocs && (
                          <button onClick={() => document.getElementById('upload-photoUpload')?.click()} className="w-full py-1 bg-brand-600 hover:bg-brand-700 text-white rounded text-[9px] font-bold transition flex items-center justify-center gap-1">
                            <Upload size={10} /> Upload
                          </button>
                        )
                      )}
                      {canEditDocs && <input type="file" id="upload-photoUpload" className="hidden" accept="image/*" onChange={e => handleFileChange(e, 'photoUpload')} />}
                    </div>
                  </div>

                  {/* Aadhaar Card */}
                  <div className="bg-slate-900/20 border border-slate-700/50 rounded-xl p-3 flex flex-col justify-between hover:shadow-md hover:border-brand-500/30 transition-all shadow-sm">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Aadhaar Card</span>
                        <Badge variant={viewEmp.aadhaarUpload ? 'green' : 'amber'}>
                          {viewEmp.aadhaarUpload ? 'Verified' : 'Pending'}
                        </Badge>
                      </div>
                      <p className="text-[9px] text-slate-400 mt-0.5">Government identification scanner</p>

                      <div className="my-3 flex justify-center bg-slate-900/40 border-2 border-dashed border-slate-700/50 rounded-lg h-20 items-center overflow-hidden transition-all">
                        {viewEmp.aadhaarUpload ? (
                          <div className="text-center text-emerald-600 py-2">
                            <ShieldCheck size={20} className="mx-auto text-emerald-500" />
                            <a href={viewEmp.aadhaarUpload} target="_blank" rel="noreferrer" className="text-[9px] font-bold text-brand-600 hover:underline block mt-1">View Document PDF</a>
                          </div>
                        ) : (
                          <div className="text-center text-slate-500 py-2">
                            <FileSpreadsheet size={20} className="mx-auto text-slate-500 opacity-60 block mb-1" />
                            <span className="text-[9px]">Pending compliance upload</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex justify-between items-center gap-1.5 pt-2 border-t border-slate-700/50">
                      {viewEmp.aadhaarUpload ? (
                        <>
                          <a href={viewEmp.aadhaarUpload} download={`${viewEmp.name}_aadhaar.pdf`} className="px-2 py-0.5 bg-slate-800/40 hover:bg-slate-700/60 border border-slate-700/50 hover:border-brand-500/50 text-slate-200 rounded text-[9px] font-bold transition">
                            Download
                          </a>
                          {canEditDocs && (
                            <button onClick={() => document.getElementById('upload-aadhaarUpload')?.click()} className="px-2 py-0.5 bg-slate-800/40 hover:bg-slate-700/60 border border-slate-700/50 hover:border-brand-500/50 text-slate-200 rounded text-[9px] font-bold transition">
                              Replace
                            </button>
                          )}
                        </>
                      ) : (
                        canEditDocs && (
                          <button onClick={() => document.getElementById('upload-aadhaarUpload')?.click()} className="w-full py-1 bg-brand-600 hover:bg-brand-700 text-white rounded text-[9px] font-bold transition flex items-center justify-center gap-1">
                            <Upload size={10} /> Upload
                          </button>
                        )
                      )}
                      {canEditDocs && <input type="file" id="upload-aadhaarUpload" className="hidden" accept=".pdf,image/*" onChange={e => handleFileChange(e, 'aadhaarUpload')} />}
                    </div>
                  </div>

                  {/* PAN Card */}
                  <div className="bg-slate-900/20 border border-slate-700/50 rounded-xl p-3 flex flex-col justify-between hover:shadow-md hover:border-brand-500/30 transition-all shadow-sm">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">PAN Card</span>
                        <Badge variant={viewEmp.panUpload ? 'green' : 'amber'}>
                          {viewEmp.panUpload ? 'Verified' : 'Pending'}
                        </Badge>
                      </div>
                      <p className="text-[9px] text-slate-400 mt-0.5">Tax division registration card</p>

                      <div className="my-3 flex justify-center bg-slate-900/40 border-2 border-dashed border-slate-700/50 rounded-lg h-20 items-center overflow-hidden transition-all">
                        {viewEmp.panUpload ? (
                          <div className="text-center text-emerald-600 py-2">
                            <ShieldCheck size={20} className="mx-auto text-emerald-500" />
                            <a href={viewEmp.panUpload} target="_blank" rel="noreferrer" className="text-[9px] font-bold text-brand-600 hover:underline block mt-1">View Document PDF</a>
                          </div>
                        ) : (
                          <div className="text-center text-slate-500 py-2">
                            <FileSpreadsheet size={20} className="mx-auto text-slate-500 opacity-60 block mb-1" />
                            <span className="text-[9px]">Pending compliance upload</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex justify-between items-center gap-1.5 pt-2 border-t border-slate-700/50">
                      {viewEmp.panUpload ? (
                        <>
                          <a href={viewEmp.panUpload} download={`${viewEmp.name}_pan.pdf`} className="px-2 py-0.5 bg-slate-800/40 hover:bg-slate-700/60 border border-slate-700/50 hover:border-brand-500/50 text-slate-200 rounded text-[9px] font-bold transition">
                            Download
                          </a>
                          {canEditDocs && (
                            <button onClick={() => document.getElementById('upload-panUpload')?.click()} className="px-2 py-0.5 bg-slate-800/40 hover:bg-slate-700/60 border border-slate-700/50 hover:border-brand-500/50 text-slate-200 rounded text-[9px] font-bold transition">
                              Replace
                            </button>
                          )}
                        </>
                      ) : (
                        canEditDocs && (
                          <button onClick={() => document.getElementById('upload-panUpload')?.click()} className="w-full py-1 bg-brand-600 hover:bg-brand-700 text-white rounded text-[9px] font-bold transition flex items-center justify-center gap-1">
                            <Upload size={10} /> Upload
                          </button>
                        )
                      )}
                      {canEditDocs && <input type="file" id="upload-panUpload" className="hidden" accept=".pdf,image/*" onChange={e => handleFileChange(e, 'panUpload')} />}
                    </div>
                  </div>

                  {/* Signature Scan */}
                  <div className="bg-slate-900/20 border border-slate-700/50 rounded-xl p-3 flex flex-col justify-between hover:shadow-md hover:border-brand-500/30 transition-all shadow-sm">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Signature</span>
                        <Badge variant={viewEmp.signatureUpload ? 'green' : 'amber'}>
                          {viewEmp.signatureUpload ? 'Verified' : 'Pending'}
                        </Badge>
                      </div>
                      <p className="text-[9px] text-slate-400 mt-0.5">Official signature record</p>

                      <div className="my-3 flex justify-center bg-slate-900/40 border-2 border-dashed border-slate-700/50 rounded-lg h-20 items-center overflow-hidden transition-all">
                        {viewEmp.signatureUpload ? (
                          <img src={viewEmp.signatureUpload} alt="Signature Record" className="h-full object-contain rounded" />
                        ) : (
                          <div className="text-center text-slate-500 py-2">
                            <Edit2 size={20} className="mx-auto text-slate-500 opacity-60 block mb-1" />
                            <span className="text-[9px]">No signature uploaded</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex justify-between items-center gap-1.5 pt-2 border-t border-slate-700/50">
                      {viewEmp.signatureUpload ? (
                        <>
                          <a href={viewEmp.signatureUpload} download={`${viewEmp.name}_signature.jpg`} className="px-2 py-0.5 bg-slate-800/40 hover:bg-slate-700/60 border border-slate-700/50 hover:border-brand-500/50 text-slate-200 rounded text-[9px] font-bold transition">
                            Download
                          </a>
                          {canEditDocs && (
                            <button onClick={() => document.getElementById('upload-signatureUpload')?.click()} className="px-2 py-0.5 bg-slate-800/40 hover:bg-slate-700/60 border border-slate-700/50 hover:border-brand-500/50 text-slate-200 rounded text-[9px] font-bold transition">
                              Replace
                            </button>
                          )}
                        </>
                      ) : (
                        canEditDocs && (
                          <button onClick={() => document.getElementById('upload-signatureUpload')?.click()} className="w-full py-1 bg-brand-600 hover:bg-brand-700 text-white rounded text-[9px] font-bold transition flex items-center justify-center gap-1">
                            <Upload size={10} /> Upload
                          </button>
                        )
                      )}
                      {canEditDocs && <input type="file" id="upload-signatureUpload" className="hidden" accept="image/*" onChange={e => handleFileChange(e, 'signatureUpload')} />}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'leaves' && (
              <div className="space-y-3 p-1 font-sans">
                <div className="flex items-center justify-between border-b border-slate-150 pb-2">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Absence Dossier Log</span>
                  <span className="text-[9px] bg-brand-50 text-brand-700 px-2 py-0.5 rounded font-bold font-mono">
                    Total recorded: {empLeavesHistory.length}
                  </span>
                </div>

                {empLeavesHistory.length === 0 ? (
                  <div className="text-center py-6 text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    No leaves logged for this employee context.
                  </div>
                ) : (
                  <div className="border border-slate-150 rounded-xl overflow-hidden shadow-2xs">
                    <Table>
                      <Thead>
                        <tr className="bg-slate-50 text-[9px] border-b border-slate-150">
                          <Th className="py-1 px-2">Type</Th>
                          <Th className="py-1 px-2">From - To</Th>
                          <Th className="py-1 px-2">Days</Th>
                          <Th className="py-1 px-2">Status</Th>
                        </tr>
                      </Thead>
                      <Tbody>
                        {empLeavesHistory.map(l => (
                          <Tr key={l.id} className="text-[10px]">
                            <Td className="py-1 px-2 font-semibold text-slate-800">{l.leaveType}</Td>
                            <Td className="py-1 px-2 text-slate-500">{l.fromDate} to {l.toDate}</Td>
                            <Td className="py-1 px-2 font-bold text-slate-800">{l.days}d</Td>
                            <Td className="py-1 px-2">
                              <Badge variant={l.status === 'Approved' ? 'green' : l.status === 'Pending' ? 'amber' : 'red'}>
                                {l.status}
                              </Badge>
                            </Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Add one-time bonus (festival / performance / custom) to an employee's history */}
      <Modal
        open={addBonusOpen}
        onClose={() => setAddBonusOpen(false)}
        title={`Add Bonus${viewEmp ? ` — ${viewEmp.name}` : ''}`}
        size="md"
        footer={
          <div className="flex justify-end gap-2 w-full">
            <Button variant="outline" onClick={() => setAddBonusOpen(false)} disabled={bonusBusy}>Cancel</Button>
            <Button icon={<Gift size={14} />} onClick={handleAddBonus} disabled={bonusBusy}>{bonusBusy ? 'Adding…' : 'Add Bonus'}</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">Bonus Type</label>
              <Select value={bonusForm.bonusType} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setBonusForm(f => ({ ...f, bonusType: e.target.value }))}
                options={['Festival', 'Performance', 'Custom'].map(t => ({ value: t, label: t }))} />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">Calculation Method</label>
              <Select value={bonusForm.calcMethod} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setBonusForm(f => ({ ...f, calcMethod: e.target.value }))}
                options={['Fixed Amount', 'Percentage of Salary'].map(m => ({ value: m, label: m }))} />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">{bonusForm.calcMethod.includes('Percentage') ? 'Percentage of Salary (%)' : 'Bonus Amount (₹)'}</label>
            <Input type="number" min="0" value={bonusForm.value} onChange={e => setBonusForm(f => ({ ...f, value: e.target.value }))}
              placeholder={bonusForm.calcMethod.includes('Percentage') ? 'e.g. 10' : 'e.g. 5000'} />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Remarks / Reason <span className="text-slate-400">(e.g. Diwali, performance)</span></label>
            <Input value={bonusForm.reason} onChange={e => setBonusForm(f => ({ ...f, reason: e.target.value }))} placeholder="Optional" />
          </div>
          <p className="text-[11px] text-slate-400">This records a one-time bonus in the employee's history. To apply it to a specific payroll month for payout, use Payroll → Apply Bonus.</p>
        </div>
      </Modal>

      {/* Biometric Code bulk import (maps machine codes to employees; no sync) */}
      <BiometricImportModal
        open={bioImportOpen}
        onClose={() => setBioImportOpen(false)}
        role={role}
        companyId={parentCompanyId || activeCompanyId}
        onDone={refreshAfterBiometric}
      />

      {/* Bulk Excel Import Dialog */}
      <Modal open={importOpen} onClose={resetImporter} title={importResult ? 'Import Completed' : 'Enterprise Excel Importer'} size={importResult ? 'lg' : 'md'}>
        <div className="space-y-4 text-left text-xs font-sans">
        {importResult ? (
          /* ── HONEST completion summary + per-row import log ─────────────── */
          <div className="space-y-4">
            <div className={`p-3 rounded-lg border ${importResult.createdN + importResult.updatedN === 0 ? 'bg-rose-50 border-rose-200 text-rose-800' : (importResult.skippedN + importResult.failedN > 0 ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800')}`}>
              <h4 className="font-bold text-[13px]">
                {importResult.createdN + importResult.updatedN === 0
                  ? 'No employees were added'
                  : 'Employees committed to the database'}
              </h4>
              <p className="mt-0.5 text-[11px] leading-relaxed">
                Processed {importResult.total} row{importResult.total === 1 ? '' : 's'}. The list and counts below reflect the database — they have already been refreshed.
              </p>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: 'Imported', n: importResult.createdN, cls: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
                { label: 'Updated', n: importResult.updatedN, cls: 'text-blue-700 bg-blue-50 border-blue-200' },
                { label: 'Skipped', n: importResult.skippedN, cls: 'text-amber-700 bg-amber-50 border-amber-200' },
                { label: 'Failed', n: importResult.failedN, cls: 'text-rose-700 bg-rose-50 border-rose-200' },
              ].map((s) => (
                <div key={s.label} className={`rounded-lg border p-2.5 text-center ${s.cls}`}>
                  <div className="text-xl font-extrabold tabular-nums">{s.n}</div>
                  <div className="text-[10px] font-bold uppercase tracking-wide">{s.label}</div>
                </div>
              ))}
            </div>
            {importResult.results.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="font-bold text-slate-700 uppercase tracking-wide text-[10px]">Import Log ({importResult.results.length} rows)</p>
                  <Button size="xs" variant="outline" icon={<Download size={12} />} onClick={downloadImportLog}>Download Log</Button>
                </div>
                <div className="border border-slate-200 rounded max-h-64 overflow-y-auto">
                  <table className="w-full text-[10px] text-slate-700 border-collapse text-left">
                    <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 font-bold">
                      <tr><th className="p-1.5">#</th><th className="p-1.5">Employee</th><th className="p-1.5">Code</th><th className="p-1.5">Status</th><th className="p-1.5">Reason</th></tr>
                    </thead>
                    <tbody>
                      {importResult.results.map((r, i) => {
                        const v: any = r.status === 'created' ? 'green' : r.status === 'updated' ? 'blue' : r.status === 'skipped' ? 'amber' : 'red';
                        return (
                          <tr key={i} className="border-b border-slate-100">
                            <td className="p-1.5 tabular-nums text-slate-400">{r.row}</td>
                            <td className="p-1.5 font-semibold">{r.name}</td>
                            <td className="p-1.5">{r.employeeId || '—'}</td>
                            <td className="p-1.5"><Badge variant={v}>{r.status}</Badge></td>
                            <td className="p-1.5 text-slate-500">{r.reason || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <Button variant="outline" onClick={() => setImportResult(null)}>Import Another File</Button>
              <Button icon={<CheckCircle2 size={12} />} onClick={resetImporter}>Done</Button>
            </div>
          </div>
        ) : (
        <>
          <div className="p-3 bg-brand-50 border border-brand-200 text-brand-800 rounded-lg">
            <h4 className="font-bold flex items-center gap-1.5 text-[11px] uppercase tracking-wide">Excel Master Import Protocol</h4>
            <p className="mt-1 leading-relaxed">
              Drop your real employee master dataset (`.xlsx`) to parse all location sheets (AHMEDABAD, BHAVNAGAR, RAJKOT, SIDDHPUR) and synchronise them dynamically.
            </p>
          </div>

          {/* Plan cap rejected the whole file — nothing was imported. */}
          {importBlocked && (
            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg space-y-2">
              <h4 className="font-bold flex items-center gap-1.5 text-[11px] uppercase tracking-wide">
                <AlertTriangle size={13} /> Import Blocked — Employee Limit
              </h4>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Current Employees', n: importBlocked.current },
                  { label: 'Import File', n: importBlocked.importCount },
                  { label: 'Available Slots', n: importBlocked.availableSlots },
                ].map((s) => (
                  <div key={s.label} className="rounded-md border border-amber-200 bg-white/70 px-2 py-1.5">
                    <p className="text-[9px] uppercase tracking-wide text-amber-700 font-bold">{s.label}</p>
                    <p className="text-[15px] font-extrabold text-amber-900 leading-tight">{s.n}</p>
                  </div>
                ))}
              </div>
              <p className="leading-relaxed">
                Your <b>{importBlocked.plan}</b> plan allows up to <b>{importBlocked.limit}</b> active employees.
                {importBlocked.availableSlots > 0
                  ? <> Only <b>{importBlocked.availableSlots}</b> more employee{importBlocked.availableSlots === 1 ? '' : 's'} can be added.</>
                  : <> No further employees can be added.</>} Nothing was imported —
                please reduce the file or upgrade your plan to continue.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setImportBlocked(null)}>Dismiss</Button>
                {/* Reuse the global upgrade dialog (App owns the Plans route) — the
                    same event apiClient fires on any EMPLOYEE_LIMIT_REACHED 403. */}
                <Button onClick={() => window.dispatchEvent(new CustomEvent('hrms:employee-limit', { detail: { plan: importBlocked.plan, limit: importBlocked.limit, current: importBlocked.current } }))}>View Plans</Button>
              </div>
            </div>
          )}



          {/* Drag & Drop File Container */}
          <div
            onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleExcelDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all shadow-sm ${isDragOver ? 'border-brand-500 bg-brand-500/10' : 'border-slate-700/50 hover:border-brand-500/50 bg-slate-900/20 hover:bg-slate-800/40'
              }`}
          >
            <input type="file" ref={fileInputRef} onChange={handleExcelSelect} accept=".xlsx,.xls" className="hidden" />
            <FileSpreadsheet className="mx-auto text-slate-500 opacity-60 mb-2" size={32} />
            <p className="font-bold text-slate-200">Drag & Drop Employee Master File Here</p>
            <p className="text-[10px] text-slate-400 mt-1">Accepts standard .xlsx and .xls sheets up to 10MB</p>
          </div>

          {/* Execution logs */}
          {importLogs.length > 0 && (
            <div className="space-y-2">
              <p className="font-bold text-slate-700 uppercase tracking-wide text-[10px]">Parser execution logs:</p>
              <div className="bg-slate-900 text-slate-200 font-mono p-3 rounded text-[10px] max-h-36 overflow-y-auto leading-relaxed">
                {importLogs.map((log, i) => (
                  <p key={i} className="flex items-start gap-1"><ChevronRight size={10} className="mt-0.5 text-brand-400 shrink-0" /> {log}</p>
                ))}
              </div>
            </div>
          )}

          {/* Preview grid */}
          {importedRows.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="font-bold text-slate-700 uppercase tracking-wide text-[10px]">Dataset Preview ({importedRows.length} ready rows):</p>
                <Badge variant="green" dot>Verified</Badge>
              </div>
              <div className="border border-slate-200 rounded max-h-40 overflow-y-auto">
                <table className="w-full text-[10px] text-slate-700 border-collapse text-left">
                  <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 font-bold">
                    <tr>
                      <th className="p-1.5">Code</th>
                      <th className="p-1.5">Name</th>
                      <th className="p-1.5">Branch</th>
                      <th className="p-1.5">Designation</th>
                      <th className="p-1.5">Bank Name</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importedRows.slice(0, 10).map((row, idx) => (
                      <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="p-1.5 font-bold text-slate-800">{row.employeeId}</td>
                        <td className="p-1.5">{row.name}</td>
                        <td className="p-1.5 font-semibold">{row.branchLocation}</td>
                        <td className="p-1.5">{row.designation}</td>
                        <td className="p-1.5 font-medium">{row.bankName}</td>
                      </tr>
                    ))}
                    {importedRows.length > 10 && (
                      <tr><td colSpan={5} className="text-center p-1.5 text-slate-400 bg-slate-50">... and {importedRows.length - 10} more rows</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <Button variant="outline" onClick={() => { setImportedRows([]); setImportLogs([]); }}>Reset Importer</Button>
                <Button icon={<CheckCircle2 size={12} />} onClick={() => setIsConfirmingBulk(true)}>Commit Bulk Import</Button>
              </div>
            </div>
          )}
        </>
        )}
        </div>
      </Modal>

      {/* Add Employee Master — dedicated full-page registration wizard. Doubles
          as the Re-Onboarding page: same steps, prefilled from the previous
          record, submitting to the re-onboard endpoint. */}
      <Modal
        open={addOpen}
        onClose={closeAddWizard}
        title={reOnboardSource ? 'Re-Onboard Employee' : 'Register Master Employee File'}
        variant="page"
        breadcrumbs={[{ label: 'Employees', onClick: closeAddWizard }, { label: reOnboardSource ? 'Re-Onboard Employee' : 'Register Employee' }]}
        subtitle={reOnboardSource
          ? `Review the details carried over from ${reOnboardSource.employeeId}. Submitting creates a new active record.`
          : 'Complete all steps to create the employee master file.'}
        context={form.branchLocation ? `Branch: ${form.branchLocation}` : undefined}
        size="md"
        footer={
          <div className="flex items-center justify-between w-full gap-2">
            <div>
              {/* Back is routed through the same gate as the step tabs. It is
                  normally allowed (the previous step must be complete to have
                  got here), but if that step was since invalidated this refuses
                  rather than dropping the user onto a locked screen. */}
              {activeTab !== 'personal' && (
                <Button variant="outline" onClick={() => { const i = ADD_STEPS.indexOf(activeTab as any); if (i > 0) goToAddStep(ADD_STEPS[i - 1]); }}>← Back</Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={closeAddWizard}>Cancel</Button>
              {/* Re-onboarding is a CREATE, so it follows the create permission.
                  Both actions are gated: the final step on EVERY step's rules,
                  intermediate steps on their own. `blocked` styles the button as
                  disabled but keeps the click, which reports what is missing. */}
              {(reOnboardSource ? canCreate : canEdit) && (activeTab === 'review'
                ? <Button
                    onClick={handleAddSubmit}
                    blocked={!addAllStepsValid}
                    blockedReason="Complete Personal Info and Employment Details first"
                  >{reOnboardSource ? 'Complete Re-Onboarding' : 'Complete Registration'}</Button>
                : <Button
                    onClick={handleSaveContinue}
                    blocked={!addGate.isValid}
                    blockedReason={addGate.blockedReason}
                  >Save &amp; Continue →</Button>)}
            </div>
          </div>
        }
      >
        <div className="space-y-4 text-left text-xs font-sans">
          {reOnboardSource && (
            <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900">
              <RotateCcw size={15} className="mt-0.5 shrink-0 text-emerald-600" />
              <div>
                <p className="text-[12px] font-bold">Re-onboarding {reOnboardSource.name}</p>
                <p className="text-[11px] font-medium mt-0.5">
                  Details are carried over from the locked record <strong>{reOnboardSource.employeeId}</strong>. A new employee
                  code is issued on submit, and a fresh biometric enrolment is required. The previous record — and its
                  attendance and payroll history — stays locked and unchanged.
                </p>
              </div>
            </div>
          )}
          {stepMsg && (
            <div className="px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">✓ {stepMsg}</div>
          )}
          {/* ── Step navigation ─────────────────────────────────────────────
              Strictly sequential. A step is reachable only once EVERY earlier
              step is complete; a completed step stays reachable so it can be
              reviewed and corrected. Because completion is derived (saved AND
              still valid), correcting an early step into an invalid state
              re-locks everything after it automatically — there is no separate
              invalidation cascade to keep in sync. */}
          <div className="flex flex-wrap border-b border-gray-200 gap-x-3 gap-y-1 text-xs">
            {ADD_STEPS.map((s, i) => {
              const done = isAddStepComplete(s);
              const unlocked = isAddStepUnlocked(s);
              const current = activeTab === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => goToAddStep(s)}
                  aria-current={current ? 'step' : undefined}
                  aria-disabled={!unlocked}
                  title={unlocked ? undefined : LOCKED_STEP_MESSAGE}
                  className={`pb-1.5 font-bold transition inline-flex items-center gap-1 ${
                    current ? 'border-b-2 border-brand-600 text-brand-600'
                      : !unlocked ? 'text-slate-300 cursor-not-allowed'
                      : done ? 'text-emerald-600 hover:text-emerald-700'
                      : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  {!unlocked && <Lock size={11} className="shrink-0" />}
                  {unlocked && done && !current && <CheckCircle2 size={11} className="shrink-0" />}
                  {i + 1}. {ADD_STEP_LABELS[s]}
                </button>
              );
            })}
          </div>

          {/* Validation summary — lists this step's missing/invalid fields; click to jump */}
          {(() => {
            const entries = Object.entries(errors).filter(([k]) => (ADD_STEP_FIELD_KEYS[activeTab] || []).includes(k));
            if (entries.length === 0) return null;
            return (
              <div className="rounded-lg bg-rose-50 border border-rose-200 p-3">
                <p className="text-[12px] font-bold text-rose-700 flex items-center gap-1.5">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                  Please complete the following {entries.length === 1 ? 'field' : `${entries.length} fields`}:
                </p>
                <ul className="mt-1.5 space-y-0.5">
                  {entries.map(([k, msg]) => (
                    <li key={k}>
                      <button type="button" onClick={() => focusField(k)} className="text-[11px] text-rose-600 font-semibold hover:underline text-left flex items-start gap-1">
                        <span className="mt-px">•</span><span>{msg}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })()}

          {/* Step 6 — Nominees (staged locally; saved transactionally after the employee is created) */}
          {activeTab === 'nominees' && (
            <NomineeWizardStep value={wizardNominees} onChange={setWizardNominees} />
          )}

          {/* Step 7 — Review & Submit */}
          {activeTab === 'review' && (
            <div className="space-y-3 text-xs">
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-2">Employee</p>
                <div className="grid grid-cols-2 gap-2">
                  <div><span className="text-slate-400">Name:</span> <strong className="text-slate-800">{form.name || '—'}</strong></div>
                  <div><span className="text-slate-400">Code:</span> <strong className="text-slate-800">{form.employeeId}</strong></div>
                  <div><span className="text-slate-400">Department:</span> <strong className="text-slate-800">{form.department}</strong></div>
                  <div><span className="text-slate-400">Designation:</span> <strong className="text-slate-800">{form.designation}</strong></div>
                  <div><span className="text-slate-400">Branch:</span> <strong className="text-slate-800">{form.branchLocation || '—'}</strong></div>
                  <div><span className="text-slate-400">Join Date:</span> <strong className="text-slate-800">{formatDate(form.joinDate)}</strong></div>
                </div>
              </div>
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-2">Nominees ({wizardNominees.length})</p>
                {wizardNominees.length === 0 ? (
                  <p className="text-[11px] text-slate-500">No nominees added. You can add them after registration from the employee profile.</p>
                ) : (
                  <div className="space-y-1">
                    {wizardNominees.map((n, i) => (
                      <div key={i} className="flex items-center justify-between"><span className="text-slate-700">{n.fullName} <span className="text-slate-400">· {n.relationship}</span></span><strong className="text-brand-600">{Number(n.percentage)}%</strong></div>
                    ))}
                    <div className="flex items-center justify-between pt-1 mt-1 border-t border-slate-200"><span className="font-bold text-slate-600">Total allocation</span><strong className={wizardNominees.reduce((s, n) => s + Number(n.percentage || 0), 0) === 100 ? 'text-emerald-600' : 'text-amber-600'}>{wizardNominees.reduce((s, n) => s + Number(n.percentage || 0), 0)}%</strong></div>
                  </div>
                )}
              </div>
              <p className="text-[11px] text-slate-500">Click <strong>Complete Registration</strong> to create the employee{wizardNominees.length ? ' and save the nominees together' : ''}.</p>
            </div>
          )}

          {activeTab === 'personal' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-gray-600 mb-1">Employee Code *</label>
                  <div className="flex gap-2 mb-1.5">
                    <button type="button" onClick={() => setForm({ ...form, codeMode: 'auto', employeeId: '[ Auto Generated ]' })}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition ${form.codeMode === 'auto' ? 'bg-brand-600 border-brand-600 text-white' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                      Auto Generate
                    </button>
                    <button type="button" onClick={() => setForm({ ...form, codeMode: 'custom', employeeId: '' })}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition ${form.codeMode === 'custom' ? 'bg-brand-600 border-brand-600 text-white' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                      Custom Code
                    </button>
                  </div>
                  {form.codeMode === 'auto' ? (
                    <Input value="VE-<BRANCH>-#### (auto on save)" disabled />
                  ) : (
                    <Input id="field-employeeId" placeholder="e.g. VE-CONTRACT-001" value={form.employeeId}
                      onChange={e => setForm({ ...form, employeeId: e.target.value.toUpperCase() })} error={addErrors.employeeId} />
                  )}
                </div>
                <Input id="field-aadhaarName" label="Aadhaar Full Name *" placeholder="e.g. NAGARADE PRITI VIJAYBHAI" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} error={addErrors.aadhaarName || addErrors.name} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Input id="field-firstName" label="First Name" value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} />
                <Input id="field-middleName" label="Middle Name" value={form.middleName} onChange={e => setForm({ ...form, middleName: e.target.value })} />
                <Input id="field-lastName" label="Surname / Last Name" value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Select id="field-gender" label="Gender *" value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value })} options={[{ value: 'Female', label: 'Female' }, { value: 'Male', label: 'Male' }]} error={addErrors.gender} />
                <Input id="field-dob" label="Date of Birth *" type="date" value={form.dob} onChange={e => setForm({ ...form, dob: e.target.value })} error={addErrors.dob} />
                <Select id="field-maritalStatus" label="Marital Status *" value={form.maritalStatus} onChange={e => setForm({ ...form, maritalStatus: e.target.value })} options={[{ value: 'UNMARRIED', label: 'UNMARRIED' }, { value: 'MARRIED', label: 'MARRIED' }]} error={addErrors.maritalStatus} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <CreatableSelect id="field-state" label="State *" value={form.state} options={stateOptions}
                  placeholder="Select or type a state" error={addErrors.state}
                  onChange={v => setForm({ ...form, state: v, city: (form.state && v !== form.state) ? '' : form.city })} onCreate={rememberState} />
                <CreatableSelect id="field-city" label="City *" value={form.city} options={cityOptionsFor(form.state)}
                  placeholder={form.state ? 'Select or type a city' : 'Select a state first'} error={addErrors.city}
                  disabled={!form.state}
                  onChange={v => setForm({ ...form, city: v })} onCreate={v => rememberCity(form.state, v)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <CreatableSelect id="field-nationality" label="Nationality *" value={form.nationality} options={countryOptions}
                  placeholder="Select a country" error={addErrors.nationality} allowCustom={isSuperAdmin}
                  onChange={v => setForm({ ...form, nationality: v })} onCreate={rememberCountry} />
                <Input id="field-phone" label="Mobile Number *" value={form.mobileNumber} inputMode="tel" maxLength={10} onChange={e => setForm({ ...form, mobileNumber: normalizeField('mobile', e.target.value) })} error={addErrors.phone} />
              </div>
              <div className="grid grid-cols-1 gap-3">
                <Input id="field-email" label="Email Address (Optional)" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} error={addErrors.email} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Input id="field-fatherSpouseName" label="Father/Spouse Name" value={form.fatherSpouseName} onChange={e => setForm({ ...form, fatherSpouseName: e.target.value })} error={addErrors.fatherSpouseName} />
                <Select id="field-relationType" label="Relation" value={form.relationType} onChange={e => setForm({ ...form, relationType: e.target.value })} options={[{ value: 'FATHER', label: 'FATHER' }, { value: 'SPOUSE', label: 'SPOUSE' }, { value: 'MOTHER', label: 'MOTHER' }]} />
                <Input id="field-emergencyContact" label="Emergency Phone" value={form.emergencyContact} inputMode="tel" maxLength={10} onChange={e => setForm({ ...form, emergencyContact: normalizeField('mobile', e.target.value) })} />
              </div>
            </div>
          )}

          {activeTab === 'job' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Select id="field-branchLocation" label="Branch Location *" value={form.branchLocation} onChange={e => setForm({ ...form, branchLocation: e.target.value })} options={[{ value: '', label: 'Head Office / None' }, ...branchOptions.map(b => ({ value: b, label: b }))]} disabled={isBranchWorkspace} error={addErrors.branchLocation} />
                <Select id="field-department" label="Department *" value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} options={formDepartments.map(d => ({ value: d, label: d }))} error={addErrors.department} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Select id="field-designation" label="Designation *" value={form.designation} onChange={e => setForm({ ...form, designation: e.target.value })} options={dynamicDesignations.map(d => ({ value: d, label: d }))} error={addErrors.designation} />
                <Select id="field-category" label="Employment Class *" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} options={categoryOptions.map(c => ({ value: c, label: c }))} error={addErrors.category} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Select id="field-employmentType" label="Employment Type *" value={form.employmentType} onChange={e => setForm({ ...form, employmentType: e.target.value })} options={employmentTypeOptions.map(t => ({ value: t, label: t }))} error={addErrors.employmentType} />
                <Input id="field-joinDate" label="Joining Date *" type="date" value={form.joinDate} onChange={e => setForm({ ...form, joinDate: e.target.value })} error={addErrors.joinDate} />
              </div>
              <div>
                <Input id="field-biometricId" label="Biometric Code (Optional)" maxLength={50} placeholder="e.g. 0001" value={form.biometricId} onChange={e => setForm({ ...form, biometricId: e.target.value })} />
                <p className="text-[10px] text-slate-400 mt-1">Attendance-machine code (a.k.a. Machine Employee Code). Must be unique within the company. This is NOT the Employee ID. Leave blank if biometric attendance is not used.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input id="field-salary" label="Salary (Monthly Basic) *" type="number" value={form.salary} onChange={e => setForm({ ...form, salary: e.target.value })} error={addErrors.salary} />
                <Input id="field-manager" label="Manager" value={form.manager} onChange={e => setForm({ ...form, manager: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Select id="field-shift" label="Shift (Optional)" value={form.shiftId || ''} onChange={e => setForm({ ...form, shiftId: e.target.value })} options={shiftSelectOptions} />
              </div>
            </div>
          )}

          {/* Step 3 — Bonus Configuration (dedicated step, immediately after salary).
              Master bonus setup consumed directly by payroll calculations. */}
          {activeTab === 'bonus' && (
            <div className="space-y-3">
              {/* State-wise minimum-wage advisory (additive; does not change payroll/bonus logic) */}
              <MinimumWageAdvisory
                companyId={String((currentComp as any)?.parentCompanyId || activeCompanyId)}
                branch={form.branchLocation}
                defaultSkill={form.category}
                performedBy={role}
                employeeName={form.name}
              />
              <BonusConfigSection
                data={form}
                salary={form.salary}
                onChange={patch => setForm((f: any) => ({ ...f, ...patch }))}
                errors={errors}
              />
            </div>
          )}

          {activeTab === 'banking' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Input id="field-aadhaar" label="Aadhaar Number" placeholder="1234 5678 9012" className="font-mono tracking-wider" value={formatAadhaar(form.aadhaar)} onChange={e => setForm({ ...form, aadhaar: rawAadhaar(e.target.value) })} error={addErrors.aadhaar} />
                <Input id="field-pan" label="PAN Card" placeholder="ABCDE1234F" className="font-mono" value={formatPan(form.pan)} onChange={e => setForm({ ...form, pan: rawPan(e.target.value) })} error={addErrors.pan} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Input id="field-pfNumber" label="Provident Fund (PF) No (Optional)" value={form.pfNumber} onChange={e => setForm({ ...form, pfNumber: e.target.value })} error={addErrors.pfNumber} />
                <Input id="field-uan" label="Universal Account No (UAN) (Optional)" value={form.uan} onChange={e => setForm({ ...form, uan: e.target.value.replace(/\D/g, '').slice(0, 12) })} error={addErrors.uan} />
                <Input id="field-esic" label="ESIC IP Number (Optional)" value={form.esic} onChange={e => setForm({ ...form, esic: e.target.value })} error={addErrors.esic} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input id="field-wcPolicyNumber" label="Workmen Compensation (WC) Policy No. (Optional)" placeholder="e.g. WC-1234/2026" maxLength={100} value={form.wcPolicyNumber} onChange={e => setForm({ ...form, wcPolicyNumber: e.target.value.slice(0, 100) })} error={addErrors.wcPolicyNumber} />
              </div>
              <BankDetails
                data={{ accountHolderName: form.accountHolderName, accountNumber: form.accountNumber, confirmAccountNumber: form.confirmAccountNumber, ifsc: form.ifsc, bankName: form.bankName, bankBranch: form.bankBranch, bankAddress: form.bankAddress, bankCity: form.bankCity, bankDistrict: form.bankDistrict, bankState: form.bankState }}
                onChange={patch => setForm((f: any) => ({ ...f, ...patch }))}
                errors={errors}
                disabled={!canEdit}
              />
            </div>
          )}

          {activeTab === 'address' && (
            <AddressSection values={form} errors={errors} onChange={(k, v) => setForm(f => ({ ...f, [k]: v }))} />
          )}
        </div>
      </Modal>

      {/* ── Full-page Employee Editor — its own route, /employees/:id/edit ──
          `editLoading` keeps the page open while a deep link or a refresh fetches
          the record, so the employee list never flashes behind an empty editor. */}
      <Modal
        open={!!editEmp || editLoading}
        onClose={closeEditor}
        variant="page"
        title="Edit Employee"
        subtitle={editEmp ? `${editEmp.name} · ${editEmp.employeeId || '—'}` : undefined}
        breadcrumbs={[
          { label: 'Employee Management', onClick: closeEditor },
          { label: 'Edit' },
          { label: editEmp?.name || 'Employee' },
        ]}
        context={currentComp?.name || undefined}
        footer={editEmp && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={closeEditor}>Cancel</Button>
            <Button variant="outline" size="sm" icon={<RotateCcw size={13} />} onClick={handleResetEdit}>Reset</Button>
            {canEdit && !isRecordLocked(editEmp, role) && (
              <Button variant="outline" size="sm" blocked={!editGate.isValid} blockedReason={editGate.blockedReason}
                onClick={() => editGate.attemptSubmit(() => handleEditSubmit('draft'))}>Save Draft</Button>
            )}
            {canEdit && !isRecordLocked(editEmp, role) && (
              <Button size="sm" blocked={!editGate.isValid} blockedReason={editGate.blockedReason}
                onClick={() => editGate.attemptSubmit(() => handleEditSubmit('save'))}>Save Changes</Button>
            )}
          </div>
        )}
      >
        {!editEmp && editLoading && (
          <div className="space-y-4">
            <div className="h-24 rounded-xl shimmer-skeleton" />
            <div className="h-9 w-full max-w-md rounded-lg shimmer-skeleton" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-12 rounded-lg shimmer-skeleton" />)}
            </div>
          </div>
        )}
        {editEmp && (
          <div className="space-y-4 text-left text-xs font-sans">
            {/* Locked previous employee reached by URL: state it up front rather
                than letting the user fill in a form the server will refuse. */}
            {isRecordLocked(editEmp, role) && (
              <div className="flex flex-wrap items-start gap-3 px-3.5 py-3 rounded-lg bg-amber-50 border border-amber-300 text-amber-900">
                <Lock size={15} className="mt-0.5 shrink-0 text-amber-600" />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-bold">Record Locked — Previous Employee</p>
                  <p className="text-[11px] font-medium mt-0.5">{LOCKED_RECORD_MESSAGE}</p>
                </div>
                {canCreate && (
                  <Button size="sm" icon={<RotateCcw size={13} />} onClick={() => { const emp = editEmp; exitEditor(); handleStartReOnboard(emp); }}>Re-Onboard</Button>
                )}
              </div>
            )}
            {/* Editor header — photo + identity + key employment facts */}
            <div className="flex flex-wrap items-center gap-4 p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
              {editEmp.photoUpload ? (
                <img src={editEmp.photoUpload} alt={editEmp.name} className="h-14 w-14 rounded-full object-cover ring-2 ring-brand-200" />
              ) : (
                <div className="h-14 w-14 rounded-full bg-brand-100 text-brand-800 font-bold flex items-center justify-center text-base ring-2 ring-brand-200">
                  {editEmp.avatar || (editEmp.name || '?').slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-base font-bold text-slate-900">{editEmp.name}</p>
                  <Badge variant={statusBadge(editEmp.status)} dot>{editEmp.status}</Badge>
                </div>
                <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-1.5">
                  <div><p className="text-[9px] uppercase tracking-wide text-gray-400 font-bold">Employee Code</p><p className="text-[11px] font-semibold text-slate-700 truncate">{editEmp.employeeId || '—'}</p></div>
                  <div><p className="text-[9px] uppercase tracking-wide text-gray-400 font-bold">Department</p><p className="text-[11px] font-semibold text-slate-700 truncate">{editEmp.department || '—'}</p></div>
                  <div><p className="text-[9px] uppercase tracking-wide text-gray-400 font-bold">Designation</p><p className="text-[11px] font-semibold text-slate-700 truncate">{editEmp.designation || '—'}</p></div>
                  <div><p className="text-[9px] uppercase tracking-wide text-gray-400 font-bold">Branch</p><p className="text-[11px] font-semibold text-slate-700 truncate">{editEmp.branchLocation || '—'}</p></div>
                  <div><p className="text-[9px] uppercase tracking-wide text-gray-400 font-bold">Joining Date</p><p className="text-[11px] font-semibold text-slate-700">{editEmp.joinDate ? formatDate(editEmp.joinDate) : '—'}</p></div>
                </div>
              </div>
            </div>

            {/* Post-save banner — stay on page & continue, or jump elsewhere. */}
            {editSaved && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5">
                <p className="text-xs font-bold text-emerald-700 flex items-center gap-1.5"><CheckCircle2 size={14} /> Employee updated successfully.</p>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" icon={<ArrowLeft size={13} />} onClick={closeEditor}>Back to Employees</Button>
                  {/* Switching to the read-only profile also leaves the editor,
                      so it goes through the same unsaved-changes guard. */}
                  <Button size="sm" variant="outline" onClick={async () => { const emp = editEmp; if (isEditDirty() && !(await ui.confirm({ title: 'Unsaved changes', message: 'You have unsaved changes. Leave without saving?', confirmText: 'Leave', cancelText: 'Stay', variant: 'warning' }))) return; exitEditor(); setViewEmp(emp); setActiveTab('personal'); }}>View Employee</Button>
                </div>
              </div>
            )}
            {!canEdit && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">You have read-only access — changes cannot be saved.</div>
            )}

            <div className="flex border-b border-gray-200 gap-3 text-xs overflow-x-auto pb-1">
              <button onClick={() => setActiveTab('personal')} className={`pb-1.5 font-bold transition ${activeTab === 'personal' ? 'border-b-2 border-brand-600 text-brand-600' : 'text-gray-400 hover:text-gray-600'}`}>1. Personal Info</button>
              <button onClick={() => setActiveTab('job')} className={`pb-1.5 font-bold transition ${activeTab === 'job' ? 'border-b-2 border-brand-600 text-brand-600' : 'text-gray-400 hover:text-gray-600'}`}>2. Employment Details</button>
              <button onClick={() => setActiveTab('bonus')} className={`pb-1.5 font-bold transition ${activeTab === 'bonus' ? 'border-b-2 border-brand-600 text-brand-600' : 'text-gray-400 hover:text-gray-600'}`}>3. Compensation Configuration</button>
              <button onClick={() => setActiveTab('banking')} className={`pb-1.5 font-bold transition ${activeTab === 'banking' ? 'border-b-2 border-brand-600 text-brand-600' : 'text-gray-400 hover:text-gray-600'}`}>4. Compliance & Bank</button>
              <button onClick={() => setActiveTab('address')} className={`pb-1.5 font-bold transition ${activeTab === 'address' ? 'border-b-2 border-brand-600 text-brand-600' : 'text-gray-400 hover:text-gray-600'}`}>5. Addresses</button>
              <button onClick={() => setActiveTab('nominees')} className={`pb-1.5 font-bold transition ${activeTab === 'nominees' ? 'border-b-2 border-brand-600 text-brand-600' : 'text-gray-400 hover:text-gray-600'}`}>6. Nominees</button>
            </div>

            {activeTab === 'nominees' && (
              <NomineesTab employeeId={editEmp.id} employeeName={editEmp.name} role={role} />
            )}

            {activeTab === 'personal' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Employee Code *" value={editEmp.employeeId} disabled />
                  <Input id="field-aadhaarName" label="Aadhaar Full Name *" value={editEmp.name} onChange={e => setEditEmp({ ...editEmp, name: e.target.value })} error={errors.aadhaarName || errors.name} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Input id="field-firstName" label="First Name" value={editEmp.firstName || ''} onChange={e => setEditEmp({ ...editEmp, firstName: e.target.value })} />
                  <Input id="field-middleName" label="Middle Name" value={editEmp.middleName || ''} onChange={e => setEditEmp({ ...editEmp, middleName: e.target.value })} />
                  <Input id="field-lastName" label="Surname / Last Name" value={editEmp.lastName || ''} onChange={e => setEditEmp({ ...editEmp, lastName: e.target.value })} />
                </div>
                {/* Real-time Aadhaar-name check: First + Middle (optional) + Surname
                    vs the Aadhaar Full Name, normalized (trim / collapse spaces /
                    case-insensitive). Presentation only — never mutates the values. */}
                {(() => {
                  const aadhaarFullName = (editEmp.name || '').trim();
                  const generated = buildFullName(editEmp.firstName, editEmp.middleName, editEmp.lastName);
                  if (!aadhaarFullName) {
                    return <p className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-600"><AlertTriangle size={12} /> Please enter Aadhaar Full Name.</p>;
                  }
                  if (!generated) return null; // no name parts to compare yet
                  return normalizeName(generated) === normalizeName(aadhaarFullName)
                    ? <p className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600"><CheckCircle2 size={12} /> Aadhaar name matches.</p>
                    : <p className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-600"><AlertTriangle size={12} /> Name differs from Aadhaar ({generated}).</p>;
                })()}
                <div className="grid grid-cols-3 gap-3">
                  <Select id="field-gender" label="Gender *" value={editEmp.gender || 'Female'} onChange={e => setEditEmp({ ...editEmp, gender: e.target.value })} options={[{ value: 'Female', label: 'Female' }, { value: 'Male', label: 'Male' }]} error={errors.gender} />
                  <Input id="field-dob" label="Date of Birth *" type="date" value={(editEmp.dob || '').slice(0, 10)} onChange={e => setEditEmp({ ...editEmp, dob: e.target.value })} error={errors.dob} />
                  <Select id="field-maritalStatus" label="Marital Status *" value={editEmp.maritalStatus || 'UNMARRIED'} onChange={e => setEditEmp({ ...editEmp, maritalStatus: e.target.value })} options={[{ value: 'UNMARRIED', label: 'UNMARRIED' }, { value: 'MARRIED', label: 'MARRIED' }]} error={errors.maritalStatus} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <CreatableSelect label="State *" value={editEmp.state || ''} options={stateOptions}
                    placeholder="Select or type a state" error={errors.state}
                    onChange={v => setEditEmp({ ...editEmp, state: v, city: (editEmp.state && v !== editEmp.state) ? '' : editEmp.city })} onCreate={rememberState} />
                  <CreatableSelect label="City *" value={editEmp.city || ''} options={cityOptionsFor(editEmp.state || '')}
                    placeholder={editEmp.state ? 'Select or type a city' : 'Select a state first'} error={errors.city}
                    disabled={!editEmp.state}
                    onChange={v => setEditEmp({ ...editEmp, city: v })} onCreate={v => rememberCity(editEmp.state || '', v)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <CreatableSelect label="Nationality *" value={editEmp.nationality || DEFAULT_COUNTRY} options={countryOptions}
                    placeholder="Select a country" error={errors.nationality} allowCustom={isSuperAdmin}
                    onChange={v => setEditEmp({ ...editEmp, nationality: v })} onCreate={rememberCountry} />
                  <Input id="field-phone" label="Mobile Number *" value={editMobileNumber} inputMode="tel" maxLength={10} onChange={e => setEditMobileNumber(normalizeField('mobile', e.target.value))} error={errors.phone} />
                </div>
                <div className="grid grid-cols-1 gap-3">
                  <Input id="field-email" label="Email Address (Optional)" value={editEmp.email || ''} onChange={e => setEditEmp({ ...editEmp, email: e.target.value })} error={errors.email} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Input id="field-fatherSpouseName" label="Father/Spouse Name" value={editEmp.fatherSpouseName || ''} onChange={e => setEditEmp({ ...editEmp, fatherSpouseName: e.target.value })} error={errors.fatherSpouseName} />
                  <Select id="field-relationType" label="Relation" value={editEmp.relationType || 'FATHER'} onChange={e => setEditEmp({ ...editEmp, relationType: e.target.value })} options={[{ value: 'FATHER', label: 'FATHER' }, { value: 'SPOUSE', label: 'SPOUSE' }, { value: 'MOTHER', label: 'MOTHER' }]} />
                  <Input id="field-emergencyContact" label="Emergency Phone" value={editEmp.emergencyContact || ''} inputMode="tel" maxLength={10} onChange={e => setEditEmp({ ...editEmp, emergencyContact: normalizeField('mobile', e.target.value) })} />
                </div>
              </div>
            )}

            {activeTab === 'job' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Select id="field-branchLocation" label="Branch Location *" value={editEmp.branchLocation || ''} onChange={e => setEditEmp({ ...editEmp, branchLocation: e.target.value })} options={[{ value: '', label: 'Head Office / None' }, ...branchOptions.map(b => ({ value: b, label: b }))]} disabled={isBranchWorkspace} error={errors.branchLocation} />
                  <Select id="field-department" label="Department *" value={editEmp.department} onChange={e => setEditEmp({ ...editEmp, department: e.target.value })} options={editFormDepartments.map(d => ({ value: d, label: d }))} error={errors.department} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Select id="field-designation" label="Designation *" value={editEmp.designation} onChange={e => setEditEmp({ ...editEmp, designation: e.target.value })} options={dynamicDesignations.map(d => ({ value: d, label: d }))} error={errors.designation} />
                  <Select id="field-category" label="Employment Class *" value={editEmp.category || 'Skilled'} onChange={e => setEditEmp({ ...editEmp, category: e.target.value })} options={categoryOptions.map(c => ({ value: c, label: c }))} error={errors.category} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Select id="field-employmentType" label="Employment Type *" value={editEmp.employmentType || 'CONTRACTUAL'} onChange={e => setEditEmp({ ...editEmp, employmentType: e.target.value })} options={employmentTypeOptions.map(t => ({ value: t, label: t }))} error={errors.employmentType} />
                  <Input id="field-joinDate" label="Joining Date *" type="date" value={(editEmp.joinDate || '').slice(0, 10)} onChange={e => setEditEmp({ ...editEmp, joinDate: e.target.value })} error={errors.joinDate} />
                </div>
                <div>
                  <Input id="field-biometricId" label="Biometric Code (Optional)" maxLength={50} placeholder="e.g. 0001" value={editEmp.biometricId || ''} onChange={e => setEditEmp({ ...editEmp, biometricId: e.target.value })} />
                  <p className="text-[10px] text-slate-400 mt-1">Attendance-machine code (a.k.a. Machine Employee Code). Must be unique within the company. This is NOT the Employee ID. Leave blank if biometric attendance is not used.</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input id="field-salary" label="Salary (Monthly Basic) *" type="number" value={editEmp.salary} onChange={e => setEditEmp({ ...editEmp, salary: parseInt(e.target.value) || 0 })} error={errors.salary} />
                  <Input id="field-manager" label="Manager" value={editEmp.manager} onChange={e => setEditEmp({ ...editEmp, manager: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Select id="field-shift" label="Shift (Optional)" value={editEmp.shiftId != null ? String(editEmp.shiftId) : ''} onChange={e => setEditEmp({ ...editEmp, shiftId: e.target.value ? Number(e.target.value) : null } as any)} options={shiftSelectOptions} />
                </div>
                <div className="border-t border-slate-700/50 pt-2 grid grid-cols-2 gap-3">
                  <Input id="field-exitDate" label="Exit Date" type="date" value={(editEmp.exitDate || '').slice(0, 10)} onChange={e => setEditEmp({ ...editEmp, exitDate: e.target.value, status: e.target.value ? 'Terminated' : 'Active' })} error={errors.exitDate} />
                  <Input id="field-exitReason" label="Exit Reason" value={editEmp.exitReason || ''} onChange={e => setEditEmp({ ...editEmp, exitReason: e.target.value })} error={errors.exitReason} />
                </div>
              </div>
            )}

            {/* Dedicated Bonus Configuration tab — master bonus setup used by payroll. */}
            {activeTab === 'bonus' && (
              <div className="space-y-3">
                <BonusConfigSection
                  data={editEmp as any}
                  salary={editEmp.salary}
                  onChange={patch => setEditEmp((e: any) => ({ ...e, ...patch }))}
                  errors={errors}
                />
              </div>
            )}

            {activeTab === 'banking' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Input id="field-aadhaar" label="Aadhaar Number" placeholder="1234 5678 9012" className="font-mono tracking-wider" value={formatAadhaar(editEmp.aadhaar || '')} onChange={e => setEditEmp({ ...editEmp, aadhaar: rawAadhaar(e.target.value) })} error={errors.aadhaar} />
                  <Input id="field-pan" label="PAN Card" placeholder="ABCDE1234F" className="font-mono" value={formatPan(editEmp.pan || '')} onChange={e => setEditEmp({ ...editEmp, pan: rawPan(e.target.value) })} error={errors.pan} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Input id="field-pfNumber" label="Provident Fund (PF) No (Optional)" value={editEmp.pfNumber || ''} onChange={e => setEditEmp({ ...editEmp, pfNumber: e.target.value })} error={errors.pfNumber} />
                  <Input id="field-uan" label="Universal Account No (UAN) (Optional)" value={editEmp.uan || ''} onChange={e => setEditEmp({ ...editEmp, uan: e.target.value.replace(/\D/g, '').slice(0, 12) })} error={errors.uan} />
                  <Input id="field-esic" label="ESIC IP Number (Optional)" value={editEmp.esic || (editEmp as any).esiNumber || ''} onChange={e => setEditEmp({ ...editEmp, esic: e.target.value })} error={errors.esic} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input id="field-wcPolicyNumber" label="Workmen Compensation (WC) Policy No. (Optional)" placeholder="e.g. WC-1234/2026" maxLength={100} value={(editEmp as any).wcPolicyNumber || ''} onChange={e => setEditEmp({ ...editEmp, wcPolicyNumber: e.target.value.slice(0, 100) })} error={errors.wcPolicyNumber} />
                </div>
                <BankDetails
                  data={{ accountHolderName: (editEmp as any).accountHolderName, accountNumber: editEmp.accountNumber, confirmAccountNumber: (editEmp as any).confirmAccountNumber, ifsc: editEmp.ifsc, bankName: editEmp.bankName, bankBranch: (editEmp as any).bankBranch, bankAddress: (editEmp as any).bankAddress, bankCity: (editEmp as any).bankCity, bankDistrict: (editEmp as any).bankDistrict, bankState: (editEmp as any).bankState }}
                  onChange={patch => setEditEmp((e: any) => ({ ...e, ...patch }))}
                  errors={errors}
                  disabled={!canEdit}
                />
              </div>
            )}

            {activeTab === 'address' && (
              <div className="space-y-3">
                <Input id="field-presentAddress" label="Present Address" value={editEmp.presentAddress || ''} onChange={e => setEditEmp({ ...editEmp, presentAddress: e.target.value })} error={errors.presentAddress} />
                <Input id="field-permanentAddress" label="Permanent Address" value={editEmp.permanentAddress || ''} onChange={e => setEditEmp({ ...editEmp, permanentAddress: e.target.value })} error={errors.permanentAddress} />
              </div>
            )}
          </div>
        )}
      </Modal>

      <ActionConfirmationModal
        isOpen={isConfirmingDelete}
        onClose={() => setIsConfirmingDelete(false)}
        onConfirm={handleDelete}
        title="⚠ Confirm Employee Archival"
        description={[
          `Archive the employee record for ${deleteEmp?.name}`,
          "Remove employee from active dashboards",
          "Retain payroll and compliance history in Previous Employees"
        ]}
        confirmationText="DELETE"
        confirmButtonText="Archive Employee"
        isDestructive={true}
      />

      <ActionConfirmationModal
        isOpen={!!offboardEmp && !isWizardOpen}
        onClose={() => setOffboardEmp(null)}
        onConfirm={handleConfirmInitialOffboarding}
        title="Confirm Employee Offboarding"
        description={[
          "Employee will be removed from active workforce",
          "Employee will move to archived workforce",
          "Payroll & active access will stop"
        ]}
        confirmButtonText="Confirm Offboarding"
        isDestructive={true}
        isLoading={isOffboardingExecuting}
      />

      {/* Enterprise Offboarding Wizard Modal */}
      <Modal open={isWizardOpen} onClose={() => { setIsWizardOpen(false); setOffboardEmp(null); }} title="Enterprise Offboarding Workflow" size="xl">
        {offboardEmp && (
          <div className="flex flex-col md:flex-row gap-6">
            {/* Stepper Sidebar */}
            <div className="w-full md:w-64 shrink-0 border-r border-slate-100 pr-4">
              <div className="mb-6">
                <h3 className="font-semibold text-slate-800">{offboardEmp.name}</h3>
                <p className="text-xs text-slate-500">{offboardEmp.employeeId} • {offboardEmp.designation}</p>
              </div>
              <ul className="space-y-4">
                {[
                  { id: 1, label: 'Documentation', icon: <FileText size={16} /> },
                  { id: 2, label: 'Payroll Settlement', icon: <IndianRupee size={16} /> },
                  { id: 3, label: 'Access Revocation', icon: <Lock size={16} /> },
                  { id: 4, label: 'HR Approval', icon: <UserCheck size={16} /> },
                  { id: 5, label: 'Final Archive', icon: <Archive size={16} /> }
                ].map((step) => {
                  const isActive = wizardStep === step.id;
                  const isPast = wizardStep > step.id;
                  return (
                    <li key={step.id} className={`flex items-center gap-3 text-sm font-medium ${isActive ? 'text-brand-600' : isPast ? 'text-emerald-600' : 'text-slate-400'}`}>
                      <div className={`flex items-center justify-center w-8 h-8 rounded-full border-2 ${isActive ? 'border-brand-600 bg-brand-50' : isPast ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
                        {isPast ? <CheckCircle2 size={16} /> : step.icon}
                      </div>
                      {step.label}
                    </li>
                  )
                })}
              </ul>
            </div>

            {/* Stepper Content */}
            <div className="flex-1 py-2">
              {wizardStep === 1 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-slate-800">Documentation Clearance</h3>
                  <p className="text-sm text-slate-500">Verify all pending documents, ID clearance, and return of company assets.</p>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
                    <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={20} />
                    <p className="text-sm text-amber-800 font-medium">Documentation clearance pending. Please verify assets.</p>
                  </div>
                  <Button onClick={() => handleWizardStepComplete(1)} className="w-full mt-4" icon={<CheckCircle2 size={16} />}>Verify & Mark Document Clearance Complete</Button>
                </div>
              )}
              {wizardStep === 2 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-slate-800">Payroll Settlement</h3>
                  <p className="text-sm text-slate-500">Verify final salary, deductions, and clear all dues.</p>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
                    <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={20} />
                    <p className="text-sm text-amber-800 font-medium">Payroll settlement pending. Wait for finance clearance.</p>
                  </div>
                  <Button onClick={() => handleWizardStepComplete(2)} className="w-full mt-4 bg-emerald-600 hover:bg-emerald-700 text-white border-0" icon={<CheckCircle2 size={16} />}>Settle Payroll Dues</Button>
                </div>
              )}
              {wizardStep === 3 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-slate-800">Access Revocation</h3>
                  <p className="text-sm text-slate-500">Revoke system access, biometric attendance, and workspace emails.</p>
                  <div className="bg-brand-50 border border-brand-200 rounded-lg p-4 flex items-start gap-3">
                    <Lock className="text-brand-500 shrink-0 mt-0.5" size={20} />
                    <p className="text-sm text-brand-800 font-medium">System login and active attendance will be disabled.</p>
                  </div>
                  <Button onClick={() => handleWizardStepComplete(3)} className="w-full mt-4" icon={<CheckCircle2 size={16} />}>Revoke Access</Button>
                </div>
              )}
              {wizardStep === 4 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-slate-800">Final HR Approval</h3>
                  <p className="text-sm text-slate-500">Acknowledge completion of all offboarding checklists.</p>

                  {/* ── Reason for Offboarding — single primary reason (reportable) ── */}
                  <div className="bg-white border border-slate-200 rounded-lg p-4">
                    <label className="text-sm font-semibold text-slate-800">Reason for Offboarding <span className="text-rose-500">*</span></label>
                    <p className="text-[11px] text-slate-400 mb-2.5">Select one primary reason — used for attrition &amp; exit-trend analytics.</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
                      {EXIT_REASONS.map(r => (
                        <label key={r} className={`flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer text-sm transition-colors ${offReason === r ? 'bg-brand-50 text-brand-700 font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}>
                          <input type="radio" name="exitReason" value={r} checked={offReason === r} onChange={() => setOffReason(r)} className="accent-brand-600" />
                          <span>{r}</span>
                        </label>
                      ))}
                    </div>
                    {offReason === 'Other' && (
                      <div className="mt-3">
                        <label className="text-[11px] font-semibold text-slate-600">Specify Other Reason <span className="text-rose-500">*</span></label>
                        <input value={offReasonOther} onChange={e => setOffReasonOther(e.target.value)} placeholder="Describe the exit reason…"
                          className="w-full mt-1 border border-slate-200 rounded-md p-2 text-sm outline-none focus:border-brand-400" />
                      </div>
                    )}
                  </div>

                  {/* ── Exit clearance checklist ── */}
                  <div className="bg-white border border-slate-200 rounded-lg p-4">
                    <label className="text-sm font-semibold text-slate-800">Exit Clearance Checklist</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 mt-2.5">
                      {EXIT_CHECKLIST.map(c => (
                        <label key={c.key} className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer hover:text-slate-800">
                          <input type="checkbox" checked={!!offChecklist[c.key]} onChange={e => setOffChecklist(prev => ({ ...prev, [c.key]: e.target.checked }))} className="accent-brand-600 h-3.5 w-3.5" />
                          <span>{c.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                    <label className="text-sm font-medium text-slate-700">HR Remarks <span className="text-[11px] font-normal text-slate-400">(optional)</span></label>
                    <textarea value={offRemarks} onChange={e => setOffRemarks(e.target.value)} className="w-full mt-2 border border-slate-200 rounded-md p-2 text-sm outline-none focus:border-brand-400" rows={3} placeholder="Optional remarks..."></textarea>
                  </div>
                  <Button
                    onClick={() => handleWizardStepComplete(4)}
                    disabled={!offReason || (offReason === 'Other' && !offReasonOther.trim())}
                    className="w-full mt-4 bg-brand-600 hover:bg-brand-700 text-white border-0"
                    icon={<CheckCircle2 size={16} />}
                  >Approve Final Sign-off</Button>
                </div>
              )}
              {wizardStep === 5 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-slate-800">Final Archive</h3>
                  <p className="text-sm text-slate-500">Employee will now be formally archived and removed from the active workforce analytics.</p>
                  <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 flex items-start gap-3">
                    <AlertTriangle className="text-rose-500 shrink-0 mt-0.5" size={20} />
                    <p className="text-sm text-rose-800 font-medium">This action cannot be undone. Employee will be moved to Previous Employees.</p>
                  </div>
                  <div className="flex gap-3 mt-4">
                    <Button variant="outline" className="w-1/3" onClick={() => { setIsWizardOpen(false); setOffboardEmp(null); }}>Cancel</Button>
                    <Button
                      onClick={handleFinalArchive}
                      disabled={isOffboardingExecuting}
                      className="w-2/3 bg-rose-600 hover:bg-rose-700 text-white border-0"
                      icon={isOffboardingExecuting ? undefined : <Archive size={16} />}
                    >
                      {isOffboardingExecuting ? 'Processing Archive...' : 'Archive Employee Record'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      <ActionConfirmationModal
        isOpen={isConfirmingBulk}
        onClose={() => setIsConfirmingBulk(false)}
        onConfirm={handleBulkCommit}
        title="⚠ Confirm Bulk Import Execution"
        description={[
          `You are about to insert ${importedRows.length} employee records.`,
          "This will create new master records and default payroll configurations.",
          "Please ensure the data formatting is absolutely correct."
        ]}
        confirmationText="IMPORT"
        confirmButtonText="Execute Bulk Import"
        isDestructive={false}
      />

    </div>
  );
};
