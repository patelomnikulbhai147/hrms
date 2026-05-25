import React, { useState } from 'react';
import { cn } from '../utils/cn';
import {
  Building2, Plus, Search, KeyRound, Lock, Trash2,
  CheckCircle2, XCircle, ArrowRight, Edit, Mail, Phone, Calendar, ChevronRight
} from 'lucide-react';
import { type Company, type Role, type SubscriptionPlan, type Employee } from '../data/mockData';
import { Card, StatCard } from '../components/ui/Card';
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
import { Badge, statusBadge } from '../components/ui/Badge';
import { Table, Thead, Tbody, Th, Td, Tr } from '../components/ui/Table';
import { type UserAccount } from './Login';

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
  onUpdateEmployees
}) => {
  if (false as boolean) {
    console.log(_role);
  }

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [planFilter, setPlanFilter] = useState('');

  // Modals state
  const [addOpen, setAddOpen] = useState(false);
  const [editPlanModal, setEditPlanModal] = useState<Company | null>(null);
  const [manageAccountsModal, setManageAccountsModal] = useState<Company | null>(null);
  const [newPlan, setNewPlan] = useState<'Starter' | 'Professional' | 'Enterprise'>('Starter');

  // Branch Management state
  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Company | null>(null);
  const [parentCompanyIdForBranch, setParentCompanyIdForBranch] = useState<string>('');
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
      name: branch.name,
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

  const handleRemoveBranch = (branchId: string) => {
    const branch = companies.find(c => c.id === branchId);
    if (!branch) return;

    const confirmDelete = confirm(`Are you sure you want to remove the branch "${branch.branchName || branch.name}"?\n\nThis will NOT delete employees, payroll history, or documents permanently.`);
    if (!confirmDelete) return;

    // Ask for reassignment or archive
    const reassign = confirm(`Employee Reassignment Confirmation:\n\nClick OK to reassign all "${branch.name}" employees to the Parent Head Office (GCRI Ahmedabad).\n\nClick Cancel to mark them as Inactive (Archived) but preserve their records.`);

    if (reassign) {
      if (onUpdateEmployees) {
        const updated = employees.map(emp => {
          if (emp.companyId === branchId) {
            return { ...emp, companyId: 'c-gcri', branchLocation: 'Ahmedabad' };
          }
          return emp;
        });
        onUpdateEmployees(updated);
      }
    } else {
      if (onUpdateEmployees) {
        const updated = employees.map(emp => {
          if (emp.companyId === branchId) {
            return { ...emp, status: 'Inactive' as const };
          }
          return emp;
        });
        onUpdateEmployees(updated);
      }
    }

    // Delete company/branch
    const nextCompanies = companies.filter(c => c.id !== branchId);
    onUpdateCompanies(nextCompanies);
    alert('Branch removed successfully. Employees, payroll records, and documents were preserved.');
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

  const handleCreateCompany = () => {
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

    onUpdateAccounts([...userAccounts, newHead]);
    onUpdateCompanies([fresh, ...companies]);
    setAddOpen(false);

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

  const handleToggleStatus = (id: string, current: 'Active' | 'Pending' | 'Inactive') => {
    const nextStatus = current === 'Active' ? 'Inactive' : 'Active';
    onUpdateCompanies(companies.map(c => c.id === id ? { ...c, status: nextStatus } : c));
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
    onUpdateCompanies(updated);
    setEditPlanModal(null);
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
      onUpdateCompanies(updatedCompanies);
      alert('Branch updated successfully.');
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

      onUpdateAccounts([...userAccounts, newAdminUser]);
      onUpdateCompanies([...companies, newBranchObj]);
      alert(`Branch created successfully.\n\nGenerated Branch Admin Account:\nLogin ID: ${newAdminUser.username}\nPassword: ${newAdminUser.passwordStr}`);
    }

    setBranchModalOpen(false);
  };

  // Manage Accounts triggers
  const companyUsers = manageAccountsModal
    ? userAccounts.filter(u => u.companyId === manageAccountsModal.id)
    : [];

  const handleCreateOfficer = () => {
    if (!manageAccountsModal) return;
    const nameErr = validateName(officerForm.name).error;
    const emailErr = validateEmail(officerForm.email).error;
    if (nameErr || emailErr) {
      alert('Error: Please resolve validation errors before saving.');
      return;
    }
    const exists = userAccounts.some(u => u.username.toLowerCase() === officerForm.username.toLowerCase());
    if (exists) {
      alert('Error: This Login ID is already taken.');
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
      status: 'Active',
      avatar: officerForm.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    };

    onUpdateAccounts([...userAccounts, newUser]);
    setOfficerForm({ name: '', email: '', username: '', password: '', role: 'Company Head' });
    setOfficerErrors({});
    alert(`Successfully provisioned new ${officerForm.role} credential:\nID: ${newUser.username}\nPassword: ${newUser.passwordStr}`);
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

  const handleResetUserPassword = (userId: string) => {
    const newPass = prompt('Enter new access password:');
    if (!newPass) return;
    const updated = userAccounts.map(u => {
      if (u.id === userId) {
        return { ...u, passwordStr: newPass };
      }
      return u;
    });
    onUpdateAccounts(updated);
    alert('Password updated successfully.');
  };

  const handleRevokeUser = (userId: string) => {
    if (!confirm('Are you sure you want to revoke this user access?')) return;
    const updated = userAccounts.filter(u => u.id !== userId);
    onUpdateAccounts(updated);
    alert('Access revoked successfully.');
  };

  // Filter accounts
  const filtered = companies.filter(c => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) || c.domain.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || c.status === statusFilter;
    const matchPlan = !planFilter || c.plan === planFilter;
    return matchSearch && matchStatus && matchPlan;
  });

  const parentCompanies = companies.filter(c => !c.parentCompanyId);
  const activeCount = parentCompanies.filter(c => c.status === 'Active').length;
  const suspendedCount = parentCompanies.filter(c => c.status === 'Inactive').length;

  // Determine if save button should be disabled
  const isSaveDisabled =
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-white tracking-tight uppercase">SaaS Company Management</h2>
          <p className="text-xs text-slate-400 mt-0.5 font-medium">Control tenant configurations, verify enrollments, and provision corporate credentials</p>
        </div>
        <Button 
          icon={<Plus size={14} />} 
          onClick={() => setAddOpen(true)}
          className="gradient-btn-primary px-5 py-2.5 rounded-xl shadow-lg border-none hover:shadow-[0_0_20px_rgba(123,47,247,0.4)]"
        >
          Create Company
        </Button>
      </div>

      {/* KPI stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard 
          label="Active Companies" 
          value={activeCount} 
          icon={<CheckCircle2 size={16} className="text-emerald-400" />} 
          color="bg-gradient-to-br from-emerald-500/20 to-teal-500/20 text-emerald-400 border border-emerald-500/30 shadow-[0_0_15px_rgba(0,255,163,0.15)]" 
          sub="Access allowed to portal" 
        />
        <StatCard 
          label="Suspended Accounts" 
          value={suspendedCount} 
          icon={<XCircle size={16} className="text-rose-400" />} 
          color="bg-gradient-to-br from-rose-500/20 to-red-500/20 text-rose-400 border border-rose-500/30 shadow-[0_0_15px_rgba(239,68,68,0.15)]" 
          sub="Portal entry blocked" 
        />
        <StatCard 
          label="Total Scoped Tenants" 
          value={parentCompanies.length} 
          icon={<Building2 size={16} className="text-blue-400" />} 
          color="bg-gradient-to-br from-blue-500/20 to-indigo-500/20 text-blue-400 border border-blue-500/30 shadow-[0_0_15px_rgba(0,163,255,0.15)]" 
          sub="Active cloud subscriptions" 
        />
      </div>

      {/* Filters bar */}
      <Card className="neon-glass-card border-white/5 shadow-2xl glow-card-border-purple p-5.5">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-48">
            <Input
              placeholder="Search companies by name or domain..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              icon={<Search size={14} />}
              className="glass-search-input font-medium py-2.5"
            />
          </div>
          <div className="w-40">
            <Select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="glass-search-input font-medium py-2.5 cursor-pointer"
              options={[
                { value: '', label: 'All Statuses' },
                { value: 'Active', label: 'Active' },
                { value: 'Inactive', label: 'Suspended' }
              ]}
            />
          </div>
          <div className="w-40">
            <Select
              value={planFilter}
              onChange={e => setPlanFilter(e.target.value)}
              className="glass-search-input font-medium py-2.5 cursor-pointer"
              options={[
                { value: '', label: 'All Plans' },
                { value: 'Starter', label: 'Starter' },
                { value: 'Professional', label: 'Professional' },
                { value: 'Enterprise', label: 'Enterprise' }
              ]}
            />
          </div>
        </div>
      </Card>

      {/* Grid directory */}
      <div className="space-y-4">
        <div className="px-1 py-1 flex items-center justify-between">
          <span className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Tenant Directory</span>
          <span className="text-xs text-blue-400 font-extrabold glow-text-neon-blue">{filtered.length} clients registered</span>
        </div>

        {filtered.length === 0 ? (
          <div className="neon-glass-card rounded-2xl p-12 text-center text-sm text-slate-400">
            No company records found matching search queries
          </div>
        ) : (
          filtered.filter(c => !c.parentCompanyId).map(c => {
            const branches = companies.filter(b => b.parentCompanyId === c.id);
            const hasBranches = branches.length > 0;
            const isExpanded = expandedParents[c.id];

            // Calculate total combined employees under parent
            const combinedEmpCount = hasBranches
              ? branches.reduce((sum, b) => sum + employees.filter(emp => emp.companyId === b.id).length, 0) + employees.filter(emp => emp.companyId === c.id).length
              : employees.filter(emp => emp.companyId === c.id).length;

            return (
              <React.Fragment key={c.id}>
                {/* Main Parent Company Card */}
                <div className="neon-glass-card rounded-2xl p-6 relative overflow-hidden transition-all duration-300">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                    {/* Company Profile (Left Section) */}
                    <div className="flex items-start gap-4">
                      {hasBranches && (
                        <button
                          onClick={() => toggleExpandParent(c.id)}
                          className="mt-2.5 p-1.5 hover:bg-slate-800/80 rounded-lg text-slate-400 hover:text-white transition-transform duration-200"
                          style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
                        >
                          <ChevronRight size={16} />
                        </button>
                      )}
                      
                      {/* Logo with Gradient Background */}
                      <div className="w-14 h-14 rounded-xl text-white flex items-center justify-center font-extrabold text-base shadow-lg" 
                           style={{ background: 'linear-gradient(135deg, #7B2FF7 0%, #2979FF 100%)' }}>
                        {c.logo}
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-2.5">
                          <h4 className="text-base font-extrabold text-white tracking-tight">{c.name}</h4>
                          {hasBranches && (
                            <span className="px-2.5 py-0.5 text-[9px] font-extrabold rounded-full bg-indigo-500/10 border border-indigo-500/25 text-indigo-300 uppercase tracking-wider shadow-[0_0_8px_rgba(99,102,241,0.2)]">
                              Parent Company
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-semibold text-slate-400 hover:underline cursor-pointer transition-colors hover:text-blue-400">
                          {c.domain}
                        </p>
                      </div>
                    </div>

                    {/* SaaS Admin Info */}
                    <div className="space-y-1.5 min-w-48">
                      <span className="text-[9px] font-extrabold text-slate-500 uppercase tracking-wider block">SaaS Admin Info</span>
                      <div>
                        <p className="text-xs font-bold text-slate-200">{c.adminName}</p>
                        <div className="flex flex-col gap-0.5 mt-0.5 text-[10px] text-slate-400">
                          <span className="flex items-center gap-1.5 hover:text-blue-400 transition-colors">
                            <Mail size={11} className="text-slate-500" /> {c.adminEmail}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Phone size={11} className="text-slate-500" /> {c.phone}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Details */}
                    <div className="space-y-1.5 min-w-44">
                      <span className="text-[9px] font-extrabold text-slate-500 uppercase tracking-wider block">Details</span>
                      <div className="text-[11px] text-slate-300 space-y-0.5">
                        <p>Sector: <span className="font-bold text-white">{c.industry}</span></p>
                        <p className="flex items-center gap-1 text-slate-400"><Calendar size={11} className="text-slate-500" /> Joined: {c.joinDate}</p>
                        <p className="font-semibold text-slate-400">
                          {hasBranches ? 'Combined Staff: ' : 'Employees: '}
                          <span className="font-extrabold glow-text-neon-blue font-sans text-xs">{combinedEmpCount}</span>
                        </p>
                      </div>
                    </div>

                    {/* Status & Actions */}
                    <div className="flex flex-row lg:flex-col items-center lg:items-end justify-between lg:justify-start gap-4">
                      {/* Glowing Status Pill */}
                      <span className={cn(
                        "px-3 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1.5 shadow-sm border",
                        c.status === 'Active' ? 'neon-pill-active' : 'neon-pill-inactive'
                      )}>
                        {c.status === 'Active' && <span className="neon-green-dot" />}
                        {c.status}
                      </span>

                      {/* Actions buttons */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => onStartMasquerade(c.id)}
                          className="gradient-btn-primary text-xs px-4 py-2 text-white rounded-xl font-bold transition-all duration-200 inline-flex items-center gap-1 shadow-md cursor-pointer"
                        >
                          Manage {hasBranches ? 'All' : ''} <ArrowRight size={11} />
                        </button>

                        <button
                          onClick={() => setManageAccountsModal(c)}
                          className="action-icon-btn p-2 cursor-pointer"
                          title="Manage Credentials"
                        >
                          <KeyRound size={13} />
                        </button>

                        <button
                          onClick={() => handleToggleStatus(c.id, c.status)}
                          className={cn(
                            "px-3 py-2 rounded-xl text-xs font-bold transition-all border cursor-pointer",
                            c.status === 'Active' 
                              ? 'bg-rose-500/10 border-rose-500/25 text-rose-450 hover:bg-rose-500/20 hover:border-rose-500/50' 
                              : 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/50'
                          )}
                        >
                          {c.status === 'Active' ? 'Suspend' : 'Activate'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Collapsible Nested Roster for branches */}
                {hasBranches && isExpanded && (
                  <div className="pl-6 border-l-2 border-indigo-500/25 space-y-4 my-2">
                    <div className="flex items-center justify-between px-1 py-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider font-sans">
                          GCRI Connected Sub-Branches
                        </span>
                        <span className="px-2 py-0.5 text-[9px] font-bold rounded-full bg-slate-800 text-slate-400">
                          {branches.length} branches resolved
                        </span>
                      </div>
                      <button
                        onClick={() => handleOpenCreateBranch(c.id)}
                        className="gradient-btn-indigo px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md cursor-pointer hover:shadow-indigo-500/25"
                      >
                        <Plus size={12} /> Create Branch
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {branches.map(b => {
                        const branchEmpCount = employees.filter(emp => emp.companyId === b.id).length;
                        return (
                          <div key={b.id} className="neon-glass-card-sub rounded-2xl p-5 relative overflow-hidden transition-all duration-300">
                            <div className="flex flex-col justify-between h-full gap-4">
                              {/* Top row */}
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-2.5">
                                  <span className="font-extrabold text-indigo-300 bg-indigo-500/10 border border-indigo-500/25 px-2 py-0.5 rounded text-[10px] font-sans uppercase tracking-wider shadow-[0_0_8px_rgba(99,102,241,0.15)]">
                                    {b.branchCode || 'BR'}
                                  </span>
                                  <div>
                                    <h5 className="font-extrabold text-white text-sm">{b.branchName || b.name}</h5>
                                    <p className="text-[10px] text-slate-450">{b.domain}</p>
                                  </div>
                                </div>

                                <span className={cn(
                                  "px-2.5 py-0.5 rounded-full text-[10px] font-bold inline-flex items-center gap-1 border",
                                  b.status === 'Active' ? 'neon-pill-active' : 'neon-pill-inactive'
                                )}>
                                  {b.status === 'Active' && <span className="neon-green-dot" />}
                                  {b.status}
                                </span>
                              </div>

                              {/* Staff info */}
                              <div className="flex items-center justify-between border-t border-b border-white/5 py-3">
                                <div className="space-y-0.5">
                                  <p className="text-[9px] text-slate-500 uppercase tracking-wider font-extrabold">Local Lead</p>
                                  <p className="text-xs font-bold text-slate-200">{b.adminName}</p>
                                  <p className="text-[10px] text-slate-450 font-semibold">{b.adminEmail}</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-[9px] text-slate-500 uppercase tracking-wider font-extrabold font-sans">Staff Count</p>
                                  <span className="text-sm font-extrabold glow-text-neon-blue font-sans">
                                    {branchEmpCount} Staff
                                  </span>
                                </div>
                              </div>

                              {/* Actions footer */}
                              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                                <button
                                  onClick={() => onStartMasquerade(b.id)}
                                  className="gradient-btn-indigo text-xs px-3.5 py-2 rounded-xl font-bold transition-all duration-200 inline-flex items-center gap-1 shadow-md cursor-pointer"
                                >
                                  Manage Branch
                                </button>

                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => setManageAccountsModal(b)}
                                    className="action-icon-btn p-2 cursor-pointer"
                                    title="Credentials"
                                  >
                                    <KeyRound size={12} />
                                  </button>
                                  <button
                                    onClick={() => handleOpenEditBranch(b)}
                                    className="action-icon-btn p-2 cursor-pointer"
                                    title="Edit Branch Settings"
                                  >
                                    <Edit size={12} />
                                  </button>
                                  <button
                                    onClick={() => handleRemoveBranch(b.id)}
                                    className="action-icon-btn-delete p-2 cursor-pointer"
                                    title="Remove Branch"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                  <button
                                    onClick={() => handleToggleStatus(b.id, b.status)}
                                    className={cn(
                                      "text-[9px] font-extrabold uppercase tracking-wider px-2.5 py-1.5 rounded-lg border transition-colors cursor-pointer",
                                      b.status === 'Active'
                                        ? 'bg-rose-500/10 border-rose-500/20 text-rose-400 hover:bg-rose-500/20'
                                        : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20'
                                    )}
                                  >
                                    {b.status === 'Active' ? 'Suspend' : 'Activate'}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </React.Fragment>
            );
          })
        )}
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
                                onClick={() => handleResetUserPassword(u.id)}
                                className="p-1 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded"
                                title="Reset Password"
                              >
                                <Lock size={12} />
                              </button>
                              <button
                                onClick={() => handleToggleUserActivation(u.id)}
                                className={`text-[10px] px-2 py-0.5 rounded font-bold text-white transition-colors ${u.status === 'Active' ? 'bg-red-650 bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'
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
    </div>
  );
};
