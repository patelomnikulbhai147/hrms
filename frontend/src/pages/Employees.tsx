import { api } from '@/api/apiClient';
import { getApiErrorMessage } from '@/utils/apiError';
import { formatDate } from '@/utils/formatDate';
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Plus, Search, Eye, Edit2,
  EyeOff, ShieldCheck, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle,
  Users, UserCheck, LogOut, ChevronRight, Lock, FileText, IndianRupee, Archive, Gift, XCircle, Trash2,
  Send, RotateCcw, Download, Clock, ThumbsUp, ChevronDown, FileDown, UserPlus, Fingerprint, Building2
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  type Employee, type EmployeeStatus, type Role, type Company,
  isCompanyIdMatch,
  resolveActiveWorkspace
} from '@/types';
import { Badge, statusBadge } from '@/components/ui/Badge';
import { Table, Thead, Tbody, Th, Td, Tr } from '@/components/ui/Table';
import { Card, StatCard } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ActionConfirmationModal } from '@/components/ui/ActionConfirmationModal';
import { Input, Select } from '@/components/ui/Input';
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
import { isActiveEmployee, isOffboarded } from '@/utils/employeeStatus';
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
}

const capitalize = (str: string) => {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

// Employee lifecycle: Active operations vs Archived (offboarded — retained for
// history, excluded from payroll/attendance/leave credits). 'Inactive' is
// retired in favour of 'Archived'.
const statusOptions: EmployeeStatus[] = ['Active', 'Archived', 'On Leave'];
const categoryOptions = ['Skilled', 'Semi-skilled', 'Unskilled', 'Highly skilled'];
const employmentTypeOptions = ['PERMANENT', 'CONTRACTUAL', 'PROBATION', 'INTERN'];

export const Employees: React.FC<EmployeesProps> = ({
  role,
  activeCompanyId,
  companies,
  userAccounts: _userAccounts,
  onUpdateAccounts: _onUpdateAccounts,
  employees,
  onUpdateEmployees,
  leaves = []
}) => {
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');

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
  const [editEmp, setEditEmp] = useState<Employee | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [wizardNominees, setWizardNominees] = useState<any[]>([]); // staged nominees during registration
  const [deleteEmp, setDeleteEmp] = useState<Employee | null>(null);

  // Excel Importer states
  const [importOpen, setImportOpen] = useState(false);
  const [importedRows, setImportedRows] = useState<any[]>([]);
  const [importLogs, setImportLogs] = useState<string[]>([]);
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
  const downloadImportTemplate = () => {
    setActionsMenuOpen(false);
    try {
      exportRowsToExcel(`Employee_Import_Template_${new Date().toISOString().slice(0, 10)}`, EMPLOYEE_EXPORT_COLUMNS, [], 'Template');
      ui.toast.success('Employee import template downloaded.');
    } catch (err: any) { ui.toast.error('Could not generate the template: ' + (err?.message || 'Unknown error')); }
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

  const [page, setPage] = useState(1);
  const pageSize = 50;

  useEffect(() => {
    setPage(1);
  }, [search, deptFilter, statusFilter, branchFilter, activeMainTab]);

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

  // Auto-generate employee code on add open
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
      aadhaar: '', pan: '', pfNumber: '', uan: '', esic: '',
      bankName: '', accountNumber: '', confirmAccountNumber: '', ifsc: '', accountHolderName: '', bankBranch: '', bankAddress: '', bankCity: '', bankDistrict: '', bankState: '', presentAddress: '', permanentAddress: '',
      ...BLANK_ADDRESS_VALUES,
      state: '', city: '',
      shiftId: '',
      bonusApplicable: false, bonusType: '', bonusCalcMethod: 'Fixed Amount', bonusValue: null, bonusEffectiveDate: '', bonusEndDate: '', bonusNotes: '',
    });
    setErrors({});
    setWizardNominees([]);
    setActiveTab('personal');
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

  const handleSaveContinue = () => {
    const idx = ADD_STEPS.indexOf(activeTab as any);
    if (idx === -1) return;
    const sectionErrors = validateAddSection(activeTab);
    if (Object.keys(sectionErrors).length) {
      // Block progress, surface every invalid field, and jump to the first one.
      setErrors(prev => ({ ...prev, ...sectionErrors }));
      setTimeout(() => focusField(Object.keys(sectionErrors)[0]), 50);
      return;
    }
    setErrors({});
    setStepMsg(`${ADD_STEP_LABELS[activeTab]} saved — continuing to ${ADD_STEP_LABELS[ADD_STEPS[idx + 1]]}.`);
    setTimeout(() => setStepMsg(''), 2500);
    setActiveTab(ADD_STEPS[idx + 1]);
  };

  const handleStartEdit = (emp: Employee) => {
    // Pre-fill Confirm Account Number with the stored value so editing an
    // existing record doesn't trip the "numbers must match" check.
    setEditEmp({ ...emp, confirmAccountNumber: emp.accountNumber || '' } as any);
    const parts = (emp.phone || '').split(' ');
    if (parts.length > 1) {
      setEditMobileNumber(parts.slice(1).join(''));
    } else {
      setEditMobileNumber(emp.phone || '');
    }
    setActiveTab('personal');
    setErrors({});
  };

  // central company scope filtering
  const companyEmployees = useMemo(() => {
    const filtered = employees.filter(e => isCompanyIdMatch(e.companyId, activeCompanyId, companies, e.branchLocation, e.branchId));
    const unique = getUniqueEmployees(filtered);
    console.log('DEBUG EMPLOYEES: activeCompanyId:', activeCompanyId, 'filtered length:', filtered.length, 'unique length:', unique.length);
    return unique;
  }, [employees, activeCompanyId, companies]);

  const filterDepartments = useMemo(() => {
    const set = new Set<string>();
    const branchEmps = employees.filter(e => {
      const matchComp = isCompanyIdMatch(e.companyId, activeCompanyId, companies, e.branchLocation, e.branchId);
      const matchBranch = !branchFilter || (e.branchLocation || '').toUpperCase() === branchFilter.toUpperCase();
      return matchComp && matchBranch;
    });
    branchEmps.forEach(e => {
      if (e.department) set.add(e.department.trim().toUpperCase());
      if (e.designation) set.add(e.designation.trim().toUpperCase());
    });
    return Array.from(set).sort();
  }, [employees, activeCompanyId, companies, branchFilter]);

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
      const matchesBranch = !branchFilter || (emp.branchLocation || '').toUpperCase() === branchFilter.toUpperCase();
      return matchesSearch && matchesDept && matchesStatus && matchesBranch;
    })
      // Default ordering: Employee ID ascending (Company → Branch → numeric seq).
      .sort(byEmployeeCode(e => e.employeeId));
  }, [companyEmployees, search, deptFilter, statusFilter, branchFilter, activeMainTab]);

  // Master Statistics Calculations
  const stats = useMemo(() => {
    const activeRoster = companyEmployees.filter(isActiveEmployee);
    // Total Staff Strength = every employee assigned to this workspace (COUNT),
    // Active Roster = the non-offboarded subset. They must not collapse to 0 just
    // because a branch's staff are archived.
    const total = companyEmployees.length;
    const active = activeRoster.length;
    const verifiedPayroll = activeRoster.filter(e => e.pfNumber && e.bankName && e.accountNumber).length;
    const pendingExits = activeRoster.filter(e => e.exitDate && !e.exitReason).length;
    return { total, active, verifiedPayroll, pendingExits };
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
    const total = companyEmployees.length;
    const activeN = companyEmployees.filter(isActiveEmployee).length;
    const both = companyEmployees.filter(e => isActiveEmployee(e) && isOffboarded(e.status)).length;
    const neither = companyEmployees.filter(e => !isActiveEmployee(e) && !isOffboarded(e.status)).length;
    const active = activeN;
    const previous = total - activeN;            // every non-active record (no record lost)
    const temporary = inProgressTemps.length;
    const pendingApproval = pendingApprovals.length;
    const allStaff = active + previous + temporary + pendingApproval;
    // Reconciliation: the displayed All Staff must equal the sum of categories,
    // and Active/Offboarded must be a clean partition of the real roster.
    const reconciles = allStaff === (total + temporary + pendingApproval);
    const partitionOk = both === 0 && neither === 0;
    const ok = reconciles && partitionOk;
    if (!ok) {
      // eslint-disable-next-line no-console
      console.error('[Employee Count Mismatch Detected]', {
        scope: activeCompanyId, total, active, previous, temporary, pendingApproval, allStaff,
        anomalies: { bothActiveAndOffboarded: both, neither }, reconciles, partitionOk,
      });
    }
    return { ok, allStaff, active, previous, temporary, pendingApproval, both, neither };
  }, [companyEmployees, inProgressTemps, pendingApprovals, activeCompanyId]);

  // Add Validation & Execution
  const handleAddSubmit = async () => {
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
      permanentAddress: form.sameAsPresent ? buildAddressString(form, 'p_') : buildAddressString(form, 'q_'),
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
      const savedEmp = await api.employees.create(newEmp);
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
      ui.toast.success(`${form.name} registered successfully${nomineeNote}.`);
      // Open the profile on the Nominees tab so the saved nominees are visible and
      // any remaining ones can be completed.
      setActiveTab('nominees');
      setViewEmp(savedEmp);
      setWizardNominees([]);
    } catch (err: any) {
      console.error(err);
      ui.toast.error(`Failed to save to database: ${err.message}`);
    }
  };

  const today = new Date().toISOString().split('T')[0];
  const handleConfirmInitialOffboarding = () => { setIsWizardOpen(true); };
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

  // Edit Submission
  const handleEditSubmit = async () => {
    if (!editEmp) return;

    const nameErr = validateName(editEmp.name).error;
    const emailErr = editEmp.email ? validateEmail(editEmp.email).error : '';
    const phoneErr = validatePhone(editMobileNumber).error;

    const activeErrors: Record<string, string> = {
      name: nameErr || '',
      email: emailErr || '',
      phone: phoneErr || '',
    };

    if (!editEmp.aadhaarName || editEmp.aadhaarName.trim().length < 3) {
      activeErrors.aadhaarName = 'Name as per Aadhaar is required';
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
      companyId: resolvedCompanyId,
      branchId: resolvedBranchId
    };

    try {
      api.employees.update(updatedEmp.id, updatedEmp).then(savedEmp => {
        onUpdateEmployees(employees.map(e => e.id === updatedEmp.id ? savedEmp : e));
        setEditEmp(null);
        ui.toast.success('Employee successfully updated.');
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

    const historyItem = {
      companyId: offboardEmp.companyId,
      companyName: currentComp?.name || 'Company',
      role: offboardEmp.role || 'Staff',
      designation: offboardEmp.designation,
      startDate: offboardEmp.joinDate,
      endDate: today,
      reason: 'Formal Offboarding Completed'
    };

    const updated: Employee = {
      ...offboardEmp,
      status: 'Archived',
      exitDate: today,
      exitReason: 'Formal Offboarding Completed',
      offboardingState: {
        ...offboardEmp.offboardingState,
        workflowStatus: 'ARCHIVED',
        completedOn: new Date().toISOString()
      },
      employmentHistory: [...(offboardEmp.employmentHistory || []), historyItem]
    };

    // Persist FIRST; only mutate local state if the DB actually accepted it.
    // Applying the change locally on failure (the old behaviour) made the UI
    // show an "archived" employee that wasn't archived in the database — the
    // change vanished on refresh/relogin. Now a failure surfaces the real
    // reason and leaves the list untouched, so frontend === database.
    api.employees.archive(offboardEmp.id).then(() => {
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

        workbook.SheetNames.forEach(sheetName => {
          if (sheetName === 'Sheet1') return;
          const worksheet = workbook.Sheets[sheetName];
          const json: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

          if (json.length < 2) return;

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

    try {
      const response = await api.employees.bulkCreate(importedRows);
      onUpdateEmployees([...response.employees, ...employees]);
      setImportedRows([]);
      setImportLogs([]);
      setImportOpen(false);
      ui.toast.success(`Bulk synchronized ${response.count} employees from Excel to local HRMS successfully.`);
    } catch (error) {
      console.error('Bulk commit failed:', error);
      ui.toast.error(getApiErrorMessage(error, 'Could not save the imported employees.'));
    }
  };


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
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${activeMainTab === 'approvals' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-indigo-700'} ${countAudit.pendingApproval ? 'relative' : ''}`}
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
                    <button onClick={downloadImportTemplate} className="flex w-full items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-slate-600 text-left transition-colors hover:bg-slate-50 hover:text-slate-900"><FileDown size={15} className="text-slate-400" /> Download Employee Import Template</button>
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
                  <button onClick={() => { setAddMenuOpen(false); handleStartAdd(); }} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-xs font-semibold text-slate-600 text-left transition-colors hover:bg-blue-50 hover:text-blue-700"><UserPlus size={15} className="text-blue-600" /> Add Full Employee</button>
                  <div className="h-px bg-slate-100" />
                  <button onClick={() => { setAddMenuOpen(false); openQuickAdd(); }} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-xs font-semibold text-slate-600 text-left transition-colors hover:bg-amber-50 hover:text-amber-700"><Plus size={15} className="text-amber-600" /> Quick Add (Temp)</button>
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
            <p>All Staff ({countAudit.allStaff}) ≠ Active ({countAudit.active}) + Previous ({countAudit.previous}) + Temporary ({countAudit.temporary}) + Pending Approval ({countAudit.pendingApproval}).
            {countAudit.both > 0 && ` ${countAudit.both} record(s) are both Active & Offboarded.`}
            {countAudit.neither > 0 && ` ${countAudit.neither} record(s) have an unrecognised status.`} Details logged to the console.</p>
          </div>
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Staff Strength" value={countAudit.allStaff} icon={<Users size={16} className="text-blue-600" />} color="bg-blue-50" />
        <StatCard label="Active Personnel" value={countAudit.active} icon={<UserCheck size={16} className="text-emerald-500" />} color="bg-emerald-50" />
        <StatCard label="Verified Payroll " value={stats.verifiedPayroll} icon={<ShieldCheck size={16} className="text-cyan-600" />} color="bg-cyan-50" />
        <StatCard label="Pending Exits" value={stats.pendingExits} icon={<LogOut size={16} className="text-amber-600" />} color="bg-amber-50" />
      </div>

      {/* Filters */}
      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <Input placeholder="Search code, name, designation..." value={search} onChange={e => setSearch(e.target.value)} icon={<Search size={14} />} />

          <Select value={branchFilter} onChange={e => setBranchFilter(e.target.value)}
            options={[{ value: '', label: 'All Branches' }, ...branchOptions.map(b => ({ value: b, label: b }))]}
          />

          <Select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
            options={[{ value: '', label: 'All Depts' }, ...filterDepartments.map(d => ({ value: d, label: d }))]}
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
                          <button onClick={() => setEditTemp({ ...t })} className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-blue-600 transition" title="Complete profile"><Edit2 size={13} /></button>
                        )}
                        {editable && canEdit && (
                          <button onClick={() => handleSubmitTemp(t)} disabled={tempBusy || !mand.ok} className="p-1 hover:bg-indigo-50 rounded text-indigo-600 transition disabled:opacity-30" title={mand.ok ? 'Submit for approval' : 'Complete all mandatory fields & documents first'}><Send size={13} /></button>
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
          <div className="px-4 py-3 border-b border-indigo-100 bg-indigo-50/50 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-indigo-800">Pending Approvals</p>
              <p className="text-[11px] text-indigo-600">Temporary employees who completed their profile &amp; documents and are awaiting activation. Approving generates the official Employee ID and creates the Active record.</p>
            </div>
            <span className="text-[11px] font-semibold text-indigo-700 bg-white border border-indigo-200 rounded-full px-2.5 py-1">{pendingApprovals.length} awaiting</span>
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
                <Tr key={t.id} className="hover:bg-indigo-50/30">
                  <Td className="px-2 py-1.5"><span className="text-[11px] font-bold text-amber-700">{t.tempEmployeeId}</span></Td>
                  <Td className="px-2 py-1.5"><span className="text-[11px] font-semibold text-slate-800">{t.name}</span><span className="block text-[9px] text-slate-400">{t.mobile} · {t.designation || '—'}</span></Td>
                  <Td className="px-2 py-1.5"><span className="text-[11px] text-slate-600">{t.branchLocation || '—'}</span></Td>
                  <Td className="px-2 py-1.5"><span className="text-[11px] text-slate-600">{t.department || '—'}</span></Td>
                  <Td className="px-2 py-1.5"><span className="text-[11px] text-slate-500">{t.submittedAt ? formatDate(t.submittedAt) : '—'}</span>{t.submittedBy && <span className="block text-[9px] text-slate-400">by {t.submittedBy}</span>}</Td>
                  <Td className="px-2 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden min-w-[40px]"><div className="h-full bg-indigo-500 rounded-full" style={{ width: `${t.profileCompletion || 0}%` }} /></div>
                      <span className="text-[10px] font-bold text-slate-600 w-8 text-right">{t.profileCompletion || 0}%</span>
                    </div>
                  </Td>
                  <Td className="px-2 py-1.5">
                    <div className="flex items-center justify-center gap-1 whitespace-nowrap">
                      <button onClick={() => setReviewTemp({ ...t })} className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-indigo-600 transition" title="Review profile & documents"><Eye size={13} /></button>
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
              {filtered.length === 0 ? (
                <tr><td colSpan={7 + (activeMainTab !== 'active' ? 1 : 0) + (showBiometric ? 1 : 0)} className="text-center py-10 text-xs text-gray-400">No synchronized employee profiles found</td></tr>
              ) : (
                filtered.slice((page - 1) * pageSize, page * pageSize).map((emp, idx) => (
                  <Tr key={emp.id} className="hover:bg-slate-50/50">
                    <Td className="px-2 py-1 text-center"><span className="text-[11px] font-semibold text-slate-500">{(page - 1) * pageSize + idx + 1}</span></Td>
                    <Td className="px-2 py-1"><span className="text-[11px] font-bold text-slate-800">{emp.employeeId}</span></Td>
                    <Td className="px-2 py-1">
                      <div className="flex items-center gap-1.5 cursor-pointer" onClick={() => setViewEmp(emp)}>
                        <div className="h-6 w-6 rounded-full bg-slate-100 flex items-center justify-center font-bold text-[9px] text-slate-600 ring-1 ring-slate-200 shrink-0">
                          {emp.avatar || 'EM'}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold text-slate-900 hover:text-blue-600 truncate">{emp.name}</p>
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
                          className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-blue-600 transition"
                          title="View Master File"
                        >
                          <Eye size={13} />
                        </button>

                        {/* Active employees: full management actions. */}
                        {!isOffboarded(emp.status) && canEdit && (
                          <>
                            <button
                              onClick={() => handleStartEdit(emp)}
                              className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-blue-600 transition"
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
                        {/* Archived / offboarded = historical record → View only.
                          Restore/Edit is reserved for Super Admin. */}
                        {isOffboarded(emp.status) && role === 'Super Admin' && (
                          <button
                            onClick={() => handleStartEdit(emp)}
                            className="p-1 hover:bg-emerald-50 rounded text-slate-500 hover:text-emerald-600 transition"
                            title="Edit / Restore (Super Admin)"
                          >
                            <Edit2 size={13} />
                          </button>
                        )}
                      </div>
                    </Td>
                  </Tr>
                ))
              )}
            </Tbody>
          </Table>

          {/* Pagination Controls */}
          {filtered.length > pageSize && (
            <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50 rounded-b-xl">
              <span className="text-xs text-slate-500 font-medium">
                Showing <span className="font-bold text-slate-700">{(page - 1) * pageSize + 1}</span> to <span className="font-bold text-slate-700">{Math.min(page * pageSize, filtered.length)}</span> of <span className="font-bold text-slate-700">{filtered.length}</span> entries
              </span>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="text-xs py-1 px-3"
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(Math.ceil(filtered.length / pageSize), p + 1))}
                  disabled={page >= Math.ceil(filtered.length / pageSize)}
                  className="text-xs py-1 px-3"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </Card>
      </>)}

      {/* ── Quick (Temporary) Employee Registration ── */}
      <Modal open={quickOpen} onClose={() => setQuickOpen(false)} title="Quick Employee Registration (Temporary)" size="sm">
        <div className="space-y-3 text-left">
          <p className="text-[11px] text-slate-500">Create a temporary employee in seconds — only Name, Mobile &amp; Branch are required. Complete the rest later and convert to a permanent employee.</p>
          <Input label="Employee Name *" value={quickForm.name} onChange={e => setQuickForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name" />
          <div>
            <Input label="Mobile Number *" value={quickForm.mobile}
              onChange={e => { setMobileDup(null); setQuickForm(f => ({ ...f, mobile: e.target.value.replace(/[^0-9+]/g, '') })); }}
              onBlur={e => checkMobileLive(e.target.value)}
              placeholder="10-digit mobile" />
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
            <Select label="Branch *" value={quickForm.branch} onChange={e => setQuickForm(f => ({ ...f, branch: e.target.value }))}
              options={[{ value: '', label: 'Select branch…' }, ...branchOptions.map(b => ({ value: b, label: b }))]} />
          )}
          <Input label="Department (optional)" value={quickForm.department} onChange={e => setQuickForm(f => ({ ...f, department: e.target.value }))} placeholder="e.g. Operations" />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => setQuickOpen(false)}>Cancel</Button>
            <Button size="sm" className="bg-amber-500 hover:bg-amber-600" loading={tempBusy} disabled={!!mobileDup || mobileChecking} onClick={handleQuickCreate}>Create Temporary Employee</Button>
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
            <div className="flex items-center justify-between rounded-lg bg-indigo-50 border border-indigo-100 px-3 py-2">
              <div>
                <p className="text-[12px] font-bold text-indigo-900">{reviewTemp.name}</p>
                <p className="text-[10px] text-indigo-600">{reviewTemp.designation || '—'} · {reviewTemp.department || '—'} · {reviewTemp.branchLocation || '—'}</p>
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
                          <a href={src} target="_blank" rel="noreferrer" className="text-[10px] font-semibold text-indigo-600 hover:underline flex items-center gap-0.5"><Eye size={11} />View</a>
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
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 px-4 py-3 text-[11px] text-indigo-800">
              The employee completed their personal &amp; verification profile. As HR, assign the official employment details below — these are company-controlled and were not entered by the employee. Approving generates the permanent Employee ID and moves them to <strong>Active Employees</strong> (payroll, attendance &amp; leave then apply as for any active employee).
            </div>

            {/* Organization */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 md:p-5 shadow-sm">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-extrabold text-slate-800"><Building2 size={16} className="text-indigo-600" /> Organization</h3>
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
              <h3 className="mb-4 flex items-center gap-2 text-sm font-extrabold text-slate-800"><ShieldCheck size={16} className="text-indigo-600" /> Employment</h3>
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
              <h3 className="mb-4 flex items-center gap-2 text-sm font-extrabold text-slate-800"><IndianRupee size={16} className="text-indigo-600" /> Payroll</h3>
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
              <h3 className="mb-4 flex items-center gap-2 text-sm font-extrabold text-slate-800"><Clock size={16} className="text-indigo-600" /> Attendance &amp; Leave</h3>
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
      <Modal open={!!viewEmp} onClose={() => setViewEmp(null)} title="Enterprise Master Employee Profile" size="md">
        {viewEmp && (
          <div className="space-y-4 text-left text-xs font-sans">
            {isOffboarded(viewEmp.status) && (
              <div className="px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-800">
                <p className="text-[12px] font-bold">Archived Employee Record</p>
                <p className="text-[11px] font-medium mt-0.5">This employee is no longer active. Data is available in read-only mode.</p>
              </div>
            )}
            {/* Upper Badge */}
            <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="h-10 w-10 rounded-full bg-blue-100 text-blue-800 font-bold flex items-center justify-center text-sm ring-2 ring-blue-200">
                {viewEmp.avatar}
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">{viewEmp.name}</p>
                <p className="text-[10px] text-gray-500 font-medium">{viewEmp.designation} · {viewEmp.department} · {viewEmp.employeeId}</p>
              </div>
              <div className="ml-auto">
                <Badge variant={statusBadge(viewEmp.status)} dot>{viewEmp.status}</Badge>
              </div>
            </div>

            {/* Sub-Tabs Navigation */}
            <div className="flex border-b border-gray-200 gap-2.5 text-xs overflow-x-auto pb-1">
              <button onClick={() => setActiveTab('personal')} className={`pb-1.5 font-bold whitespace-nowrap transition ${activeTab === 'personal' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>Personal Details</button>
              <button onClick={() => setActiveTab('job')} className={`pb-1.5 font-bold whitespace-nowrap transition ${activeTab === 'job' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>Employment Details</button>
              <button onClick={() => setActiveTab('banking')} className={`pb-1.5 font-bold whitespace-nowrap transition ${activeTab === 'banking' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>Payroll & Banking</button>
              <button onClick={() => setActiveTab('bonus')} className={`pb-1.5 font-bold whitespace-nowrap transition ${activeTab === 'bonus' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>Bonus</button>
              <button onClick={() => setActiveTab('compliance')} className={`pb-1.5 font-bold whitespace-nowrap transition ${activeTab === 'compliance' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>Compliance IDs</button>
              <button onClick={() => setActiveTab('documents')} className={`pb-1.5 font-bold whitespace-nowrap transition ${activeTab === 'documents' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>Documents</button>
              <button onClick={() => setActiveTab('nominees')} className={`pb-1.5 font-bold whitespace-nowrap transition ${activeTab === 'nominees' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>Nominees</button>
              <button onClick={() => setActiveTab('leaves')} className={`pb-1.5 font-bold whitespace-nowrap transition ${activeTab === 'leaves' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>Leave History</button>
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

                {/* Quick Actions */}
                {canEdit && (
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
                <div className="col-span-2">
                  <p className="text-[10px] text-gray-400">ESIC IP Number</p>
                  <p className="font-semibold text-slate-800 mt-0.5">{viewEmp.esic || (viewEmp as any).esiNumber || '—'}</p>
                </div>
              </div>
            )}

            {activeTab === 'documents' && (
              <div className="space-y-3 p-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {/* Photo Card */}
                  <div className="bg-slate-900/20 border border-slate-700/50 rounded-xl p-3 flex flex-col justify-between hover:shadow-md hover:border-blue-500/30 transition-all shadow-sm">
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
                          <a href={viewEmp.photoUpload} download={`${viewEmp.name}_photo.jpg`} className="px-2 py-0.5 bg-slate-800/40 hover:bg-slate-700/60 border border-slate-700/50 hover:border-blue-500/50 text-slate-200 rounded text-[9px] font-bold transition">
                            Download
                          </a>
                          {canEdit && (
                            <button onClick={() => document.getElementById('upload-photoUpload')?.click()} className="px-2 py-0.5 bg-slate-800/40 hover:bg-slate-700/60 border border-slate-700/50 hover:border-blue-500/50 text-slate-200 rounded text-[9px] font-bold transition">
                              Replace
                            </button>
                          )}
                        </>
                      ) : (
                        canEdit && (
                          <button onClick={() => document.getElementById('upload-photoUpload')?.click()} className="w-full py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[9px] font-bold transition flex items-center justify-center gap-1">
                            <Upload size={10} /> Upload
                          </button>
                        )
                      )}
                      {canEdit && <input type="file" id="upload-photoUpload" className="hidden" accept="image/*" onChange={e => handleFileChange(e, 'photoUpload')} />}
                    </div>
                  </div>

                  {/* Aadhaar Card */}
                  <div className="bg-slate-900/20 border border-slate-700/50 rounded-xl p-3 flex flex-col justify-between hover:shadow-md hover:border-blue-500/30 transition-all shadow-sm">
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
                            <a href={viewEmp.aadhaarUpload} target="_blank" rel="noreferrer" className="text-[9px] font-bold text-blue-600 hover:underline block mt-1">View Document PDF</a>
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
                          <a href={viewEmp.aadhaarUpload} download={`${viewEmp.name}_aadhaar.pdf`} className="px-2 py-0.5 bg-slate-800/40 hover:bg-slate-700/60 border border-slate-700/50 hover:border-blue-500/50 text-slate-200 rounded text-[9px] font-bold transition">
                            Download
                          </a>
                          {canEdit && (
                            <button onClick={() => document.getElementById('upload-aadhaarUpload')?.click()} className="px-2 py-0.5 bg-slate-800/40 hover:bg-slate-700/60 border border-slate-700/50 hover:border-blue-500/50 text-slate-200 rounded text-[9px] font-bold transition">
                              Replace
                            </button>
                          )}
                        </>
                      ) : (
                        canEdit && (
                          <button onClick={() => document.getElementById('upload-aadhaarUpload')?.click()} className="w-full py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[9px] font-bold transition flex items-center justify-center gap-1">
                            <Upload size={10} /> Upload
                          </button>
                        )
                      )}
                      {canEdit && <input type="file" id="upload-aadhaarUpload" className="hidden" accept=".pdf,image/*" onChange={e => handleFileChange(e, 'aadhaarUpload')} />}
                    </div>
                  </div>

                  {/* PAN Card */}
                  <div className="bg-slate-900/20 border border-slate-700/50 rounded-xl p-3 flex flex-col justify-between hover:shadow-md hover:border-blue-500/30 transition-all shadow-sm">
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
                            <a href={viewEmp.panUpload} target="_blank" rel="noreferrer" className="text-[9px] font-bold text-blue-600 hover:underline block mt-1">View Document PDF</a>
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
                          <a href={viewEmp.panUpload} download={`${viewEmp.name}_pan.pdf`} className="px-2 py-0.5 bg-slate-800/40 hover:bg-slate-700/60 border border-slate-700/50 hover:border-blue-500/50 text-slate-200 rounded text-[9px] font-bold transition">
                            Download
                          </a>
                          {canEdit && (
                            <button onClick={() => document.getElementById('upload-panUpload')?.click()} className="px-2 py-0.5 bg-slate-800/40 hover:bg-slate-700/60 border border-slate-700/50 hover:border-blue-500/50 text-slate-200 rounded text-[9px] font-bold transition">
                              Replace
                            </button>
                          )}
                        </>
                      ) : (
                        canEdit && (
                          <button onClick={() => document.getElementById('upload-panUpload')?.click()} className="w-full py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[9px] font-bold transition flex items-center justify-center gap-1">
                            <Upload size={10} /> Upload
                          </button>
                        )
                      )}
                      {canEdit && <input type="file" id="upload-panUpload" className="hidden" accept=".pdf,image/*" onChange={e => handleFileChange(e, 'panUpload')} />}
                    </div>
                  </div>

                  {/* Signature Scan */}
                  <div className="bg-slate-900/20 border border-slate-700/50 rounded-xl p-3 flex flex-col justify-between hover:shadow-md hover:border-blue-500/30 transition-all shadow-sm">
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
                          <a href={viewEmp.signatureUpload} download={`${viewEmp.name}_signature.jpg`} className="px-2 py-0.5 bg-slate-800/40 hover:bg-slate-700/60 border border-slate-700/50 hover:border-blue-500/50 text-slate-200 rounded text-[9px] font-bold transition">
                            Download
                          </a>
                          {canEdit && (
                            <button onClick={() => document.getElementById('upload-signatureUpload')?.click()} className="px-2 py-0.5 bg-slate-800/40 hover:bg-slate-700/60 border border-slate-700/50 hover:border-blue-500/50 text-slate-200 rounded text-[9px] font-bold transition">
                              Replace
                            </button>
                          )}
                        </>
                      ) : (
                        canEdit && (
                          <button onClick={() => document.getElementById('upload-signatureUpload')?.click()} className="w-full py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[9px] font-bold transition flex items-center justify-center gap-1">
                            <Upload size={10} /> Upload
                          </button>
                        )
                      )}
                      {canEdit && <input type="file" id="upload-signatureUpload" className="hidden" accept="image/*" onChange={e => handleFileChange(e, 'signatureUpload')} />}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'leaves' && (
              <div className="space-y-3 p-1 font-sans">
                <div className="flex items-center justify-between border-b border-slate-150 pb-2">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Absence Dossier Log</span>
                  <span className="text-[9px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-bold font-mono">
                    Total recorded: {empLeavesHistory.length}
                  </span>
                </div>

                {empLeavesHistory.length === 0 ? (
                  <div className="text-center py-6 text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    No leaves logged for this employee context.
                  </div>
                ) : (
                  <div className="border border-slate-150 rounded-xl overflow-hidden shadow-2xs max-h-56 overflow-y-auto">
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
      <Modal open={importOpen} onClose={() => setImportOpen(false)} title="Enterprise Excel Importer" size="md">
        <div className="space-y-4 text-left text-xs font-sans">
          <div className="p-3 bg-blue-50 border border-blue-200 text-blue-800 rounded-lg">
            <h4 className="font-bold flex items-center gap-1.5 text-[11px] uppercase tracking-wide">Excel Master Import Protocol</h4>
            <p className="mt-1 leading-relaxed">
              Drop your real employee master dataset (`.xlsx`) to parse all location sheets (AHMEDABAD, BHAVNAGAR, RAJKOT, SIDDHPUR) and synchronise them dynamically.
            </p>
          </div>



          {/* Drag & Drop File Container */}
          <div
            onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleExcelDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all shadow-sm ${isDragOver ? 'border-blue-500 bg-blue-500/10' : 'border-slate-700/50 hover:border-blue-500/50 bg-slate-900/20 hover:bg-slate-800/40'
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
                  <p key={i} className="flex items-start gap-1"><ChevronRight size={10} className="mt-0.5 text-blue-400 shrink-0" /> {log}</p>
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
        </div>
      </Modal>

      {/* Add Employee Master — dedicated full-page registration wizard */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Register Master Employee File"
        variant="page"
        breadcrumbs={[{ label: 'Employees', onClick: () => setAddOpen(false) }, { label: 'Register Employee' }]}
        subtitle="Complete all steps to create the employee master file."
        context={form.branchLocation ? `Branch: ${form.branchLocation}` : undefined}
        size="md"
        footer={
          <div className="flex items-center justify-between w-full gap-2">
            <div>
              {activeTab !== 'personal' && (
                <Button variant="outline" onClick={() => { const i = ADD_STEPS.indexOf(activeTab as any); if (i > 0) setActiveTab(ADD_STEPS[i - 1]); }}>← Back</Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              {canEdit && (activeTab === 'review'
                ? <Button onClick={handleAddSubmit}>Complete Registration</Button>
                : <Button onClick={handleSaveContinue}>Save &amp; Continue →</Button>)}
            </div>
          </div>
        }
      >
        <div className="space-y-4 text-left text-xs font-sans">
          {stepMsg && (
            <div className="px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">✓ {stepMsg}</div>
          )}
          {/* Tabs header in dialog */}
          <div className="flex border-b border-gray-200 gap-3 text-xs">
            <button onClick={() => setActiveTab('personal')} className={`pb-1.5 font-bold transition ${activeTab === 'personal' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>1. Personal Info</button>
            <button onClick={() => setActiveTab('job')} className={`pb-1.5 font-bold transition ${activeTab === 'job' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>2. Employment Details</button>
            <button onClick={() => setActiveTab('bonus')} className={`pb-1.5 font-bold transition ${activeTab === 'bonus' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>3. Compensation Configuration</button>
            <button onClick={() => setActiveTab('banking')} className={`pb-1.5 font-bold transition ${activeTab === 'banking' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>4. Compliance & Bank</button>
            <button onClick={() => setActiveTab('address')} className={`pb-1.5 font-bold transition ${activeTab === 'address' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>5. Addresses</button>
            <button onClick={() => setActiveTab('nominees')} className={`pb-1.5 font-bold transition ${activeTab === 'nominees' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>6. Nominees</button>
            <button onClick={() => setActiveTab('review')} className={`pb-1.5 font-bold transition ${activeTab === 'review' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>7. Review</button>
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
                      <div key={i} className="flex items-center justify-between"><span className="text-slate-700">{n.fullName} <span className="text-slate-400">· {n.relationship}</span></span><strong className="text-indigo-600">{Number(n.percentage)}%</strong></div>
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
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition ${form.codeMode === 'auto' ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                      Auto Generate
                    </button>
                    <button type="button" onClick={() => setForm({ ...form, codeMode: 'custom', employeeId: '' })}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition ${form.codeMode === 'custom' ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                      Custom Code
                    </button>
                  </div>
                  {form.codeMode === 'auto' ? (
                    <Input value="VE-<BRANCH>-#### (auto on save)" disabled />
                  ) : (
                    <Input id="field-employeeId" placeholder="e.g. VE-CONTRACT-001" value={form.employeeId}
                      onChange={e => setForm({ ...form, employeeId: e.target.value.toUpperCase() })} error={errors.employeeId} />
                  )}
                </div>
                <Input id="field-aadhaarName" label="Aadhaar Full Name *" placeholder="e.g. NAGARADE PRITI VIJAYBHAI" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} error={errors.aadhaarName || errors.name} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Input id="field-firstName" label="First Name" value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} />
                <Input id="field-middleName" label="Middle Name" value={form.middleName} onChange={e => setForm({ ...form, middleName: e.target.value })} />
                <Input id="field-lastName" label="Surname / Last Name" value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Select id="field-gender" label="Gender *" value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value })} options={[{ value: 'Female', label: 'Female' }, { value: 'Male', label: 'Male' }]} error={errors.gender} />
                <Input id="field-dob" label="Date of Birth *" type="date" value={form.dob} onChange={e => setForm({ ...form, dob: e.target.value })} error={errors.dob} />
                <Select id="field-maritalStatus" label="Marital Status *" value={form.maritalStatus} onChange={e => setForm({ ...form, maritalStatus: e.target.value })} options={[{ value: 'UNMARRIED', label: 'UNMARRIED' }, { value: 'MARRIED', label: 'MARRIED' }]} error={errors.maritalStatus} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <CreatableSelect id="field-state" label="State *" value={form.state} options={stateOptions}
                  placeholder="Select or type a state" error={errors.state}
                  onChange={v => setForm({ ...form, state: v, city: (form.state && v !== form.state) ? '' : form.city })} onCreate={rememberState} />
                <CreatableSelect id="field-city" label="City *" value={form.city} options={cityOptionsFor(form.state)}
                  placeholder={form.state ? 'Select or type a city' : 'Select a state first'} error={errors.city}
                  disabled={!form.state}
                  onChange={v => setForm({ ...form, city: v })} onCreate={v => rememberCity(form.state, v)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <CreatableSelect id="field-nationality" label="Nationality *" value={form.nationality} options={countryOptions}
                  placeholder="Select a country" error={errors.nationality} allowCustom={isSuperAdmin}
                  onChange={v => setForm({ ...form, nationality: v })} onCreate={rememberCountry} />
                <Input id="field-phone" label="Mobile Number *" value={form.mobileNumber} onChange={e => setForm({ ...form, mobileNumber: e.target.value })} error={errors.phone} />
              </div>
              <div className="grid grid-cols-1 gap-3">
                <Input id="field-email" label="Email Address (Optional)" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} error={errors.email} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Input id="field-fatherSpouseName" label="Father/Spouse Name" value={form.fatherSpouseName} onChange={e => setForm({ ...form, fatherSpouseName: e.target.value })} error={errors.fatherSpouseName} />
                <Select id="field-relationType" label="Relation" value={form.relationType} onChange={e => setForm({ ...form, relationType: e.target.value })} options={[{ value: 'FATHER', label: 'FATHER' }, { value: 'SPOUSE', label: 'SPOUSE' }, { value: 'MOTHER', label: 'MOTHER' }]} />
                <Input id="field-emergencyContact" label="Emergency Phone" value={form.emergencyContact} onChange={e => setForm({ ...form, emergencyContact: e.target.value })} />
              </div>
            </div>
          )}

          {activeTab === 'job' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Select id="field-branchLocation" label="Branch Location *" value={form.branchLocation} onChange={e => setForm({ ...form, branchLocation: e.target.value })} options={[{ value: '', label: 'Head Office / None' }, ...branchOptions.map(b => ({ value: b, label: b }))]} disabled={isBranchWorkspace} error={errors.branchLocation} />
                <Select id="field-department" label="Department *" value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} options={formDepartments.map(d => ({ value: d, label: d }))} error={errors.department} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Select id="field-designation" label="Designation *" value={form.designation} onChange={e => setForm({ ...form, designation: e.target.value })} options={dynamicDesignations.map(d => ({ value: d, label: d }))} error={errors.designation} />
                <Select id="field-category" label="Employment Class *" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} options={categoryOptions.map(c => ({ value: c, label: c }))} error={errors.category} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Select id="field-employmentType" label="Employment Type *" value={form.employmentType} onChange={e => setForm({ ...form, employmentType: e.target.value })} options={employmentTypeOptions.map(t => ({ value: t, label: t }))} error={errors.employmentType} />
                <Input id="field-joinDate" label="Joining Date *" type="date" value={form.joinDate} onChange={e => setForm({ ...form, joinDate: e.target.value })} error={errors.joinDate} />
              </div>
              <div>
                <Input id="field-biometricId" label="Biometric Code (Optional)" maxLength={50} placeholder="e.g. 0001" value={form.biometricId} onChange={e => setForm({ ...form, biometricId: e.target.value })} />
                <p className="text-[10px] text-slate-400 mt-1">Attendance-machine code (a.k.a. Machine Employee Code). Must be unique within the company. This is NOT the Employee ID. Leave blank if biometric attendance is not used.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input id="field-salary" label="Salary (Monthly Basic) *" type="number" value={form.salary} onChange={e => setForm({ ...form, salary: e.target.value })} error={errors.salary} />
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
                <Input id="field-aadhaar" label="Aadhaar Number" placeholder="1234 5678 9012" className="font-mono tracking-wider" value={formatAadhaar(form.aadhaar)} onChange={e => setForm({ ...form, aadhaar: rawAadhaar(e.target.value) })} error={errors.aadhaar} />
                <Input id="field-pan" label="PAN Card" placeholder="ABCDE1234F" className="font-mono" value={formatPan(form.pan)} onChange={e => setForm({ ...form, pan: rawPan(e.target.value) })} error={errors.pan} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Input id="field-pfNumber" label="Provident Fund (PF) No" value={form.pfNumber} onChange={e => setForm({ ...form, pfNumber: e.target.value })} error={errors.pfNumber} />
                <Input id="field-uan" label="Universal Account No (UAN)" value={form.uan} onChange={e => setForm({ ...form, uan: e.target.value.replace(/\D/g, '').slice(0, 12) })} error={errors.uan} />
                <Input id="field-esic" label="ESIC IP Number" value={form.esic} onChange={e => setForm({ ...form, esic: e.target.value })} error={errors.esic} />
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

      {/* Edit Employee Modal */}
      <Modal
        open={!!editEmp}
        onClose={() => setEditEmp(null)}
        title="Modify Employee Master File"
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditEmp(null)}>Cancel</Button>
            {canEdit && <Button onClick={handleEditSubmit}>Save Master File</Button>}
          </>
        }
      >
        {editEmp && (
          <div className="space-y-4 text-left text-xs font-sans">
            <div className="flex border-b border-gray-200 gap-3 text-xs">
              <button onClick={() => setActiveTab('personal')} className={`pb-1.5 font-bold transition ${activeTab === 'personal' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>1. Personal Info</button>
              <button onClick={() => setActiveTab('job')} className={`pb-1.5 font-bold transition ${activeTab === 'job' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>2. Employment Details</button>
              <button onClick={() => setActiveTab('bonus')} className={`pb-1.5 font-bold transition ${activeTab === 'bonus' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>3. Compensation Configuration</button>
              <button onClick={() => setActiveTab('banking')} className={`pb-1.5 font-bold transition ${activeTab === 'banking' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>4. Compliance & Bank</button>
              <button onClick={() => setActiveTab('address')} className={`pb-1.5 font-bold transition ${activeTab === 'address' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>5. Addresses</button>
              <button onClick={() => setActiveTab('nominees')} className={`pb-1.5 font-bold transition ${activeTab === 'nominees' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>6. Nominees</button>
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
                  <Input id="field-phone" label="Mobile Number *" value={editMobileNumber} onChange={e => setEditMobileNumber(e.target.value)} error={errors.phone} />
                </div>
                <div className="grid grid-cols-1 gap-3">
                  <Input id="field-email" label="Email Address (Optional)" value={editEmp.email || ''} onChange={e => setEditEmp({ ...editEmp, email: e.target.value })} error={errors.email} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Input id="field-fatherSpouseName" label="Father/Spouse Name" value={editEmp.fatherSpouseName || ''} onChange={e => setEditEmp({ ...editEmp, fatherSpouseName: e.target.value })} error={errors.fatherSpouseName} />
                  <Select id="field-relationType" label="Relation" value={editEmp.relationType || 'FATHER'} onChange={e => setEditEmp({ ...editEmp, relationType: e.target.value })} options={[{ value: 'FATHER', label: 'FATHER' }, { value: 'SPOUSE', label: 'SPOUSE' }, { value: 'MOTHER', label: 'MOTHER' }]} />
                  <Input id="field-emergencyContact" label="Emergency Phone" value={editEmp.emergencyContact || ''} onChange={e => setEditEmp({ ...editEmp, emergencyContact: e.target.value })} />
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
                  <Input id="field-pfNumber" label="Provident Fund (PF) No" value={editEmp.pfNumber || ''} onChange={e => setEditEmp({ ...editEmp, pfNumber: e.target.value })} error={errors.pfNumber} />
                  <Input id="field-uan" label="Universal Account No (UAN)" value={editEmp.uan || ''} onChange={e => setEditEmp({ ...editEmp, uan: e.target.value.replace(/\D/g, '').slice(0, 12) })} error={errors.uan} />
                  <Input id="field-esic" label="ESIC IP Number" value={editEmp.esic || (editEmp as any).esiNumber || ''} onChange={e => setEditEmp({ ...editEmp, esic: e.target.value })} error={errors.esic} />
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
                    <li key={step.id} className={`flex items-center gap-3 text-sm font-medium ${isActive ? 'text-blue-600' : isPast ? 'text-emerald-600' : 'text-slate-400'}`}>
                      <div className={`flex items-center justify-center w-8 h-8 rounded-full border-2 ${isActive ? 'border-blue-600 bg-blue-50' : isPast ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
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
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
                    <Lock className="text-blue-500 shrink-0 mt-0.5" size={20} />
                    <p className="text-sm text-blue-800 font-medium">System login and active attendance will be disabled.</p>
                  </div>
                  <Button onClick={() => handleWizardStepComplete(3)} className="w-full mt-4" icon={<CheckCircle2 size={16} />}>Revoke Access</Button>
                </div>
              )}
              {wizardStep === 4 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-slate-800">Final HR Approval</h3>
                  <p className="text-sm text-slate-500">Acknowledge completion of all offboarding checklists.</p>
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                    <label className="text-sm font-medium text-slate-700">HR Remarks</label>
                    <textarea className="w-full mt-2 border border-slate-200 rounded-md p-2 text-sm" rows={3} placeholder="Optional remarks..."></textarea>
                  </div>
                  <Button onClick={() => handleWizardStepComplete(4)} className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white border-0" icon={<CheckCircle2 size={16} />}>Approve Final Sign-off</Button>
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
