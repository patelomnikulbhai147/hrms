import React, { useState } from 'react';
import { 
  ShieldCheck, Search, ShieldAlert, Key, CheckCircle2, XCircle, Power, 
  Building2, Users as UsersIcon, UserPlus, Upload, Download, SlidersHorizontal, 
  ChevronDown, Settings, MoreVertical, Edit2, Shield, Trash2, UserCheck, RotateCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { type UserAccount, type AppModules, type ModulePermissions } from './Login';
import { type Company } from '../data/mockData';
import { isWorkspaceInherited } from '../utils/workspaceUtils';
import { Badge } from '../components/ui/Badge';
import { cn } from '../utils/cn';
import { usePermissions } from '../context/PermissionContext';
import { api } from '../api/apiClient';
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
  delete: false
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

  const [newUser, setNewUser] = useState<Partial<UserAccount>>({
    name: '',
    email: '',
    username: '',
    password: '',
    role: 'HR',
    status: 'Active',
    companyId: ''
  });
  
  const { canDelete: canDeleteModule } = usePermissions();
  const canDelete = canDeleteModule('users');

  // Modal state
  const [selectedUser, setSelectedUser] = useState<UserAccount | null>(null);

  const filteredUsers = userAccounts.filter(user => {
    const company = companies.find(c => c.id === user.companyId);
    
    const matchesSearch = (user?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (user?.username || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (user?.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (company?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (company?.branchName || '').toLowerCase().includes(searchTerm.toLowerCase());
                          
    const matchesRole = roleFilter === 'All' || user.role === roleFilter;
    const matchesCompany = companyFilter === 'All' || user.companyId === companyFilter;
    const matchesBranch = branchFilter === 'All' || company?.branchName === branchFilter;
    const matchesStatus = statusFilter === 'All' || user.status === statusFilter;
    
    return matchesSearch && matchesRole && matchesCompany && matchesBranch && matchesStatus;
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
      alert('Failed to update status. Please try again.');
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

  const handleToggleWorkspace = (companyId: string) => {
    if (!selectedUser) return;
    const updatedUser = { ...selectedUser };
    const currentIds = updatedUser.accessibleCompanyIds || [];
    
    if (currentIds.includes(companyId)) {
      updatedUser.accessibleCompanyIds = currentIds.filter(id => id !== companyId);
    } else {
      updatedUser.accessibleCompanyIds = [...currentIds, companyId];
    }
    setSelectedUser(updatedUser);
  };

  const handleSavePermissions = async () => {
    if (!selectedUser) return;
    
    try {
      await api.users.update(selectedUser.id, {
        accessibleCompanyIds: selectedUser.accessibleCompanyIds,
        moduleAccess: selectedUser.moduleAccess,
        permissions: selectedUser.permissions
      });
      
      onUpdateAccounts(prev => prev.map(u => u.id === selectedUser.id ? selectedUser : u));
      setSelectedUser(null);
    } catch (err) {
      console.error('Failed to save permissions to backend:', err);
      alert('Failed to save permissions to backend. Please try again.');
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
        const idNum = parseInt(u.id.replace(/\D/g, '')) || 0;
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
      alert('Failed to add user. Ensure backend is running.');
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
              type="text"
              placeholder="Search by name, email, or login ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-[12px] pl-10 pr-12 py-2.5 text-[13px] text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm"
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
                  <th className="px-3 py-3 text-[11px] font-black text-slate-500 uppercase tracking-wider w-[28%]">User</th>
                  <th className="px-3 py-3 text-[11px] font-black text-slate-500 uppercase tracking-wider w-[12%]">Role <ChevronDown size={12} className="inline ml-1 opacity-50"/></th>
                  <th className="px-3 py-3 text-[11px] font-black text-slate-500 uppercase tracking-wider w-[22%]">Company / Branch <ChevronDown size={12} className="inline ml-1 opacity-50"/></th>
                  <th className="px-3 py-3 text-[11px] font-black text-slate-500 uppercase tracking-wider w-[10%] text-center">Status <ChevronDown size={12} className="inline ml-1 opacity-50"/></th>
                  <th className="px-3 py-3 text-[11px] font-black text-slate-500 uppercase tracking-wider w-[12%]">Last Login <ChevronDown size={12} className="inline ml-1 opacity-50"/></th>
                  <th className="px-3 py-3 text-[11px] font-black text-slate-500 uppercase tracking-wider w-[16%] text-right">Actions <ChevronDown size={12} className="inline ml-1 opacity-50"/></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map(user => (
                  <tr key={user.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="relative shrink-0">
                          <div className={cn(
                            "w-9 h-9 rounded-full flex items-center justify-center font-bold text-[13px] shadow-sm border",
                            user.role === 'Super Admin' ? "bg-purple-50 text-purple-700 border-purple-200" :
                            user.role === 'Company Head' ? "bg-blue-50 text-blue-700 border-blue-200" :
                            "bg-slate-100 text-slate-700 border-slate-200"
                          )}>
                            {user.avatar || user.name.charAt(0)}
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
                              <span className="text-[12px] font-bold text-slate-900 truncate">{companies.find(c => c.id === user.companyId)?.name || 'Unknown Company'}</span>
                              <span className="text-[11px] font-medium text-slate-500 truncate">
                                {companies.find(c => c.id === user.companyId)?.branchName || 'Head Office'}
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
                    <td colSpan={6} className="p-16 text-center">
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
                Showing 1 to {Math.min(10, filteredUsers.length)} of {filteredUsers.length} users
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
                    
                    {/* Workspace Access Matrix */}
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-extrabold text-white tracking-wide uppercase flex items-center gap-2">
                          <Building2 size={16} className="text-blue-400" />
                          Workspace Access
                        </h3>
                        <Badge variant="blue">{companies.length} Total</Badge>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        {companies.map(company => {
                          const directAssigned = (selectedUser.accessibleCompanyIds || []).includes(company.id) || selectedUser.companyId === company.id;
                          
                          // Compute inheritance for selected user using shared logic
                          const isInherited = isWorkspaceInherited(company.id, selectedUser, companies);
                          
                          const isAssigned = directAssigned || isInherited;
                          
                          return (
                            <button
                              key={company.id}
                              onClick={() => !isInherited && handleToggleWorkspace(company.id)}
                              disabled={isInherited || selectedUser.companyId === company.id}
                              className={cn(
                                "flex flex-col items-start p-4 rounded-xl border transition-all text-left group relative overflow-hidden",
                                isAssigned 
                                  ? (isInherited ? "bg-emerald-500/10 border-emerald-500/30" : "bg-blue-600/15 border-blue-500/40 shadow-inner") 
                                  : "bg-slate-900/40 border-slate-800/60 hover:bg-slate-800/60 hover:border-slate-600",
                                (isInherited || selectedUser.companyId === company.id) && "cursor-default"
                              )}
                            >
                              <div className="flex items-start gap-3 w-full">
                                <div className={cn(
                                  "w-5 h-5 rounded-md border flex items-center justify-center shrink-0 mt-0.5 transition-colors shadow-sm",
                                  isAssigned 
                                    ? (isInherited ? "bg-emerald-500 border-emerald-500 text-white" : "bg-blue-500 border-blue-500 text-white") 
                                    : "bg-slate-800 border-slate-600 text-transparent group-hover:border-slate-500"
                                )}>
                                  <CheckCircle2 size={14} strokeWidth={3} className={cn("transition-transform", isAssigned ? "scale-100" : "scale-0")} />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className={cn("text-sm font-bold truncate transition-colors", isAssigned ? (isInherited ? "text-emerald-300" : "text-blue-300") : "text-slate-300")}>{company.name}</p>
                                  <p className="text-[11px] text-slate-500 truncate mt-0.5">{company.domain || 'Branch Office'}</p>
                                </div>
                              </div>
                              {isInherited && (
                                <div className="mt-3 w-full border-t border-emerald-500/20 pt-2.5">
                                  <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-400">
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"></div>
                                    Inherited Access
                                  </span>
                                </div>
                              )}
                              {selectedUser.companyId === company.id && !isInherited && (
                                <div className="mt-3 w-full border-t border-blue-500/20 pt-2.5">
                                  <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-blue-400">
                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)]"></div>
                                    Primary Base
                                  </span>
                                </div>
                              )}
                            </button>
                          );
                        })}
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
                                <div className="p-3.5 flex items-center gap-3">
                                  {(['view', 'create', 'edit', 'delete'] as Array<keyof ModulePermissions>).map(action => {
                                    const hasAction = perms[action];
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
                                        {action}
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
    </div>
  );
};
