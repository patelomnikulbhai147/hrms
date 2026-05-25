import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Plus, Search, Eye, Edit2, Trash2,
  EyeOff, ShieldCheck, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle,
  Users, UserCheck, LogOut, ChevronRight
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  type Employee, type EmployeeStatus, type Role, type Company,
  isCompanyIdMatch
} from '../data/mockData';
import { Badge, statusBadge } from '../components/ui/Badge';
import { Table, Thead, Tbody, Th, Td, Tr } from '../components/ui/Table';
import { Card, StatCard } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input, Select } from '../components/ui/Input';
import {
  validatePhone, validateName, validateEmail,
  validateSalary, validateEmployeeId
} from '../utils/validation';
import { type UserAccount } from './Login';
import { allExcelParsedEmployees } from '../data/excelSeededData';

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

const statusOptions: EmployeeStatus[] = ['Active', 'Inactive', 'On Leave', 'Terminated'];
const categoryOptions = ['Skilled', 'Semi-skilled', 'Unskilled', 'Highly skilled'];
const employmentTypeOptions = ['PERMANENT', 'CONTRACTUAL', 'PROBATION', 'INTERN'];
const branchOptions = ['AHMEDABAD', 'BHAVNAGAR', 'RAJKOT', 'SIDDHPUR'];

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

  // Drawer & Modals state
  const [viewEmp, setViewEmp] = useState<Employee | null>(null);
  const [editEmp, setEditEmp] = useState<Employee | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteEmp, setDeleteEmp] = useState<Employee | null>(null);

  // Excel Importer states
  const [importOpen, setImportOpen] = useState(false);
  const [importedRows, setImportedRows] = useState<any[]>([]);
  const [importLogs, setImportLogs] = useState<string[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tabs in drawer
  const [activeTab, setActiveTab] = useState<'personal' | 'job' | 'banking' | 'compliance' | 'documents' | 'leaves' | 'address'>('personal');

  // Unmasking state for sensitive fields
  const [unmaskedField, setUnmaskedField] = useState<Record<string, boolean>>({});

  // Dynamic Leave History filtering for the currently viewed employee
  const empLeavesHistory = useMemo(() => {
    if (!viewEmp) return [];
    return leaves.filter(
      l => (l.employeeId === viewEmp.id || l.employeeName.toLowerCase() === viewEmp.name.toLowerCase()) &&
        l.companyId === activeCompanyId
    );
  }, [leaves, viewEmp, activeCompanyId]);

  // Handlers for premium document upload and base64 parsing
  const handleUploadDocType = (docType: 'photoUpload' | 'aadhaarUpload' | 'panUpload' | 'signatureUpload' | 'otherUpload', fileUrl: string) => {
    if (!viewEmp) return;
    const updatedEmp = {
      ...viewEmp,
      [docType]: fileUrl
    };
    onUpdateEmployees(employees.map(e => e.id === viewEmp.id ? updatedEmp : e));
    setViewEmp(updatedEmp);
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
    employeeId: '',

    // Expanded master fields
    firstName: '',
    middleName: '',
    lastName: '',
    aadhaarName: '',
    gender: 'Female',
    dob: '1998-08-10',
    maritalStatus: 'UNMARRIED',
    nationality: 'INDIAN',
    fatherSpouseName: '',
    relationType: 'FATHER',
    emergencyContact: '',
    category: 'Skilled',
    employmentType: 'CONTRACTUAL',
    exitDate: '',
    exitReason: '',
    serviceBookNo: '',
    branchLocation: 'AHMEDABAD',
    aadhaar: '',
    pan: '',
    pfNumber: '',
    uan: '',
    esic: '',
    bankName: '',
    accountNumber: '',
    ifsc: '',
    presentAddress: '',
    permanentAddress: '',
  });

  const [editCountryCode, setEditCountryCode] = useState('+91');
  const [editMobileNumber, setEditMobileNumber] = useState('');

  // Auto-generate employee code on add open
  const handleStartAdd = () => {
    const nextCodeNum = companyEmployees.length + 1;
    setForm({
      name: '', email: '', countryCode: '+91', mobileNumber: '',
      department: 'Nursing', designation: 'Staff Nurse', role: 'Staff',
      status: 'Active', location: 'Ahmedabad, Gujarat', salary: '32000',
      joinDate: '2026-05-20', manager: 'Dr. Suresh Babu',
      employeeId: `VE${String(1000 + nextCodeNum)}`,
      firstName: '', middleName: '', lastName: '', aadhaarName: '',
      gender: 'Female', dob: '1998-08-10', maritalStatus: 'UNMARRIED',
      nationality: 'INDIAN', fatherSpouseName: '', relationType: 'FATHER',
      emergencyContact: '', category: 'Skilled', employmentType: 'CONTRACTUAL',
      exitDate: '', exitReason: '', serviceBookNo: '', branchLocation: 'AHMEDABAD',
      aadhaar: '', pan: '', pfNumber: '', uan: '', esic: '',
      bankName: '', accountNumber: '', ifsc: '', presentAddress: '', permanentAddress: '',
    });
    setErrors({});
    setActiveTab('personal');
    setAddOpen(true);
  };

  const handleStartEdit = (emp: Employee) => {
    setEditEmp(emp);
    const parts = (emp.phone || '').split(' ');
    if (parts.length > 1) {
      setEditCountryCode(parts[0]);
      setEditMobileNumber(parts.slice(1).join(''));
    } else {
      setEditCountryCode('+91');
      setEditMobileNumber(emp.phone || '');
    }
    setActiveTab('personal');
    setErrors({});
  };

  // central company scope filtering
  const companyEmployees = useMemo(() => {
    return employees.filter(e => isCompanyIdMatch(e.companyId, activeCompanyId, companies));
  }, [employees, activeCompanyId, companies]);

  const filterDepartments = useMemo(() => {
    const set = new Set<string>();
    const branchEmps = employees.filter(e => {
      const matchComp = isCompanyIdMatch(e.companyId, activeCompanyId, companies);
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
      isCompanyIdMatch(e.companyId, activeCompanyId, companies) &&
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
      isCompanyIdMatch(e.companyId, activeCompanyId, companies) &&
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

  // Table Filters
  const filtered = useMemo(() => {
    const list = companyEmployees.filter(e => {
      const q = search.toLowerCase();
      const matchSearch = !q ||
        e.name.toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q) ||
        e.employeeId.toLowerCase().includes(q) ||
        (e.designation || '').toLowerCase().includes(q);
      const matchDept = !deptFilter || 
        (e.department || '').trim().toUpperCase() === deptFilter.toUpperCase() ||
        (e.designation || '').trim().toUpperCase() === deptFilter.toUpperCase();
      const matchStatus = !statusFilter || e.status === statusFilter;
      const matchBranch = !branchFilter || (e.branchLocation || '').toUpperCase() === branchFilter.toUpperCase();
      return matchSearch && matchDept && matchStatus && matchBranch;
    });

    // Automatically sort employee list by Employee Code in ascending natural order
    return [...list].sort((a, b) => {
      return a.employeeId.localeCompare(b.employeeId, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [companyEmployees, search, deptFilter, statusFilter, branchFilter]);

  // Master Statistics Calculations
  const stats = useMemo(() => {
    const total = companyEmployees.length;
    const active = companyEmployees.filter(e => e.status === 'Active').length;
    const verifiedPayroll = companyEmployees.filter(e => e.pfNumber && e.bankName && e.accountNumber).length;
    const pendingExits = companyEmployees.filter(e => e.exitDate && !e.exitReason).length;
    return { total, active, verifiedPayroll, pendingExits };
  }, [companyEmployees]);

  // Add Validation & Execution
  const handleAddSubmit = () => {
    const nameErr = validateName(form.name).error;
    const emailErr = validateEmail(form.email).error;
    const phoneErr = validatePhone(form.mobileNumber).error;
    const empIdErr = validateEmployeeId(form.employeeId, companyEmployees).error;
    const salaryErr = validateSalary(form.salary).error;

    const activeErrors: Record<string, string> = {
      name: nameErr || '',
      email: emailErr || '',
      phone: phoneErr || '',
      employeeId: empIdErr || '',
      salary: salaryErr || ''
    };

    if (!form.aadhaarName || form.aadhaarName.trim().length < 3) {
      activeErrors.aadhaarName = 'Name as per Aadhaar is required';
    }
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
    if (!form.pan || !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(form.pan.trim().toUpperCase())) {
      activeErrors.pan = 'Valid 10-character PAN is required (e.g. ABCDE1234F)';
    }
    if (!form.aadhaar || !/^\d{12}$/.test(form.aadhaar.trim())) {
      activeErrors.aadhaar = 'Valid 12-digit Aadhaar number is required';
    }
    if (!form.bankName || form.bankName.trim().length < 3) {
      activeErrors.bankName = 'Bank Name is required';
    }
    if (!form.accountNumber || form.accountNumber.trim().length < 9) {
      activeErrors.accountNumber = 'Valid Bank Account Number is required';
    }
    if (!form.ifsc || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(form.ifsc.trim().toUpperCase())) {
      activeErrors.ifsc = 'Valid 11-character IFSC is required';
    }

    if (form.pfNumber || form.uan) {
      if (!form.pfNumber) {
        activeErrors.pfNumber = 'PF Number is required if UAN is provided';
      }
      if (!form.uan || !/^\d{12}$/.test(form.uan.trim())) {
        activeErrors.uan = 'Valid 12-digit UAN is required if PF number is provided';
      }
    }

    const hasErrors = Object.values(activeErrors).some(val => val !== '');
    if (hasErrors) {
      setErrors(activeErrors);
      alert('Error: Please resolve all required fields and format validation errors before submitting.');
      return;
    }

    const newEmp: Employee = {
      id: `emp-gcri-${form.employeeId}`,
      employeeId: form.employeeId.trim(),
      companyId: activeCompanyId,
      name: form.name,
      email: form.email,
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
      aadhaarName: form.aadhaarName,
      gender: form.gender,
      dob: form.dob,
      maritalStatus: form.maritalStatus,
      nationality: form.nationality,
      fatherSpouseName: form.fatherSpouseName,
      relationType: form.relationType,
      emergencyContact: form.emergencyContact,
      category: form.category,
      employmentType: form.employmentType,
      exitDate: form.exitDate,
      exitReason: form.exitReason,
      serviceBookNo: form.serviceBookNo,
      branchLocation: form.branchLocation,
      aadhaar: form.aadhaar,
      pan: form.pan,
      pfNumber: form.pfNumber,
      uan: form.uan,
      esic: form.esic,
      bankName: form.bankName,
      accountNumber: form.accountNumber,
      ifsc: form.ifsc,
      presentAddress: form.presentAddress,
      permanentAddress: form.permanentAddress,
    };

    onUpdateEmployees([newEmp, ...employees]);
    setAddOpen(false);
    alert(`Absence/Employee profile for ${form.name} logged successfully.`);
  };

  // Edit Submission
  const handleEditSubmit = () => {
    if (!editEmp) return;

    const nameErr = validateName(editEmp.name).error;
    const emailErr = validateEmail(editEmp.email).error;
    const phoneErr = validatePhone(editMobileNumber).error;

    if (nameErr || emailErr || phoneErr) {
      alert('Error: Please correct name, email or phone errors.');
      return;
    }

    const updated: Employee = {
      ...editEmp,
      phone: `${editCountryCode} ${editMobileNumber}`,
      location: `${capitalize(editEmp.branchLocation || 'Ahmedabad')}, Gujarat`,
    };

    onUpdateEmployees(employees.map(e => e.id === editEmp.id ? updated : e));
    setEditEmp(null);
    alert('Employee profile saved successfully.');
  };

  const handleDelete = () => {
    if (!deleteEmp) return;
    const today = new Date().toISOString().split('T')[0];
    const updated: Employee = {
      ...deleteEmp,
      status: 'Terminated',
      exitDate: today,
      exitReason: 'Archived / Soft-Deleted'
    };
    onUpdateEmployees(employees.map(e => e.id === deleteEmp.id ? updated : e));
    setDeleteEmp(null);
    alert(`Employee file for ${deleteEmp.name} soft-deleted and archived successfully.`);
  };

  // Toggling secure field values
  const toggleFieldMask = (empId: string, fieldName: string) => {
    const key = `${empId}-${fieldName}`;
    setUnmaskedField(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const getMaskedValue = (val: string | undefined, fieldName: string, empId: string) => {
    if (!val) return '—';
    const key = `${empId}-${fieldName}`;
    const show = unmaskedField[key];
    if (show) return val;

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
            const isDup = companyEmployees.some(e => e.employeeId.toUpperCase() === empCode.toUpperCase()) ||
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
              companyId: activeCompanyId,
              name: fullName,
              email: email,
              phone: cleanExcelValue(row[17]),
              department: designation !== '-' && designation.toLowerCase().includes('nurse') ? 'Nursing' : 'Clinical',
              designation: designation,
              role: 'Staff' as Role,
              status: cleanExcelValue(row[29]) !== '-' ? 'Inactive' : 'Active' as EmployeeStatus,
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
              serviceBookNo: cleanExcelValue(row[28]),
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

  const handleBulkCommit = () => {
    if (importedRows.length === 0) return;
    onUpdateEmployees([...importedRows, ...employees]);
    setImportedRows([]);
    setImportLogs([]);
    setImportOpen(false);
    alert(`Bulk synchronized ${importedRows.length} employees from Excel to local HRMS successfully.`);
  };

  const loadSeededMockExcel = () => {
    // Quick load all parsed Excel records from static storage for seamless testing
    const mapped = allExcelParsedEmployees.map(emp => ({
      ...emp,
      companyId: activeCompanyId,
      role: 'Employee' as Role,
      status: (emp.status || 'Active') as any
    }));

    // Deduplicate to avoid accidental repeated seed additions
    const newEmployees = mapped.filter(m => 
      !employees.some(e => e.employeeId === m.employeeId && e.companyId === m.companyId)
    );

    if (newEmployees.length === 0) {
      alert('All enterprise seed records are already populated in this branch!');
    } else {
      onUpdateEmployees([...newEmployees, ...employees]);
      alert(`Instantly populated database with ${newEmployees.length} real employee profiles from the Excel master!`);
    }
    setImportOpen(false);
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
        {isHR && (
          <div className="flex items-center gap-2">
            <Button variant="outline" icon={<Upload size={14} />} onClick={() => setImportOpen(true)}>
              Bulk Excel Importer
            </Button>
            <Button icon={<Plus size={14} />} onClick={handleStartAdd}>
              Register Employee
            </Button>
          </div>
        )}
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Staff Strength" value={stats.total} icon={<Users size={16} className="text-blue-600" />} color="bg-blue-50" />
        <StatCard label="Active Roster" value={stats.active} icon={<UserCheck size={16} className="text-emerald-500" />} color="bg-emerald-50" />
        <StatCard label="Verified Payroll Compliance" value={stats.verifiedPayroll} icon={<ShieldCheck size={16} className="text-cyan-600" />} color="bg-cyan-50" />
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

      {/* Main Table */}
      <Card padding={false}>
        <Table>
          <Thead>
            <tr>
              <Th className="px-2 py-1.5 text-[10px] w-[8%] tracking-wider font-bold">Emp Code</Th>
              <Th className="px-2 py-1.5 text-[10px] w-[26%] tracking-wider font-bold">Employee Full Name</Th>
              <Th className="px-2 py-1.5 text-[10px] w-[10%] tracking-wider font-bold">Nationality</Th>
              <Th className="px-2 py-1.5 text-[10px] w-[12%] tracking-wider font-bold">Date of Joining</Th>
              <Th className="px-2 py-1.5 text-[10px] w-[18%] tracking-wider font-bold">Designation</Th>
              <Th className="px-2 py-1.5 text-[10px] w-[10%] tracking-wider font-bold">Category</Th>
              <Th className="px-2 py-1.5 text-[10px] w-[10%] tracking-wider font-bold">Date of Exit</Th>
              <Th className="px-2 py-1.5 text-[10px] w-[6%] tracking-wider font-bold text-center">ACTIONS</Th>
            </tr>
          </Thead>
          <Tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-10 text-xs text-gray-400">No synchronized employee profiles found</td></tr>
            ) : (
              filtered.map(emp => (
                <Tr key={emp.id} className="hover:bg-slate-50/50">
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
                  <Td className="px-2 py-1"><span className="text-[11px] font-semibold text-slate-700">{emp.nationality || 'INDIAN'}</span></Td>
                  <Td className="px-2 py-1"><span className="text-[11px] text-slate-600">{emp.joinDate}</span></Td>
                  <Td className="px-2 py-1"><span className="text-[11px] font-medium text-slate-800 truncate block max-w-[130px]">{emp.designation}</span></Td>
                  <Td className="px-2 py-1"><Badge variant="blue" className="text-[9px] px-1 py-0">{emp.category || 'SKILLED'}</Badge></Td>
                  <Td className="px-2 py-1"><span className="text-[11px] text-slate-500 font-medium">{emp.exitDate || '—'}</span></Td>
                  <Td className="px-2 py-1 w-24">
                    <div className="flex items-center justify-center gap-1 whitespace-nowrap">
                      <button
                        onClick={() => setViewEmp(emp)}
                        className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-blue-600 transition"
                        title="View Master File"
                      >
                        <Eye size={13} />
                      </button>

                      <button
                        onClick={() => handleStartEdit(emp)}
                        className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-blue-600 transition"
                        title="Edit File"
                      >
                        <Edit2 size={13} />
                      </button>

                      <button
                        onClick={() => setDeleteEmp(emp)}
                        className="p-1 hover:bg-red-50 rounded text-red-500 hover:text-red-600 transition"
                        title="Delete Employee"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </Td>
                </Tr>
              ))
            )}
          </Tbody>
        </Table>
      </Card>

      {/* View Master Drawer/Modal */}
      <Modal open={!!viewEmp} onClose={() => setViewEmp(null)} title="Enterprise Master Employee Profile" size="md">
        {viewEmp && (
          <div className="space-y-4 text-left text-xs font-sans">
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
              <button onClick={() => setActiveTab('leaves')} className={`pb-1.5 font-bold whitespace-nowrap transition ${activeTab === 'leaves' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>Leave History</button>
            </div>

            {/* Sub-Tabs View Content */}
            {activeTab === 'personal' && (
              <div className="space-y-3.5">
                <div className="grid grid-cols-2 gap-3 p-1">
                  <div><p className="text-[10px] text-gray-400">First Name</p><p className="font-semibold text-slate-800 mt-0.5">{viewEmp.firstName || viewEmp.name.split(' ')[0]}</p></div>
                  <div><p className="text-[10px] text-gray-400">Last Name / Surname</p><p className="font-semibold text-slate-800 mt-0.5">{viewEmp.lastName || '—'}</p></div>
                  <div><p className="text-[10px] text-gray-400">Name on Aadhaar</p><p className="font-semibold text-slate-800 mt-0.5">{viewEmp.aadhaarName || viewEmp.name}</p></div>
                  <div><p className="text-[10px] text-gray-400">Gender</p><p className="font-semibold text-slate-800 mt-0.5">{viewEmp.gender || 'Female'}</p></div>
                  <div><p className="text-[10px] text-gray-400">Date of Birth</p><p className="font-semibold text-slate-800 mt-0.5">{viewEmp.dob || '—'}</p></div>
                  <div><p className="text-[10px] text-gray-400">Marital Status</p><p className="font-semibold text-slate-800 mt-0.5">{viewEmp.maritalStatus || 'UNMARRIED'}</p></div>
                  <div><p className="text-[10px] text-gray-400">Nationality</p><p className="font-semibold text-slate-800 mt-0.5">{viewEmp.nationality || 'INDIAN'}</p></div>
                  <div><p className="text-[10px] text-gray-400">Emergency Parent/Spouse</p><p className="font-semibold text-slate-800 mt-0.5">{viewEmp.fatherSpouseName || '—'} ({viewEmp.relationType || 'FATHER'})</p></div>
                </div>

                <div className="border-t border-slate-150 pt-3.5 space-y-3 p-1">
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
                <div><p className="text-[10px] text-gray-400">Date of Joining</p><p className="font-semibold text-slate-800 mt-0.5">{viewEmp.joinDate}</p></div>
                <div><p className="text-[10px] text-gray-400">Service Book No</p><p className="font-semibold text-slate-800 mt-0.5">{viewEmp.serviceBookNo || '—'}</p></div>
                <div><p className="text-[10px] text-gray-400">Monthly Basic Salary</p><p className="font-bold text-slate-800 mt-0.5">₹{(viewEmp.salary || 0).toLocaleString()}</p></div>
                {viewEmp.exitDate && (
                  <>
                    <div><p className="text-[10px] text-gray-400">Exit Date</p><p className="font-semibold text-red-600 mt-0.5">{viewEmp.exitDate}</p></div>
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
                    <p className="font-semibold text-slate-800 mt-0.5">{viewEmp.ifsc || '—'}</p>
                  </div>
                </div>

                <div className="border-t border-slate-150 pt-3.5">
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
                    <span className="font-semibold text-slate-800">{getMaskedValue(viewEmp.aadhaar, 'aadhaar', viewEmp.id)}</span>
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
                    <span className="font-semibold text-slate-800">{getMaskedValue(viewEmp.pan, 'pan', viewEmp.id)}</span>
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
                  <p className="font-semibold text-slate-800 mt-0.5">{viewEmp.esic || '—'}</p>
                </div>
              </div>
            )}

            {activeTab === 'documents' && (
              <div className="space-y-3 p-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {/* Photo Card */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col justify-between hover:shadow-xs transition">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Passport Photo</span>
                        <Badge variant={viewEmp.photoUpload ? 'green' : 'amber'}>
                          {viewEmp.photoUpload ? 'Verified' : 'Pending'}
                        </Badge>
                      </div>
                      <p className="text-[9px] text-slate-400 mt-0.5">Primary photo identification</p>

                      <div className="my-3 flex justify-center bg-white p-2 rounded-lg border border-slate-100 h-20 items-center overflow-hidden">
                        {viewEmp.photoUpload ? (
                          <img src={viewEmp.photoUpload} alt="Passport Photo" className="h-full object-contain rounded" />
                        ) : (
                          <div className="text-center text-slate-400 py-2">
                            <Users size={20} className="mx-auto text-slate-300 block" />
                            <span className="text-[9px]">No photo uploaded</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex justify-between items-center gap-1.5 pt-2 border-t border-slate-150">
                      {viewEmp.photoUpload ? (
                        <>
                          <a href={viewEmp.photoUpload} download={`${viewEmp.name}_photo.jpg`} className="px-2 py-0.5 bg-white hover:bg-slate-100 border border-slate-250 text-slate-700 rounded text-[9px] font-bold transition">
                            Download
                          </a>
                          <button onClick={() => document.getElementById('upload-photoUpload')?.click()} className="px-2 py-0.5 bg-white hover:bg-slate-100 border border-slate-250 text-slate-700 rounded text-[9px] font-bold transition">
                            Replace
                          </button>
                        </>
                      ) : (
                        <button onClick={() => document.getElementById('upload-photoUpload')?.click()} className="w-full py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[9px] font-bold transition flex items-center justify-center gap-1">
                          <Upload size={10} /> Upload
                        </button>
                      )}
                      <input type="file" id="upload-photoUpload" className="hidden" accept="image/*" onChange={e => handleFileChange(e, 'photoUpload')} />
                    </div>
                  </div>

                  {/* Aadhaar Card */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col justify-between hover:shadow-xs transition">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Aadhaar Card</span>
                        <Badge variant={viewEmp.aadhaarUpload ? 'green' : 'amber'}>
                          {viewEmp.aadhaarUpload ? 'Verified' : 'Pending'}
                        </Badge>
                      </div>
                      <p className="text-[9px] text-slate-400 mt-0.5">Government identification scanner</p>

                      <div className="my-3 flex justify-center bg-white p-2 rounded-lg border border-slate-100 h-20 items-center overflow-hidden">
                        {viewEmp.aadhaarUpload ? (
                          <div className="text-center text-emerald-600 py-2">
                            <ShieldCheck size={20} className="mx-auto text-emerald-500" />
                            <a href={viewEmp.aadhaarUpload} target="_blank" rel="noreferrer" className="text-[9px] font-bold text-blue-600 hover:underline block mt-1">View Document PDF</a>
                          </div>
                        ) : (
                          <div className="text-center text-slate-400 py-2">
                            <FileSpreadsheet size={20} className="mx-auto text-slate-300 block" />
                            <span className="text-[9px]">Pending compliance upload</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex justify-between items-center gap-1.5 pt-2 border-t border-slate-150">
                      {viewEmp.aadhaarUpload ? (
                        <>
                          <a href={viewEmp.aadhaarUpload} download={`${viewEmp.name}_aadhaar.pdf`} className="px-2 py-0.5 bg-white hover:bg-slate-100 border border-slate-250 text-slate-700 rounded text-[9px] font-bold transition">
                            Download
                          </a>
                          <button onClick={() => document.getElementById('upload-aadhaarUpload')?.click()} className="px-2 py-0.5 bg-white hover:bg-slate-100 border border-slate-250 text-slate-700 rounded text-[9px] font-bold transition">
                            Replace
                          </button>
                        </>
                      ) : (
                        <button onClick={() => document.getElementById('upload-aadhaarUpload')?.click()} className="w-full py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[9px] font-bold transition flex items-center justify-center gap-1">
                          <Upload size={10} /> Upload
                        </button>
                      )}
                      <input type="file" id="upload-aadhaarUpload" className="hidden" accept=".pdf,image/*" onChange={e => handleFileChange(e, 'aadhaarUpload')} />
                    </div>
                  </div>

                  {/* PAN Card */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col justify-between hover:shadow-xs transition">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">PAN Card</span>
                        <Badge variant={viewEmp.panUpload ? 'green' : 'amber'}>
                          {viewEmp.panUpload ? 'Verified' : 'Pending'}
                        </Badge>
                      </div>
                      <p className="text-[9px] text-slate-400 mt-0.5">Tax division registration card</p>

                      <div className="my-3 flex justify-center bg-white p-2 rounded-lg border border-slate-100 h-20 items-center overflow-hidden">
                        {viewEmp.panUpload ? (
                          <div className="text-center text-emerald-600 py-2">
                            <ShieldCheck size={20} className="mx-auto text-emerald-500" />
                            <a href={viewEmp.panUpload} target="_blank" rel="noreferrer" className="text-[9px] font-bold text-blue-600 hover:underline block mt-1">View Document PDF</a>
                          </div>
                        ) : (
                          <div className="text-center text-slate-400 py-2">
                            <FileSpreadsheet size={20} className="mx-auto text-slate-300 block" />
                            <span className="text-[9px]">Pending compliance upload</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex justify-between items-center gap-1.5 pt-2 border-t border-slate-150">
                      {viewEmp.panUpload ? (
                        <>
                          <a href={viewEmp.panUpload} download={`${viewEmp.name}_pan.pdf`} className="px-2 py-0.5 bg-white hover:bg-slate-100 border border-slate-250 text-slate-700 rounded text-[9px] font-bold transition">
                            Download
                          </a>
                          <button onClick={() => document.getElementById('upload-panUpload')?.click()} className="px-2 py-0.5 bg-white hover:bg-slate-100 border border-slate-250 text-slate-700 rounded text-[9px] font-bold transition">
                            Replace
                          </button>
                        </>
                      ) : (
                        <button onClick={() => document.getElementById('upload-panUpload')?.click()} className="w-full py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[9px] font-bold transition flex items-center justify-center gap-1">
                          <Upload size={10} /> Upload
                        </button>
                      )}
                      <input type="file" id="upload-panUpload" className="hidden" accept=".pdf,image/*" onChange={e => handleFileChange(e, 'panUpload')} />
                    </div>
                  </div>

                  {/* Signature Scan */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col justify-between hover:shadow-xs transition">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Signature</span>
                        <Badge variant={viewEmp.signatureUpload ? 'green' : 'amber'}>
                          {viewEmp.signatureUpload ? 'Verified' : 'Pending'}
                        </Badge>
                      </div>
                      <p className="text-[9px] text-slate-400 mt-0.5">Official signature record</p>

                      <div className="my-3 flex justify-center bg-white p-2 rounded-lg border border-slate-100 h-20 items-center overflow-hidden">
                        {viewEmp.signatureUpload ? (
                          <img src={viewEmp.signatureUpload} alt="Signature Record" className="h-full object-contain rounded" />
                        ) : (
                          <div className="text-center text-slate-400 py-2">
                            <Edit2 size={20} className="mx-auto text-slate-300 block" />
                            <span className="text-[9px]">No signature uploaded</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex justify-between items-center gap-1.5 pt-2 border-t border-slate-150">
                      {viewEmp.signatureUpload ? (
                        <>
                          <a href={viewEmp.signatureUpload} download={`${viewEmp.name}_signature.jpg`} className="px-2 py-0.5 bg-white hover:bg-slate-100 border border-slate-250 text-slate-700 rounded text-[9px] font-bold transition">
                            Download
                          </a>
                          <button onClick={() => document.getElementById('upload-signatureUpload')?.click()} className="px-2 py-0.5 bg-white hover:bg-slate-100 border border-slate-250 text-slate-700 rounded text-[9px] font-bold transition">
                            Replace
                          </button>
                        </>
                      ) : (
                        <button onClick={() => document.getElementById('upload-signatureUpload')?.click()} className="w-full py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[9px] font-bold transition flex items-center justify-center gap-1">
                          <Upload size={10} /> Upload
                        </button>
                      )}
                      <input type="file" id="upload-signatureUpload" className="hidden" accept="image/*" onChange={e => handleFileChange(e, 'signatureUpload')} />
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

      {/* Bulk Excel Import Dialog */}
      <Modal open={importOpen} onClose={() => setImportOpen(false)} title="Enterprise Excel Importer" size="md">
        <div className="space-y-4 text-left text-xs font-sans">
          <div className="p-3 bg-blue-50 border border-blue-200 text-blue-800 rounded-lg">
            <h4 className="font-bold flex items-center gap-1.5 text-[11px] uppercase tracking-wide">Excel Master Import Protocol</h4>
            <p className="mt-1 leading-relaxed">
              Drop your real employee master dataset (`.xlsx`) to parse all location sheets (AHMEDABAD, BHAVNAGAR, RAJKOT, SIDDHPUR) and synchronise them dynamically.
            </p>
          </div>

          {/* Quick Mock Trigger */}
          <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
            <div>
              <p className="font-bold text-slate-800">Quick-Load Excel Seeding (834 Rows)</p>
              <p className="text-[10px] text-slate-500">Populates the HRMS dynamically with the full parsed real master roster.</p>
            </div>
            <Button variant="outline" size="sm" onClick={loadSeededMockExcel}>
              Load Seeded Dataset
            </Button>
          </div>

          {/* Drag & Drop File Container */}
          <div
            onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleExcelDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition ${isDragOver ? 'border-blue-500 bg-blue-50/50' : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50/50'
              }`}
          >
            <input type="file" ref={fileInputRef} onChange={handleExcelSelect} accept=".xlsx,.xls" className="hidden" />
            <FileSpreadsheet className="mx-auto text-slate-400 mb-2" size={32} />
            <p className="font-bold text-slate-700">Drag & Drop Employee Master File Here</p>
            <p className="text-[10px] text-gray-400 mt-1">Accepts standard .xlsx and .xls sheets up to 10MB</p>
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
                <Button icon={<CheckCircle2 size={12} />} onClick={handleBulkCommit}>Commit Bulk Import</Button>
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
          <>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAddSubmit}>Save Master File</Button>
          </>
        }
      >
        <div className="space-y-4 text-left text-xs font-sans">
          {/* Tabs header in dialog */}
          <div className="flex border-b border-gray-200 gap-3 text-xs">
            <button onClick={() => setActiveTab('personal')} className={`pb-1.5 font-bold transition ${activeTab === 'personal' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>1. Personal Info</button>
            <button onClick={() => setActiveTab('job')} className={`pb-1.5 font-bold transition ${activeTab === 'job' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>2. Employment Details</button>
            <button onClick={() => setActiveTab('banking')} className={`pb-1.5 font-bold transition ${activeTab === 'banking' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>3. Compliance & Bank</button>
            <button onClick={() => setActiveTab('address')} className={`pb-1.5 font-bold transition ${activeTab === 'address' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>4. Addresses</button>
          </div>

          {activeTab === 'personal' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Input label="Employee Code *" value={form.employeeId} onChange={e => setForm({ ...form, employeeId: e.target.value })} error={errors.employeeId} />
                <Input label="Aadhaar Full Name *" placeholder="e.g. NAGARADE PRITI VIJAYBHAI" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} error={errors.name} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Input label="First Name" value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} />
                <Input label="Middle Name" value={form.middleName} onChange={e => setForm({ ...form, middleName: e.target.value })} />
                <Input label="Surname / Last Name" value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Select label="Gender *" value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value })} options={[{ value: 'Female', label: 'Female' }, { value: 'Male', label: 'Male' }]} />
                <Input label="Date of Birth *" type="date" value={form.dob} onChange={e => setForm({ ...form, dob: e.target.value })} />
                <Select label="Marital Status *" value={form.maritalStatus} onChange={e => setForm({ ...form, maritalStatus: e.target.value })} options={[{ value: 'UNMARRIED', label: 'UNMARRIED' }, { value: 'MARRIED', label: 'MARRIED' }]} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Nationality" value={form.nationality} onChange={e => setForm({ ...form, nationality: e.target.value })} />
                <Input label="Mobile Number *" value={form.mobileNumber} onChange={e => setForm({ ...form, mobileNumber: e.target.value })} error={errors.phone} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Input label="Father/Spouse Name" value={form.fatherSpouseName} onChange={e => setForm({ ...form, fatherSpouseName: e.target.value })} />
                <Select label="Relation" value={form.relationType} onChange={e => setForm({ ...form, relationType: e.target.value })} options={[{ value: 'FATHER', label: 'FATHER' }, { value: 'SPOUSE', label: 'SPOUSE' }, { value: 'MOTHER', label: 'MOTHER' }]} />
                <Input label="Emergency Phone" value={form.emergencyContact} onChange={e => setForm({ ...form, emergencyContact: e.target.value })} />
              </div>
            </div>
          )}

          {activeTab === 'job' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Select label="Branch Location *" value={form.branchLocation} onChange={e => setForm({ ...form, branchLocation: e.target.value })} options={branchOptions.map(b => ({ value: b, label: b }))} />
                <Select label="Department *" value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} options={formDepartments.map(d => ({ value: d, label: d }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Select label="Designation *" value={form.designation} onChange={e => setForm({ ...form, designation: e.target.value })} options={dynamicDesignations.map(d => ({ value: d, label: d }))} />
                <Select label="Employment Class *" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} options={categoryOptions.map(c => ({ value: c, label: c }))} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Select label="Employment Type *" value={form.employmentType} onChange={e => setForm({ ...form, employmentType: e.target.value })} options={employmentTypeOptions.map(t => ({ value: t, label: t }))} />
                <Input label="Joining Date *" type="date" value={form.joinDate} onChange={e => setForm({ ...form, joinDate: e.target.value })} />
                <Input label="Service Book No" value={form.serviceBookNo} onChange={e => setForm({ ...form, serviceBookNo: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Salary (Monthly Basic) *" type="number" value={form.salary} onChange={e => setForm({ ...form, salary: e.target.value })} error={errors.salary} />
                <Input label="Manager" value={form.manager} onChange={e => setForm({ ...form, manager: e.target.value })} />
              </div>
            </div>
          )}

          {activeTab === 'banking' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Input label="Aadhaar Number" placeholder="12-digit number" value={form.aadhaar} onChange={e => setForm({ ...form, aadhaar: e.target.value.replace(/\D/g, '').slice(0, 12) })} />
                <Input label="PAN Card" placeholder="10-character alphanumeric" value={form.pan} onChange={e => setForm({ ...form, pan: e.target.value.toUpperCase().slice(0, 10) })} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Input label="Provident Fund (PF) No" value={form.pfNumber} onChange={e => setForm({ ...form, pfNumber: e.target.value })} />
                <Input label="Universal Account No (UAN)" value={form.uan} onChange={e => setForm({ ...form, uan: e.target.value.replace(/\D/g, '').slice(0, 12) })} />
                <Input label="ESIC IP Number" value={form.esic} onChange={e => setForm({ ...form, esic: e.target.value })} />
              </div>
              <div className="border-t border-slate-150 pt-2 grid grid-cols-3 gap-3">
                <Input label="Bank Name" placeholder="e.g. State Bank of India" value={form.bankName} onChange={e => setForm({ ...form, bankName: e.target.value })} />
                <Input label="Account Number" value={form.accountNumber} onChange={e => setForm({ ...form, accountNumber: e.target.value.replace(/\D/g, '') })} />
                <Input label="IFSC Code" placeholder="e.g. SBIN0001234" value={form.ifsc} onChange={e => setForm({ ...form, ifsc: e.target.value.toUpperCase().slice(0, 11) })} />
              </div>
            </div>
          )}

          {activeTab === 'address' && (
            <div className="space-y-3">
              <Input label="Present Address" value={form.presentAddress} onChange={e => setForm({ ...form, presentAddress: e.target.value })} />
              <Input label="Permanent Address" value={form.permanentAddress} onChange={e => setForm({ ...form, permanentAddress: e.target.value })} />
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
            <Button onClick={handleEditSubmit}>Save Master File</Button>
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
            </div>

            {activeTab === 'personal' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Employee Code *" value={editEmp.employeeId} disabled />
                  <Input label="Aadhaar Full Name *" value={editEmp.name} onChange={e => setEditEmp({ ...editEmp, name: e.target.value })} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Input label="First Name" value={editEmp.firstName || ''} onChange={e => setEditEmp({ ...editEmp, firstName: e.target.value })} />
                  <Input label="Middle Name" value={editEmp.middleName || ''} onChange={e => setEditEmp({ ...editEmp, middleName: e.target.value })} />
                  <Input label="Surname / Last Name" value={editEmp.lastName || ''} onChange={e => setEditEmp({ ...editEmp, lastName: e.target.value })} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Select label="Gender *" value={editEmp.gender || 'Female'} onChange={e => setEditEmp({ ...editEmp, gender: e.target.value })} options={[{ value: 'Female', label: 'Female' }, { value: 'Male', label: 'Male' }]} />
                  <Input label="Date of Birth *" type="date" value={editEmp.dob || ''} onChange={e => setEditEmp({ ...editEmp, dob: e.target.value })} />
                  <Select label="Marital Status *" value={editEmp.maritalStatus || 'UNMARRIED'} onChange={e => setEditEmp({ ...editEmp, maritalStatus: e.target.value })} options={[{ value: 'UNMARRIED', label: 'UNMARRIED' }, { value: 'MARRIED', label: 'MARRIED' }]} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Nationality" value={editEmp.nationality || 'INDIAN'} onChange={e => setEditEmp({ ...editEmp, nationality: e.target.value })} />
                  <Input label="Mobile Number *" value={editMobileNumber} onChange={e => setEditMobileNumber(e.target.value)} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Input label="Father/Spouse Name" value={editEmp.fatherSpouseName || ''} onChange={e => setEditEmp({ ...editEmp, fatherSpouseName: e.target.value })} />
                  <Select label="Relation" value={editEmp.relationType || 'FATHER'} onChange={e => setEditEmp({ ...editEmp, relationType: e.target.value })} options={[{ value: 'FATHER', label: 'FATHER' }, { value: 'SPOUSE', label: 'SPOUSE' }, { value: 'MOTHER', label: 'MOTHER' }]} />
                  <Input label="Emergency Phone" value={editEmp.emergencyContact || ''} onChange={e => setEditEmp({ ...editEmp, emergencyContact: e.target.value })} />
                </div>
              </div>
            )}

            {activeTab === 'job' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Select label="Branch Location *" value={editEmp.branchLocation || 'AHMEDABAD'} onChange={e => setEditEmp({ ...editEmp, branchLocation: e.target.value })} options={branchOptions.map(b => ({ value: b, label: b }))} />
                  <Select label="Department *" value={editEmp.department} onChange={e => setEditEmp({ ...editEmp, department: e.target.value })} options={editFormDepartments.map(d => ({ value: d, label: d }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Select label="Designation *" value={editEmp.designation} onChange={e => setEditEmp({ ...editEmp, designation: e.target.value })} options={dynamicDesignations.map(d => ({ value: d, label: d }))} />
                  <Select label="Employment Class *" value={editEmp.category || 'Skilled'} onChange={e => setEditEmp({ ...editEmp, category: e.target.value })} options={categoryOptions.map(c => ({ value: c, label: c }))} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Select label="Employment Type *" value={editEmp.employmentType || 'CONTRACTUAL'} onChange={e => setEditEmp({ ...editEmp, employmentType: e.target.value })} options={employmentTypeOptions.map(t => ({ value: t, label: t }))} />
                  <Input label="Joining Date *" type="date" value={editEmp.joinDate} onChange={e => setEditEmp({ ...editEmp, joinDate: e.target.value })} />
                  <Input label="Service Book No" value={editEmp.serviceBookNo || ''} onChange={e => setEditEmp({ ...editEmp, serviceBookNo: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Salary (Monthly Basic) *" type="number" value={editEmp.salary} onChange={e => setEditEmp({ ...editEmp, salary: parseInt(e.target.value) || 0 })} />
                  <Input label="Manager" value={editEmp.manager} onChange={e => setEditEmp({ ...editEmp, manager: e.target.value })} />
                </div>
                <div className="border-t border-slate-150 pt-2 grid grid-cols-2 gap-3">
                  <Input label="Exit Date" type="date" value={editEmp.exitDate || ''} onChange={e => setEditEmp({ ...editEmp, exitDate: e.target.value, status: e.target.value ? 'Terminated' : 'Active' })} />
                  <Input label="Exit Reason" value={editEmp.exitReason || ''} onChange={e => setEditEmp({ ...editEmp, exitReason: e.target.value })} />
                </div>
              </div>
            )}

            {activeTab === 'banking' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Aadhaar Number" value={editEmp.aadhaar || ''} onChange={e => setEditEmp({ ...editEmp, aadhaar: e.target.value.replace(/\D/g, '').slice(0, 12) })} />
                  <Input label="PAN Card" value={editEmp.pan || ''} onChange={e => setEditEmp({ ...editEmp, pan: e.target.value.toUpperCase().slice(0, 10) })} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Input label="Provident Fund (PF) No" value={editEmp.pfNumber || ''} onChange={e => setEditEmp({ ...editEmp, pfNumber: e.target.value })} />
                  <Input label="Universal Account No (UAN)" value={editEmp.uan || ''} onChange={e => setEditEmp({ ...editEmp, uan: e.target.value.replace(/\D/g, '').slice(0, 12) })} />
                  <Input label="ESIC IP Number" value={editEmp.esic || ''} onChange={e => setEditEmp({ ...editEmp, esic: e.target.value })} />
                </div>
                <div className="border-t border-slate-150 pt-2 grid grid-cols-3 gap-3">
                  <Input label="Bank Name" value={editEmp.bankName || ''} onChange={e => setEditEmp({ ...editEmp, bankName: e.target.value })} />
                  <Input label="Account Number" value={editEmp.accountNumber || ''} onChange={e => setEditEmp({ ...editEmp, accountNumber: e.target.value.replace(/\D/g, '') })} />
                  <Input label="IFSC Code" value={editEmp.ifsc || ''} onChange={e => setEditEmp({ ...editEmp, ifsc: e.target.value.toUpperCase().slice(0, 11) })} />
                </div>
              </div>
            )}

            {activeTab === 'address' && (
              <div className="space-y-3">
                <Input label="Present Address" value={editEmp.presentAddress || ''} onChange={e => setEditEmp({ ...editEmp, presentAddress: e.target.value })} />
                <Input label="Permanent Address" value={editEmp.permanentAddress || ''} onChange={e => setEditEmp({ ...editEmp, permanentAddress: e.target.value })} />
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Delete Confirmation */}
      <Modal open={!!deleteEmp} onClose={() => setDeleteEmp(null)} title="Confirm Soft-Delete & Archive" size="sm">
        {deleteEmp && (
          <div className="space-y-4 text-xs text-left p-1">
            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-950 rounded-xl flex items-start gap-2 shadow-inner">
              <AlertTriangle className="shrink-0 text-amber-600 mt-0.5 animate-pulse" size={16} />
              <div>
                <p className="font-bold text-gray-700">Are you sure you want to remove employee:</p>
                <p className="text-sm font-extrabold text-slate-900 mt-1 uppercase tracking-wide">
                  {deleteEmp.name} ?
                </p>
              </div>
            </div>

            <p className="text-[11px] text-gray-500 leading-relaxed bg-slate-50 p-2.5 rounded-xl border border-slate-150">
              Enterprise Safeguard: This record will be soft-deleted (status marked as <span className="font-semibold text-rose-700">Terminated</span>) and archived. The employee will be excluded from the active roster and payroll, but remains fully recoverable in the database later.
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <Button variant="outline" onClick={() => setDeleteEmp(null)}>Cancel</Button>
              <Button variant="danger" onClick={handleDelete}>Soft-Delete & Archive</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
