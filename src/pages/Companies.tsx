import React, { useState } from 'react';
import {
  Building2, Plus, Search, Lock, Trash2,
  CheckCircle2, Mail, Phone, ChevronRight, Shield, Cloud, Link, Users, Archive, ShieldAlert,
  FileSpreadsheet, Loader2, FileText
} from 'lucide-react';
import { type Company, type Role, type SubscriptionPlan, type Employee } from '../data/mockData';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { PhoneInput } from '../components/ui/PhoneInput';
import {
  validatePhone,
  validateName,
  validateEmail,
  validateCompanyName,
  validatePercentage
} from '../utils/validation';
import { Modal } from '../components/ui/Modal';
import { ActionConfirmationModal } from '../components/ui/ActionConfirmationModal';
import { Badge } from '../components/ui/Badge';
import { Table, Thead, Tbody, Th, Td, Tr } from '../components/ui/Table';
import { type UserAccount } from './Login';
import { getUniqueEmployees } from '../utils/deduplication';
import { usePermissions } from '../context/PermissionContext';
import { getCompanyInitials } from '../utils/workspaceUtils';
import { api, type SuperAdminStats } from '../api/apiClient';
import { downloadCompanyExcel, downloadCompanyPDF } from '../utils/companyExportUtils';

interface CompaniesProps {
  _role: Role;
  companies: Company[];
  onUpdateCompanies: (companies: Company[]) => void;
  userAccounts: UserAccount[];
  onUpdateAccounts: (accounts: UserAccount[]) => void;
  onStartMasquerade: (companyId: string) => void;
  plans: SubscriptionPlan[];
  employees: Employee[];
  onUpdateEmployees?: (employees: Employee[]) => void;
  onRefresh?: () => void;
  superAdminStats?: SuperAdminStats | null;
}

export const Companies: React.FC<CompaniesProps> = ({
  _role,
  companies,
  onUpdateCompanies,
  userAccounts,
  onUpdateAccounts,
  onStartMasquerade,
  plans,
  employees,
  onUpdateEmployees,
  onRefresh,
  superAdminStats
}) => {
  if (false as boolean) {
    console.log(_role);
  }

  const { canEdit: canEditModule, canView: canViewModule } = usePermissions();

  // === SUPER ADMIN GUARD ===
  // Triple-layer security: even if routing & App.tsx guards are bypassed, the
  // component itself refuses to render any company data for non-Super Admin.
  if (!canViewModule('companies')) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full p-8 text-center"
        style={{ minHeight: '60vh' }}
      >
        <div
          className="w-24 h-24 rounded-full flex items-center justify-center mb-6"
          style={{ background: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)' }}
        >
          <ShieldAlert className="w-12 h-12" style={{ color: '#dc2626' }} />
        </div>
        <h2 className="text-2xl font-bold mb-3" style={{ color: '#111827' }}>Access Denied</h2>
        <p className="max-w-md leading-relaxed mb-2" style={{ color: '#6b7280' }}>
          The <span className="font-bold" style={{ color: '#374151' }}>Company Management</span> dashboard
          is exclusively available to{' '}
          <span
            className="font-bold px-1.5 py-0.5 rounded"
            style={{ color: '#1d4ed8', background: '#eff6ff' }}
          >
            Super Admin
          </span>{' '}
          accounts.
        </p>
        <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
          Contact your system administrator if you require elevated access.
        </p>
        <div
          className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
          style={{ background: '#f3f4f6', color: '#6b7280', border: '1px solid #e5e7eb' }}
        >
          <Shield size={14} />
          Your role: {_role}
        </div>
      </div>
    );
  }
  // === END SUPER ADMIN GUARD ===

  const canEdit = canEditModule('companies');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  
  // Dependency Check & Delete State
  const [deleteTarget, setDeleteTarget] = useState<Company | null>(null);
  const [deleteDependencies] = useState<{employees: number, branches: number, payrolls: number, attendances: number, documents: number} | null>(null);
  const [isCheckingDependencies] = useState(false);

  // Enterprise Lifecycle & Export
  const [activeMainTab, setActiveMainTab] = useState<'active' | 'archived'>('active');
  const [offboardCompany, setOffboardCompany] = useState<Company | null>(null);

  // Activate/Suspend Toggle State
  const [statusModalTarget, setStatusModalTarget] = useState<{ id: string, currentStatus: string, name: string, isBranch: boolean } | null>(null);
  const [isStatusUpdating, setIsStatusUpdating] = useState(false);

  // ── Export (Excel + PDF) ──────────────────────────────────────────────────
  const [isExporting, setIsExporting] = useState<'excel' | 'pdf' | null>(null);
  const [exportDropOpen, setExportDropOpen] = useState(false);
  const exportDropRef = React.useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  React.useEffect(() => {
    if (!exportDropOpen) return;
    const close = (e: MouseEvent) => {
      if (exportDropRef.current && !exportDropRef.current.contains(e.target as Node)) {
        setExportDropOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [exportDropOpen]);

  const handleExportExcel = async () => {
    if (isExporting) return;
    setExportDropOpen(false);
    setIsExporting('excel');
    try {
      const payload = await api.companies.getExportData();
      downloadCompanyExcel(payload);
    } catch (err: any) {
      console.error('Company Excel export failed:', err);
      alert(`Excel export failed: ${err?.message || 'Unknown error.'}`);
    } finally {
      setIsExporting(null);
    }
  };

  const handleExportPDF = async () => {
    if (isExporting) return;
    setExportDropOpen(false);
    setIsExporting('pdf');
    try {
      const payload = await api.companies.getExportData();
      await downloadCompanyPDF(payload, superAdminStats);
    } catch (err: any) {
      console.error('Company PDF export failed:', err);
      alert(`PDF export failed: ${err?.message || 'Unknown error.'}`);
    } finally {
      setIsExporting(null);
    }
  };
  // ── End Export ────────────────────────────────────────────────────────────


  const uniqueEmployees = React.useMemo(() => getUniqueEmployees(employees), [employees]);
  const activeUniqueEmployees = React.useMemo(() => uniqueEmployees.filter(e => e.status !== 'Archived' && e.status !== 'Terminated'), [uniqueEmployees]);

  const [addOpen, setAddOpen] = useState(false);
  const [editPlanModal, setEditPlanModal] = useState<Company | null>(null);

  const [isConfirmingOffboard, setIsConfirmingOffboard] = useState(false);
  const [manageAccountsModal, setManageAccountsModal] = useState<Company | null>(null);
  const [workspaceAssignUser, setWorkspaceAssignUser] = useState<UserAccount | null>(null);

  const [selectedWorkspaces, setSelectedWorkspaces] = useState<string[]>([]);

  const [newPlan, setNewPlan] = useState<'Starter' | 'Professional' | 'Enterprise'>('Starter');

  // Branch Management state
  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Company | null>(null);
  const [parentCompanyIdForBranch, setParentCompanyIdForBranch] = useState<string>('');

  // Edit Company state
  const [editCompanyModalOpen, setEditCompanyModalOpen] = useState(false);
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);
  const [editCompanyForm, setEditCompanyForm] = useState({
    name: '',
    branchCode: '',
    industry: 'Technology',
    adminEmail: '',
    phone: '',
    billingAddress: '',
    domain: '',
    status: 'Active' as 'Active' | 'Inactive' | 'Archived'
  });

  const handleOpenEditCompany = (company: Company) => {
    setEditingCompanyId(company.id);
    setEditCompanyForm({
      name: company.name || '',
      branchCode: company.branchCode || company.gstNumber || '',
      industry: company.industry || 'Technology',
      adminEmail: company.adminEmail || company.email || '',
      phone: company.phone || '',
      billingAddress: company.billingAddress || company.address || '',
      domain: company.domain || '',
      status: (company.status as any) || 'Active'
    });
    setEditCompanyModalOpen(true);
  };

  const handleSaveCompany = async () => {
    if (!editingCompanyId) return;
    try {
      const payload = {
        name: editCompanyForm.name,
        branchCode: editCompanyForm.branchCode,
        industry: editCompanyForm.industry,
        adminEmail: editCompanyForm.adminEmail,
        phone: editCompanyForm.phone,
        billingAddress: editCompanyForm.billingAddress,
        domain: editCompanyForm.domain,
        status: editCompanyForm.status,
        isHeadOffice: true
      };
      const saved = await api.companies.update(editingCompanyId, payload);
      const updatedCompany = { ...companies.find(c => c.id === editingCompanyId), ...saved, isHeadOffice: true };
      onUpdateCompanies(companies.map(c => c.id === editingCompanyId ? updatedCompany : c));
      onRefresh?.();
      setEditCompanyModalOpen(false);
      alert('Company details updated successfully.');
    } catch (err) {
      console.error(err);
      alert('Failed to update company details.');
    }
  };

  const [branchForm, setBranchForm] = useState({
    name: '',
    branchCode: '',
    location: '',
    email: '',
    phone: '',
    adminName: '',
    employeeCapacity: 200,
    status: 'Active' as 'Active' | 'Inactive',
    pfRate: 12,
    esicRate: 3.25,
    basicPercent: 50,
    profTaxRate: 200,
    overtimeRate: 1.5,
    enableBroadcasts: true,
    enableSystemAlerts: true
  });

  const handleOpenCreateBranch = (parentId: string) => {
    setEditingBranch(null);
    setParentCompanyIdForBranch(parentId);
    setBranchForm({
      name: '',
      branchCode: '',
      location: '',
      email: '',
      phone: '',
      adminName: '',
      employeeCapacity: 200,
      status: 'Active',
      pfRate: 12,
      esicRate: 3.25,
      basicPercent: 50,
      profTaxRate: 200,
      overtimeRate: 1.5,
      enableBroadcasts: true,
      enableSystemAlerts: true
    });
    setBranchModalOpen(true);
  };

  const handleOpenEditBranch = (branch: Company) => {
    setEditingBranch(branch);
    setParentCompanyIdForBranch(branch.parentCompanyId || 'c-gcri');
    setBranchForm({
      name: branch.name || branch.branchName || '',
      branchCode: branch.branchCode || '',
      location: branch.address || '',
      email: branch.email || branch.adminEmail || '',
      phone: branch.phone || '',
      adminName: branch.adminName || '',
      employeeCapacity: branch.employeeCapacity || 200,
      status: branch.status === 'Active' ? 'Active' : 'Inactive',
      pfRate: branch.pfRate || 12,
      esicRate: branch.esicRate || 3.25,
      basicPercent: branch.basicPercent || 50,
      profTaxRate: branch.profTaxRate || 200,
      overtimeRate: branch.overtimeRate || 1.5,
      enableBroadcasts: true,
      enableSystemAlerts: true
    });
    setBranchModalOpen(true);
  };





  const [expandedParents, setExpandedParents] = useState<Record<string, boolean>>({
    'c-gcri': true
  });

  const toggleExpandParent = (parentId: string) => {
    setExpandedParents(prev => ({
      ...prev,
      [parentId]: !prev[parentId]
    }));
  };

  // Dynamic Onboarding state
  const [newCompany, setNewCompany] = useState({
    name: '',
    email: '',
    countryCode: '+91',
    mobileNumber: '',
    address: '',
    adminName: '',
    adminEmail: '',
    industry: 'Technology',
    plan: 'Starter' as 'Starter' | 'Professional' | 'Enterprise',
    pfRate: '12',
    esicRate: '3.25',
    logo: '',
    primaryColor: '#3b82f6',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [officerErrors, setOfficerErrors] = useState<Record<string, string>>({});

  const handlePhoneChange = (val: string) => {
    const clean = val.replace(/[^\d]/g, '');
    setNewCompany(prev => {
      const next = { ...prev, mobileNumber: clean };
      const err = validatePhone(clean, next.countryCode).error;
      setErrors(prevErrors => ({ ...prevErrors, mobileNumber: err }));
      return next;
    });
  };

  const handleCountryCodeChange = (code: string) => {
    setNewCompany(prev => {
      const next = { ...prev, countryCode: code };
      const err = validatePhone(next.mobileNumber, code).error;
      setErrors(prevErrors => ({ ...prevErrors, mobileNumber: err }));
      return next;
    });
  };

  const [officerForm, setOfficerForm] = useState({
    name: '',
    email: '',
    username: '',
    password: '',
    role: 'Company Head' as 'Company Head' | 'HR',
  });

  const handleCreateCompany = async () => {
    // Require validation
    if (errors.mobileNumber || !newCompany.name || !newCompany.email || !newCompany.mobileNumber || !newCompany.address) {
      alert('Error: Please resolve validation errors before saving.');
      return;
    }

    const compId = `c${Date.now()}`;
    const generatedLogo = newCompany.logo || newCompany.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

    // Calculate trial plan price and 30-day trial renewal date (relative to mock 2026-05-20)
    const planObj = plans.find(p => p.name === newCompany.plan);
    const price = planObj ? planObj.priceMonthly : (newCompany.plan === 'Enterprise' ? 12999 : (newCompany.plan === 'Professional' ? 4999 : 1999));
    const trialDate = new Date('2026-05-20');
    trialDate.setDate(trialDate.getDate() + 30);
    const yyyy = trialDate.getFullYear();
    const mm = String(trialDate.getMonth() + 1).padStart(2, '0');
    const dd = String(trialDate.getDate()).padStart(2, '0');
    const renDate = `${yyyy}-${mm}-${dd}`;

    const fresh: Company = {
      id: compId,
      name: newCompany.name,
      domain: `${newCompany.name.toLowerCase().replace(/\s+/g, '')}.in`,
      adminName: newCompany.adminName,
      adminEmail: newCompany.adminEmail,
      phone: `${newCompany.countryCode} ${newCompany.mobileNumber}`,
      industry: newCompany.industry,
      status: 'Active',
      employeeCount: 0,
      joinDate: new Date().toISOString().split('T')[0],
      plan: newCompany.plan === 'Professional' ? 'Professional' : (newCompany.plan === 'Enterprise' ? 'Enterprise' : 'Starter'),
      logo: generatedLogo,
      pfRate: parseFloat(newCompany.pfRate) || 12,
      esicRate: parseFloat(newCompany.esicRate) || 3.25,
      basicPercent: 50,
      overtimeRate: 1.5,
      profTaxRate: 200,

      // Auto-generated branding parameters matching input specifications
      address: newCompany.address,
      email: newCompany.email,
      primaryColor: newCompany.primaryColor,
      headerText: `${newCompany.name.toUpperCase()} PRIVATE LIMITED`,
      footerText: `${newCompany.name} · Confidential Document · Contact: ${newCompany.countryCode} ${newCompany.mobileNumber}`,
      signatureText: `${newCompany.adminName}, Operations Director`,
      themeStyle: 'Modern',

      // SaaS billing parameters initialized
      paymentStatus: 'Trial Active',
      renewalDate: renDate,
      gstNumber: '',
      billingAddress: newCompany.address,
      subscriptionPrice: price,
      billingCycle: 'Monthly',
      accountStatus: 'Active'
    };

    // Auto-create a Company Head user account for this new company!
    const newHead: UserAccount = {
      id: `u${Date.now()}`,
      name: newCompany.adminName,
      email: newCompany.adminEmail,
      username: newCompany.adminEmail.split('@')[0],
      passwordStr: 'head123',
      role: 'Company Head',
      companyId: compId,
      status: 'Active',
      avatar: newCompany.adminName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    };

    try { await api.companies.create(fresh); await api.users.create({...newHead, password: newHead.passwordStr}); onRefresh?.(); setAddOpen(false); } catch(err) { console.error(err); alert('Failed to create via API'); }

    // Reset state
    setNewCompany({
      name: '',
      email: '',
      countryCode: '+91',
      mobileNumber: '',
      address: '',
      adminName: '',
      adminEmail: '',
      industry: 'Technology',
      plan: 'Starter',
      pfRate: '12',
      esicRate: '3.25',
      logo: '',
      primaryColor: '#3b82f6',
    });
    setErrors({});

    alert(`Company registered successfully.\n\nGenerated Default Company Head Account:\nLogin ID: ${newHead.username}\nPassword: ${newHead.passwordStr}`);
  };

  const openStatusModal = (company: Company) => {
    setStatusModalTarget({
      id: company.id,
      currentStatus: company.status,
      name: company.name,
      isBranch: !!company.parentCompanyId
    });
  };

  const confirmStatusToggle = () => {
    if (!statusModalTarget) return;
    setIsStatusUpdating(true);
    
    // Simulate backend sync delay
    setTimeout(() => {
      const nextStatus = statusModalTarget.currentStatus === 'Active' ? 'Inactive' : 'Active';
      
      // Cascade to branches: Find all branches under this company
      const childBranchIds = companies.filter(c => c.parentCompanyId === statusModalTarget.id).map(c => c.id);
      const relatedCompanyIds = [statusModalTarget.id, ...childBranchIds];
      
      const updatedCompanies = companies.map(c => {
        if (relatedCompanyIds.includes(c.id)) {
          return { 
            ...c, 
            status: nextStatus, 
            accountStatus: nextStatus === 'Active' ? 'Active' : 'Suspended',
            branchPortalActive: nextStatus === 'Active',
            branchLicenseActive: nextStatus === 'Active',
            branchLicenseStatus: nextStatus === 'Active' ? 'Active License' : 'Suspended',
            isArchived: nextStatus === 'Active' ? false : c.isArchived
          } as Company;
        }
        return c;
      });
      
      // Update state and backend. Branches only accept branch-valid fields;
      // companies accept the access/license flags too.
      const targets = updatedCompanies.filter(c => relatedCompanyIds.includes(c.id));
      const updates = targets.map(c => {
        return c.parentCompanyId
          ? api.branches.update(c.id, { status: c.status, isArchived: c.isArchived })
          : api.companies.update(c.id, {
              status: c.status, accountStatus: c.accountStatus, branchPortalActive: c.branchPortalActive,
              branchLicenseActive: c.branchLicenseActive, branchLicenseStatus: c.branchLicenseStatus, isArchived: c.isArchived
            });
      });

      // Optimistic UI update first, then reconcile with the backend result.
      onUpdateCompanies(updatedCompanies);

      Promise.allSettled(updates).then((results) => {
        const failures = results.filter(r => r.status === 'rejected');
        if (failures.length > 0) {
          console.error('Status update failures:', failures.map(f => (f as PromiseRejectedResult).reason));
          alert(`Failed to ${nextStatus === 'Active' ? 'restore/reactivate' : 'suspend'} ${failures.length} of ${targets.length} record(s). The change was not saved. Please try again.`);
        }
        // Always re-sync from the database so the UI reflects the true persisted
        // state (reverts the optimistic update if the backend rejected it).
        onRefresh?.();
      });

      // Forceful Employee Restoration: If company becomes Active, ALL its archived employees should become Active
      if (nextStatus === 'Active' && onUpdateEmployees) {
        const empUpdates: Promise<any>[] = [];
        const updatedEmployees = employees.map(emp => {
          // Match by company OR branch — branch employees carry companyId = parent
          // and branchId = the branch, so a branch restore must check branchId too.
          const belongs = relatedCompanyIds.includes(emp.companyId) ||
            (!!(emp as any).branchId && relatedCompanyIds.includes((emp as any).branchId));
          if (belongs && emp.status === 'Archived') {
            empUpdates.push(api.employees.update(emp.id, { status: 'Active', exitDate: null, exitReason: null }).catch(e => console.error(e)));
            return {
              ...emp,
              status: 'Active' as const,
            };
          }
          return emp;
        });
        Promise.all(empUpdates);
        onUpdateEmployees(updatedEmployees);
      }
      
      // Audit log tracking
      const action = nextStatus === 'Active' ? 'Activated' : 'Suspended';
      const logEntry = `[${new Date().toISOString()}] ${action}: ${statusModalTarget.name} (ID: ${statusModalTarget.id}) by User/Admin.`;
      const existingLogs = JSON.parse(localStorage.getItem('hrms_audit_logs') || '[]');
      localStorage.setItem('hrms_audit_logs', JSON.stringify([logEntry, ...existingLogs]));
      
      setIsStatusUpdating(false);
      setStatusModalTarget(null);
    }, 800);
  };

  const handleSavePlan = () => {
    if (!editPlanModal) return;
    const selectedPlan = plans.find(p => p.name === newPlan);
    const updated = companies.map(c => {
      if (c.id === editPlanModal.id) {
        return {
          ...c,
          plan: newPlan,
          priceMonthly: selectedPlan ? selectedPlan.priceMonthly : c.priceMonthly,
          priceYearly: selectedPlan ? selectedPlan.priceYearly : c.priceYearly,
          subscriptionPrice: selectedPlan ? selectedPlan.priceMonthly : c.subscriptionPrice,
          paymentStatus: 'Paid' as const
        };
      }
      return c;
    });
    api.companies.update(editPlanModal.id, { 
      plan: newPlan, 
      priceMonthly: selectedPlan ? selectedPlan.priceMonthly : editPlanModal.priceMonthly,
      priceYearly: selectedPlan ? selectedPlan.priceYearly : editPlanModal.priceYearly,
      subscriptionPrice: selectedPlan ? selectedPlan.priceMonthly : editPlanModal.subscriptionPrice
    }).then(() => {
      onUpdateCompanies(updated);
      setEditPlanModal(null);
    }).catch(err => {
      console.error(err);
      alert('Failed to save plan to backend');
    });
  };

  const handleSaveBranch = () => {
    if (!branchForm.name || !branchForm.branchCode || !branchForm.email || !branchForm.adminName) {
      alert('Please fill in all strictly required fields (Branch Name, Branch Code, Branch Email, and Branch Admin).');
      return;
    }

    if (editingBranch) {
      // Edit mode
      const updatedCompanies = companies.map(c => {
        if (c.id === editingBranch.id) {
          return {
            ...c,
            name: branchForm.name,
            branchName: branchForm.name.replace(/^GCRI\s+/, ''),
            branchCode: branchForm.branchCode,
            location: branchForm.location,
            address: branchForm.location,
            email: branchForm.email,
            adminEmail: branchForm.email,
            phone: branchForm.phone,
            adminName: branchForm.adminName,
            employeeCapacity: Number(branchForm.employeeCapacity) || 200,
            status: branchForm.status,
            pfRate: Number(branchForm.pfRate) || 12,
            esicRate: Number(branchForm.esicRate) || 3.25,
            basicPercent: Number(branchForm.basicPercent) || 50,
            profTaxRate: Number(branchForm.profTaxRate) || 200,
            overtimeRate: Number(branchForm.overtimeRate) || 1.5,
          };
        }
        return c;
      });
      api.branches.update(editingBranch.id, {
        branchName: branchForm.name.replace(/^GCRI\s+/, ''),
        branchCode: branchForm.branchCode,
        location: branchForm.location,
        email: branchForm.email,
        adminEmail: branchForm.email,
        phone: branchForm.phone,
        adminName: branchForm.adminName,
        employeeCapacity: Number(branchForm.employeeCapacity) || 200,
        status: branchForm.status,
        pfRate: Number(branchForm.pfRate) || 12,
        esicRate: Number(branchForm.esicRate) || 3.25,
        basicPercent: Number(branchForm.basicPercent) || 50,
        profTaxRate: Number(branchForm.profTaxRate) || 200,
        overtimeRate: Number(branchForm.overtimeRate) || 1.5,
      }).then(() => {
        onUpdateCompanies(updatedCompanies);
        onRefresh?.();
        setBranchModalOpen(false);
        alert('Branch updated successfully.');
      }).catch(err => {
        console.error(err);
        alert('Failed to update branch on backend.');
      });
    } else {
      // Create mode
      const newId = `c-br-${Date.now()}`;
      const newBranchObj: Company = {
        id: newId,
        parentCompanyId: parentCompanyIdForBranch || 'c-gcri',
        name: branchForm.name,
        branchName: branchForm.name.replace(/^GCRI\s+/, ''),
        branchCode: branchForm.branchCode,
        domain: `${branchForm.name.toLowerCase().replace(/\s+/g, '')}.gcri.in`,
        adminName: branchForm.adminName,
        adminEmail: branchForm.email,
        phone: branchForm.phone,
        industry: 'Healthcare & Research',
        status: branchForm.status,
        employeeCount: 0,
        joinDate: new Date().toISOString().split('T')[0],
        plan: 'Enterprise',
        logo: 'GC',
        pfRate: Number(branchForm.pfRate) || 12,
        esicRate: Number(branchForm.esicRate) || 3.25,
        basicPercent: Number(branchForm.basicPercent) || 50,
        profTaxRate: Number(branchForm.profTaxRate) || 200,
        overtimeRate: Number(branchForm.overtimeRate) || 1.5,
        address: branchForm.location,
        email: branchForm.email,
        primaryColor: '#6366f1',
        headerText: `${branchForm.name.toUpperCase()} REGIONAL CENTER`,
        footerText: `${branchForm.name} · Subsidiary of Gujarat Cancer Research Institute`,
        signatureText: `${branchForm.adminName}, Branch Director`,
        themeStyle: 'Modern',
        paymentStatus: 'Trial Active',
        renewalDate: '2027-12-31',
        subscriptionPrice: 0,
        billingCycle: 'Monthly',
        accountStatus: 'Active'
      };

      // Auto provision Branch Admin user account!
      const newAdminUser: UserAccount = {
        id: `u-ba-${Date.now()}`,
        name: branchForm.adminName,
        email: branchForm.email,
        username: branchForm.email.split('@')[0],
        passwordStr: 'welcome123',
        role: 'Company Head',
        companyId: newId,
        status: 'Active',
        avatar: branchForm.adminName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
      };

      Promise.all([
        api.branches.create(newBranchObj).catch(e => { console.error("Branch create error:", e); throw e; }),
        api.users.create({ ...newAdminUser, password: newAdminUser.passwordStr }).catch(e => { console.error("User create error:", e); throw e; })
      ]).then(() => {
        onUpdateAccounts([...userAccounts, newAdminUser]);
        onUpdateCompanies([...companies, newBranchObj]);
        onRefresh?.();
        alert(`Branch created successfully.\n\nGenerated Branch Admin Account:\nLogin ID: ${newAdminUser.username}\nPassword: ${newAdminUser.passwordStr}`);
      }).catch(err => {
        console.error(err);
        alert('Failed to create branch or admin user on the backend.');
      });
    }

    setBranchModalOpen(false);
  };

  // Manage Accounts triggers
  const companyUsers = manageAccountsModal
    ? userAccounts.filter(u => u.companyId === manageAccountsModal.id)
    : [];

  const handleOpenWorkspaceAssign = (user: UserAccount) => {
    setWorkspaceAssignUser(user);
    setSelectedWorkspaces(user.accessibleCompanyIds || [user.companyId]);
  };

  const handleSaveWorkspaces = () => {
    if (!workspaceAssignUser) return;
    const updated = userAccounts.map(u => {
      if (u.id === workspaceAssignUser.id) {
        return {
          ...u,
          accessibleCompanyIds: selectedWorkspaces,
          companyId: selectedWorkspaces.length > 0 ? selectedWorkspaces[0] : u.companyId
        };
      }
      return u;
    });
    onUpdateAccounts(updated);
    setWorkspaceAssignUser(null);
  };

  const handleCreateOfficer = () => {
    if (!manageAccountsModal) return;
    const nameErr = validateName(officerForm.name).error;
    const emailErr = validateEmail(officerForm.email).error;
    if (nameErr || emailErr) {
      alert('Error: Please resolve validation errors before saving.');
      return;
    }
    const existingUser = userAccounts.find(u => u.username.toLowerCase() === officerForm.username.toLowerCase());
    if (existingUser) {
      if (existingUser.accessibleCompanyIds && existingUser.accessibleCompanyIds.includes(manageAccountsModal.id)) {
        alert('Error: This user already has access to this workspace.');
        return;
      }
      
      const updated = userAccounts.map(u => {
        if (u.id === existingUser.id) {
          const currentIds = u.accessibleCompanyIds || [u.companyId];
          return {
            ...u,
            accessibleCompanyIds: [...new Set([...currentIds, manageAccountsModal.id])]
          };
        }
        return u;
      });
      
      onUpdateAccounts(updated);
      setOfficerForm({ name: '', email: '', username: '', password: '', role: 'Company Head' });
      setOfficerErrors({});
      alert(`Existing user detected — additional branch/company access granted to ${manageAccountsModal.name}.`);
      return;
    }

    const newUser: UserAccount = {
      id: `u${Date.now()}`,
      name: officerForm.name,
      email: officerForm.email,
      username: officerForm.username.trim(),
      passwordStr: officerForm.password || 'welcome123',
      role: officerForm.role,
      companyId: manageAccountsModal.id,
      accessibleCompanyIds: [manageAccountsModal.id],
      status: 'Active',
      avatar: officerForm.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    };

    api.users.create({ ...newUser, password: newUser.passwordStr }).then(() => {
      onUpdateAccounts([...userAccounts, newUser]);
      setOfficerForm({ name: '', email: '', username: '', password: '', role: 'Company Head' });
      setOfficerErrors({});
      alert(`Successfully provisioned new ${officerForm.role} credential:\nID: ${newUser.username}\nPassword: ${newUser.passwordStr}`);
    }).catch(err => {
      console.error(err);
      alert('Failed to create user account on the backend.');
    });
  };

  const handleToggleUserActivation = (userId: string) => {
    const updated = userAccounts.map(u => {
      if (u.id === userId) {
        const nextStatus = u.status === 'Active' ? 'Disabled' : 'Active';
        return { ...u, status: nextStatus as 'Active' | 'Disabled' };
      }
      return u;
    });
    onUpdateAccounts(updated);
    alert('User status toggled successfully.');
  };

  const handleResetUserPassword = async (userId: string) => {
    const newPass = prompt('Enter new access password (min 8 characters):');
    if (!newPass || newPass.length < 8) {
      if (newPass) alert('Password must be at least 8 characters long.');
      return;
    }
    
    try {
      await api.users.resetPassword(userId, newPass);
      const updated = userAccounts.map(u => {
        if (u.id === userId) {
          return { ...u, passwordStr: newPass };
        }
        return u;
      });
      onUpdateAccounts(updated);
      alert('Password updated successfully.');
    } catch (err: any) {
      console.error(err);
      alert(`Failed to reset password: ${err.message}`);
    }
  };

  const handleRevokeUser = (userId: string) => {
    if (!confirm('Are you sure you want to revoke this user access?')) return;
    const updated = userAccounts.filter(u => u.id !== userId);
    onUpdateAccounts(updated);
    alert('Access revoked successfully.');
  };

  // Filter accounts
  const filtered = companies.filter(c => {
    const isArchived = c.status === 'Archived';
    if (activeMainTab === 'active' && isArchived) return false;
    if (activeMainTab === 'archived' && !isArchived) return false;

    const matchSearch = (c.name || '').toLowerCase().includes(search.toLowerCase()) || (c.domain || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || c.status === statusFilter;
    const matchPlan = !planFilter || c.plan === planFilter;
    return matchSearch && matchStatus && matchPlan;
  });

  const handleStartOffboarding = (company: Company) => {
    if (company.status === 'Archived') {
       alert("Company is already archived.");
       return;
    }
    setOffboardCompany({
      ...company,
      offboardingState: company.offboardingState || {
        initiatedOn: new Date().toISOString(),
        payrollVerified: false,
        invoiceCleared: false,
        complianceVerified: false,
        assetCheckCompleted: false,
        employeesOffboarded: false,
        financialSettlement: false
      }
    });

  };

  const handleCompleteOffboarding = () => {
    if (!offboardCompany) return;
    const state = offboardCompany.offboardingState;
    if (!state?.payrollVerified || !state?.invoiceCleared || !state?.complianceVerified || !state?.assetCheckCompleted || !state?.financialSettlement) {
      alert("Cannot finalize closure: Pending clearances or settlements.");
      return;
    }
    const today = new Date().toISOString().split('T')[0];
    const branchIds = companies.filter(c => c.parentCompanyId === offboardCompany.id).map(c => c.id);
    const allLinkedIds = [offboardCompany.id, ...branchIds];
    
    // Auto cascade employees to archived if they belong to this company or its branches
    if (onUpdateEmployees) {
      const empUpdates: Promise<any>[] = [];
      const updatedEmps = employees.map(emp => {
        if (allLinkedIds.includes(emp.companyId) && emp.status !== 'Archived') {
          empUpdates.push(api.employees.update(emp.id, { 
             status: 'Archived', 
             exitDate: today, 
             exitReason: 'Tender/Company Auto-Archived' 
          }).catch(e => console.error(e)));

          return {
             ...emp,
             status: 'Archived' as const,
             exitDate: today,
             exitReason: 'Tender/Company Auto-Archived',
             employmentHistory: [...(emp.employmentHistory || []), {
               companyId: offboardCompany.id,
               companyName: offboardCompany.name,
               branchName: emp.branchLocation,
               role: emp.role,
               designation: emp.designation,
               startDate: emp.joinDate,
               endDate: today,
               reason: 'Tender/Contract Completed'
             }]
          };
        }
        return emp;
      });
      Promise.all(empUpdates);
      onUpdateEmployees(updatedEmps);
    }

    const updated: Company = {
      ...offboardCompany,
      status: 'Archived',
      offboardingState: {
        ...state,
        completedOn: new Date().toISOString()
      }
    };

    const compUpdates = [
      offboardCompany.parentCompanyId ? api.branches.archive(offboardCompany.id) : api.companies.archive(offboardCompany.id),
      ...branchIds.map(bId => api.branches.archive(bId))
    ];

    Promise.all(compUpdates).then(() => {
      onUpdateCompanies(companies.map(c => {
        if (c.id === offboardCompany.id) return updated;
        if (c.parentCompanyId === offboardCompany.id) return { ...c, status: 'Archived' };
        return c;
      }));
      onRefresh?.();
      setIsConfirmingOffboard(false);
      setOffboardCompany(null);
      alert(`Company/Branch ${offboardCompany.name} and any child branches were offboarded and safely archived. All linked employees were automatically archived.`);
    }).catch(err => {
      console.error(err);
      alert('Failed to execute offboarding on backend.');
    });
  };

  const executeCompleteOffboarding = () => {
    setIsConfirmingOffboard(true);
  };

  // KPI counts — straight from the database via SuperAdminStatisticsService.
  // No client-side recomputation; the API is the single source of truth.
  // Cards auto-update because superAdminStats is re-fetched after every
  // create / edit / suspend / activate / archive / delete action (see App.tsx).
  const kpiTotalCompanies    = superAdminStats?.totalCompanies      ?? 0;
  const kpiTotalBranches     = superAdminStats?.totalBranches        ?? 0;
  const kpiDeactivatedCompanies = superAdminStats?.deactivatedCompanies ?? 0;
  const kpiDeactivatedBranches  = superAdminStats?.deactivatedBranches  ?? 0;

  // Determine if save button should be disabled
  console.log('Companies.tsx render. Total companies:', companies.length, 'Filtered:', filtered.length); const isSaveDisabled =
    !newCompany.name ||
    !newCompany.email ||
    !newCompany.mobileNumber ||
    !newCompany.address ||
    !newCompany.adminName ||
    !newCompany.adminEmail ||
    !newCompany.pfRate ||
    !newCompany.esicRate ||
    Object.values(errors).some(err => !!err);

  return (
    <div className="space-y-4 bg-[#F8FBFF] -mx-4 -mt-4 p-6 min-h-screen font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-2">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">SaaS Company Management</h2>
          <p className="text-sm text-slate-500 mt-1">Configure tenants, verify enrollments, and manage corporate access</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => setActiveMainTab('active')}
            className={`px-4 py-2 text-sm font-medium rounded-full transition-colors border shadow-sm ${activeMainTab === 'active' ? 'bg-white text-[#2563EB] border-[#DBEAFE]' : 'bg-transparent border-transparent text-slate-500 hover:text-[#1D4ED8]'}`}
          >
            Active Tenders
          </button>
          <button
            onClick={() => setActiveMainTab('archived')}
            className={`px-4 py-2 text-sm font-medium rounded-full transition-colors border shadow-sm ${activeMainTab === 'archived' ? 'bg-white text-[#2563EB] border-[#DBEAFE]' : 'bg-transparent border-transparent text-slate-500 hover:text-[#1D4ED8]'}`}
          >
            Archived Tenders
          </button>
          
          {canEdit && (
            <div className="relative" ref={exportDropRef}>
              <button
                id="btn-export-company-dropdown"
                onClick={() => setExportDropOpen(o => !o)}
                disabled={!!isExporting}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl border transition-all duration-200 select-none disabled:opacity-50 disabled:cursor-not-allowed bg-white border-emerald-200 text-emerald-700 shadow-sm hover:bg-emerald-50 hover:border-emerald-300 hover:shadow-md active:scale-[0.98]"
              >
                {isExporting ? (
                  <><Loader2 size={13} className="animate-spin" /> Exporting…</>
                ) : (
                  <><FileSpreadsheet size={13} className="text-emerald-600" /> Export <ChevronRight size={12} className={`transition-transform ml-0.5 ${exportDropOpen ? 'rotate-90' : 'rotate-0'}`} /></>
                )}
              </button>

              {exportDropOpen && (
                <div className="absolute right-0 z-50 mt-1.5 w-52 rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-200/60 overflow-hidden">
                  {/* Excel option */}
                  <button
                    type="button"
                    onClick={handleExportExcel}
                    className="flex w-full items-center gap-2.5 px-4 py-3 text-xs font-semibold text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
                  >
                    <FileSpreadsheet size={15} className="text-emerald-600 flex-shrink-0" />
                    <div className="text-left">
                      <div className="font-bold">Export to Excel</div>
                      <div className="text-[10px] text-slate-400 font-normal">Companies · Branches · Plans (.xlsx)</div>
                    </div>
                  </button>
                  <div className="h-px bg-slate-100" />
                  {/* PDF option */}
                  <button
                    type="button"
                    onClick={handleExportPDF}
                    className="flex w-full items-center gap-2.5 px-4 py-3 text-xs font-semibold text-slate-600 hover:bg-rose-50 hover:text-rose-700 transition-colors"
                  >
                    <FileText size={15} className="text-rose-600 flex-shrink-0" />
                    <div className="text-left">
                      <div className="font-bold">Export to PDF</div>
                      <div className="text-[10px] text-slate-400 font-normal">Dashboard report (.pdf)</div>
                    </div>
                  </button>
                </div>
              )}
            </div>
          )}
          
          {canEdit && activeMainTab === 'active' && (
            <button 
              onClick={() => setAddOpen(true)}
              className="px-5 py-2 text-sm font-medium bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] text-white rounded-full shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all inline-flex items-center gap-2"
            >
              <Plus size={16} />
              Create Company
            </button>
          )}
        </div>
      </div>

      {/* ── KPI Cards ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

        {/* Card 1 — Total Companies */}
        <div className="relative overflow-hidden bg-gradient-to-br from-[#EFF6FF] via-[#F0F7FF] to-white rounded-2xl p-5 flex items-start gap-4 border border-[#BFDBFE] shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
          {/* Decorative ring */}
          <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full bg-[#2563EB]/8 pointer-events-none" />
          <div className="w-11 h-11 rounded-xl bg-[#2563EB] flex items-center justify-center flex-shrink-0 shadow-md shadow-blue-200">
            <Building2 size={20} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-[#2563EB] uppercase tracking-wide mb-0.5">Total Companies</p>
            <p className="text-3xl font-extrabold text-slate-800 leading-none">{kpiTotalCompanies}</p>
            <p className="text-xs text-slate-500 mt-1.5">Registered organizations</p>
          </div>
        </div>

        {/* Card 2 — Total Branches */}
        <div className="relative overflow-hidden bg-gradient-to-br from-indigo-50 via-indigo-50/60 to-white rounded-2xl p-5 flex items-start gap-4 border border-indigo-200 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
          <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full bg-indigo-400/10 pointer-events-none" />
          <div className="w-11 h-11 rounded-xl bg-indigo-600 flex items-center justify-center flex-shrink-0 shadow-md shadow-indigo-200">
            <Link size={20} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-0.5">Total Branches</p>
            <p className="text-3xl font-extrabold text-slate-800 leading-none">{kpiTotalBranches}</p>
            <p className="text-xs text-slate-500 mt-1.5">All company branches</p>
          </div>
        </div>

        {/* Card 3 — Deactivated Companies */}
        <div className="relative overflow-hidden bg-gradient-to-br from-amber-50 via-orange-50/60 to-white rounded-2xl p-5 flex items-start gap-4 border border-amber-200 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
          <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full bg-amber-400/10 pointer-events-none" />
          <div className="w-11 h-11 rounded-xl bg-amber-500 flex items-center justify-center flex-shrink-0 shadow-md shadow-amber-200">
            <Lock size={20} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-0.5">Deactivated Companies</p>
            <p className="text-3xl font-extrabold text-slate-800 leading-none">{kpiDeactivatedCompanies}</p>
            <p className="text-xs text-slate-500 mt-1.5">Company access disabled</p>
          </div>
        </div>

        {/* Card 4 — Deactivated Branches */}
        <div className="relative overflow-hidden bg-gradient-to-br from-rose-50 via-red-50/60 to-white rounded-2xl p-5 flex items-start gap-4 border border-rose-200 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
          <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full bg-rose-400/10 pointer-events-none" />
          <div className="w-11 h-11 rounded-xl bg-rose-600 flex items-center justify-center flex-shrink-0 shadow-md shadow-rose-200">
            <Shield size={20} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-rose-600 uppercase tracking-wide mb-0.5">Deactivated Branches</p>
            <p className="text-3xl font-extrabold text-slate-800 leading-none">{kpiDeactivatedBranches}</p>
            <p className="text-xs text-slate-500 mt-1.5">Branch access disabled</p>
          </div>
        </div>

      </div>

      {/* Filters bar */}
      <div className="bg-white rounded-[14px] border border-[#DBEAFE] shadow-sm p-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search companies by name or domain..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-slate-50 border-none rounded-full pl-11 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 text-slate-700 placeholder-slate-400 outline-none"
            />
          </div>
          <div className="w-full sm:w-48 relative">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="w-full appearance-none bg-white border border-slate-200 rounded-full px-4 py-2.5 text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            >
              <option value="">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Inactive">Suspended</option>
            </select>
            <ChevronRight size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 rotate-90 pointer-events-none" />
          </div>
          <div className="w-full sm:w-48 relative">
            <select
              value={planFilter}
              onChange={e => setPlanFilter(e.target.value)}
              className="w-full appearance-none bg-white border border-slate-200 rounded-full px-4 py-2.5 text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            >
              <option value="">All Plans</option>
              <option value="Starter">Starter</option>
              <option value="Professional">Professional</option>
              <option value="Enterprise">Enterprise</option>
            </select>
            <ChevronRight size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 rotate-90 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Grid directory */}
      <div className="bg-white rounded-[14px] border border-[#DBEAFE] shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[#DBEAFE] flex items-center justify-between bg-white">
          <span className="text-sm font-bold text-slate-800">Tenant Directory</span>
          <span className="text-xs text-slate-500 font-medium">{filtered.filter(c => !c.parentCompanyId).length} clients registered</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#DBEAFE] bg-[#F8FBFF]">
                <th className="py-3 px-5 text-xs font-semibold text-slate-500">Company Profile</th>
                <th className="py-3 px-5 text-xs font-semibold text-slate-500">SaaS Admin Info</th>
                <th className="py-3 px-5 text-xs font-semibold text-slate-500">Details</th>
                <th className="py-3 px-5 text-xs font-semibold text-slate-500">Status</th>
                <th className="py-3 px-5 text-xs font-semibold text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DBEAFE]">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-8 text-sm text-slate-400">
                  No company records found matching search queries
                </td>
              </tr>
            ) : (
              filtered.filter(c => !c.parentCompanyId).map(c => {
                const branches = companies.filter(b => b.parentCompanyId === c.id);
                const hasBranches = branches.length > 0;
                const isExpanded = expandedParents[c.id];

                // Calculate total combined employees under parent
                const combinedEmpCount = (c.employeeCount || 0) + branches.reduce((sum, b) => sum + (b.employeeCount || 0), 0);

                return (
                  <React.Fragment key={c.id}>
                    <tr className="hover:bg-slate-50/50 transition-colors bg-white">
                      {/* Company Profile */}
                      <td className="py-3 px-5">
                        <div className="flex items-center gap-3">
                          {hasBranches && (
                            <button
                              onClick={() => toggleExpandParent(c.id)}
                              className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600 transition-transform duration-200"
                              style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
                            >
                              <ChevronRight size={16} />
                            </button>
                          )}
                          <div className="w-10 h-10 rounded-full bg-[#EFF6FF] text-[#1D4ED8] flex items-center justify-center font-bold text-sm border border-[#DBEAFE]" style={!c.logoImage ? {} : {}}>
                            {c.logoImage ? (
                              <img src={c.logoImage} alt="Logo" className="w-full h-full object-contain rounded-full" />
                            ) : (
                              <span>{getCompanyInitials(c.name)}</span>
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-bold text-slate-800">{c.name}</h4>
                              {hasBranches && (
                                <span className="text-[10px] font-semibold bg-[#EFF6FF] text-[#2563EB] px-2 py-0.5 rounded-full border border-[#DBEAFE]">Parent Company</span>
                              )}
                            </div>
                            <span className="text-xs text-slate-500 mt-0.5 block">{c.domain}</span>
                          </div>
                        </div>
                      </td>

                      {/* SaaS Admin Info */}
                      <td className="py-3 px-5">
                        <div className="space-y-1">
                          <p className="text-xs font-semibold text-slate-700">{c.adminName}</p>
                          <div className="flex flex-col gap-1 text-[11px] text-slate-500">
                            <span className="flex items-center gap-1.5"><Mail size={12} className="text-slate-400" /> {c.adminEmail}</span>
                            <span className="flex items-center gap-1.5"><Phone size={12} className="text-slate-400" /> {c.phone}</span>
                          </div>
                        </div>
                      </td>

                      {/* Details */}
                      <td className="py-3 px-5">
                        <div className="text-[11px] text-slate-500 space-y-1">
                          <p>Sector: <span className="font-semibold text-slate-700">{c.industry}</span></p>
                          <p>Joined: {c.joinDate}</p>
                          <p>
                            {hasBranches ? 'Combined Staff: ' : 'Employees: '}
                            <span className="font-semibold text-slate-700">{combinedEmpCount}</span>
                          </p>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-5">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${c.status === 'Active' ? 'bg-[#DBEAFE] text-[#1D4ED8] border-[#BFDBFE]' : 'bg-[#FEE2E2] text-[#DC2626] border-[#FECACA]'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${c.status === 'Active' ? 'bg-[#2563EB]' : 'bg-[#DC2626]'}`}></span>
                          {c.status}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-5">
                        {canEdit && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => onStartMasquerade(c.id)}
                              className="text-xs px-3 py-1.5 bg-white text-slate-700 border border-slate-200 rounded-full font-medium transition-colors hover:bg-slate-50 inline-flex items-center gap-1.5 shadow-sm"
                            >
                              Manage {hasBranches ? 'All' : ''} <ChevronRight size={14} className="text-slate-400" />
                            </button>
                            
                            <button
                              onClick={() => handleOpenEditCompany(c)}
                              className="p-1.5 bg-white text-slate-400 hover:text-slate-600 border border-slate-200 rounded-md transition-colors shadow-sm"
                              title="Edit Company"
                            >
                              <Link size={14} />
                            </button>

                            <button
                              onClick={() => setManageAccountsModal(c)}
                              className="p-1.5 bg-white text-slate-400 hover:text-slate-600 border border-slate-200 rounded-md transition-colors shadow-sm"
                              title="Manage Credentials"
                            >
                              <Users size={14} />
                            </button>

                            {c.status !== 'Archived' ? (
                               <button
                                onClick={() => handleStartOffboarding(c)}
                                className="p-1.5 bg-white text-rose-400 hover:text-rose-600 border border-slate-200 rounded-md transition-colors shadow-sm"
                                title="Delete/Archive"
                              >
                                <Trash2 size={14} />
                              </button>
                            ) : (
                               <button
                                onClick={() => openStatusModal(c)}
                                className={`px-2.5 py-1 rounded border text-[10px] font-bold shadow-xs transition-all ${c.status === 'Active' ? 'bg-[#FEE2E2] border-[#FECACA] text-[#DC2626] hover:bg-rose-100' : 'bg-[#DBEAFE] border-[#BFDBFE] text-[#1D4ED8] hover:bg-[#EFF6FF]'}`}
                              >
                                {c.status === 'Active' ? 'Suspend' : (c.status === 'Archived' ? 'Restore' : 'Activate')}
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>

                    {/* Collapsible Nested Roster for branches */}
                    {hasBranches && isExpanded && (
                      <tr>
                        <td colSpan={5} className="bg-[#F8FBFF] p-6 border-l-4 border-[#2563EB]">
                          <div className="rounded-[16px] border border-[#DBEAFE] bg-white overflow-hidden shadow-sm">
                            <div className="bg-[#EFF6FF] px-5 py-3 border-b border-[#DBEAFE] flex items-center justify-between">
                              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">GCRI Connected Sub-Branches</span>
                              <div className="flex items-center gap-3">
                                <span className="text-[11px] text-slate-500 font-medium">{branches.length} branches resolved</span>
                                {canEdit && (
                                  <button
                                    onClick={() => handleOpenCreateBranch(c.id)}
                                    className="px-3 py-1.5 bg-white border border-[#DBEAFE] hover:bg-[#EFF6FF] text-[#2563EB] rounded-full text-[11px] font-bold flex items-center gap-1 shadow-sm transition-colors"
                                  >
                                    <Plus size={12} className="text-[#2563EB]" /> Create Branch
                                  </button>
                                )}
                              </div>
                            </div>
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="border-b border-[#DBEAFE] text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                                  <th className="py-3 px-5">Branch Code & Name</th>
                                  <th className="py-3 px-5">SaaS Admin Info</th>
                                  <th className="py-3 px-5">Staff Count</th>
                                  <th className="py-3 px-5">Status</th>
                                  <th className="py-3 px-5 text-right">Branch Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[#E2EFEA] text-xs text-slate-600">
                                {branches.map(b => {
                                  // Total staff assigned to this branch — the live count computed by
                                  // the backend (getBranches: COUNT(employees WHERE branchId = b.id)).
                                  // Falls back to a direct count over the loaded employee list so the
                                  // number always reflects real DB records, never a cached/placeholder 0.
                                  const branchEmpCount = (b as any).headcount ??
                                    uniqueEmployees.filter(emp => emp.branchId === b.id).length;
                                  return (
                                    <tr key={b.id} className="hover:bg-slate-50/50 transition-colors">
                                      <td className="py-2.5 px-5">
                                        <div className="flex items-center gap-3">
                                          <span className="font-bold text-[#1D4ED8] bg-[#EFF6FF] px-2 py-1 rounded border border-[#DBEAFE] text-[10px]">
                                            {b.branchCode || 'BR'}
                                          </span>
                                          <div>
                                            <p className="font-bold text-slate-800">{b.branchName || b.name}</p>
                                            <p className="text-[10px] text-slate-500">{b.domain}</p>
                                          </div>
                                        </div>
                                      </td>
                                      <td className="py-2.5 px-5">
                                        <p className="font-medium text-slate-700">{b.adminName}</p>
                                        <p className="text-[10px] text-slate-500">{b.adminEmail}</p>
                                      </td>
                                      <td className="py-2.5 px-5 font-semibold text-slate-700">
                                        {branchEmpCount} Staff
                                      </td>
                                      <td className="py-2.5 px-5">
                                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${b.status === 'Active' ? 'bg-[#DBEAFE] text-[#1D4ED8] border-[#BFDBFE]' : 'bg-[#FEE2E2] text-[#DC2626] border-[#FECACA]'}`}>
                                          <span className={`w-1 h-1 rounded-full ${b.status === 'Active' ? 'bg-[#2563EB]' : 'bg-[#DC2626]'}`}></span>
                                          {b.status}
                                        </span>
                                      </td>
                                      <td className="py-2.5 px-5 text-right">
                                        {canEdit && (
                                          <div className="inline-flex items-center gap-2">
                                            <button
                                              onClick={() => onStartMasquerade(b.id)}
                                              className="px-3 py-1.5 bg-white text-slate-700 border border-slate-200 rounded-full font-medium text-[11px] transition-colors hover:bg-slate-50 shadow-sm"
                                            >
                                              Manage
                                            </button>
                                            <button
                                              onClick={() => handleOpenEditBranch(b)}
                                              className="p-1.5 bg-white text-slate-400 hover:text-slate-600 border border-slate-200 rounded-md transition-colors shadow-sm"
                                              title="Edit Branch Settings"
                                            >
                                              <Link size={12} />
                                            </button>
                                            <button
                                              onClick={() => setManageAccountsModal(b)}
                                              className="p-1.5 bg-white text-slate-400 hover:text-slate-600 border border-slate-200 rounded-md transition-colors shadow-sm"
                                              title="Credentials"
                                            >
                                              <Users size={12} />
                                            </button>
                                            {b.status !== 'Archived' ? (
                                              <button
                                                onClick={() => handleStartOffboarding(b)}
                                                className="p-1.5 bg-white text-rose-400 hover:text-rose-600 border border-slate-200 rounded-md transition-colors shadow-sm"
                                                title="Delete/Archive"
                                              >
                                                <Trash2 size={12} />
                                              </button>
                                            ) : (
                                              <button
                                                onClick={() => openStatusModal(b)}
                                                className={`px-2.5 py-1 rounded border text-[10px] font-bold shadow-xs transition-all ${b.status === 'Active' ? 'bg-[#FEE2E2] border-[#FECACA] text-[#DC2626] hover:bg-rose-100' : 'bg-[#DBEAFE] border-[#BFDBFE] text-[#1D4ED8] hover:bg-[#EFF6FF]'}`}
                                              >
                                                {b.status === 'Active' ? 'Suspend' : (b.status === 'Archived' ? 'Restore' : 'Activate')}
                                              </button>
                                            )}
                                          </div>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Company Modal with Strict Onboarding Fields */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add SaaS Client Tenant"
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateCompany} disabled={isSaveDisabled}>
              Register Company
            </Button>
          </>
        }
      >
        <div className="space-y-3.5 max-h-[70vh] overflow-y-auto pr-1">
          <p className="text-xs text-gray-400">All fields are strictly required. Provisions tenant database and default Company Head credentials.</p>

          <div className="grid grid-cols-2 gap-3 text-left">
            <Input
              label="Company Name *"
              placeholder="e.g. Acme Tech"
              value={newCompany.name}
              onChange={e => {
                const clean = e.target.value.replace(/[^a-zA-Z0-9\s&.]/g, '');
                setNewCompany({ ...newCompany, name: clean });
                setErrors(prev => ({ ...prev, name: validateCompanyName(clean).error }));
              }}
              error={errors.name}
              success={newCompany.name !== '' && !errors.name}
            />
            <Input
              label="Company Official Email *"
              placeholder="e.g. contact@acme.com"
              type="email"
              value={newCompany.email}
              onChange={e => {
                const val = e.target.value;
                setNewCompany({ ...newCompany, email: val });
                setErrors(prev => ({ ...prev, email: validateEmail(val).error }));
              }}
              error={errors.email}
              success={newCompany.email !== '' && !errors.email}
            />
          </div>

          {/* Validated Phone Number Field using custom PhoneInput */}
          <PhoneInput
            label="Company Mobile Number *"
            countryCode={newCompany.countryCode}
            mobileNumber={newCompany.mobileNumber}
            onChangeCountry={handleCountryCodeChange}
            onChangeNumber={handlePhoneChange}
            error={errors.mobileNumber}
            success={newCompany.mobileNumber !== '' && !errors.mobileNumber}
          />

          <Input
            label="Corporate HQ Full Address *"
            placeholder="Street, City, State, ZIP..."
            value={newCompany.address}
            onChange={e => setNewCompany({ ...newCompany, address: e.target.value })}
          />

          <div className="grid grid-cols-2 gap-3 text-left">
            <Select
              label="Industry Sector *"
              value={newCompany.industry}
              onChange={e => setNewCompany({ ...newCompany, industry: e.target.value })}
              options={[
                { value: 'Technology', label: 'Technology / Software' },
                { value: 'Finance', label: 'Finance & Banking' },
                { value: 'Healthcare', label: 'Healthcare' },
                { value: 'Construction', label: 'Construction' },
                { value: 'Automotive', label: 'Automotive' }
              ]}
            />
            <Input
              label="Company Logo Text (Emblem) *"
              placeholder="e.g. TN"
              value={newCompany.logo}
              onChange={e => setNewCompany({ ...newCompany, logo: e.target.value.toUpperCase().slice(0, 3) })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 text-left">
            <Input
              label="PF Contribution Percentage (%) *"
              value={newCompany.pfRate}
              onChange={e => {
                const clean = e.target.value.replace(/[^\d.]/g, '');
                setNewCompany({ ...newCompany, pfRate: clean });
                setErrors(prev => ({ ...prev, pfRate: validatePercentage(clean).error }));
              }}
              error={errors.pfRate}
              success={newCompany.pfRate !== '' && !errors.pfRate}
            />
            <Input
              label="ESIC Contribution Percentage (%) *"
              value={newCompany.esicRate}
              onChange={e => {
                const clean = e.target.value.replace(/[^\d.]/g, '');
                setNewCompany({ ...newCompany, esicRate: clean });
                setErrors(prev => ({ ...prev, esicRate: validatePercentage(clean).error }));
              }}
              error={errors.esicRate}
              success={newCompany.esicRate !== '' && !errors.esicRate}
            />
          </div>

          <div className="border-t border-gray-150 pt-3 space-y-3 text-left">
            <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Default Company Head Account</h4>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Admin Full Name *"
                placeholder="e.g. Vikram Singh"
                value={newCompany.adminName}
                onChange={e => {
                  const clean = e.target.value.replace(/[^a-zA-Z\s]/g, '');
                  setNewCompany({ ...newCompany, adminName: clean });
                  setErrors(prev => ({ ...prev, adminName: validateName(clean).error }));
                }}
                error={errors.adminName}
                success={newCompany.adminName !== '' && !errors.adminName}
              />
              <Input
                label="Admin Login Email *"
                placeholder="e.g. head@acme.com"
                type="email"
                value={newCompany.adminEmail}
                onChange={e => {
                  const val = e.target.value;
                  setNewCompany({ ...newCompany, adminEmail: val });
                  setErrors(prev => ({ ...prev, adminEmail: validateEmail(val).error }));
                }}
                error={errors.adminEmail}
                success={newCompany.adminEmail !== '' && !errors.adminEmail}
              />
            </div>
            <p className="text-[10px] text-gray-400">
              Note: Login ID will be derived from email username (e.g. head). Default password is <strong>head123</strong>.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 border-t border-gray-150 pt-3">
            <Select
              label="Pricing Plan"
              value={newCompany.plan}
              onChange={e => setNewCompany({ ...newCompany, plan: e.target.value as any })}
              options={[
                { value: 'Starter', label: 'Starter' },
                { value: 'Professional', label: 'Professional' },
                { value: 'Enterprise', label: 'Enterprise' }
              ]}
            />
            <Select
              label="Brand Primary Color Theme"
              value={newCompany.primaryColor}
              onChange={e => setNewCompany({ ...newCompany, primaryColor: e.target.value })}
              options={[
                { value: '#3b82f6', label: 'Vibrant Blue' },
                { value: '#0f766e', label: 'Deep Teal' },
                { value: '#65a30d', label: 'Fresh Lime' },
                { value: '#ea580c', label: 'Construct Orange' },
                { value: '#e11d48', label: 'Rose Red' }
              ]}
            />
          </div>

        </div>
      </Modal>

      {/* Interactive Account Manager Modal */}
      <Modal
        open={!!manageAccountsModal}
        onClose={() => setManageAccountsModal(null)}
        title={`Credentials & Access: ${manageAccountsModal?.name}`}
        size="lg"
      >
        {manageAccountsModal && (
          <div className="space-y-6">

            {/* Table of active logins */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Authorized Logins & Status</h4>
              <Card padding={false}>
                <Table>
                  <Thead>
                    <tr>
                      <Th>User Profile</Th>
                      <Th>Role</Th>
                      <Th>Login ID</Th>
                      <Th>Status</Th>
                      <Th>Actions</Th>
                    </tr>
                  </Thead>
                  <Tbody>
                    {companyUsers.length === 0 ? (
                      <tr><td colSpan={5} className="text-center py-6 text-sm text-gray-400">No login credentials provisioned</td></tr>
                    ) : (
                      companyUsers.map(u => (
                        <Tr key={u.id}>
                          <Td>
                            <div>
                              <p className="text-xs font-semibold text-gray-900">{u.name}</p>
                              <p className="text-[10px] text-gray-400">{u.email}</p>
                            </div>
                          </Td>
                          <Td>
                            <Badge variant={u.role === 'Company Head' ? 'danger' : 'blue'}>{u.role}</Badge>
                          </Td>
                          <Td><span className="text-xs font-mono font-bold text-gray-800">{u.username}</span></Td>
                          <Td>
                            <Badge variant={u.status === 'Active' ? 'success' : 'danger'}>{u.status}</Badge>
                          </Td>
                          <Td>
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => handleOpenWorkspaceAssign(u)}
                                className="p-1 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 rounded"
                                title="Manage Workspaces"
                              >
                                <Building2 size={12} />
                              </button>
                              <button
                                onClick={() => handleResetUserPassword(u.id)}
                                className="p-1 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded"
                                title="Reset Password"
                              >
                                <Lock size={12} />
                              </button>
                              <button
                                onClick={() => handleToggleUserActivation(u.id)}
                                className={`text-[10px] px-2 py-0.5 rounded font-bold text-white transition-colors ${u.status === 'Active' ? 'bg-red-650 bg-red-600 hover:bg-red-700' : 'bg-[#2563EB] hover:bg-[#1D4ED8]'
                                  }`}
                              >
                                {u.status === 'Active' ? 'Disable' : 'Enable'}
                              </button>
                              <button
                                onClick={() => handleRevokeUser(u.id)}
                                className="p-1 text-red-600 hover:text-red-750 hover:bg-red-50 rounded"
                                title="Delete Login Profile"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </Td>
                        </Tr>
                      ))
                    )}
                  </Tbody>
                </Table>
              </Card>
            </div>

            {/* Create Officer Form */}
            <div className="border-t border-gray-150 pt-4 space-y-3">
              <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Provision New Corporate Officer</h4>

              <div className="grid grid-cols-2 gap-3 text-left">
                <Input
                  label="Officer Name *"
                  placeholder="e.g. Ramesh Kumar"
                  value={officerForm.name}
                  onChange={e => {
                    const clean = e.target.value.replace(/[^a-zA-Z\s]/g, '');
                    setOfficerForm({ ...officerForm, name: clean });
                    setOfficerErrors(prev => ({ ...prev, name: validateName(clean).error }));
                  }}
                  error={officerErrors.name}
                  success={officerForm.name !== '' && !officerErrors.name}
                />
                <Input
                  label="Officer Email *"
                  placeholder="e.g. ramesh@technova.in"
                  type="email"
                  value={officerForm.email}
                  onChange={e => {
                    const val = e.target.value;
                    setOfficerForm({ ...officerForm, email: val });
                    setOfficerErrors(prev => ({ ...prev, email: validateEmail(val).error }));
                  }}
                  error={officerErrors.email}
                  success={officerForm.email !== '' && !officerErrors.email}
                />
              </div>

              <div className="grid grid-cols-3 gap-3 items-end text-left">
                <Input
                  label="Generated Login ID *"
                  placeholder="e.g. ramesh"
                  value={officerForm.username}
                  onChange={e => setOfficerForm({ ...officerForm, username: e.target.value })}
                />
                <Input
                  label="Temporary Password *"
                  placeholder="Default: welcome123"
                  type="password"
                  value={officerForm.password}
                  onChange={e => setOfficerForm({ ...officerForm, password: e.target.value })}
                />
                <Select
                  label="System Role *"
                  value={officerForm.role}
                  onChange={e => setOfficerForm({ ...officerForm, role: e.target.value as any })}
                  options={[
                    { value: 'Company Head', label: 'Company Head' },
                    { value: 'HR', label: 'HR Officer' }
                  ]}
                />
              </div>

              <div className="pt-2 text-left">
                <Button
                  onClick={handleCreateOfficer}
                  disabled={
                    !officerForm.name ||
                    !officerForm.email ||
                    !officerForm.username ||
                    !!officerErrors.name ||
                    !!officerErrors.email
                  }
                >
                  Add Officer Account
                </Button>
              </div>
            </div>

          </div>
        )}
      </Modal>

      {/* Edit Plan Modal */}
      <Modal
        open={!!editPlanModal}
        onClose={() => setEditPlanModal(null)}
        title="Modify Subscription Tier"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditPlanModal(null)}>Cancel</Button>
            <Button onClick={handleSavePlan}>Update Subscription</Button>
          </>
        }
      >
        {editPlanModal && (
          <div className="space-y-3">
            <p className="text-xs text-gray-655">
              Update billing details and operational boundaries for <strong>{editPlanModal.name}</strong>.
            </p>
            <Select
              label="Select Subscription Plan"
              value={newPlan}
              onChange={e => setNewPlan(e.target.value as 'Starter' | 'Professional' | 'Enterprise')}
              options={[
                { value: 'Starter', label: 'Starter (₹1,999 / mo)' },
                { value: 'Professional', label: 'Professional (₹4,999 / mo)' },
                { value: 'Enterprise', label: 'Enterprise (₹12,999 / mo)' }
              ]}
            />
          </div>
        )}
      </Modal>

      
      {/* Edit Company Modal */}
      <Modal open={editCompanyModalOpen} onClose={() => setEditCompanyModalOpen(false)} title="Edit Parent Company" size="lg" footer={<>
        <Button variant="outline" onClick={() => setEditCompanyModalOpen(false)}>Cancel</Button>
        <Button onClick={handleSaveCompany} style={{ backgroundColor: '#4f46e5' }}>Save Changes</Button>
      </>}>
        <div className="grid grid-cols-2 gap-4 text-left font-sans">
          <Input label="Company Name *" value={editCompanyForm.name} onChange={e => setEditCompanyForm({...editCompanyForm, name: e.target.value})} />
          <Input label="Company Code" value={editCompanyForm.branchCode} onChange={e => setEditCompanyForm({...editCompanyForm, branchCode: e.target.value})} />
          <Input label="Sector / Industry" value={editCompanyForm.industry} onChange={e => setEditCompanyForm({...editCompanyForm, industry: e.target.value})} />
          <Input label="Admin Email" type="email" value={editCompanyForm.adminEmail} onChange={e => setEditCompanyForm({...editCompanyForm, adminEmail: e.target.value})} />
          <Input label="Phone Number" value={editCompanyForm.phone} onChange={e => setEditCompanyForm({...editCompanyForm, phone: e.target.value})} />
          <Input label="Website Domain" value={editCompanyForm.domain} onChange={e => setEditCompanyForm({...editCompanyForm, domain: e.target.value})} />
          <Select 
            label="Status" 
            value={editCompanyForm.status} 
            onChange={e => setEditCompanyForm({...editCompanyForm, status: e.target.value as any})}
            options={[
              { value: 'Active', label: 'Active' },
              { value: 'Inactive', label: 'Inactive' },
              { value: 'Archived', label: 'Archived' }
            ]}
          />
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-gray-700 mb-1">Billing Address</label>
            <textarea
              className="w-full text-sm p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              rows={2}
              value={editCompanyForm.billingAddress}
              onChange={e => setEditCompanyForm({...editCompanyForm, billingAddress: e.target.value})}
            />
          </div>
        </div>
      </Modal>

      {/* Branch Creation / Edition Modal */}
      <Modal
        open={branchModalOpen}
        onClose={() => setBranchModalOpen(false)}
        title={editingBranch ? `Edit Regional Branch: ${editingBranch.branchName || editingBranch.name}` : "Create Subsidiary Regional Branch"}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setBranchModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveBranch}>
              {editingBranch ? "Save Branch Settings" : "Deploy Branch Portal"}
            </Button>
          </>
        }
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <p className="text-xs text-gray-500">
            {editingBranch
              ? "Modify this subsidiary's regional limits, operational capacity, statutory parameters, and local leadership accounts."
              : "Registering a new sub-center branches under Gujarat Cancer Research Institute. Generates specialized Branch Admin logins on completion."}
          </p>

          {/* General Center Specifications */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider border-b pb-1">1. Regional Center Specifications</h4>
            <div className="grid grid-cols-2 gap-3 text-left">
              <Input
                label="Branch Name (e.g. GCRI Siddhpur) *"
                placeholder="e.g. GCRI Siddhpur"
                value={branchForm.name}
                onChange={e => setBranchForm({ ...branchForm, name: e.target.value })}
              />
              <Input
                label="Branch Code (e.g. SIDD) *"
                placeholder="e.g. SIDD"
                value={branchForm.branchCode}
                onChange={e => setBranchForm({ ...branchForm, branchCode: e.target.value.toUpperCase() })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3 text-left">
              <Input
                label="Branch Location / Address *"
                placeholder="e.g. Siddhpur Highway, Patan"
                value={branchForm.location}
                onChange={e => setBranchForm({ ...branchForm, location: e.target.value })}
              />
              <Select
                label="Operational Status *"
                value={branchForm.status}
                onChange={e => setBranchForm({ ...branchForm, status: e.target.value as 'Active' | 'Inactive' })}
                options={[
                  { value: 'Active', label: 'Active (Permit Portal Access)' },
                  { value: 'Inactive', label: 'Suspended (Revoke Branch Portal Access)' }
                ]}
              />
            </div>
          </div>

          {/* Branch Authority Credentials */}
          <div className="space-y-3 pt-2">
            <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider border-b pb-1">2. Local Leadership (Branch Admin)</h4>
            <div className="grid grid-cols-3 gap-3 text-left">
              <div className="col-span-1">
                <Input
                  label="Branch Admin Full Name *"
                  placeholder="e.g. Dr. Harshit Patel"
                  value={branchForm.adminName}
                  onChange={e => setBranchForm({ ...branchForm, adminName: e.target.value })}
                />
              </div>
              <div className="col-span-1">
                <Input
                  label="Branch Contact Email *"
                  placeholder="e.g. siddhpur@gcri.in"
                  type="email"
                  value={branchForm.email}
                  onChange={e => setBranchForm({ ...branchForm, email: e.target.value })}
                />
              </div>
              <div className="col-span-1">
                <Input
                  label="Branch Contact Phone *"
                  placeholder="e.g. +91 9988776655"
                  value={branchForm.phone}
                  onChange={e => setBranchForm({ ...branchForm, phone: e.target.value })}
                />
              </div>
            </div>
            {!editingBranch && (
              <p className="text-[10px] text-gray-400 italic mt-0.5">
                * Note: Login ID will be derived from email username (e.g. `siddhpur`). Default access password is <strong>welcome123</strong>.
              </p>
            )}
          </div>

          {/* Capacity and Statutory Parameters */}
          <div className="space-y-3 pt-2">
            <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider border-b pb-1">3. Capacity & Statutory Payroll Configurations</h4>
            <div className="grid grid-cols-3 gap-3 text-left">
              <Input
                label="Max Employee Capacity Limit *"
                type="number"
                disabled={true}
                value={branchForm.employeeCapacity}
                className="bg-gray-50 text-gray-500 font-bold cursor-not-allowed"
                title="Capacity upgrades must be executed through the Billing tab."
              />
              <Input
                label="PF Contribution Rate (%)"
                type="number"
                step="0.01"
                placeholder="e.g. 12"
                value={branchForm.pfRate}
                onChange={e => setBranchForm({ ...branchForm, pfRate: Number(e.target.value) || 12 })}
              />
              <Input
                label="ESIC Contribution Rate (%)"
                type="number"
                step="0.01"
                placeholder="e.g. 3.25"
                value={branchForm.esicRate}
                onChange={e => setBranchForm({ ...branchForm, esicRate: Number(e.target.value) || 3.25 })}
              />
            </div>
            <div className="grid grid-cols-3 gap-3 text-left">
              <Input
                label="Basic Salary % of CTC (%)"
                type="number"
                placeholder="e.g. 50"
                value={branchForm.basicPercent}
                onChange={e => setBranchForm({ ...branchForm, basicPercent: Number(e.target.value) || 50 })}
              />
              <Input
                label="Overtime Rate Multiplier"
                type="number"
                step="0.1"
                placeholder="e.g. 1.5"
                value={branchForm.overtimeRate}
                onChange={e => setBranchForm({ ...branchForm, overtimeRate: Number(e.target.value) || 1.5 })}
              />
              <Input
                label="Professional Tax Rate (INR)"
                type="number"
                placeholder="e.g. 200"
                value={branchForm.profTaxRate}
                onChange={e => setBranchForm({ ...branchForm, profTaxRate: Number(e.target.value) || 200 })}
              />
            </div>
          </div>

          {/* Local Notification Privileges */}
          <div className="space-y-3 pt-2 text-left">
            <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider border-b pb-1">4. Subsidiary Notification & Scopes</h4>
            <div className="flex flex-col gap-2 pt-1 text-xs">
              <label className="flex items-center gap-2 font-medium text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={branchForm.enableBroadcasts}
                  onChange={e => setBranchForm({ ...branchForm, enableBroadcasts: e.target.checked })}
                  className="rounded text-indigo-650 focus:ring-indigo-500 w-3.5 h-3.5"
                />
                Permit local Broadcast Dispatch to all devices in this branch
              </label>
              <label className="flex items-center gap-2 font-medium text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={branchForm.enableSystemAlerts}
                  onChange={e => setBranchForm({ ...branchForm, enableSystemAlerts: e.target.checked })}
                  className="rounded text-indigo-650 focus:ring-indigo-500 w-3.5 h-3.5"
                />
                Receive automatic critical biometric and compliance alerts
              </label>
            </div>
          </div>
        </div>
      </Modal>
      {/* Workspace Assignment Modal */}
      <Modal
        open={!!workspaceAssignUser}
        onClose={() => setWorkspaceAssignUser(null)}
        title={`Manage Workspaces: ${workspaceAssignUser?.name}`}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setWorkspaceAssignUser(null)}>Cancel</Button>
            <Button onClick={handleSaveWorkspaces}>Save Permissions</Button>
          </>
        }
      >
        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          <p className="text-xs text-gray-500">
            Select which companies and branches this user can access. They will be able to seamlessly switch between these workspaces.
          </p>
          <div className="space-y-2 border border-gray-100 rounded-xl overflow-hidden">
            {companies.map(comp => {
              let isInherited = false;
              for (const pid of selectedWorkspaces) {
                if (!pid) continue;
                const parent = companies.find(c => c.id === pid);
                if (parent && (pid === 'c-gcri' || parent.isHeadOffice || !parent.parentCompanyId)) {
                  if (comp.parentCompanyId === pid) {
                    isInherited = true;
                    break;
                  }
                }
              }
              const isAssigned = selectedWorkspaces.includes(comp.id) || isInherited;

              return (
              <label key={comp.id} className={`flex items-center gap-3 p-3 hover:bg-slate-50 border-b border-gray-50 last:border-0 transition-colors ${isInherited ? 'cursor-default opacity-80 bg-emerald-50/30' : 'cursor-pointer'}`}>
                <input 
                  type="checkbox" 
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 disabled:opacity-50 disabled:cursor-not-allowed"
                  checked={isAssigned}
                  disabled={isInherited}
                  onChange={(e) => {
                    if (isInherited) return;
                    if (e.target.checked) {
                      setSelectedWorkspaces([...selectedWorkspaces, comp.id]);
                    } else {
                      setSelectedWorkspaces(selectedWorkspaces.filter(id => id !== comp.id));
                    }
                  }}
                />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                    {comp.name}
                    {comp.isHeadOffice && <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full uppercase tracking-wider font-bold">HQ</span>}
                    {isInherited && <span className="text-[9px] bg-emerald-100 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-full uppercase tracking-wider font-bold">Inherited</span>}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{comp.branchName ? `Branch: ${comp.branchName}` : 'Parent Company'}</p>
                </div>
              </label>
            )})}
          </div>
        </div>
      </Modal>

      {/* Enterprise Company/Branch Offboarding Modal */}
      <Modal open={!!offboardCompany} onClose={() => setOffboardCompany(null)} title="Enterprise Company & Tender Offboarding Workflow" size="lg">
        {offboardCompany && (
          <div className="space-y-6 text-sm text-left">
            <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="h-12 w-12 rounded-full overflow-hidden flex items-center justify-center font-bold text-lg text-white shadow-inner" style={!offboardCompany.logoImage ? { backgroundColor: offboardCompany.primaryColor || '#3b82f6' } : {}}>
                {offboardCompany.logoImage ? (
                  <img src={offboardCompany.logoImage} alt="Logo" className="w-full h-full object-contain" />
                ) : (
                  getCompanyInitials(offboardCompany.name)
                )}
              </div>
              <div>
                <h3 className="font-semibold text-lg text-slate-800">{offboardCompany.name}</h3>
                <p className="text-slate-500 text-xs">ID: {offboardCompany.id} • Domain: {offboardCompany.domain} • Admin: {offboardCompany.adminName}</p>
              </div>
            </div>
            
            <div className="bg-amber-50 p-3 rounded-lg border border-amber-200 flex items-start gap-3">
              <Building2 className="text-amber-600 shrink-0 mt-0.5" size={20} />
              <div className="text-xs text-amber-800 space-y-1">
                <p className="font-bold">Important Data Cascade Warning</p>
                <p>Archiving this company/tender will automatically cascade and mark all associated employees as "Archived" with their professional history permanently preserved. This is a one-way workflow.</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Card padding={false} className="overflow-hidden">
                <div className="p-3 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
                  <CheckCircle2 size={16} className={offboardCompany.offboardingState?.payrollVerified ? 'text-emerald-500' : 'text-slate-300'} />
                  <span className="font-medium text-slate-700">Payroll Verified</span>
                </div>
                <div className="p-3 text-xs flex justify-between items-center">
                  <span className="text-slate-500">All final employee salaries disbursed.</span>
                  <input type="checkbox" checked={offboardCompany.offboardingState?.payrollVerified} onChange={e => setOffboardCompany({...offboardCompany, offboardingState: {...offboardCompany.offboardingState, payrollVerified: e.target.checked}})} className="rounded border-slate-300 text-blue-600 focus:ring-blue-600" />
                </div>
              </Card>

              <Card padding={false} className="overflow-hidden">
                <div className="p-3 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
                  <CheckCircle2 size={16} className={offboardCompany.offboardingState?.invoiceCleared ? 'text-emerald-500' : 'text-slate-300'} />
                  <span className="font-medium text-slate-700">SaaS Invoices Cleared</span>
                </div>
                <div className="p-3 text-xs flex justify-between items-center">
                  <span className="text-slate-500">No pending SaaS subscription dues.</span>
                  <input type="checkbox" checked={offboardCompany.offboardingState?.invoiceCleared} onChange={e => setOffboardCompany({...offboardCompany, offboardingState: {...offboardCompany.offboardingState, invoiceCleared: e.target.checked}})} className="rounded border-slate-300 text-blue-600 focus:ring-blue-600" />
                </div>
              </Card>

              <Card padding={false} className="overflow-hidden">
                <div className="p-3 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
                  <CheckCircle2 size={16} className={offboardCompany.offboardingState?.complianceVerified ? 'text-emerald-500' : 'text-slate-300'} />
                  <span className="font-medium text-slate-700">Govt Compliance Verified</span>
                </div>
                <div className="p-3 text-xs flex justify-between items-center">
                  <span className="text-slate-500">PF & ESIC filings marked complete.</span>
                  <input type="checkbox" checked={offboardCompany.offboardingState?.complianceVerified} onChange={e => setOffboardCompany({...offboardCompany, offboardingState: {...offboardCompany.offboardingState, complianceVerified: e.target.checked}})} className="rounded border-slate-300 text-blue-600 focus:ring-blue-600" />
                </div>
              </Card>

              <Card padding={false} className="overflow-hidden">
                <div className="p-3 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
                  <CheckCircle2 size={16} className={offboardCompany.offboardingState?.assetCheckCompleted ? 'text-emerald-500' : 'text-slate-300'} />
                  <span className="font-medium text-slate-700">Company Assets Returned</span>
                </div>
                <div className="p-3 text-xs flex justify-between items-center">
                  <span className="text-slate-500">Hardware and licenses recovered.</span>
                  <input type="checkbox" checked={offboardCompany.offboardingState?.assetCheckCompleted} onChange={e => setOffboardCompany({...offboardCompany, offboardingState: {...offboardCompany.offboardingState, assetCheckCompleted: e.target.checked}})} className="rounded border-slate-300 text-blue-600 focus:ring-blue-600" />
                </div>
              </Card>

              <Card padding={false} className="overflow-hidden">
                <div className="p-3 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
                  <CheckCircle2 size={16} className={offboardCompany.offboardingState?.financialSettlement ? 'text-emerald-500' : 'text-slate-300'} />
                  <span className="font-medium text-slate-700">Financial Settlement</span>
                </div>
                <div className="p-3 text-xs flex justify-between items-center">
                  <span className="text-slate-500">Full & final vendor settlement done.</span>
                  <input type="checkbox" checked={offboardCompany.offboardingState?.financialSettlement} onChange={e => setOffboardCompany({...offboardCompany, offboardingState: {...offboardCompany.offboardingState, financialSettlement: e.target.checked}})} className="rounded border-slate-300 text-blue-600 focus:ring-blue-600" />
                </div>
              </Card>
            </div>

            <div className="p-5 border-t border-slate-200/60 bg-slate-50 flex justify-end gap-3 rounded-b-xl">
              <Button onClick={() => setOffboardCompany(null)} variant="outline">Cancel & Keep Active</Button>
              <Button onClick={executeCompleteOffboarding} className="bg-red-600 hover:bg-red-700 text-white shadow-md shadow-red-200">Archive Tender & Workforce</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Status Toggle Confirmation Modal */}
      <ActionConfirmationModal
        isOpen={!!statusModalTarget}
        onClose={() => !isStatusUpdating && setStatusModalTarget(null)}
        title={statusModalTarget?.currentStatus === 'Active' ? '⚠ Suspend Access Confirmation' : 'Reactivate Access Confirmation'}
        description={[
          statusModalTarget?.currentStatus === 'Active' ? 'Are you sure you want to suspend this workspace?' : 'Are you sure you want to reactivate this workspace?',
          `Target: ${statusModalTarget?.name} (${statusModalTarget?.isBranch ? 'Branch' : 'Company'})`,
          statusModalTarget?.currentStatus === 'Active' 
            ? 'Access to this workspace will be immediately blocked.' 
            : 'Access to this workspace and its workforce will be fully restored.'
        ]}
        confirmationText={statusModalTarget?.currentStatus === 'Active' ? 'SUSPEND' : 'REACTIVATE'}
        confirmButtonText={isStatusUpdating ? 'Synchronizing...' : (statusModalTarget?.currentStatus === 'Active' ? 'Confirm Suspend' : 'Confirm Reactivate')}
        isDestructive={statusModalTarget?.currentStatus === 'Active'}
        isLoading={isStatusUpdating}
        onConfirm={confirmStatusToggle}
      />

      <ActionConfirmationModal
        isOpen={isConfirmingOffboard}
        onClose={() => setIsConfirmingOffboard(false)}
        onConfirm={handleCompleteOffboarding}
        title="⚠ Offboard Company Confirmation"
        description={[
          "Archive company and all child branches",
          "Deactivate workforce and set status to Archived",
          "Move employees to previous employees roster",
          "Stop payroll processing and all active access"
        ]}
        confirmationText="OFFBOARD"
        confirmButtonText="Execute Offboarding"
        isDestructive={true}
      />
      {/* Dependency Delete/Archive Warning Modal */}
      {deleteTarget && (
        <Modal
          open={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          title={`Delete ${deleteTarget.isHeadOffice ? 'Company' : 'Branch'}: ${deleteTarget.name}`}
          size="sm"
          footer={
            isCheckingDependencies ? (
              <Button disabled>Checking...</Button>
            ) : deleteDependencies && (deleteDependencies.employees > 0 || deleteDependencies.branches > 0 || deleteDependencies.payrolls > 0 || deleteDependencies.documents > 0) ? (
              <>
                <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
                <Button 
                  onClick={() => {
                    api.companies.archive(deleteTarget.id).then(() => {
                      const updated = companies.map(c => {
                        if (c.id === deleteTarget.id) return { ...c, status: 'Archived' as any, isArchived: true };
                        if (c.parentCompanyId === deleteTarget.id) return { ...c, status: 'Archived' as any, isArchived: true };
                        return c;
                      });
                      onUpdateCompanies(updated);
                      setDeleteTarget(null);
                      alert('Company/Branch archived successfully.');
                    }).catch(console.error);
                  }}
                  className="bg-amber-500 hover:bg-amber-600 text-white"
                >
                  Archive Instead
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
                <Button 
                  onClick={() => {
                    api.companies.hardDelete(deleteTarget.id).then(() => {
                      onUpdateCompanies(companies.filter(c => c.id !== deleteTarget.id));
                      setDeleteTarget(null);
                      alert('Permanently deleted successfully.');
                    }).catch(console.error);
                  }}
                  className="bg-rose-500 hover:bg-rose-600 text-white"
                >
                  Permanent Delete
                </Button>
              </>
            )
          }
        >
          {isCheckingDependencies ? (
            <p className="text-sm text-slate-300">Checking for related records...</p>
          ) : deleteDependencies ? (
            <div className="space-y-4 text-sm text-slate-300">
              {(deleteDependencies.employees > 0 || deleteDependencies.branches > 0 || deleteDependencies.payrolls > 0 || deleteDependencies.documents > 0) ? (
                <>
                  <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-400 font-medium">
                    This {deleteTarget.isHeadOffice ? 'company' : 'branch'} cannot be hard deleted because it has existing dependent records.
                  </div>
                  <ul className="list-disc pl-5 space-y-1 text-slate-400">
                    {deleteDependencies.employees > 0 && <li>{deleteDependencies.employees} Employees</li>}
                    {deleteDependencies.branches > 0 && <li>{deleteDependencies.branches} Branches</li>}
                    {deleteDependencies.payrolls > 0 && <li>{deleteDependencies.payrolls} Payroll Records</li>}
                    {deleteDependencies.documents > 0 && <li>{deleteDependencies.documents} Documents</li>}
                  </ul>
                  <p>You can choose to <strong>Archive</strong> this {deleteTarget.isHeadOffice ? 'company' : 'branch'} instead, which will preserve the records but suspend access.</p>
                </>
              ) : (
                <p>No dependent records found. Are you sure you want to permanently delete this {deleteTarget.isHeadOffice ? 'company' : 'branch'}?</p>
              )}
            </div>
          ) : null}
        </Modal>
      )}
    </div>
  );
};
