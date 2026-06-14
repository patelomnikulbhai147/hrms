import React, { useState, useMemo } from 'react';
import {
  ShieldCheck, Search, ShieldAlert, Key, CheckCircle2, XCircle, Power,
  Building2, Users as UsersIcon, UserPlus, Upload, Download, SlidersHorizontal,
  ChevronDown, ChevronRight, Minus, GitBranch, Settings, MoreVertical, Edit2, Shield, Trash2, UserCheck, RotateCw, ClipboardList, Activity
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { type UserAccount, type AppModules, type ModulePermissions } from './Login';
import { type Company } from '../data/mockData';
import { buildCompanyBranchGroups, type CompanyBranchGroup } from '../utils/workspaceUtils';
import { Badge } from '../components/ui/Badge';
import { cn } from '../utils/cn';
import { usePermissions } from '../context/PermissionContext';
import { api } from '../api/apiClient';
import { getApiErrorMessage } from '../utils/apiError';
import { exportToExcel } from '../utils/exportUtils';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface UsersProps {
  userAccounts: UserAccount[];
  companies: Company[];
  onUpdateAccounts: (updater: UserAccount[] | ((prev: UserAccount[]) => UserAccount[])) => void;
}

const MODULES_LIST: { id: AppModules; name: string }[] = [
  { id: 'dashboard', name: 'Dashboard' },
  { id: 'companies', name: 'Companies (Super Admin only)' },
  { id: 'billing', name: 'Billing & Subscriptions' },
  { id: 'employees', name: 'Employees' },
  { id: 'leaves', name: 'Leave Management' },
  { id: 'payroll', name: 'Payroll' },
  { id: 'attendance', name: 'Attendance' },
  { id: 'documents', name: 'Documents' },
  { id: 'reports', name: 'Reports' },
  { id: 'settings', name: 'Settings' }
];

const DEFAULT_PERMISSIONS: ModulePermissions = {
  view: true,
  edit: false,
  create: false,
  delete: false,
  export: false,
  approve: false,
  print: false,
  manage: false
};

export const Users: React.FC<UsersProps> = ({ userAccounts, companies, onUpdateAccounts }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('All');
  const [companyFilter, setCompanyFilter] = useState<string>('All');
  const [branchFilter, setBranchFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<'excel' | 'pdf'>('excel');
  const [exportScope, setExportScope] = useState<'all' | 'filtered' | 'current'>('all');
  const [exportContent, setExportContent] = useState({
    userInfo: true,
    companyAccess: true,
    branchAccess: true,
    permissions: true,
    auditData: true
  });
  
  const [isAuditOpen, setIsAuditOpen] = useState(false);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  const fetchAuditLogs = async () => {
    setIsAuditOpen(true);
    setLoadingAudit(true);
    try {
      const logs = await api.users.getAuditLogs();
      setAuditLogs(logs);
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoadingAudit(false);
    }
  };

  const [newUser, setNewUser] = useState<Partial<UserAccount>>({
    name: '',
    email: '',
    username: '',
    password: '',
    role: 'HR',
    status: 'Active',
    companyId: ''
  });
  
  const { canDelete: canDeleteModule, hasBranchAccess } = usePermissions();
  const canDelete = canDeleteModule('users');

  // Modal state
  const [selectedUser, setSelectedUser] = useState<UserAccount | null>(null);

  // ── Admin "Reset Password" modal state ────────────────────────────────────
  const [resetUser, setResetUser] = useState<UserAccount | null>(null);
  const [resetPw, setResetPw] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');
  const [resetShow, setResetShow] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetDone, setResetDone] = useState(false);

  const openReset = (user: UserAccount) => {
    setResetUser(user); setResetPw(''); setResetConfirm(''); setResetShow(false);
    setResetError(''); setResetDone(false); setResetBusy(false);
  };
  const closeReset = () => { setResetUser(null); setResetBusy(false); };

  const handleResetPassword = async () => {
    if (!resetUser) return;
    setResetError('');
    if (resetPw.length < 8) { setResetError('Password must be at least 8 characters long.'); return; }
    if (resetPw !== resetConfirm) { setResetError('Passwords do not match.'); return; }
    setResetBusy(true);
    try {
      await api.users.resetPassword(String(resetUser.id), resetPw);
      setResetDone(true); // show success confirmation
    } catch (err) {
      setResetError(getApiErrorMessage(err, 'Could not reset the password.'));
    } finally {
      setResetBusy(false);
    }
  };
  // Workspace Access matrix: which company groups are collapsed (default: all expanded).
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Ids arrive as numbers from the API but the UI/filters use strings, so every
  // id comparison is coerced. Without this, companies.find / the Company filter
  // never matched (number !== string) — breaking company lookups and filtering.
  const sameId = (a: any, b: any) => a != null && b != null && String(a) === String(b);

  const filteredUsers = userAccounts.filter(user => {
    const company = companies.find(c => sameId(c.id, user.companyId));
    const q = (searchTerm || '').trim().toLowerCase();

    const matchesSearch = !q ||
                          (user?.name || '').toLowerCase().includes(q) ||
                          (user?.username || '').toLowerCase().includes(q) ||
                          (user?.email || '').toLowerCase().includes(q) ||
                          (company?.name || '').toLowerCase().includes(q) ||
                          ((company as any)?.branchName || '').toLowerCase().includes(q);

    const matchesRole = roleFilter === 'All' || user.role === roleFilter;
    const matchesCompany = companyFilter === 'All' || sameId(user.companyId, companyFilter);
    const matchesBranch = branchFilter === 'All' || (company as any)?.branchName === branchFilter;
    const matchesStatus = statusFilter === 'All' || user.status === statusFilter;

    return matchesSearch && matchesRole && matchesCompany && matchesBranch && matchesStatus;
  })
  // Default ordering: ascending by database id. Gaps in the id sequence (e.g. a
  // missing 7 from a deleted/rolled-back row) are expected and left untouched —
  // we only sort for display. The visible row number is a derived SR NO, so the
  // internal primary key is never exposed to users.
  .sort((a, b) => {
    const na = Number(a.id), nb = Number(b.id);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return String(a.id ?? '').localeCompare(String(b.id ?? ''));
  });

  const handleToggleStatus = async (userId: string) => {
    try {
      const user = userAccounts.find(u => u.id === userId);
      if (!user) return;
      const newStatus = user.status === 'Active' ? 'Disabled' : 'Active';
      await api.users.update(userId, { status: newStatus });
      onUpdateAccounts(prev => prev.map(u => {
        if (u.id === userId) {
          return { ...u, status: newStatus };
        }
        return u;
      }));
    } catch (err) {
      console.error('Failed to toggle status:', err);
      alert(getApiErrorMessage(err, 'Could not update the user status.'));
    }
  };

  const handleOpenPermissions = (user: UserAccount) => {
    setSelectedUser(user);
  };

  const handleCloseModal = () => {
    setSelectedUser(null);
  };

  const handleToggleModuleAccess = (moduleId: AppModules) => {
    if (!selectedUser) return;
    const currentAccess = selectedUser.moduleAccess?.[moduleId] ?? true;
    
    const updatedUser = { ...selectedUser };
    if (!updatedUser.moduleAccess) updatedUser.moduleAccess = {} as Record<AppModules, boolean>;
    
    updatedUser.moduleAccess[moduleId] = !currentAccess;
    setSelectedUser(updatedUser);
  };

  const handleToggleActionPermission = (moduleId: AppModules, action: keyof ModulePermissions) => {
    if (!selectedUser) return;
    
    const updatedUser = { ...selectedUser };
    if (!updatedUser.permissions) updatedUser.permissions = {} as Record<AppModules, ModulePermissions>;
    if (!updatedUser.permissions[moduleId]) updatedUser.permissions[moduleId] = { ...DEFAULT_PERMISSIONS };
    
    updatedUser.permissions[moduleId][action] = !updatedUser.permissions[moduleId][action];
    setSelectedUser(updatedUser);
  };

  // --- Workspace Access selection ----------------------------------------
  // The user's primary base (companyId) is always granted and can never be
  // removed; everything else lives in accessibleCompanyIds.
  const isWorkspaceLocked = (id: string) => !!selectedUser && selectedUser.companyId === id;
  const isWorkspaceSelected = (id: string) =>
    !!selectedUser && (isWorkspaceLocked(id) || (selectedUser.accessibleCompanyIds || []).includes(id));

  const commitAccessibleIds = (ids: Set<string>) => {
    if (!selectedUser) return;
    // The primary base is implicit, so don't persist it inside accessibleCompanyIds.
    if (selectedUser.companyId) ids.delete(selectedUser.companyId);
    setSelectedUser({ ...selectedUser, accessibleCompanyIds: Array.from(ids) });
  };

  const handleToggleWorkspace = (companyId: string) => {
    if (!selectedUser || isWorkspaceLocked(companyId)) return;
    const next = new Set(selectedUser.accessibleCompanyIds || []);
    next.has(companyId) ? next.delete(companyId) : next.add(companyId);
    commitAccessibleIds(next);
  };

  // Tri-state for a company group, derived from its branches (or the company
  // itself when it has no branches): 'all' | 'partial' | 'none'.
  const getGroupState = (group: CompanyBranchGroup): 'all' | 'partial' | 'none' => {
    const ids = group.branches.length > 0
      ? group.branches.map(b => b.id)
      : [group.companyId];
    const selected = ids.filter(isWorkspaceSelected).length;
    if (selected === 0) return 'none';
    if (selected === ids.length) return 'all';
    return 'partial';
  };

  // AUTO-SELECT / AUTO-DESELECT: toggling the company header selects ALL of its
  // branches (plus the company node), or clears them — never partially.
  const handleToggleCompanyGroup = (group: CompanyBranchGroup) => {
    if (!selectedUser) return;
    const branchIds = group.branches.map(b => b.id);
    // Include the company node itself only when it's a real, loaded workspace.
    const targets = group.company
      ? [group.companyId, ...branchIds]
      : (branchIds.length > 0 ? branchIds : [group.companyId]);
    const next = new Set(selectedUser.accessibleCompanyIds || []);
    if (getGroupState(group) === 'all') {
      targets.forEach(id => { if (!isWorkspaceLocked(id)) next.delete(id); });
    } else {
      targets.forEach(id => next.add(id));
    }
    commitAccessibleIds(next);
  };

  const toggleGroupCollapsed = (companyId: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      next.has(companyId) ? next.delete(companyId) : next.add(companyId);
      return next;
    });
  };

  // PERMISSION VALIDATION: a scoped admin only ever sees the companies/branches
  // they themselves can reach (Company Admin -> own company + branches; Branch
  // admin -> assigned branch). Super Admin sees everything because hasBranchAccess
  // returns true for them. Grouping is then strictly by parentCompanyId, so no
  // branch can appear under the wrong company.
  const accessGroups = useMemo<CompanyBranchGroup[]>(
    () => buildCompanyBranchGroups(companies.filter(c => hasBranchAccess(c.id))),
    [companies, hasBranchAccess]
  );
  const totalBranchCount = useMemo(
    () => accessGroups.reduce((n, g) => n + g.branches.length, 0),
    [accessGroups]
  );

  const handleSavePermissions = async () => {
    if (!selectedUser) return;
    
    try {
      const updatedUserFromApi = await api.users.update(selectedUser.id, {
        accessibleCompanyIds: selectedUser.accessibleCompanyIds,
        moduleAccess: selectedUser.moduleAccess,
        permissions: selectedUser.permissions
      });
      
      onUpdateAccounts(prev => prev.map(u => u.id === selectedUser.id ? updatedUserFromApi : u));
      setSelectedUser(null);
    } catch (err) {
      console.error('Failed to save permissions to backend:', err);
      alert(getApiErrorMessage(err, 'Could not save permissions.'));
    }
  };

  // Stats
  const totalUsers = userAccounts.length;
  const activeUsers = userAccounts.filter(u => u.status === 'Active').length;
  const superAdmins = userAccounts.filter(u => u.role === 'Super Admin').length;
  const companyHeads = userAccounts.filter(u => u.role === 'Company Head').length;
  const hrManagers = userAccounts.filter(u => u.role === 'HR').length;

  const handleClearFilters = () => {
    setSearchTerm('');
    setRoleFilter('All');
    setCompanyFilter('All');
    setBranchFilter('All');
    setStatusFilter('All');
  };

  const handleExport = () => {
    setIsExportOpen(true);
  };

  const handleExportSubmit = () => {
    const dataToExport = exportScope === 'all' ? userAccounts : filteredUsers;

    if (exportFormat === 'excel') {
      const wb = XLSX.utils.book_new();
      
      // Sheet 1: User Directory
      if (exportContent.userInfo) {
        const directoryData = dataToExport.map(u => ({
          'User ID': u.username,
          'Full Name': u.name,
          'Email': u.email,
          'Role': u.role,
          'Status': u.status
        }));
        const wsDirectory = XLSX.utils.json_to_sheet(directoryData);
        XLSX.utils.book_append_sheet(wb, wsDirectory, 'User Directory');
      }

      // Sheet 2: Role Permissions
      if (exportContent.permissions) {
        const permissionsData = dataToExport.map(u => ({
          'Full Name': u.name,
          'Role': u.role,
          'Dashboard': u.moduleAccess?.dashboard ? 'Yes' : 'No',
          'Employees': u.moduleAccess?.employees ? 'Yes' : 'No',
          'Attendance': u.moduleAccess?.attendance ? 'Yes' : 'No',
          'Leaves': u.moduleAccess?.leaves ? 'Yes' : 'No',
          'Payroll': u.moduleAccess?.payroll ? 'Yes' : 'No',
          'Companies': u.moduleAccess?.companies ? 'Yes' : 'No',
          'Reports': u.moduleAccess?.reports ? 'Yes' : 'No'
        }));
        const wsPerms = XLSX.utils.json_to_sheet(permissionsData);
        XLSX.utils.book_append_sheet(wb, wsPerms, 'Role Permissions');
      }

      // Sheet 3: Company & Branch Access
      if (exportContent.companyAccess || exportContent.branchAccess) {
        const accessData = dataToExport.map(u => {
          const comp = companies.find(c => c.id === u.companyId);
          return {
            'Full Name': u.name,
            'Company Name': comp?.name || 'All',
            'Branch Name': comp?.branchName || 'All',
            'Additional Access': (u.accessibleCompanyIds?.length || 0) + ' Branches'
          };
        });
        const wsAccess = XLSX.utils.json_to_sheet(accessData);
        XLSX.utils.book_append_sheet(wb, wsAccess, 'Company Access');
      }

      // Sheet 4: Audit Information
      if (exportContent.auditData) {
        const auditData = dataToExport.map(u => ({
          'Full Name': u.name,
          'Last Login': 'Today', // Placeholder for actual last login
          'Created Date': 'N/A',
          'Updated Date': 'N/A'
        }));
        const wsAudit = XLSX.utils.json_to_sheet(auditData);
        XLSX.utils.book_append_sheet(wb, wsAudit, 'Audit Information');
      }

      XLSX.writeFile(wb, "HRMate_Users_Report.xlsx");
    } else {
      // PDF Export
      const doc = new jsPDF();
      doc.setFontSize(18);
      doc.text('HRMate User Management Report', 14, 22);
      doc.setFontSize(11);
      const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '_');
      doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 30);
      
      const tableData = dataToExport.map(u => [
        u.name,
        u.email,
        u.role,
        companies.find(c => c.id === u.companyId)?.name || 'Global',
        u.status
      ]);
      
      autoTable(doc, {
        startY: 40,
        head: [['Name', 'Email', 'Role', 'Company', 'Status']],
        body: tableData.length > 0 ? tableData : [['No data', '', '', '', '']],
      });
      
      doc.save("HRMate_Users_Report.pdf");
    }
    
    setIsExportOpen(false);
  };

  const handleAddUserSubmit = async () => {
    if (!newUser.name || !newUser.email || !newUser.username || !newUser.password) {
      alert('Please fill all required fields');
      return;
    }
    try {
      // Find the next available ID
      const maxId = userAccounts.reduce((max, u) => {
        // u.id may be a numeric DB id (1, 2, 3) or a legacy string id (USR001).
        // Coerce to string before stripping non-digits so numeric ids don't throw
        // "u.id.replace is not a function".
        const idNum = parseInt(String(u.id).replace(/\D/g, '')) || 0;
        return idNum > max ? idNum : max;
      }, 0);
      
      const createdUser = await api.users.create({
        ...newUser,
        id: `USR${String(maxId + 1).padStart(3, '0')}`,
        avatar: newUser.name.charAt(0)
      });
      onUpdateAccounts(prev => [...prev, createdUser]);
      setIsAddUserOpen(false);
      setNewUser({ name: '', email: '', username: '', password: '', role: 'HR', status: 'Active', companyId: '' });
    } catch (err) {
      alert(getApiErrorMessage(err, 'Could not add the user.'));
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data: any[] = XLSX.utils.sheet_to_json(ws);

        // Validation & Creation logic
        let imported = 0;
        let errors = 0;
        
        for (const row of data) {
          // Simple duplicate check against current state (in a real app, backend handles this)
          if (userAccounts.some(u => u.email === row.Email || u.username === row.Username)) {
            errors++;
            continue;
          }
          if (!['Super Admin', 'Company Head', 'HR'].includes(row.Role)) {
            row.Role = 'HR'; // Default or fail
          }
          
          await api.users.create({
            name: row['Full Name'] || row.Name,
            email: row.Email,
            username: row.Username,
            password: row.Password || 'temp123',
            role: row.Role,
            status: row.Status || 'Active',
            companyId: companies.find(c => c.name === row.Company)?.id || ''
          });
          imported++;
        }
        alert(`Successfully imported ${imported} users! ${errors} skipped due to duplicates.`);
        setIsImportOpen(false);
        window.location.reload();
      } catch (err) {
        alert('Failed to parse file. Please ensure it is a valid Excel/CSV format.');
      }
    };
    reader.readAsBinaryString(file);
  };

  return (
    <div className="flex-1 overflow-auto bg-[#F8FAFC] text-slate-900 font-sans">
      <div className="max-w-[1600px] mx-auto px-6 py-8">
        
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-[14px] bg-blue-600/10 flex items-center justify-center text-blue-600 shadow-sm border border-blue-100">
              <ShieldCheck size={26} strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                User Management & RBAC
                <span className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-white ml-1">
                  <CheckCircle2 size={12} strokeWidth={3} />
                </span>
              </h1>
              <p className="text-[13px] text-slate-500 font-medium mt-0.5">Enterprise Role-Based Access Control & Global User Governance</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setIsAddUserOpen(true)} className="h-10 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[13px] font-bold transition-all shadow-sm flex items-center gap-2">
              <UserPlus size={16} />
              Add User
            </button>
            <button onClick={() => setIsImportOpen(true)} className="h-10 px-4 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-[13px] font-bold transition-all shadow-sm flex items-center gap-2">
              <UserPlus size={16} className="text-blue-600" />
              Import Users
            </button>
            <button onClick={handleExport} className="h-10 px-4 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-[13px] font-bold transition-all shadow-sm flex items-center gap-2">
              <Download size={16} className="text-blue-600" />
              Export
            </button>
            <button onClick={fetchAuditLogs} className="h-10 px-4 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-[13px] font-bold transition-all shadow-sm flex items-center gap-2">
              <ClipboardList size={16} className="text-purple-600" />
              Audit Logs
            </button>
            <button onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'settings' }))} className="h-10 w-10 bg-white border border-slate-200 hover:bg-slate-50 text-slate-500 rounded-xl flex items-center justify-center transition-all shadow-sm">
              <SlidersHorizontal size={16} />
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-5 mb-8">
          {/* Total Users */}
          <div className="bg-white border border-slate-200 rounded-[16px] p-5 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <UsersIcon size={22} strokeWidth={2.5} />
              </div>
              <div className="flex-1">
                <p className="text-[13px] font-bold text-slate-600">Total Users</p>
                <h3 className="text-2xl font-black text-slate-900 mt-0.5 leading-none">{totalUsers}</h3>
                <p className="text-[11px] font-medium text-slate-400 mt-1">All registered users</p>
              </div>
            </div>
          </div>
          
          {/* Active Users */}
          <div className="bg-white border border-emerald-100/50 rounded-[16px] p-5 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
            <div className="flex items-start justify-between relative z-10">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <UserCheck size={22} strokeWidth={2.5} />
                </div>
                <div>
                  <p className="text-[13px] font-bold text-slate-600">Active Users</p>
                  <h3 className="text-2xl font-black text-slate-900 mt-0.5 leading-none">{activeUsers}</h3>
                  <p className="text-[11px] font-medium text-slate-400 mt-1">Current active users</p>
                </div>
              </div>
              <div className="px-2 py-1 bg-emerald-50 text-emerald-600 text-[11px] font-bold rounded-md flex items-center gap-0.5">
                ↑ 92%
              </div>
            </div>
          </div>
          
          {/* Super Admins */}
          <div className="bg-white border border-purple-100/50 rounded-[16px] p-5 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                <ShieldAlert size={22} strokeWidth={2.5} />
              </div>
              <div className="flex-1">
                <p className="text-[13px] font-bold text-slate-600">Super Admins</p>
                <h3 className="text-2xl font-black text-slate-900 mt-0.5 leading-none">{superAdmins}</h3>
                <p className="text-[11px] font-medium text-slate-400 mt-1">Platform super admins</p>
              </div>
            </div>
          </div>

          {/* Company Heads */}
          <div className="bg-white border border-blue-100/50 rounded-[16px] p-5 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <Building2 size={22} strokeWidth={2.5} />
              </div>
              <div className="flex-1">
                <p className="text-[13px] font-bold text-slate-600">Company Heads</p>
                <h3 className="text-2xl font-black text-slate-900 mt-0.5 leading-none">{companyHeads}</h3>
                <p className="text-[11px] font-medium text-slate-400 mt-1">Company head users</p>
              </div>
            </div>
          </div>

          {/* HR Managers */}
          <div className="bg-[#FFF8F1] border border-orange-100 rounded-[16px] p-5 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-orange-100/50 text-orange-500 flex items-center justify-center shrink-0">
                <UsersIcon size={22} strokeWidth={2.5} />
              </div>
              <div className="flex-1">
                <p className="text-[13px] font-bold text-slate-700">HR Managers</p>
                <h3 className="text-2xl font-black text-slate-900 mt-0.5 leading-none">{hrManagers}</h3>
                <p className="text-[11px] font-medium text-slate-500 mt-1">HR department users</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filter Bar 1 */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative flex-1 min-w-[280px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              // type="search" + autoComplete/name/ignore attrs stop the browser
              // and password managers (1Password, LastPass) from autofilling the
              // logged-in user's saved email into this box. That autofill silently
              // set the search term to e.g. "om@gmail.com", collapsing the table to
              // the single matching user even though all users were loaded.
              type="search"
              name="userDirectorySearch"
              autoComplete="off"
              data-lpignore="true"
              data-1p-ignore
              data-form-type="other"
              placeholder="Search by name, email, or login ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-[12px] pl-10 pr-12 py-2.5 text-[13px] text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm [&::-webkit-search-cancel-button]:hidden"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-[10px] font-medium text-slate-500">⌘K</kbd>
            </div>
          </div>
          
          <div className="relative">
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="h-[42px] pl-10 pr-8 bg-white border border-slate-200 rounded-[12px] text-[13px] font-bold text-slate-600 appearance-none hover:bg-slate-50 transition-colors shadow-sm whitespace-nowrap cursor-pointer"
            >
              <option value="All">All Roles</option>
              <option value="Super Admin">Super Admin</option>
              <option value="Company Head">Company Head</option>
              <option value="HR">HR</option>
            </select>
            <UsersIcon size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <ChevronDown size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
          
          <div className="relative">
            <select
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              className="h-[42px] pl-10 pr-8 bg-white border border-slate-200 rounded-[12px] text-[13px] font-bold text-slate-600 appearance-none hover:bg-slate-50 transition-colors shadow-sm whitespace-nowrap cursor-pointer"
            >
              <option value="All">All Companies</option>
              {Array.from(new Set(companies.map(c => c.id))).map(id => {
                const c = companies.find(comp => comp.id === id);
                return c ? <option key={c.id} value={c.id}>{c.name}</option> : null;
              })}
            </select>
            <Building2 size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <ChevronDown size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
          
          <div className="relative">
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="h-[42px] pl-10 pr-8 bg-white border border-slate-200 rounded-[12px] text-[13px] font-bold text-slate-600 appearance-none hover:bg-slate-50 transition-colors shadow-sm whitespace-nowrap cursor-pointer"
            >
              <option value="All">All Branches</option>
              {Array.from(new Set(companies.map(c => c.branchName).filter(Boolean))).map(branch => (
                <option key={branch} value={branch}>{branch}</option>
              ))}
            </select>
            <Shield size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <ChevronDown size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>

          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-[42px] pl-10 pr-8 bg-white border border-slate-200 rounded-[12px] text-[13px] font-bold text-slate-600 appearance-none hover:bg-slate-50 transition-colors shadow-sm whitespace-nowrap cursor-pointer"
            >
              <option value="All">All Status</option>
              <option value="Active">Active</option>
              <option value="Disabled">Disabled</option>
            </select>
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-emerald-500 border border-emerald-600 pointer-events-none"></div>
            <ChevronDown size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
          
          <button onClick={handleClearFilters} className="h-[42px] px-4 text-blue-600 text-[13px] font-bold flex items-center gap-2 hover:bg-blue-50 rounded-[12px] transition-colors ml-auto whitespace-nowrap">
            <RotateCw size={14} />
            Clear Filters
          </button>
        </div>

        {/* Filter Bar 2 */}
        <div className="flex flex-wrap items-center gap-4 mb-6 bg-white p-2 border border-slate-200 rounded-[14px] shadow-sm">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {[
              { id: 'All', label: 'All Users', count: totalUsers, activeClass: 'bg-blue-50 text-blue-700', baseClass: 'text-blue-600 hover:bg-blue-50/50' },
              { id: 'Super Admin', label: 'Super Admin', count: superAdmins, activeClass: 'bg-purple-50 text-purple-700', baseClass: 'text-purple-600 hover:bg-purple-50/50' },
              { id: 'Company Head', label: 'Company Head', count: companyHeads, activeClass: 'bg-blue-50 text-blue-700', baseClass: 'text-blue-600 hover:bg-blue-50/50' },
              { id: 'HR', label: 'HR', count: hrManagers, activeClass: 'bg-cyan-50 text-cyan-700', baseClass: 'text-cyan-600 hover:bg-cyan-50/50' }
            ].map(role => (
              <button
                key={role.id}
                onClick={() => setRoleFilter(role.id)}
                className={cn(
                  "px-4 py-1.5 rounded-full text-[13px] font-bold transition-all duration-200 flex items-center gap-2 whitespace-nowrap",
                  roleFilter === role.id ? role.activeClass : role.baseClass
                )}
              >
                {role.label}
                <span className={cn(
                  "px-1.5 py-0.5 rounded text-[10px] font-bold leading-none",
                  roleFilter === role.id ? "bg-white/60 shadow-sm" : "bg-slate-100 text-slate-500"
                )}>
                  {role.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-white border border-slate-200 rounded-[16px] overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse table-auto lg:table-fixed">
              <thead>
                <tr className="bg-white border-b border-slate-200">
                  <th className="px-3 py-3 text-[11px] font-black text-slate-500 uppercase tracking-wider w-[6%] text-center">SR No</th>
                  <th className="px-3 py-3 text-[11px] font-black text-slate-500 uppercase tracking-wider w-[24%]">User</th>
                  <th className="px-3 py-3 text-[11px] font-black text-slate-500 uppercase tracking-wider w-[12%]">Role <ChevronDown size={12} className="inline ml-1 opacity-50"/></th>
                  <th className="px-3 py-3 text-[11px] font-black text-slate-500 uppercase tracking-wider w-[22%]">Company / Branch <ChevronDown size={12} className="inline ml-1 opacity-50"/></th>
                  <th className="px-3 py-3 text-[11px] font-black text-slate-500 uppercase tracking-wider w-[10%] text-center">Status <ChevronDown size={12} className="inline ml-1 opacity-50"/></th>
                  <th className="px-3 py-3 text-[11px] font-black text-slate-500 uppercase tracking-wider w-[12%]">Last Login <ChevronDown size={12} className="inline ml-1 opacity-50"/></th>
                  <th className="px-3 py-3 text-[11px] font-black text-slate-500 uppercase tracking-wider w-[14%] text-right">Actions <ChevronDown size={12} className="inline ml-1 opacity-50"/></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map((user, idx) => (
                  <tr key={user.id ?? user.email ?? user.username ?? idx} className="hover:bg-slate-50/50 transition-colors group">
                    {/* SR No — sequential row position (1..N), NOT the database
                        primary key. Stays gapless even when ids have gaps. */}
                    <td className="px-3 py-3 text-center">
                      <span className="text-[12px] font-bold text-slate-500 tabular-nums">{idx + 1}</span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="relative shrink-0">
                          <div className={cn(
                            "w-9 h-9 rounded-full flex items-center justify-center font-bold text-[13px] shadow-sm border",
                            user.role === 'Super Admin' ? "bg-purple-50 text-purple-700 border-purple-200" :
                            user.role === 'Company Head' ? "bg-blue-50 text-blue-700 border-blue-200" :
                            "bg-slate-100 text-slate-700 border-slate-200"
                          )}>
                            {user.avatar || (user.name || user.email || '?').charAt(0)}
                          </div>
                          <div className={cn(
                            "absolute -bottom-0.5 -right-0.5 w-3 h-3 border-2 border-white rounded-full flex items-center justify-center",
                            user.status === 'Active' ? "bg-emerald-500" : "bg-slate-400"
                          )}>
                            <div className="w-1 h-1 bg-white rounded-full"></div>
                          </div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-bold text-slate-900 flex items-center gap-1 truncate">
                             {user.name} 
                             {user.role === 'Super Admin' && <ShieldCheck size={14} className="text-blue-500 shrink-0" />}
                             {user.role === 'Company Head' && <CheckCircle2 size={14} className="text-blue-500 shrink-0" />}
                          </p>
                          <p className="text-[11px] font-medium text-slate-500 mt-0.5 flex items-center gap-1 truncate">
                            <span className="truncate">{user.email}</span>
                            <span className="text-slate-300 shrink-0">|</span>
                            <span className="shrink-0">ID: <span className="font-mono text-slate-400">{user.username}</span></span>
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className={cn(
                        "inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-extrabold tracking-wide uppercase border",
                        user.role === 'Super Admin' ? "bg-purple-50 text-purple-600 border-purple-100" :
                        user.role === 'Company Head' ? "bg-blue-50 text-blue-600 border-blue-100" :
                        "bg-cyan-50 text-cyan-600 border-cyan-100"
                      )}>
                        {user.role === 'Super Admin' && <ShieldAlert size={12} strokeWidth={2.5} />}
                        {user.role === 'Company Head' && <UsersIcon size={12} strokeWidth={2.5} />}
                        {user.role}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-start gap-2.5">
                        <div className={cn(
                          "w-7 h-7 rounded-lg flex items-center justify-center shrink-0",
                          user.role === 'Super Admin' ? "bg-purple-50 text-purple-600" : "bg-blue-50 text-blue-600"
                        )}>
                          <Building2 size={14} />
                        </div>
                        <div className="flex flex-col min-w-0">
                          {user.role === 'Super Admin' ? (
                            <>
                              <span className="text-[12px] font-bold text-slate-900 truncate">Global Multi-Tenant</span>
                              <span className="text-[11px] font-medium text-slate-500 truncate">All Companies</span>
                            </>
                          ) : (
                            <>
                              <span className="text-[12px] font-bold text-slate-900 truncate">{(companies.find(c => sameId(c.id, user.companyId)) as any)?.name || 'Unknown Company'}</span>
                              <span className="text-[11px] font-medium text-slate-500 truncate">
                                {(companies.find(c => sameId(c.id, user.companyId)) as any)?.branchName || 'Head Office'}
                                {user.accessibleCompanyIds && user.accessibleCompanyIds.length > 1 && (
                                  <span className="text-blue-500 font-semibold ml-1">+ {user.accessibleCompanyIds.length - 1} Branch</span>
                                )}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <div className={cn(
                        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold",
                        user.status === 'Active' ? "text-emerald-600" : "text-slate-500"
                      )}>
                        <div className={cn("w-1.5 h-1.5 rounded-full", user.status === 'Active' ? "bg-emerald-500" : "bg-slate-400")} />
                        {user.status}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <p className="text-[12px] font-semibold text-slate-700 whitespace-nowrap">Today, 10:42 AM</p>
                      <p className="text-[11px] font-bold text-emerald-500 mt-0.5 flex items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div> Online
                      </p>
                    </td>
                    <td className="px-3 py-3 text-right">
                      {canDelete && (
                        <div className="flex items-center justify-end gap-1 flex-nowrap">
                          <button
                            onClick={() => openReset(user)}
                            title="Reset password"
                            className="w-7 h-7 shrink-0 rounded-lg border border-slate-200 text-slate-400 hover:text-amber-600 hover:border-amber-200 hover:bg-amber-50 flex items-center justify-center transition-colors"
                          >
                            <Key size={13} />
                          </button>
                          <button className="w-7 h-7 shrink-0 rounded-lg border border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50 flex items-center justify-center transition-colors">
                            <Shield size={13} />
                          </button>

                          <button
                            onClick={() => handleOpenPermissions(user)}
                            className="px-2.5 py-1.5 shrink-0 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-lg text-[11px] font-bold transition-all shadow-sm flex items-center gap-1"
                          >
                            <Key size={13} />
                            Permissions
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-16 text-center">
                      <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-4">
                        <Search size={24} className="text-slate-300" />
                      </div>
                      <h3 className="text-slate-900 font-bold text-lg">No users found</h3>
                      <p className="text-slate-500 text-sm mt-1">We couldn't find any users matching your current filters.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            
            {/* Pagination Footer */}
            <div className="px-6 py-4 border-t border-slate-200 bg-white flex items-center justify-between">
              <p className="text-[13px] font-medium text-slate-500">
                {filteredUsers.length === totalUsers
                  ? `Showing all ${totalUsers} user${totalUsers === 1 ? '' : 's'}`
                  : `Showing ${filteredUsers.length} of ${totalUsers} users (filtered)`}
                {filteredUsers.length !== totalUsers && (
                  <button onClick={handleClearFilters} className="ml-2 text-blue-600 font-bold hover:underline">Clear filters</button>
                )}
              </p>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1">
                  <button className="w-8 h-8 rounded flex items-center justify-center text-slate-400 hover:bg-slate-50 disabled:opacity-50" disabled>
                    <ChevronDown size={14} className="rotate-90" />
                    <ChevronDown size={14} className="rotate-90 -ml-2" />
                  </button>
                  <button className="w-8 h-8 rounded flex items-center justify-center text-slate-400 hover:bg-slate-50 disabled:opacity-50" disabled>
                    <ChevronDown size={16} className="rotate-90" />
                  </button>
                  <button className="w-8 h-8 rounded bg-blue-600 text-white font-bold text-[13px]">1</button>
                  <button className="w-8 h-8 rounded hover:bg-slate-50 text-slate-600 font-bold text-[13px]">2</button>
                  <button className="w-8 h-8 rounded hover:bg-slate-50 text-slate-600 font-bold text-[13px]">3</button>
                  <span className="text-slate-400 mx-1">...</span>
                  <button className="w-8 h-8 rounded hover:bg-slate-50 text-slate-600 font-bold text-[13px]">{Math.ceil(filteredUsers.length / 10) || 16}</button>
                  <button className="w-8 h-8 rounded flex items-center justify-center text-slate-600 hover:bg-slate-50">
                    <ChevronDown size={16} className="-rotate-90" />
                  </button>
                  <button className="w-8 h-8 rounded flex items-center justify-center text-slate-600 hover:bg-slate-50">
                    <ChevronDown size={14} className="-rotate-90 -mr-2" />
                    <ChevronDown size={14} className="-rotate-90" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[13px] text-slate-500">Rows per page:</span>
                  <button className="h-8 px-3 border border-slate-200 rounded-lg text-[13px] font-bold text-slate-700 flex items-center gap-2">
                    10 <ChevronDown size={14} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* RBAC Permissions Modal */}
      <AnimatePresence>
        {selectedUser && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
              onClick={handleCloseModal}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-4xl max-h-[90vh] bg-[#0B1120] border border-slate-700/60 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            >
              {/* Modal Header */}
              <div className="px-6 py-5 border-b border-slate-800/60 bg-slate-900/40 flex items-center justify-between sticky top-0 z-10">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-slate-800 to-slate-700 flex items-center justify-center font-bold text-white shadow-md border border-slate-600/50 text-lg">
                    {selectedUser.avatar || selectedUser.name.charAt(0)}
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-white tracking-tight">{selectedUser.name}</h2>
                    <p className="text-xs font-medium text-blue-400 mt-0.5 flex items-center gap-1.5">
                      <Key size={12} /> Permission Matrix Configuration
                    </p>
                  </div>
                </div>
                <button 
                  onClick={handleCloseModal}
                  className="p-2 text-slate-400 hover:text-white hover:bg-slate-800/60 rounded-xl transition-colors"
                >
                  <XCircle size={20} />
                </button>
              </div>

              {/* Modal Body - Scrollable */}
              <div className="p-6 overflow-y-auto flex-1 bg-slate-950/50">
                
                {selectedUser.role === 'Super Admin' ? (
                  <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                    <div className="w-20 h-20 bg-gradient-to-tr from-amber-500/20 to-rose-500/20 border border-amber-500/30 rounded-3xl flex items-center justify-center mb-6 shadow-[0_0_40px_rgba(245,158,11,0.1)]">
                      <ShieldCheck className="text-amber-400" size={40} />
                    </div>
                    <h3 className="text-xl font-black text-white tracking-tight mb-2">Protected System Role</h3>
                    <p className="text-slate-400 max-w-sm mx-auto leading-relaxed text-sm">
                      <strong className="text-amber-400 font-bold">Super Admin</strong> has permanent full system access. Permission controls and workspace limits are securely locked to prevent accidental lockouts.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-8">
                    
                    {/* Workspace Access — Company → Branch hierarchy */}
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-extrabold text-white tracking-wide uppercase flex items-center gap-2">
                          <Building2 size={16} className="text-blue-400" />
                          Workspace Access
                        </h3>
                        <Badge variant="blue">
                          {accessGroups.length} {accessGroups.length === 1 ? 'Company' : 'Companies'}
                          {totalBranchCount > 0 && ` • ${totalBranchCount} ${totalBranchCount === 1 ? 'Branch' : 'Branches'}`}
                        </Badge>
                      </div>

                      <div className="space-y-3">
                        {accessGroups.map(group => {
                          const state = getGroupState(group);
                          const isCollapsed = collapsedGroups.has(group.companyId);
                          const hasBranches = group.branches.length > 0;
                          // The header is "locked" when the company itself is the user's
                          // primary base AND it has no branches to toggle independently.
                          const companyLocked = !hasBranches && isWorkspaceLocked(group.companyId);

                          return (
                            <div
                              key={group.companyId}
                              className={cn(
                                "rounded-xl border overflow-hidden transition-colors",
                                state === 'all'
                                  ? "bg-blue-600/10 border-blue-500/40"
                                  : state === 'partial'
                                    ? "bg-blue-600/[0.06] border-blue-500/25"
                                    : "bg-slate-900/40 border-slate-800/60"
                              )}
                            >
                              {/* Company header row */}
                              <div className="flex items-center gap-2.5 p-3">
                                {/* Expand / collapse */}
                                {hasBranches ? (
                                  <button
                                    type="button"
                                    onClick={() => toggleGroupCollapsed(group.companyId)}
                                    className="p-0.5 text-slate-500 hover:text-slate-200 transition-colors shrink-0"
                                    aria-label={isCollapsed ? 'Expand branches' : 'Collapse branches'}
                                  >
                                    {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                                  </button>
                                ) : (
                                  <span className="w-[22px] shrink-0" />
                                )}

                                {/* Tri-state company checkbox (auto-select / auto-deselect all branches) */}
                                <button
                                  type="button"
                                  disabled={companyLocked}
                                  onClick={() => handleToggleCompanyGroup(group)}
                                  className={cn(
                                    "w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors shadow-sm",
                                    state === 'all'
                                      ? "bg-blue-500 border-blue-500 text-white"
                                      : state === 'partial'
                                        ? "bg-blue-500/30 border-blue-500 text-blue-200"
                                        : "bg-slate-800 border-slate-600 text-transparent hover:border-slate-500",
                                    companyLocked && "opacity-90 cursor-default"
                                  )}
                                  aria-label={`Select all branches of ${group.companyName}`}
                                >
                                  {state === 'all' && <CheckCircle2 size={13} strokeWidth={3} />}
                                  {state === 'partial' && <Minus size={13} strokeWidth={3.5} />}
                                </button>

                                {/* Name + count — clicking the label also expands/collapses */}
                                <button
                                  type="button"
                                  onClick={() => hasBranches && toggleGroupCollapsed(group.companyId)}
                                  className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
                                >
                                  <div className={cn(
                                    "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                                    state === 'none' ? "bg-slate-800 text-slate-400" : "bg-blue-500/20 text-blue-300"
                                  )}>
                                    <Building2 size={16} />
                                  </div>
                                  <div className="min-w-0">
                                    <p className={cn(
                                      "text-sm font-bold truncate",
                                      state === 'none' ? "text-slate-300" : "text-blue-200"
                                    )}>
                                      {group.companyName}
                                      {hasBranches && (
                                        <span className="text-slate-500 font-semibold ml-1.5">
                                          ({group.branches.length} {group.branches.length === 1 ? 'Branch' : 'Branches'})
                                        </span>
                                      )}
                                    </p>
                                    <p className="text-[11px] text-slate-500 truncate mt-0.5">
                                      {group.company?.domain || (hasBranches ? 'Parent Company' : 'Standalone Workspace')}
                                    </p>
                                  </div>
                                </button>

                                {/* State pill */}
                                {isWorkspaceLocked(group.companyId) && !hasBranches ? (
                                  <span className="text-[10px] font-bold uppercase tracking-widest text-blue-400 shrink-0">Primary</span>
                                ) : state === 'all' ? (
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400 shrink-0">Full</span>
                                ) : state === 'partial' ? (
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-300/80 shrink-0">Partial</span>
                                ) : null}
                              </div>

                              {/* Branch children */}
                              {hasBranches && !isCollapsed && (
                                <div className="border-t border-slate-800/60 bg-slate-950/30 py-1.5 pl-[34px] pr-3">
                                  {group.branches.map((branch, idx) => {
                                    const last = idx === group.branches.length - 1;
                                    const selected = isWorkspaceSelected(branch.id);
                                    const locked = isWorkspaceLocked(branch.id);
                                    return (
                                      <div key={branch.id} className="flex items-center gap-2">
                                        {/* Tree connector */}
                                        <span className="text-slate-600 font-mono text-sm leading-none select-none shrink-0 -mt-1">
                                          {last ? '└' : '├'}
                                        </span>
                                        <button
                                          type="button"
                                          disabled={locked}
                                          onClick={() => handleToggleWorkspace(branch.id)}
                                          className={cn(
                                            "flex items-center gap-2.5 flex-1 min-w-0 py-1.5 px-2 my-0.5 rounded-lg transition-colors text-left",
                                            selected ? "hover:bg-blue-500/10" : "hover:bg-slate-800/50",
                                            locked && "cursor-default"
                                          )}
                                        >
                                          <span className={cn(
                                            "w-[18px] h-[18px] rounded-md border flex items-center justify-center shrink-0 transition-colors",
                                            selected
                                              ? "bg-blue-500 border-blue-500 text-white"
                                              : "bg-slate-800 border-slate-600 text-transparent"
                                          )}>
                                            {selected && <CheckCircle2 size={12} strokeWidth={3} />}
                                          </span>
                                          <GitBranch size={13} className={cn("shrink-0", selected ? "text-blue-300/70" : "text-slate-500")} />
                                          <span className={cn(
                                            "text-sm font-semibold truncate",
                                            selected ? "text-blue-100" : "text-slate-300"
                                          )}>
                                            {branch.branchName || branch.name}
                                          </span>
                                          {locked && (
                                            <span className="text-[9px] font-bold uppercase tracking-widest text-blue-400 ml-auto shrink-0">Primary</span>
                                          )}
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {accessGroups.length === 0 && (
                          <div className="text-center text-slate-500 text-sm py-8 border border-dashed border-slate-800 rounded-xl">
                            No companies or branches available to assign.
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-800 to-transparent" />

                    {/* RBAC Modules */}
                    <div>
                      <h3 className="text-sm font-extrabold text-white tracking-wide uppercase flex items-center gap-2 mb-4">
                        <Key size={16} className="text-emerald-400" />
                        Module Permissions
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {MODULES_LIST.map((module) => {
                          const isEnabled = selectedUser.moduleAccess?.[module.id] ?? true;
                          const perms = selectedUser.permissions?.[module.id] || DEFAULT_PERMISSIONS;
                          
                          return (
                            <div key={module.id} className={cn(
                              "rounded-xl border transition-all duration-300 flex flex-col",
                              isEnabled ? "bg-slate-900/40 border-slate-700/50" : "bg-slate-900/20 border-slate-800/40 opacity-60"
                            )}>
                              {/* Module Header Row */}
                              <div className="p-3.5 flex items-center justify-between border-b border-slate-800/40 bg-slate-800/20">
                                <span className={cn("font-bold text-sm tracking-tight", isEnabled ? "text-white" : "text-slate-500 line-through decoration-slate-600/50")}>
                                  {module.name}
                                </span>
                                <button
                                  onClick={() => handleToggleModuleAccess(module.id)}
                                  className={cn(
                                    "relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-200 ease-in-out focus:outline-none shadow-inner",
                                    isEnabled ? "bg-emerald-500" : "bg-slate-700"
                                  )}
                                >
                                  <span className={cn(
                                    "pointer-events-none inline-block h-3 w-3 mt-[1px] transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                                    isEnabled ? "translate-x-3.5" : "translate-x-0.5"
                                  )} />
                                </button>
                              </div>

                              {/* Granular Permissions */}
                              {isEnabled && (
                                <div className="p-3.5 grid grid-cols-2 lg:grid-cols-4 gap-3">
                                  {(['view', 'create', 'edit', 'delete', 'export', 'approve', 'print', 'manage'] as Array<keyof ModulePermissions>).map(action => {
                                    const hasAction = perms[action];
                                    const displayAction = action === 'view' ? 'read' : action;
                                    return (
                                      <button
                                        key={action} 
                                        onClick={() => handleToggleActionPermission(module.id, action)}
                                        className={cn(
                                          "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all border",
                                          hasAction 
                                            ? "bg-slate-800/80 text-white border-slate-600/50 shadow-sm" 
                                            : "bg-slate-900/50 text-slate-500 border-slate-800/50 hover:bg-slate-800/50 hover:text-slate-400"
                                        )}
                                      >
                                        <div className={cn(
                                          "w-1.5 h-1.5 rounded-full",
                                          hasAction ? (action === 'view' ? 'bg-blue-400' : 'bg-emerald-400') : 'bg-slate-600'
                                        )} />
                                        {displayAction}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 border-t border-slate-800/60 bg-slate-900/80 flex items-center justify-end gap-3 sticky bottom-0">
                <button
                  onClick={handleCloseModal}
                  className="px-4 py-2 rounded-xl text-sm font-bold text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSavePermissions}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-500/20 flex items-center gap-2"
                >
                  <ShieldCheck size={16} />
                  Save Permission Matrix
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Reset Password Modal (admin resets any user's password) */}
      {resetUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={closeReset} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
                <Key size={18} className="text-amber-600" />
              </div>
              <div>
                <h3 className="text-[15px] font-black text-slate-900">Reset Password</h3>
                <p className="text-[12px] text-slate-500 font-medium">
                  {resetUser.name} <span className="text-slate-400">· @{resetUser.username}</span>
                </p>
              </div>
            </div>

            {resetDone ? (
              <div className="px-6 py-8 text-center">
                <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 size={28} className="text-emerald-500" />
                </div>
                <h4 className="text-[15px] font-black text-slate-900">Password reset successfully</h4>
                <p className="text-[13px] text-slate-500 mt-1">
                  <span className="font-bold">@{resetUser.username}</span> can now sign in with the new password. The old password no longer works.
                </p>
                <button onClick={closeReset} className="mt-5 w-full h-11 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-[13px] font-bold transition-all">
                  Done
                </button>
              </div>
            ) : (
              <div className="px-6 py-5">
                <label className="block text-[12px] font-bold text-slate-600 mb-1.5">New password</label>
                <input
                  type={resetShow ? 'text' : 'password'}
                  value={resetPw}
                  onChange={e => setResetPw(e.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-400"
                  autoFocus
                />
                <label className="block text-[12px] font-bold text-slate-600 mb-1.5 mt-4">Confirm new password</label>
                <input
                  type={resetShow ? 'text' : 'password'}
                  value={resetConfirm}
                  onChange={e => setResetConfirm(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleResetPassword(); }}
                  placeholder="Re-enter the password"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-400"
                />
                <button type="button" onClick={() => setResetShow(s => !s)} className="mt-2 text-[12px] font-bold text-slate-500 hover:text-slate-700">
                  {resetShow ? 'Hide' : 'Show'} passwords
                </button>

                {resetError && (
                  <div className="mt-3 px-3 py-2 bg-red-50 border border-red-100 rounded-lg text-[12px] font-semibold text-red-600">
                    {resetError}
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 mt-5">
                  <button onClick={closeReset} disabled={resetBusy} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 disabled:opacity-50">Cancel</button>
                  <button
                    onClick={handleResetPassword}
                    disabled={resetBusy}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-bold transition-all shadow-sm disabled:opacity-60 flex items-center gap-2"
                  >
                    {resetBusy ? <><RotateCw size={14} className="animate-spin" /> Resetting…</> : <>Reset Password</>}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add User Modal */}
      <AnimatePresence>
        {isAddUserOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddUserOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10">
                <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <UserPlus size={18} className="text-blue-600" />
                  Add New User
                </h2>
                <button
                  onClick={() => setIsAddUserOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <XCircle size={20} />
                </button>
              </div>
              <div className="p-6 overflow-y-auto space-y-4">
                <div>
                  <label className="block text-[12px] font-bold text-slate-700 mb-1.5">Full Name <span className="text-rose-500">*</span></label>
                  <input type="text" value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="John Doe" />
                </div>
                <div>
                  <label className="block text-[12px] font-bold text-slate-700 mb-1.5">Email Address <span className="text-rose-500">*</span></label>
                  <input type="email" value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="john@example.com" />
                </div>
                <div>
                  <label className="block text-[12px] font-bold text-slate-700 mb-1.5">Username <span className="text-rose-500">*</span></label>
                  <input type="text" value={newUser.username} onChange={e => setNewUser({...newUser, username: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="johndoe" />
                </div>
                <div>
                  <label className="block text-[12px] font-bold text-slate-700 mb-1.5">Password <span className="text-rose-500">*</span></label>
                  <input type="password" value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="••••••••" />
                </div>
                <div>
                  <label className="block text-[12px] font-bold text-slate-700 mb-1.5">Role</label>
                  <select value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value as any})} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
                    <option value="HR">HR</option>
                    <option value="Company Head">Company Head</option>
                    <option value="Super Admin">Super Admin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[12px] font-bold text-slate-700 mb-1.5">Assign Company</label>
                  <select value={newUser.companyId} onChange={e => setNewUser({...newUser, companyId: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
                    <option value="">None / Global Access</option>
                    {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3 sticky bottom-0">
                <button onClick={() => setIsAddUserOpen(false)} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700">Cancel</button>
                <button onClick={handleAddUserSubmit} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold shadow-sm">Add User</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Import Users Modal */}
      <AnimatePresence>
        {isImportOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsImportOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10">
                <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <Upload size={18} className="text-blue-600" />
                  Import Users
                </h2>
                <button
                  onClick={() => setIsImportOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <XCircle size={20} />
                </button>
              </div>
              <div className="p-6 overflow-y-auto">
                <p className="text-sm text-slate-500 mb-4">Upload an Excel (.xlsx) or CSV (.csv) file to mass-import user records.</p>
                <label className="border-2 border-dashed border-slate-300 rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 transition-colors">
                  <Upload size={32} className="text-slate-400 mb-3" />
                  <span className="text-sm font-bold text-blue-600">Click to browse or drag file here</span>
                  <span className="text-[11px] font-medium text-slate-400 mt-1">Supports .xlsx, .csv</span>
                  <input type="file" accept=".xlsx, .csv" className="hidden" onChange={handleFileUpload} />
                </label>
              </div>
              <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3 sticky bottom-0">
                <button onClick={() => setIsImportOpen(false)} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700">Cancel</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Export Users Modal */}
      <AnimatePresence>
        {isExportOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsExportOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10">
                <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <Download size={18} className="text-blue-600" />
                  Export Users
                </h2>
                <button
                  onClick={() => setIsExportOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <XCircle size={20} />
                </button>
              </div>
              <div className="p-6 overflow-y-auto space-y-5">
                <div>
                  <label className="block text-[12px] font-bold text-slate-700 mb-2">Export Format</label>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="radio" checked={exportFormat === 'excel'} onChange={() => setExportFormat('excel')} className="text-blue-600" />
                      Excel (.xlsx)
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="radio" checked={exportFormat === 'pdf'} onChange={() => setExportFormat('pdf')} className="text-blue-600" />
                      PDF (.pdf)
                    </label>
                  </div>
                </div>
                
                <div>
                  <label className="block text-[12px] font-bold text-slate-700 mb-2">Export Scope</label>
                  <div className="flex flex-col gap-2 text-sm">
                    <label className="flex items-center gap-2">
                      <input type="radio" checked={exportScope === 'current'} onChange={() => setExportScope('current')} className="text-blue-600" />
                      Current Page
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="radio" checked={exportScope === 'filtered'} onChange={() => setExportScope('filtered')} className="text-blue-600" />
                      Filtered Users ({filteredUsers.length})
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="radio" checked={exportScope === 'all'} onChange={() => setExportScope('all')} className="text-blue-600" />
                      All Users ({userAccounts.length})
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-[12px] font-bold text-slate-700 mb-2">Export Content</label>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={exportContent.userInfo} onChange={e => setExportContent({...exportContent, userInfo: e.target.checked})} className="rounded text-blue-600" />
                      User Information
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={exportContent.companyAccess} onChange={e => setExportContent({...exportContent, companyAccess: e.target.checked})} className="rounded text-blue-600" />
                      Company Access
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={exportContent.branchAccess} onChange={e => setExportContent({...exportContent, branchAccess: e.target.checked})} className="rounded text-blue-600" />
                      Branch Access
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={exportContent.permissions} onChange={e => setExportContent({...exportContent, permissions: e.target.checked})} className="rounded text-blue-600" />
                      RBAC Permissions
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={exportContent.auditData} onChange={e => setExportContent({...exportContent, auditData: e.target.checked})} className="rounded text-blue-600" />
                      Audit Data
                    </label>
                  </div>
                </div>
              </div>
              <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3 sticky bottom-0">
                <button onClick={() => setIsExportOpen(false)} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700">Cancel</button>
                <button onClick={handleExportSubmit} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold shadow-sm">Generate Export</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Audit Logs Modal */}
      <AnimatePresence>
        {isAuditOpen && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white rounded-[24px] shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col relative">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
                <div>
                  <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
                    <ClipboardList className="text-purple-600" />
                    Permission Audit Logs
                  </h2>
                  <p className="text-[13px] text-slate-500 font-medium mt-1">Track history of workspace and permission changes.</p>
                </div>
                <button onClick={() => setIsAuditOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 transition-colors">
                  <XCircle size={20} />
                </button>
              </div>
              <div className="p-6 overflow-y-auto bg-slate-50 flex-1">
                {loadingAudit ? (
                  <div className="flex justify-center items-center py-20 text-slate-400 animate-pulse">Loading audit data...</div>
                ) : auditLogs.length === 0 ? (
                  <div className="flex justify-center items-center py-20 text-slate-400">No audit logs found.</div>
                ) : (
                  <div className="space-y-4">
                    {auditLogs.map((log: any) => {
                      const details = log.details ? JSON.parse(log.details) : {};
                      return (
                        <div key={log.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-3">
                              <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center text-purple-600 shrink-0">
                                <Activity size={18} />
                              </div>
                              <div>
                                <h4 className="text-sm font-bold text-slate-800">{log.action.replace(/_/g, ' ')}</h4>
                                <p className="text-[13px] text-slate-500 mt-0.5">
                                  Updated user <span className="font-bold text-slate-700">{log.targetName}</span>
                                </p>
                                <div className="flex gap-4 mt-2">
                                  {details.permissionsUpdated && (
                                    <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md">Permissions Updated</span>
                                  )}
                                  {details.workspaces && (
                                    <span className="text-[11px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-md">{details.workspaces.length} Workspaces Assigned</span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-[12px] font-bold text-slate-500">By: {log.user?.name || 'System'}</p>
                              <p className="text-[11px] font-medium text-slate-400">{new Date(log.createdAt).toLocaleString()}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};
