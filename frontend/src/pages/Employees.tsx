import { api } from '../api/apiClient';
import { getApiErrorMessage } from '../utils/apiError';
import { formatDate } from '../utils/formatDate';
import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Plus, Search, Eye, Edit2,
  EyeOff, ShieldCheck, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle,
  Users, UserCheck, LogOut, ChevronRight, Lock, FileText, IndianRupee, Archive
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  type Employee, type EmployeeStatus, type Role, type Company,
  isCompanyIdMatch,
  resolveActiveWorkspace
} from '../types';
import { Badge, statusBadge } from '../components/ui/Badge';
import { Table, Thead, Tbody, Th, Td, Tr } from '../components/ui/Table';
import { Card, StatCard } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { ActionConfirmationModal } from '../components/ui/ActionConfirmationModal';
import { Input, Select } from '../components/ui/Input';
import {
  validatePhone, validateName, validateEmail,
  validateSalary
} from '../utils/validation';
import { type UserAccount } from './Login';
import { getUniqueEmployees } from '../utils/deduplication';
import { ExportMenu } from '../components/ui/ExportMenu';
import { type ExportColumn } from '../utils/exportUtils';
import { BiometricImportModal } from '../components/BiometricImportModal';
import { CreatableSelect } from '../components/ui/CreatableSelect';
import { NomineesTab } from '../components/NomineesTab';
import { NomineeWizardStep } from '../components/NomineeWizardStep';
import { INDIAN_STATES, citiesForState } from '../data/indianStatesCities';
import { NATIONALITY_COUNTRIES, DEFAULT_COUNTRY } from '../data/countries';
import { byEmployeeCode } from '../utils/employeeSort';
import { isActiveEmployee, isOffboarded } from '../utils/employeeStatus';
import { formatAadhaar, formatPan, rawAadhaar, rawPan, isValidAadhaar, isValidPan, AADHAAR_ERROR, PAN_ERROR } from '../utils/idFormat';
import { BankDetails } from '../components/BankDetails';
import { usePermissions } from '../context/PermissionContext';

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
  const [activeTab, setActiveTab] = useState<'personal' | 'job' | 'banking' | 'compliance' | 'documents' | 'leaves' | 'address' | 'nominees'>('personal');

  // Unmasking state for sensitive fields
  const [unmaskedField, setUnmaskedField] = useState<Record<string, boolean>>({});

  // Dynamic Leave History filtering for the currently viewed employee

  // Enterprise Lifecycle & Export
  const [activeMainTab, setActiveMainTab] = useState<'all' | 'active' | 'previous'>('all');

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
      alert('Failed to upload document. Please try again.');
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
  const rememberState = (name: string) => { const n = (name || '').trim(); if (!n) return; setCustomStates(p => uniqSort([...p, n])); api.locationMasters.add('state', n).catch(() => {}); };
  // A custom city is always stored linked to its state, so it only resurfaces for
  // that state in future (req: "store custom cities for future use", per state).
  const rememberCity = (state: string, name: string) => {
    const st = (state || '').trim(); const n = (name || '').trim();
    if (!st || !n) return;
    setCustomCitiesByState(p => ({ ...p, [st]: uniqSort([...(p[st] || []), n]) }));
    api.locationMasters.addCity(st, n).catch(() => {});
  };
  const rememberCountry = (name: string) => { const n = (name || '').trim(); if (!n) return; setCustomCountries(p => uniqSort([...p, n])); api.locationMasters.addCountry(n).catch(() => {}); };

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
    state: '',
    city: '',
    shiftId: '' as number | string,
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
      state: '', city: '',
      shiftId: '',
    });
    setErrors({});
    setWizardNominees([]);
    setActiveTab('personal');
    setAddOpen(true);
  };

  // ── Add-wizard multi-step "Save & Continue" flow ──────────────────────────
  const ADD_STEPS = ['personal', 'job', 'banking', 'address', 'nominees', 'review'] as const;
  const ADD_STEP_LABELS: Record<string, string> = { personal: 'Personal Info', job: 'Employment Details', banking: 'Compliance & Bank', address: 'Addresses', nominees: 'Nominees', review: 'Review & Submit' };

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

  const handleSaveContinue = () => {
    const idx = ADD_STEPS.indexOf(activeTab as any);
    if (idx === -1) return;
    const sectionErrors = validateAddSection(activeTab);
    if (Object.keys(sectionErrors).length) {
      setErrors(prev => ({ ...prev, ...sectionErrors }));
      const firstKey = Object.keys(sectionErrors)[0];
      setTimeout(() => { document.getElementById(`field-${firstKey}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 50);
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

    if (!form.presentAddress || form.presentAddress.trim().length < 5) {
      activeErrors.presentAddress = 'Present Address is required (min 5 characters)';
    }
    if (!form.permanentAddress || form.permanentAddress.trim().length < 5) {
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
      else if (['presentAddress', 'permanentAddress'].includes(firstErrorKey)) setActiveTab('address');

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
      presentAddress: form.presentAddress,
      permanentAddress: form.permanentAddress,
      shiftId: form.shiftId ? Number(form.shiftId) : null,
    };

    // Validate staged nominee allocation BEFORE creating the employee, so we never
    // end up with an employee saved but nominees rejected (no partial state).
    const nomTotal = wizardNominees.reduce((s, n) => s + Number(n.percentage || 0), 0);
    if (wizardNominees.length && nomTotal > 100.01) {
      alert(`Total nominee allocation is ${nomTotal}% — it cannot exceed 100%. Fix it in the Nominees step.`);
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
      alert(`${form.name} registered successfully${nomineeNote}.`);
      // Open the profile on the Nominees tab so the saved nominees are visible and
      // any remaining ones can be completed.
      setActiveTab('nominees');
      setViewEmp(savedEmp);
      setWizardNominees([]);
    } catch (err: any) {
      console.error(err);
      alert(`Failed to save to database: ${err.message}`);
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
      alert('Employee archived successfully.');
    }).catch(err => {
      console.error(err);
      alert('Failed to archive employee');
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
      else if (['presentAddress', 'permanentAddress'].includes(firstErrorKey)) setActiveTab('address');

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
        alert('Employee successfully updated.');
      }).catch(err => {
        console.error(err);
        alert(`Failed to save to the database: ${err.message}`);
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
      alert('Employee successfully archived and removed from active workforce.');
    }).catch(err => {
      console.error(err);
      setIsOffboardingExecuting(false);
      alert(getApiErrorMessage(err, 'Could not archive the employee. No changes were saved.'));
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
        alert('Error parsing Excel file. Please ensure it matches standard branch templates.');
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
      alert(`Bulk synchronized ${response.count} employees from Excel to local HRMS successfully.`);
    } catch (error) {
      console.error('Bulk commit failed:', error);
      alert(getApiErrorMessage(error, 'Could not save the imported employees.'));
    }
  };


  const isHR = role === 'HR' || role === 'Company Head' || role === 'Super Admin';

  return (
    <div className="space-y-4 font-sans text-left">
      {/* Top action header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Synchronized Employee Workspace</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Real enterprise roster synced across banking, government compliance and payroll modules
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Main Tabs */}
          <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button
              onClick={() => setActiveMainTab('all')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${activeMainTab === 'all' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              All Staff ({companyEmployees.length})
            </button>
            <button
              onClick={() => setActiveMainTab('active')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${activeMainTab === 'active' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Active Personnel ({stats.active})
            </button>
            <button
              onClick={() => setActiveMainTab('previous')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${activeMainTab === 'previous' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Previous Personnel ({companyEmployees.length - stats.active})
            </button>
          </div>

          <ExportMenu
            fileName="Employees"
            title="Employee Directory"
            sheetName="Employees"
            columns={EMPLOYEE_EXPORT_COLUMNS}
            rows={() => filtered.map((e, i) => ({ ...e, srNo: i + 1 }))}
          />

          {isHR && canCreate && activeMainTab !== 'previous' && (
            <>
              <Button variant="outline" icon={<Upload size={14} />} onClick={() => setImportOpen(true)}>
                Bulk Importer
              </Button>
              <Button variant="outline" icon={<Upload size={14} />} onClick={() => setBioImportOpen(true)}>
                Import Biometric Codes
              </Button>
              <Button icon={<Plus size={14} />} onClick={handleStartAdd}>
                Add Employee
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Staff Strength" value={stats.total} icon={<Users size={16} className="text-blue-600" />} color="bg-blue-50" />
        <StatCard label="Active Personnel" value={stats.active} icon={<UserCheck size={16} className="text-emerald-500" />} color="bg-emerald-50" />
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

      {/* Optional column toggle */}
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

      {/* Add Employee Master Modal */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Register Master Employee File"
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
            <button onClick={() => setActiveTab('banking')} className={`pb-1.5 font-bold transition ${activeTab === 'banking' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>3. Compliance & Bank</button>
            <button onClick={() => setActiveTab('address')} className={`pb-1.5 font-bold transition ${activeTab === 'address' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>4. Addresses</button>
            <button onClick={() => setActiveTab('nominees')} className={`pb-1.5 font-bold transition ${activeTab === 'nominees' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>5. Nominees</button>
            <button onClick={() => setActiveTab('review')} className={`pb-1.5 font-bold transition ${activeTab === 'review' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>6. Review</button>
          </div>

          {/* Step 5 — Nominees (staged locally; saved transactionally after the employee is created) */}
          {activeTab === 'nominees' && (
            <NomineeWizardStep value={wizardNominees} onChange={setWizardNominees} />
          )}

          {/* Step 6 — Review & Submit */}
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
                  <div><span className="text-slate-400">Join Date:</span> <strong className="text-slate-800">{form.joinDate}</strong></div>
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
                <CreatableSelect label="State *" value={form.state} options={stateOptions}
                  placeholder="Select or type a state" error={errors.state}
                  onChange={v => setForm({ ...form, state: v, city: (form.state && v !== form.state) ? '' : form.city })} onCreate={rememberState} />
                <CreatableSelect label="City *" value={form.city} options={cityOptionsFor(form.state)}
                  placeholder={form.state ? 'Select or type a city' : 'Select a state first'} error={errors.city}
                  disabled={!form.state}
                  onChange={v => setForm({ ...form, city: v })} onCreate={v => rememberCity(form.state, v)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <CreatableSelect label="Nationality *" value={form.nationality} options={countryOptions}
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
            <div className="space-y-3">
              <Input id="field-presentAddress" label="Present Address" value={form.presentAddress} onChange={e => setForm({ ...form, presentAddress: e.target.value })} error={errors.presentAddress} />
              <Input id="field-permanentAddress" label="Permanent Address" value={form.permanentAddress} onChange={e => setForm({ ...form, permanentAddress: e.target.value })} error={errors.permanentAddress} />
              <div className="p-2 bg-slate-50 rounded border border-slate-200 flex items-center justify-between text-[11px] font-semibold text-slate-600">
                <span>Copy Present Address to Permanent?</span>
                <button type="button" onClick={() => setForm({ ...form, permanentAddress: form.presentAddress })} className="text-blue-600 hover:underline">Copy Address</button>
              </div>
            </div>
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
              <button onClick={() => setActiveTab('banking')} className={`pb-1.5 font-bold transition ${activeTab === 'banking' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>3. Compliance & Bank</button>
              <button onClick={() => setActiveTab('address')} className={`pb-1.5 font-bold transition ${activeTab === 'address' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>4. Addresses</button>
              <button onClick={() => setActiveTab('nominees')} className={`pb-1.5 font-bold transition ${activeTab === 'nominees' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>5. Nominees</button>
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
