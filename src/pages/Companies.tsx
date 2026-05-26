import React, { useState } from 'react';
import {
  Building2, Plus, Search, KeyRound, Lock, Trash2,
  CheckCircle2, XCircle, ArrowRight, Edit, Mail, Phone, Calendar, ChevronRight, LogOut, FileSpreadsheet
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
import { ActionConfirmationModal } from '../components/ui/ActionConfirmationModal';
import { Badge, statusBadge } from '../components/ui/Badge';
import { Table, Thead, Tbody, Th, Td, Tr } from '../components/ui/Table';
import { type UserAccount } from './Login';
import { getUniqueEmployees } from '../utils/deduplication';
import { usePermissions } from '../context/PermissionContext';
import { exportToExcel } from '../utils/exportUtils';

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

  const { canEdit: canEditModule } = usePermissions();
  const canEdit = canEditModule('companies');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [planFilter, setPlanFilter] = useState('');

  // Enterprise Lifecycle & Export
  const [activeMainTab, setActiveMainTab] = useState<'active' | 'archived'>('active');
  const [offboardCompany, setOffboardCompany] = useState<Company | null>(null);
  const [offboardStep, setOffboardStep] = useState(1);
  const [isExporting, setIsExporting] = useState(false);

  // Activate/Suspend Toggle State
  const [statusModalTarget, setStatusModalTarget] = useState<{ id: string, currentStatus: string, name: string, isBranch: boolean } | null>(null);
  const [isStatusUpdating, setIsStatusUpdating] = useState(false);

  const uniqueEmployees = React.useMemo(() => getUniqueEmployees(employees), [employees]);
  const activeUniqueEmployees = React.useMemo(() => uniqueEmployees.filter(e => e.status !== 'Archived' && e.status !== 'Terminated'), [uniqueEmployees]);

  const [addOpen, setAddOpen] = useState(false);
  const [editPlanModal, setEditPlanModal] = useState<Company | null>(null);
  const [viewBranchModal, setViewBranchModal] = useState<Company | null>(null);
  const [isConfirmingOffboard, setIsConfirmingOffboard] = useState(false);
  const [manageAccountsModal, setManageAccountsModal] = useState<Company | null>(null);
  const [workspaceAssignUser, setWorkspaceAssignUser] = useState<UserAccount | null>(null);
  const [selectedWorkspaces, setSelectedWorkspaces] = useState<string[]>([]);

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
        const updated = uniqueEmployees.map(emp => {
          if (emp.companyId === branchId) {
            return { ...emp, companyId: 'c-gcri', branchLocation: 'Ahmedabad' };
          }
          return emp;
        });
        onUpdateEmployees(updated);
      }
    } else {
      if (onUpdateEmployees) {
        const updated = uniqueEmployees.map(emp => {
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
      
      const updatedCompanies = companies.map(c => {
        if (c.id === statusModalTarget.id) {
          return { 
            ...c, 
            status: nextStatus, 
            accountStatus: nextStatus === 'Active' ? 'Active' : 'Suspended',
            branchPortalActive: nextStatus === 'Active',
            branchLicenseActive: nextStatus === 'Active',
            branchLicenseStatus: nextStatus === 'Active' ? 'Active License' : 'Suspended'
          } as Company;
        }
        return c;
      });
      
      // Update state
      onUpdateCompanies(updatedCompanies);
      
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
    const isArchived = c.status === 'Archived';
    if (activeMainTab === 'active' && isArchived) return false;
    if (activeMainTab === 'archived' && !isArchived) return false;

    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) || c.domain.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || c.status === statusFilter;
    const matchPlan = !planFilter || c.plan === planFilter;
    return matchSearch && matchStatus && matchPlan;
  });

  const handleExport = () => {
    setIsExporting(true);
    setTimeout(() => {
      exportToExcel({
        fileName: activeMainTab === 'active' ? 'Active_Tenders' : 'Archived_Tenders',
        sheets: [
          {
            sheetName: 'Companies',
            columns: [
              { header: 'Company/Branch ID', key: 'id', width: 15 },
              { header: 'Name', key: 'name', width: 30 },
              { header: 'Email', key: 'email', width: 25 },
              { header: 'Industry', key: 'industry', width: 20 },
              { header: 'Join Date', key: 'joinDate', width: 15 },
              { header: 'Status', key: 'status', width: 15 },
              { header: 'Plan', key: 'plan', width: 15 }
            ],
            data: filtered
          }
        ]
      });
      setIsExporting(false);
    }, 500);
  };

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
    setOffboardStep(1);
  };

  const handleCompleteOffboarding = () => {
    if (!offboardCompany) return;
    const state = offboardCompany.offboardingState;
    if (!state?.payrollVerified || !state?.invoiceCleared || !state?.complianceVerified || !state?.assetCheckCompleted || !state?.financialSettlement) {
      alert("Cannot finalize closure: Pending clearances or settlements.");
      return;
    }
    const today = new Date().toISOString().split('T')[0];
    
    // Auto cascade employees to archived if they belong to this company or its branches
    if (onUpdateEmployees) {
      const branchIds = companies.filter(c => c.parentCompanyId === offboardCompany.id).map(c => c.id);
      const allLinkedIds = [offboardCompany.id, ...branchIds];

      const updatedEmps = employees.map(emp => {
        if (allLinkedIds.includes(emp.companyId) && emp.status !== 'Archived') {
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
    onUpdateCompanies(companies.map(c => {
      if (c.id === offboardCompany.id) return updated;
      if (c.parentCompanyId === offboardCompany.id) return { ...c, status: 'Archived' };
      return c;
    }));
    setIsConfirmingOffboard(false);
    setOffboardCompany(null);
    alert(`Company/Branch ${offboardCompany.name} and any child branches were offboarded and safely archived. All linked employees were automatically archived.`);
  };

  const executeCompleteOffboarding = () => {
    setIsConfirmingOffboard(true);
  };

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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">SaaS Company Management</h2>
          <p className="text-xs text-gray-500 mt-0.5">Control tenant configurations, verify enrollments, and provision corporate credentials</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Main Tabs */}
          <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button
              onClick={() => setActiveMainTab('active')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${activeMainTab === 'active' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Active Tenders
            </button>
            <button
              onClick={() => setActiveMainTab('archived')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${activeMainTab === 'archived' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Archived Tenders
            </button>
          </div>
          
          {canEdit && (
            <Button variant="outline" icon={<FileSpreadsheet size={14} />} onClick={handleExport} disabled={isExporting}>
              {isExporting ? 'Exporting...' : 'Export to Excel'}
            </Button>
          )}
          
          {canEdit && activeMainTab === 'active' && (
            <Button icon={<Plus size={14} />} onClick={() => setAddOpen(true)}>
              Create Company
            </Button>
          )}
        </div>
      </div>

      {/* KPI stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard label="Active Companies" value={activeCount} icon={<CheckCircle2 size={16} className="text-emerald-600" />} color="bg-emerald-50" sub="Access allowed to portal" />
        <StatCard label="Suspended Accounts" value={suspendedCount} icon={<XCircle size={16} className="text-red-500" />} color="bg-red-50" sub="Portal entry blocked" />
        <StatCard label="Total Scoped Tenants" value={parentCompanies.length} icon={<Building2 size={16} className="text-blue-600" />} color="bg-blue-50" sub="Active cloud subscriptions" />
      </div>

      {/* Filters bar */}
      <Card>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-48">
            <Input
              placeholder="Search companies by name or domain..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              icon={<Search size={14} />}
            />
          </div>
          <div className="w-40">
            <Select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
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
      <Card padding={false}>
        <div className="px-4 py-2.5 border-b border-slate-800/80 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Tenant Directory</span>
          <span className="text-xs text-slate-500 font-medium">{filtered.length} clients registered</span>
        </div>
        <Table>
          <Thead>
            <tr>
              <Th>Company Profile</Th>
              <Th>SaaS Admin Info</Th>
              <Th>Details</Th>
              <Th>Status</Th>
              <Th>Actions</Th>
            </tr>
          </Thead>
          <Tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-sm text-gray-400">
                  No company records found matching search queries
                </td>
              </tr>
            ) : (
              filtered.filter(c => !c.parentCompanyId).map(c => {
                const branches = companies.filter(b => b.parentCompanyId === c.id);
                const hasBranches = branches.length > 0;
                const isExpanded = expandedParents[c.id];

                // Calculate total combined employees under parent
                const combinedEmpCount = hasBranches
                  ? branches.reduce((sum, b) => sum + activeUniqueEmployees.filter(emp => emp.companyId === b.id).length, 0) + activeUniqueEmployees.filter(emp => emp.companyId === c.id).length
                  : activeUniqueEmployees.filter(emp => emp.companyId === c.id).length;

                return (
                  <React.Fragment key={c.id}>
                    <Tr className={hasBranches ? "bg-slate-800/30 hover:bg-slate-800/50 font-medium" : ""}>
                      {/* Company Profile */}
                      <Td>
                        <div className="flex items-center gap-2.5">
                          {hasBranches && (
                            <button
                              onClick={() => toggleExpandParent(c.id)}
                              className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-slate-200 transition-transform duration-200"
                              style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
                            >
                              <ChevronRight size={14} />
                            </button>
                          )}
                          <div className="w-8 h-8 rounded border text-white flex items-center justify-center font-bold text-xs" style={{ backgroundColor: c.primaryColor || '#3b82f6', borderColor: `${c.primaryColor || '#3b82f6'}40` }}>
                            {c.logo}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <h4 className="text-xs font-bold text-slate-200">{c.name}</h4>
                              {hasBranches && (
                                <Badge variant="indigo" className="scale-90 origin-left">Parent Company</Badge>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-500 hover:underline cursor-pointer">{c.domain}</span>
                          </div>
                        </div>
                      </Td>

                      {/* SaaS Admin Info */}
                      <Td>
                        <div className="space-y-0.5">
                          <p className="text-xs font-semibold text-slate-300">{c.adminName}</p>
                          <div className="flex flex-col gap-0.5 text-[10px] text-slate-500">
                            <span className="flex items-center gap-1"><Mail size={10} /> {c.adminEmail}</span>
                            <span className="flex items-center gap-1"><Phone size={10} /> {c.phone}</span>
                          </div>
                        </div>
                      </Td>

                      {/* Details */}
                      <Td>
                        <div className="text-[10px] text-slate-400 space-y-0.5">
                          <p>Sector: <span className="font-semibold text-slate-300">{c.industry}</span></p>
                          <p className="flex items-center gap-1"><Calendar size={9} /> Joined: {c.joinDate}</p>
                          <p>
                            {hasBranches ? 'Combined Staff: ' : 'Employees: '}
                            <span className="font-bold text-indigo-400">{combinedEmpCount}</span>
                          </p>
                        </div>
                      </Td>

                      {/* Status */}
                      <Td>
                        <Badge variant={statusBadge(c.status)} dot>{c.status}</Badge>
                      </Td>

                      {/* Actions */}
                      <Td>
                        {canEdit && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => onStartMasquerade(c.id)}
                              className="text-xs px-2.5 py-1 text-white rounded font-bold transition-colors inline-flex items-center gap-1 shadow-sm font-sans"
                              style={{ backgroundColor: c.primaryColor || '#4f46e5' }}
                            >
                              Manage {hasBranches ? 'All' : ''} <ArrowRight size={10} />
                            </button>

                            <button
                              onClick={() => setManageAccountsModal(c)}
                              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-indigo-400 border border-slate-700 rounded transition-colors"
                              title="Manage Credentials"
                            >
                              <KeyRound size={13} />
                            </button>

                            {activeMainTab === 'active' ? (
                              <button
                                onClick={() => handleStartOffboarding(c)}
                                className="text-[10px] font-semibold text-amber-500 hover:text-amber-400 hover:underline inline-flex items-center gap-1"
                                title="Initiate Tender Offboarding"
                              >
                                <LogOut size={10} /> Offboard
                              </button>
                            ) : (
                              <button
                                onClick={() => openStatusModal(c)}
                                className={`px-2.5 py-1 rounded border text-[10px] font-bold shadow-xs transition-all ${c.status === 'Active' ? 'bg-rose-50/10 border-rose-500/20 text-rose-400 hover:bg-rose-500/20 hover:text-rose-300' : 'bg-emerald-50/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300'}`}
                              >
                                {c.status === 'Active' ? 'Suspend' : 'Activate'}
                              </button>
                            )}
                          </div>
                        )}
                      </Td>
                    </Tr>

                    {/* Collapsible Nested Roster for branches */}
                    {hasBranches && isExpanded && (
                      <tr>
                        <td colSpan={5} className="bg-slate-900/40 p-4 border-l-4 border-indigo-500">
                          <div className="rounded-xl border border-slate-700/80 bg-slate-800/50 overflow-hidden shadow-sm">
                            <div className="bg-slate-900/60 px-4 py-2 border-b border-slate-700/60 flex items-center justify-between">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-sans">GCRI Connected Sub-Branches</span>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-slate-500 font-medium">{branches.length} branches resolved</span>
                                {canEdit && (
                                  <button
                                    onClick={() => handleOpenCreateBranch(c.id)}
                                    className="px-2.5 py-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg text-[9px] font-bold flex items-center gap-1 shadow-xs transition-colors"
                                  >
                                    <Plus size={10} /> Create Branch
                                  </button>
                                )}
                              </div>
                            </div>
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="bg-slate-900/40 border-b border-slate-700/80 text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                                  <th className="py-2.5 px-4">Branch Code & Name</th>
                                  <th className="py-2.5 px-4">SaaS Admin Info</th>
                                  <th className="py-2.5 px-4">Staff Count</th>
                                  <th className="py-2.5 px-4">Status</th>
                                  <th className="py-2.5 px-4 text-right">Branch Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-700/50 text-[11px] text-slate-300">
                                {branches.map(b => {
                                  const branchEmpCount = activeUniqueEmployees.filter(emp => emp.companyId === b.id).length;
                                  return (
                                    <tr key={b.id} className="hover:bg-slate-800/30 transition-colors">
                                      <td className="py-2 px-4">
                                        <div className="flex items-center gap-2">
                                          <span className="font-bold text-indigo-300 bg-indigo-500/20 border border-indigo-500/30 px-1.5 py-0.5 rounded text-[10px] font-sans">
                                            {b.branchCode || 'BR'}
                                          </span>
                                          <div>
                                            <p className="font-bold text-slate-200">{b.branchName || b.name}</p>
                                            <p className="text-[9px] text-slate-500">{b.domain}</p>
                                          </div>
                                        </div>
                                      </td>
                                      <td className="py-2 px-4">
                                        <p className="font-medium text-slate-300">{b.adminName}</p>
                                        <p className="text-[9px] text-slate-500">{b.adminEmail}</p>
                                      </td>
                                      <td className="py-2 px-4 font-bold text-indigo-400 font-sans">
                                        {branchEmpCount} Staff
                                      </td>
                                      <td className="py-2 px-4">
                                        <Badge variant={statusBadge(b.status)} dot>{b.status}</Badge>
                                      </td>
                                      <td className="py-2 px-4 text-right">
                                        {canEdit && (
                                          <div className="inline-flex items-center gap-1.5">
                                            <button
                                              onClick={() => onStartMasquerade(b.id)}
                                              className="px-2 py-1 text-white text-[10px] rounded font-bold transition-colors shadow-xs font-sans"
                                              style={{ backgroundColor: b.primaryColor || '#4f46e5' }}
                                            >
                                              Manage Branch
                                            </button>
                                            <button
                                              onClick={() => setManageAccountsModal(b)}
                                              className="p-1 bg-slate-800 border border-slate-700 rounded text-slate-400 hover:text-indigo-400 transition-colors"
                                              title="Credentials"
                                            >
                                              <KeyRound size={11} />
                                            </button>
                                            <button
                                              onClick={() => handleOpenEditBranch(b)}
                                              className="p-1 bg-slate-800 border border-slate-700 rounded text-slate-400 hover:text-indigo-400 transition-colors"
                                              title="Edit Branch Settings"
                                            >
                                              <Edit size={11} />
                                            </button>
                                            {activeMainTab === 'active' ? (
                                              <button
                                                onClick={() => handleStartOffboarding(b)}
                                                className="p-1 bg-amber-500/10 border border-amber-500/20 rounded text-amber-400 hover:text-amber-300 hover:bg-amber-500/20 transition-colors"
                                                title="Initiate Branch Offboarding"
                                              >
                                                <LogOut size={11} />
                                              </button>
                                            ) : (
                                              <button
                                                onClick={() => handleRemoveBranch(b.id)}
                                                className="p-1 bg-rose-500/10 border border-rose-500/20 rounded text-rose-400 hover:text-rose-300 hover:bg-rose-500/20 transition-colors"
                                                title="Permanently Delete"
                                              >
                                                <Trash2 size={11} />
                                              </button>
                                            )}
                                            <button
                                              onClick={() => openStatusModal(b)}
                                              className={`px-2 py-1 rounded border text-[9px] font-bold shadow-xs transition-all ${b.status === 'Active' ? 'bg-rose-50/10 border-rose-500/20 text-rose-400 hover:bg-rose-500/20 hover:text-rose-300' : 'bg-emerald-50/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300'}`}
                                            >
                                              {b.status === 'Active' ? 'Suspend' : 'Activate'}
                                            </button>
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
          </Tbody>
        </Table>
      </Card>

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
              <div className="h-12 w-12 rounded-full flex items-center justify-center font-bold text-lg text-white shadow-inner" style={{ backgroundColor: offboardCompany.primaryColor || '#3b82f6' }}>
                {offboardCompany.logo || offboardCompany.name.slice(0, 2).toUpperCase()}
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
      <Modal open={!!statusModalTarget} onClose={() => !isStatusUpdating && setStatusModalTarget(null)} title={statusModalTarget?.currentStatus === 'Active' ? 'Suspend Access Confirmation' : 'Reactivate Access Confirmation'} size="sm">
        {statusModalTarget && (
          <div className="space-y-5">
            <div className={`p-4 rounded-xl border flex items-start gap-3 ${statusModalTarget.currentStatus === 'Active' ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'}`}>
              <div className={`mt-0.5 ${statusModalTarget.currentStatus === 'Active' ? 'text-rose-500' : 'text-emerald-500'}`}>
                {statusModalTarget.currentStatus === 'Active' ? <XCircle size={20} /> : <CheckCircle2 size={20} />}
              </div>
              <div className="text-sm">
                <p className={`font-bold ${statusModalTarget.currentStatus === 'Active' ? 'text-rose-800' : 'text-emerald-800'}`}>
                  {statusModalTarget.currentStatus === 'Active' ? 'Are you sure you want to suspend this workspace?' : 'Are you sure you want to reactivate this workspace?'}
                </p>
                <p className={`mt-1 text-xs ${statusModalTarget.currentStatus === 'Active' ? 'text-rose-600' : 'text-emerald-600'}`}>
                  Target: <strong>{statusModalTarget.name}</strong> ({statusModalTarget.isBranch ? 'Branch' : 'Company'})
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-500">
              {statusModalTarget.currentStatus === 'Active'
                ? 'Suspended workspaces will lose access to employee portals, payroll generation, and daily operations immediately. Data will remain safe, but logins will be blocked.'
                : 'Reactivating this workspace will instantly restore login access and allow operations, payroll processing, and employee management to resume.'}
            </p>

            <div className="flex justify-end gap-3 pt-3">
              <Button variant="outline" onClick={() => setStatusModalTarget(null)} disabled={isStatusUpdating}>
                Cancel
              </Button>
              <Button
                onClick={confirmStatusToggle}
                disabled={isStatusUpdating}
                className={statusModalTarget.currentStatus === 'Active' ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-200' : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-200'}
              >
                {isStatusUpdating ? 'Synchronizing...' : (statusModalTarget.currentStatus === 'Active' ? 'Confirm Suspend' : 'Confirm Reactivate')}
              </Button>
            </div>
          </div>
        )}
      </Modal>

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
    </div>
  );
};
