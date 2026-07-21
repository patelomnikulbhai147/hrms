import React, { useState } from 'react';
import {
  Building2, Plus, Search, Lock, Trash2,
  CheckCircle2, Mail, Phone, ChevronRight, Shield, Cloud, Link, Users, Archive, ShieldAlert,
  FileSpreadsheet, Loader2, FileText, UploadCloud, Image as ImageIcon, RefreshCw,
  Network, BadgeCheck, GitBranch
} from 'lucide-react';
import { type Company, type Role, type SubscriptionPlan, type Employee } from '@/data/mockData';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { PhoneInput } from '@/components/ui/PhoneInput';
import {
  validatePhone,
  validateName,
  validateEmail,
  validateCompanyName,
  validatePercentage
} from '@/utils/validation';
import { Modal } from '@/components/ui/Modal';
import { ActionConfirmationModal } from '@/components/ui/ActionConfirmationModal';
import { Badge } from '@/components/ui/Badge';
import { Table, Thead, Tbody, Th, Td, Tr } from '@/components/ui/Table';
import { type UserAccount } from '@/pages/Login';
import { getUniqueEmployees } from '@/utils/deduplication';
import { formatDate } from '@/utils/formatDate';
import { usePermissions } from '@/context/PermissionContext';
import { getCompanyInitials } from '@/utils/workspaceUtils';
import { api, type SuperAdminStats } from '@/api/apiClient';
import { getApiErrorMessage } from '@/utils/apiError';
import { safeSetJSON } from '@/utils/safeStorage';
import { downloadCompanyExcel, downloadCompanyPDF } from '@/utils/companyExportUtils';
import { ui } from '@/components/ui/feedback';
import { BranchFormModal } from '@/components/branches/BranchFormModal';

// Mirrors COMPANY_TYPES in CompanyProfile so a type chosen at registration is a
// valid option when the Company Head later edits it.
const REG_COMPANY_TYPES = ['Private Limited', 'Public Limited', 'LLP', 'Partnership', 'Proprietorship', 'Trust', 'NGO', 'Government', 'Other'];

// ── Standard KPI card ────────────────────────────────────────────────────────
// One enterprise design system for EVERY dashboard KPI card: identical white/blue
// theme, border, shadow, hover lift, icon container, decorative ring, typography,
// spacing, padding and radius. Only the icon, title, value and subtitle change —
// any future KPI card automatically inherits this look by reusing <KpiCard>.
const KpiCard: React.FC<{ icon: React.ReactNode; title: string; value: React.ReactNode; subtitle: string }> = ({ icon, title, value, subtitle }) => (
  <div className="relative overflow-hidden h-full bg-gradient-to-br from-[#FCF4EE] via-[#F0F7FF] to-white rounded-2xl p-5 flex items-start gap-4 border border-[#BFDBFE] shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
    {/* Decorative ring — identical position, size & opacity on every card */}
    <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full bg-[#2563EB]/8 pointer-events-none" />
    {/* Icon container — identical size, radius, background & shadow; glyph varies */}
    <div className="w-11 h-11 rounded-xl bg-[#2563EB] flex items-center justify-center flex-shrink-0 shadow-md shadow-brand-200">
      {icon}
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-xs font-semibold text-[#2563EB] uppercase tracking-wide mb-0.5">{title}</p>
      <p className="text-3xl font-extrabold text-slate-800 leading-none">{value}</p>
      <p className="text-xs text-slate-500 mt-1.5">{subtitle}</p>
    </div>
  </div>
);

interface CompaniesProps {
  _role: Role;
  companies: Company[];
  onUpdateCompanies: (companies: Company[]) => void;
  userAccounts: UserAccount[];
  onUpdateAccounts: (accounts: UserAccount[]) => void;
  onStartMasquerade: (companyId: string, kind?: 'company' | 'branch') => void;
  plans: SubscriptionPlan[];
  employees: Employee[];
  onUpdateEmployees?: (employees: Employee[]) => void;
  onRefresh?: () => void;
  superAdminStats?: SuperAdminStats | null;
  // Navigate to the dedicated Edit-Company page. Editing is NEVER inline here —
  // the Companies screen is a listing page only.
  onEditCompany?: (companyId: string) => void;
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
  superAdminStats,
  onEditCompany
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
            style={{ color: '#99552F', background: '#FCF4EE' }}
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
  const [deleteDependencies] = useState<{ employees: number, branches: number, payrolls: number, attendances: number, documents: number } | null>(null);
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
      ui.toast.error(`Excel export failed: ${err?.message || 'Unknown error.'}`);
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
      ui.toast.error(`PDF export failed: ${err?.message || 'Unknown error.'}`);
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

  // Company Overview (Super Admin monitoring — read-only, no PII) + Support Session.
  const [overviewTarget, setOverviewTarget] = useState<{ company: Company; kind: 'company' | 'branch' } | null>(null);
  const [overviewData, setOverviewData] = useState<any>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [supportForm, setSupportForm] = useState<{ open: boolean; reason: string; ticketNumber: string }>({ open: false, reason: '', ticketNumber: '' });
  const [startingSupport, setStartingSupport] = useState(false);
  const openOverview = async (company: Company, kind: 'company' | 'branch') => {
    setOverviewTarget({ company, kind });
    setOverviewData(null);
    setSupportForm({ open: false, reason: '', ticketNumber: '' });
    setOverviewLoading(true);
    try { setOverviewData(await api.statistics.getCompanyOverview(company.id)); }
    catch (e) { ui.toast.error(getApiErrorMessage(e) || 'Could not load company overview.'); }
    finally { setOverviewLoading(false); }
  };
  const startSupportSession = async () => {
    if (!overviewTarget) return;
    if (!supportForm.reason.trim()) { ui.toast.error('Please select or enter a reason for the support session.'); return; }
    setStartingSupport(true);
    try {
      await api.supportSessions.start({ companyId: overviewTarget.company.id, reason: supportForm.reason.trim(), ticketNumber: supportForm.ticketNumber.trim() || undefined });
      const { company, kind } = overviewTarget;
      setOverviewTarget(null);
      onStartMasquerade(company.id, kind); // enter the audited workspace
    } catch (e) { ui.toast.error(getApiErrorMessage(e) || 'Could not start the support session.'); }
    finally { setStartingSupport(false); }
  };
  const [workspaceAssignUser, setWorkspaceAssignUser] = useState<UserAccount | null>(null);

  const [selectedWorkspaces, setSelectedWorkspaces] = useState<string[]>([]);

  const [newPlan, setNewPlan] = useState<'Starter' | 'Professional' | 'Enterprise'>('Starter');

  // Branch Management state
  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Company | null>(null);
  const [parentCompanyIdForBranch, setParentCompanyIdForBranch] = useState<string>('');

  // Edit Company is a dedicated page now (pages/CompanyEdit.tsx) — no inline edit
  // state/handlers live here anymore. The Edit icon calls onEditCompany(id).

  // The branch form itself (state + save path) lives in <BranchFormModal>, which
  // the Company Dashboard reuses. This page only decides create-vs-edit.
  const handleOpenCreateBranch = (parentId: string) => {
    setEditingBranch(null);
    setParentCompanyIdForBranch(parentId);
    setBranchModalOpen(true);
  };

  const handleOpenEditBranch = (branch: Company) => {
    setEditingBranch(branch);
    setParentCompanyIdForBranch(branch.parentCompanyId || 'c-gcri');
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

  // Dynamic Onboarding state.
  //
  // Everything captured here is written to the Company master record (or its
  // Branch / CompanyOwner / Document children) by POST /api/companies, so the
  // Company Head's Company Profile opens pre-filled. Optional boxes left empty
  // are dropped server-side rather than stored as '', and the Company Head can
  // fill them in later.
  const BLANK_COMPANY = {
    // Identity
    name: '',
    legalName: '',
    tradeName: '',
    companyCode: '',
    companyType: '',
    industry: 'Technology',
    businessCategory: '',
    employeeCapacity: '',
    // Contact
    email: '',
    countryCode: '+91',
    mobileNumber: '',
    website: '',
    // Registered address
    address: '',
    city: '',
    state: '',
    pincode: '',
    country: 'India',
    // Statutory registration
    gstNumber: '',
    panNumber: '',
    cinNumber: '',
    registrationNumber: '',
    msmeNumber: '',
    iecCode: '',
    // Default branch
    defaultBranchName: '',
    defaultBranchCode: '',
    // Company Head account
    adminName: '',
    adminEmail: '',
    // Plan & branding
    plan: 'Starter' as 'Starter' | 'Professional' | 'Enterprise',
    pfRate: '12',
    esicRate: '3.25',
    logo: '',
    logoImage: '',
    primaryColor: '#C77E52',
  };
  const [newCompany, setNewCompany] = useState({ ...BLANK_COMPANY });

  // Owner(s) / Director(s) — seeded into the CompanyOwner table. The primary
  // owner is the company's primary contact person and feeds the {{owner_*}}
  // document placeholders.
  type OwnerDraft = { name: string; designation: string; email: string; mobile: string };
  const BLANK_OWNER: OwnerDraft = { name: '', designation: '', email: '', mobile: '' };
  const [owners, setOwners] = useState<OwnerDraft[]>([{ ...BLANK_OWNER }]);
  const [primaryOwner, setPrimaryOwner] = useState(0);

  // Registration certificates — become company-scoped Document rows so the
  // Company Profile → Company Documents tab needs no re-upload.
  type DocDraft = { fileData: string; mimeType: string; size: string; fileName: string };
  const REG_DOC_SLOTS = [
    { key: 'gstCertificate', label: 'GST Certificate', numberField: 'gstNumber' },
    { key: 'panCard', label: 'PAN Card', numberField: 'panNumber' },
    { key: 'cinCertificate', label: 'Certificate of Incorporation', numberField: 'cinNumber' },
    { key: 'msmeCertificate', label: 'MSME / Udyam Certificate', numberField: 'msmeNumber' },
    { key: 'iecCertificate', label: 'IEC Certificate', numberField: 'iecCode' },
  ] as const;
  const DOC_MAX_MB = 5;
  const [regDocs, setRegDocs] = useState<Record<string, DocDraft>>({});

  const humanBytes = (b: number) => b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(2)} MB`;

  const acceptRegDoc = (slot: string, file?: File | null) => {
    if (!file) return;
    if (file.size > DOC_MAX_MB * 1024 * 1024) { ui.toast.warning(`File must be ${DOC_MAX_MB} MB or smaller.`); return; }
    const reader = new FileReader();
    reader.onload = ev => setRegDocs(prev => ({
      ...prev,
      [slot]: { fileData: String(ev.target?.result || ''), mimeType: file.type || 'application/octet-stream', size: humanBytes(file.size), fileName: file.name },
    }));
    reader.readAsDataURL(file);
  };
  const removeRegDoc = (slot: string) => setRegDocs(prev => { const n = { ...prev }; delete n[slot]; return n; });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [officerErrors, setOfficerErrors] = useState<Record<string, string>>({});

  // ── Optional Company Logo upload (registration) ──────────────────────────────
  // PNG/JPG/JPEG/SVG, configurable max size. Stored as base64 on `logoImage`; if
  // left empty the company falls back to its initials emblem everywhere.
  const LOGO_MAX_MB = 2; // configurable
  const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml'];
  const [logoDragOver, setLogoDragOver] = useState(false);
  const acceptCompanyLogo = (file?: File | null) => {
    if (!file) return;
    const okType = LOGO_TYPES.includes(file.type) || /\.(png|jpe?g|svg)$/i.test(file.name);
    if (!okType) { ui.toast.warning('Unsupported format. Use PNG, JPG, JPEG or SVG.'); return; }
    if (file.size > LOGO_MAX_MB * 1024 * 1024) { ui.toast.warning(`Logo must be ${LOGO_MAX_MB} MB or smaller.`); return; }
    const reader = new FileReader();
    reader.onload = (ev) => setNewCompany(prev => ({ ...prev, logoImage: (ev.target?.result as string) || '' }));
    reader.readAsDataURL(file);
  };

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
      ui.toast.error('Please resolve validation errors before saving.');
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

    // Certificates are sent keyed by slot; the backend files them as company
    // documents and mirrors the ones that report templates read by column.
    const documents: Record<string, any> = {};
    for (const slot of REG_DOC_SLOTS) {
      const d = regDocs[slot.key];
      if (!d) continue;
      documents[slot.key] = {
        fileData: d.fileData, mimeType: d.mimeType, size: d.size,
        documentNumber: (newCompany as any)[slot.numberField] || '',
      };
    }

    // `fresh` carries registration-only keys (owners, documents, defaultBranch)
    // alongside the Company columns, so it is wider than the Company type.
    const fresh: Record<string, any> = {
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
      // Optional uploaded brand logo — omitted when absent so the initials emblem is used.
      logoImage: newCompany.logoImage || undefined,
      pfRate: parseFloat(newCompany.pfRate) || 12,
      esicRate: parseFloat(newCompany.esicRate) || 3.25,
      basicPercent: 50,
      overtimeRate: 1.5,
      profTaxRate: 200,

      // Company master profile — every value below lands on a real Company column
      // and shows up pre-filled in the Company Head's Company Profile.
      legalName: newCompany.legalName,
      tradeName: newCompany.tradeName,
      companyCode: newCompany.companyCode,
      companyType: newCompany.companyType,
      businessCategory: newCompany.businessCategory,
      employeeCapacity: newCompany.employeeCapacity,
      website: newCompany.website,
      city: newCompany.city,
      state: newCompany.state,
      pincode: newCompany.pincode,
      country: newCompany.country,
      panNumber: newCompany.panNumber,
      cinNumber: newCompany.cinNumber,
      registrationNumber: newCompany.registrationNumber,
      msmeNumber: newCompany.msmeNumber,
      iecCode: newCompany.iecCode,

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
      gstNumber: newCompany.gstNumber,
      billingAddress: newCompany.address,
      subscriptionPrice: price,
      billingCycle: 'Monthly',
      accountStatus: 'Active',

      // Child records seeded alongside the company (all optional).
      // Flag the primary BEFORE filtering — the primary index refers to the row
      // the user ticked, not to its position among the non-empty rows.
      owners: owners
        .map((o, i) => ({ ...o, isPrimary: i === primaryOwner }))
        .filter(o => o.name.trim()),
      documents,
      defaultBranch: newCompany.defaultBranchName.trim()
        ? { branchName: newCompany.defaultBranchName, branchCode: newCompany.defaultBranchCode, location: newCompany.address }
        : undefined,
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

    // Company creation is authoritative. The auto-generated Company Head account
    // is a convenience — if it fails (e.g. the username already exists) we must
    // NOT hide the fact that the company itself was created: still refresh, close
    // and report. Previously a head-user error skipped onRefresh()/close, leaving
    // a created company invisible until a manual refresh.
    let headCreated = false;
    let headWarning = '';
    let createdCompany: any = null;
    try {
      createdCompany = await api.companies.create(fresh);
    } catch (err) {
      console.error('Company create failed:', err);
      ui.toast.error(getApiErrorMessage(err, 'Could not create the company.'));
      return;   // company not created — keep the form open with the entered data
    }
    try {
      // Link the Company Head to the REAL persisted company id (the backend
      // assigns its own numeric id; the frontend temp `c<ts>` id must not be sent
      // — it caused a 400 "companyId: Expected Int, provided String").
      await api.users.create({ ...newHead, companyId: createdCompany?.id ?? newHead.companyId, password: newHead.passwordStr });
      headCreated = true;
    } catch (uErr: any) {
      console.warn('Company created, but Company Head account was not created:', uErr);
      headWarning = '\n\nNote: the default Company Head account could not be auto-created ' +
        '(it may already exist). Create or assign a user for this company in User Management.';
    }

    onRefresh?.();
    setAddOpen(false);

    // Reset state
    setNewCompany({ ...BLANK_COMPANY });
    setOwners([{ ...BLANK_OWNER }]);
    setPrimaryOwner(0);
    setRegDocs({});
    setErrors({});

    // The backend seeds the branch / owners / documents best-effort and reports
    // anything it could not attach — surface that instead of claiming success.
    const partial: string[] = createdCompany?.warnings || [];

    await ui.alert({
      title: 'Company Registered',
      variant: partial.length ? 'warning' : 'success',
      message: `Company registered successfully. Its profile is pre-filled with everything entered here.${headCreated
        ? `\n\nGenerated Default Company Head Account:\nLogin ID: ${newHead.username}\nPassword: ${newHead.passwordStr}`
        : headWarning}${partial.length ? `\n\nNot everything was attached:\n· ${partial.join('\n· ')}` : ''}`
    });
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
          ui.toast.error(`Failed to ${nextStatus === 'Active' ? 'restore/reactivate' : 'suspend'} ${failures.length} of ${targets.length} record(s). The change was not saved. Please try again.`);
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
      // Cap the local audit log so it can never grow without bound (quota safety),
      // and guard the write so a storage failure never crashes the UI.
      safeSetJSON('hrms_audit_logs', [logEntry, ...existingLogs].slice(0, 200));

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
      ui.toast.error(getApiErrorMessage(err, 'Could not save the plan.'));
    });
  };

  // Manage Accounts triggers
  const companyUsers = manageAccountsModal
    ? userAccounts.filter(u => u.companyId === manageAccountsModal.id)
    : [];

  const handleOpenWorkspaceAssign = (user: UserAccount) => {
    setWorkspaceAssignUser(user);
    setSelectedWorkspaces(user.accessibleCompanyIds || [user.companyId]);
  };

  const handleSaveWorkspaces = async () => {
    if (!workspaceAssignUser) return;
    const newCompanyId = selectedWorkspaces.length > 0 ? selectedWorkspaces[0] : workspaceAssignUser.companyId;
    try {
      // Persist to the database FIRST, then mirror into local state. Previously
      // this only updated React state, so the reassigned workspace access was
      // lost on the next login/refresh (the app reloads users from the API).
      await api.users.update(workspaceAssignUser.id, {
        accessibleCompanyIds: selectedWorkspaces,
        companyId: newCompanyId,
      });
      const updated = userAccounts.map(u =>
        u.id === workspaceAssignUser.id
          ? { ...u, accessibleCompanyIds: selectedWorkspaces, companyId: newCompanyId }
          : u
      );
      onUpdateAccounts(updated);
      setWorkspaceAssignUser(null);
    } catch (err) {
      console.error(err);
      ui.toast.error(getApiErrorMessage(err, 'Could not save workspace access.'));
    }
  };

  const handleCreateOfficer = () => {
    if (!manageAccountsModal) return;
    const nameErr = validateName(officerForm.name).error;
    const emailErr = validateEmail(officerForm.email).error;
    if (nameErr || emailErr) {
      ui.toast.error('Please resolve validation errors before saving.');
      return;
    }
    const existingUser = userAccounts.find(u => u.username.toLowerCase() === officerForm.username.toLowerCase());
    if (existingUser) {
      if (existingUser.accessibleCompanyIds && existingUser.accessibleCompanyIds.includes(manageAccountsModal.id)) {
        ui.toast.warning('This user already has access to this workspace.');
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
      ui.toast.success(`Existing user detected — additional branch/company access granted to ${manageAccountsModal.name}.`);
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
      ui.alert({ title: 'Officer Provisioned', variant: 'success', message: `Successfully provisioned new ${officerForm.role} credential:\nID: ${newUser.username}\nPassword: ${newUser.passwordStr}` });
    }).catch(err => {
      console.error(err);
      ui.toast.error(getApiErrorMessage(err, 'Could not create the user account.'));
    });
  };

  const handleToggleUserActivation = async (userId: string) => {
    const target = userAccounts.find(u => u.id === userId);
    if (!target) return;
    const nextStatus = target.status === 'Active' ? 'Disabled' : 'Active';
    try {
      // Persist the status change to the DB before reflecting it locally — a
      // toggle that only changed React state reverted on refresh.
      await api.users.update(userId, { status: nextStatus });
      onUpdateAccounts(userAccounts.map(u => u.id === userId ? { ...u, status: nextStatus as 'Active' | 'Disabled' } : u));
      ui.toast.success('User status toggled successfully.');
    } catch (err) {
      console.error(err);
      ui.toast.error(getApiErrorMessage(err, 'Could not update the user status.'));
    }
  };

  const handleResetUserPassword = async (userId: string) => {
    const newPass = await ui.prompt({ message: 'Enter new access password (min 8 characters):' });
    if (!newPass || newPass.length < 8) {
      if (newPass) ui.toast.warning('Password must be at least 8 characters long.');
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
      ui.toast.success('Password updated successfully.');
    } catch (err: any) {
      console.error(err);
      ui.toast.error(`Failed to reset password: ${err.message}`);
    }
  };

  const handleRevokeUser = async (userId: string) => {
    if (!(await ui.confirm({ message: 'Are you sure you want to revoke this user access?', variant: 'danger', confirmText: 'Revoke Access' }))) return;
    try {
      // Delete in the database first; only then drop from the list. The old
      // version filtered local state only, so the "revoked" user reappeared on
      // the next refresh.
      await api.users.delete(userId);
      onUpdateAccounts(userAccounts.filter(u => u.id !== userId));
      ui.toast.success('Access revoked successfully.');
    } catch (err) {
      console.error(err);
      ui.toast.error(getApiErrorMessage(err, 'Could not revoke this user.'));
    }
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
      ui.toast.warning("Company is already archived.");
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
      ui.toast.error("Cannot finalize closure: Pending clearances or settlements.");
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
      ui.toast.success(`Company/Branch ${offboardCompany.name} and any child branches were offboarded and safely archived. All linked employees were automatically archived.`);
    }).catch(err => {
      console.error(err);
      ui.toast.error(getApiErrorMessage(err, 'Could not offboard this company.'));
    });
  };

  const executeCompleteOffboarding = () => {
    setIsConfirmingOffboard(true);
  };

  // KPI counts — straight from the database via SuperAdminStatisticsService.
  // No client-side recomputation; the API is the single source of truth.
  // Cards auto-update because superAdminStats is re-fetched after every
  // create / edit / suspend / activate / archive / delete action (see App.tsx).
  const kpiTotalCompanies = superAdminStats?.totalCompanies ?? 0;
  const kpiTotalBranches = superAdminStats?.totalBranches ?? 0;
  // Active = status 'Active' only (backend excludes Archived/Suspended/Inactive/
  // Offboarded). Replaces the former "Deactivated" KPIs as the primary metrics.
  const kpiActiveCompanies = superAdminStats?.activeCompanies ?? 0;
  const kpiActiveBranches = superAdminStats?.activeBranches ?? 0;

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

        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => setActiveMainTab('active')}
            className={`px-4 py-2 text-sm font-medium rounded-full transition-colors border shadow-sm ${activeMainTab === 'active' ? 'bg-white text-[#2563EB] border-[#F7E3D3]' : 'bg-transparent border-transparent text-slate-500 hover:text-[#99552F]'}`}
          >
            Active Tenders
          </button>
          <button
            onClick={() => setActiveMainTab('archived')}
            className={`px-4 py-2 text-sm font-medium rounded-full transition-colors border shadow-sm ${activeMainTab === 'archived' ? 'bg-white text-[#2563EB] border-[#F7E3D3]' : 'bg-transparent border-transparent text-slate-500 hover:text-[#99552F]'}`}
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
              className="px-5 py-2 text-sm font-medium bg-gradient-to-r from-[#2563EB] to-[#99552F] text-white rounded-full shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all inline-flex items-center gap-2"
            >
              <Plus size={16} />
              Create Company
            </button>
          )}
        </div>
      </div>

      {/* ── KPI Cards ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

        {/* Every card uses the SAME <KpiCard> theme — only icon/title/value/subtitle differ. */}
        <KpiCard
          icon={<Building2 size={20} className="text-white" />}
          title="Total Companies"
          value={kpiTotalCompanies}
          subtitle="Registered organizations"
        />
        <KpiCard
          icon={<GitBranch size={20} className="text-white" />}
          title="Total Branches"
          value={kpiTotalBranches}
          subtitle="All company branches"
        />
        <KpiCard
          icon={<BadgeCheck size={20} className="text-white" />}
          title="Active Companies"
          value={kpiActiveCompanies}
          subtitle="Currently Active Organizations"
        />
        <KpiCard
          icon={<Network size={20} className="text-white" />}
          title="Active Branches"
          value={kpiActiveBranches}
          subtitle="Currently Active Branches"
        />

      </div>

      {/* Filters bar */}
      <div className="bg-white rounded-[14px] border border-[#F7E3D3] shadow-sm p-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search companies by name or domain..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-slate-50 border-none rounded-full pl-11 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-brand-500/20 text-slate-700 placeholder-slate-400 outline-none"
            />
          </div>
          <div className="w-full sm:w-48 relative">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="w-full appearance-none bg-white border border-slate-200 rounded-full px-4 py-2.5 text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            >
              <option value="">All Status</option>
              <option value="Active">Active</option>
              <option value="Inactive">Suspended</option>
            </select>
            <ChevronRight size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 rotate-90 pointer-events-none" />
          </div>
          <div className="w-full sm:w-48 relative">
            <select
              value={planFilter}
              onChange={e => setPlanFilter(e.target.value)}
              className="w-full appearance-none bg-white border border-slate-200 rounded-full px-4 py-2.5 text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
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
      <div className="bg-white rounded-[14px] border border-[#F7E3D3] shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[#F7E3D3] flex items-center justify-between bg-white">
          <span className="text-sm font-bold text-slate-800">Tenant Directory</span>
          <span className="text-xs text-slate-500 font-medium">{filtered.filter(c => !c.parentCompanyId).length} clients registered</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#F7E3D3] bg-[#F8FBFF]">
                <th className="py-3 px-5 text-xs font-semibold text-slate-500">Company Profile</th>
                <th className="py-3 px-5 text-xs font-semibold text-slate-500">SaaS Admin Info</th>
                <th className="py-3 px-5 text-xs font-semibold text-slate-500">Details</th>
                <th className="py-3 px-5 text-xs font-semibold text-slate-500">Status</th>
                <th className="py-3 px-5 text-xs font-semibold text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F7E3D3]">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-sm text-slate-400">
                    No company records found matching search queries
                  </td>
                </tr>
              ) : (
                filtered.filter(c => !c.parentCompanyId).map(c => {
                  const branches = companies
                    .filter(b => b.parentCompanyId === c.id)
                    .sort((a, b) => ((a as any).branchNo ?? a.id) - ((b as any).branchNo ?? b.id));
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
                            <div className="w-10 h-10 rounded-full bg-[#FCF4EE] text-[#99552F] flex items-center justify-center font-bold text-sm border border-[#F7E3D3]" style={!c.logoImage ? {} : {}}>
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
                                  <span className="text-[10px] font-semibold bg-[#FCF4EE] text-[#2563EB] px-2 py-0.5 rounded-full border border-[#F7E3D3]">Parent Company</span>
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
                            <p>Joined: {formatDate(c.joinDate)}</p>
                            <p>
                              {hasBranches ? 'Combined Staff: ' : 'Employees: '}
                              <span className="font-semibold text-slate-700">{combinedEmpCount}</span>
                            </p>
                          </div>
                        </td>

                        {/* Status */}
                        <td className="py-3 px-5">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${c.status === 'Active' ? 'bg-[#F7E3D3] text-[#99552F] border-[#BFDBFE]' : 'bg-[#FEE2E2] text-[#DC2626] border-[#FECACA]'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${c.status === 'Active' ? 'bg-[#2563EB]' : 'bg-[#DC2626]'}`}></span>
                            {c.status}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-5">
                          {canEdit && (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => openOverview(c, 'company')}
                                className="text-xs px-3 py-1.5 bg-white text-slate-700 border border-slate-200 rounded-full font-medium transition-colors hover:bg-slate-50 inline-flex items-center gap-1.5 shadow-sm"
                              >
                                Overview <ChevronRight size={14} className="text-slate-400" />
                              </button>

                              <button
                                onClick={() => onEditCompany?.(c.id)}
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
                                  className="px-2.5 py-1 rounded border text-[10px] font-bold shadow-xs transition-all bg-[#F7E3D3] border-[#BFDBFE] text-[#99552F] hover:bg-[#FCF4EE]"
                                >
                                  Restore
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
                            <div className="rounded-[16px] border border-[#F7E3D3] bg-white overflow-hidden shadow-sm">
                              <div className="bg-[#FCF4EE] px-5 py-3 border-b border-[#F7E3D3] flex items-center justify-between">
                                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">GCRI Connected Sub-Branches</span>
                                <div className="flex items-center gap-3">
                                  <span className="text-[11px] text-slate-500 font-medium">{branches.length} branches resolved</span>
                                  {canEdit && (
                                    <button
                                      onClick={() => handleOpenCreateBranch(c.id)}
                                      className="px-3 py-1.5 bg-white border border-[#F7E3D3] hover:bg-[#FCF4EE] text-[#2563EB] rounded-full text-[11px] font-bold flex items-center gap-1 shadow-sm transition-colors"
                                    >
                                      <Plus size={12} className="text-[#2563EB]" /> Create Branch
                                    </button>
                                  )}
                                </div>
                              </div>
                              <table className="w-full text-left border-collapse">
                                <thead>
                                  <tr className="border-b border-[#F7E3D3] text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
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
                                            {(b as any).branchNo != null && (
                                              <span
                                                className="text-[11px] font-bold text-slate-400 w-6 text-center"
                                                title="Branch No"
                                              >#{(b as any).branchNo}</span>
                                            )}
                                            <span className="font-bold text-[#99552F] bg-[#FCF4EE] px-2 py-1 rounded border border-[#F7E3D3] text-[10px]">
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
                                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${b.status === 'Active' ? 'bg-[#F7E3D3] text-[#99552F] border-[#BFDBFE]' : 'bg-[#FEE2E2] text-[#DC2626] border-[#FECACA]'}`}>
                                            <span className={`w-1 h-1 rounded-full ${b.status === 'Active' ? 'bg-[#2563EB]' : 'bg-[#DC2626]'}`}></span>
                                            {b.status}
                                          </span>
                                        </td>
                                        <td className="py-2.5 px-5 text-right">
                                          {canEdit && (
                                            <div className="inline-flex items-center gap-2">
                                              <button
                                                onClick={() => openOverview(b, 'branch')}
                                                className="px-3 py-1.5 bg-white text-slate-700 border border-slate-200 rounded-full font-medium text-[11px] transition-colors hover:bg-slate-50 shadow-sm"
                                              >
                                                Overview
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
                                                  className="px-2.5 py-1 rounded border text-[10px] font-bold shadow-xs transition-all bg-[#F7E3D3] border-[#BFDBFE] text-[#99552F] hover:bg-[#FCF4EE]"
                                                >
                                                  Restore
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
        variant="page"
        breadcrumbs={[{ label: 'Companies', onClick: () => setAddOpen(false) }, { label: 'New Company' }]}
        subtitle="Register a new client company and its default administrator."
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
          <p className="text-xs text-gray-400">Fields marked * are required. Everything entered here becomes this company's master profile — the Company Head sees it pre-filled and never re-types it.</p>

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
              label="Company Legal Name"
              placeholder="e.g. Acme Tech Pvt Ltd"
              value={newCompany.legalName}
              onChange={e => setNewCompany({ ...newCompany, legalName: e.target.value })}
            />
            <Input
              label="Trade Name"
              placeholder="e.g. Acme"
              value={newCompany.tradeName}
              onChange={e => setNewCompany({ ...newCompany, tradeName: e.target.value })}
            />
            <Input
              label="Company Code"
              placeholder="e.g. ACME001"
              value={newCompany.companyCode}
              onChange={e => setNewCompany({ ...newCompany, companyCode: e.target.value.toUpperCase() })}
            />
            <Select
              label="Company Type"
              value={newCompany.companyType}
              onChange={e => setNewCompany({ ...newCompany, companyType: e.target.value })}
              options={[{ value: '', label: '— Select —' }, ...REG_COMPANY_TYPES.map(t => ({ value: t, label: t }))]}
            />
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
              label="Business Category"
              placeholder="e.g. Manufacturing"
              value={newCompany.businessCategory}
              onChange={e => setNewCompany({ ...newCompany, businessCategory: e.target.value })}
            />
            <Input
              label="Employee Strength"
              placeholder="e.g. 150"
              value={newCompany.employeeCapacity}
              onChange={e => setNewCompany({ ...newCompany, employeeCapacity: e.target.value.replace(/[^\d]/g, '') })}
            />
          </div>

          {/* ── Contact ── */}
          <div className="border-t border-gray-150 pt-3 space-y-3 text-left">
            <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Contact Details</h4>
            <div className="grid grid-cols-2 gap-3">
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
              <Input
                label="Website"
                placeholder="e.g. acme.com"
                value={newCompany.website}
                onChange={e => setNewCompany({ ...newCompany, website: e.target.value })}
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
          </div>

          {/* ── Registered address ── */}
          <div className="border-t border-gray-150 pt-3 space-y-3 text-left">
            <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Registered Address</h4>
            <Input
              label="Corporate HQ Full Address *"
              placeholder="Street, Area, Landmark..."
              value={newCompany.address}
              onChange={e => setNewCompany({ ...newCompany, address: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-3">
              <Input label="City" placeholder="e.g. Rajkot" value={newCompany.city} onChange={e => setNewCompany({ ...newCompany, city: e.target.value })} />
              <Input label="State" placeholder="e.g. Gujarat" value={newCompany.state} onChange={e => setNewCompany({ ...newCompany, state: e.target.value })} />
              <Input label="PIN Code" placeholder="e.g. 360001" value={newCompany.pincode} onChange={e => setNewCompany({ ...newCompany, pincode: e.target.value.replace(/[^\dA-Za-z\s-]/g, '') })} />
              <Input label="Country" value={newCompany.country} onChange={e => setNewCompany({ ...newCompany, country: e.target.value })} />
            </div>
          </div>

          {/* ── Statutory registration ── */}
          <div className="border-t border-gray-150 pt-3 space-y-3 text-left">
            <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Statutory Registration</h4>
            <div className="grid grid-cols-2 gap-3">
              <Input label="GST Number" placeholder="e.g. 24ABCDE1234F1Z5" value={newCompany.gstNumber} onChange={e => setNewCompany({ ...newCompany, gstNumber: e.target.value.toUpperCase() })} />
              <Input label="PAN Number" placeholder="e.g. ABCDE1234F" value={newCompany.panNumber} onChange={e => setNewCompany({ ...newCompany, panNumber: e.target.value.toUpperCase() })} />
              <Input label="CIN Number" placeholder="e.g. U72900GJ2020PTC000000" value={newCompany.cinNumber} onChange={e => setNewCompany({ ...newCompany, cinNumber: e.target.value.toUpperCase() })} />
              <Input label="Registration Number" value={newCompany.registrationNumber} onChange={e => setNewCompany({ ...newCompany, registrationNumber: e.target.value })} />
              <Input label="MSME / Udyam Number" value={newCompany.msmeNumber} onChange={e => setNewCompany({ ...newCompany, msmeNumber: e.target.value.toUpperCase() })} />
              <Input label="IEC Code" value={newCompany.iecCode} onChange={e => setNewCompany({ ...newCompany, iecCode: e.target.value.toUpperCase() })} />
            </div>
          </div>

          {/* ── Company documents ── */}
          <div className="border-t border-gray-150 pt-3 space-y-2.5 text-left">
            <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Company Documents</h4>
            <p className="text-[11px] text-slate-500">Optional. Uploaded certificates appear in the company's <span className="font-semibold">Company Documents</span> tab — no re-upload needed. Max {DOC_MAX_MB} MB each.</p>
            <div className="space-y-2">
              {REG_DOC_SLOTS.map(slot => {
                const d = regDocs[slot.key];
                return (
                  <div key={slot.key} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <span className="flex-1 text-[11px] font-bold text-slate-600">{slot.label}</span>
                    {d ? (
                      <>
                        <span className="truncate max-w-[38%] text-[10px] text-emerald-700 font-semibold flex items-center gap-1"><CheckCircle2 size={12} /> {d.fileName} · {d.size}</span>
                        <button type="button" onClick={() => removeRegDoc(slot.key)} className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-600 hover:text-rose-700"><Trash2 size={12} /> Remove</button>
                      </>
                    ) : (
                      <label className="inline-flex items-center gap-1 text-[10px] font-semibold text-brand-600 hover:text-brand-700 cursor-pointer">
                        <UploadCloud size={13} /> Upload
                        <input type="file" accept=".png,.jpg,.jpeg,.pdf" className="hidden" onChange={e => acceptRegDoc(slot.key, e.target.files?.[0])} />
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Owners / Directors ── */}
          <div className="border-t border-gray-150 pt-3 space-y-2.5 text-left">
            <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Owner(s) / Director(s)</h4>
            <p className="text-[11px] text-slate-500">Optional. The primary owner is the company's primary contact person and fills the owner placeholders on generated letters and reports.</p>
            {owners.map((o, i) => (
              <div key={i} className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Full Name" placeholder="e.g. Vishy Patel" value={o.name} onChange={e => setOwners(prev => prev.map((r, j) => j === i ? { ...r, name: e.target.value } : r))} />
                  <Input label="Designation" placeholder="e.g. Managing Director" value={o.designation} onChange={e => setOwners(prev => prev.map((r, j) => j === i ? { ...r, designation: e.target.value } : r))} />
                  <Input label="Email" type="email" value={o.email} onChange={e => setOwners(prev => prev.map((r, j) => j === i ? { ...r, email: e.target.value } : r))} />
                  <Input label="Mobile" value={o.mobile} onChange={e => setOwners(prev => prev.map((r, j) => j === i ? { ...r, mobile: e.target.value } : r))} />
                </div>
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600 cursor-pointer select-none">
                    <input type="radio" name="primaryOwner" checked={primaryOwner === i} onChange={() => setPrimaryOwner(i)} className="h-3.5 w-3.5 accent-[#C77E52]" />
                    Primary contact person
                  </label>
                  {owners.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        setOwners(prev => prev.filter((_, j) => j !== i));
                        // Keep the tick on the same person after the row shifts.
                        setPrimaryOwner(p => (p === i ? 0 : p > i ? p - 1 : p));
                      }}
                      className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-600 hover:text-rose-700"
                    ><Trash2 size={12} /> Remove</button>
                  )}
                </div>
              </div>
            ))}
            <button type="button" onClick={() => setOwners(prev => [...prev, { ...BLANK_OWNER }])} className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-600 hover:text-brand-700">
              <Plus size={13} /> Add another owner / director
            </button>
          </div>

          {/* ── Default branch ── */}
          <div className="border-t border-gray-150 pt-3 space-y-2.5 text-left">
            <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Default Branch</h4>
            <p className="text-[11px] text-slate-500">Optional. Created immediately and shown in the company's Branch Information tab.</p>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Branch Name" placeholder="e.g. Rajkot Head Office" value={newCompany.defaultBranchName} onChange={e => setNewCompany({ ...newCompany, defaultBranchName: e.target.value })} />
              <Input label="Branch Code" placeholder="e.g. RJT-HO" value={newCompany.defaultBranchCode} onChange={e => setNewCompany({ ...newCompany, defaultBranchCode: e.target.value.toUpperCase() })} />
            </div>
          </div>

          {/* ── Payroll defaults ── */}
          <div className="border-t border-gray-150 pt-3 space-y-3 text-left">
            <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Payroll Defaults</h4>
            <div className="grid grid-cols-2 gap-3">
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
            <Input
              label="Company Logo Text (Emblem) *"
              placeholder="e.g. TN"
              value={newCompany.logo}
              onChange={e => setNewCompany({ ...newCompany, logo: e.target.value.toUpperCase().slice(0, 3) })}
            />
          </div>

          {/* ── Company Branding (optional logo upload) ── */}
          <div className="border-t border-gray-150 pt-3 space-y-2 text-left">
            <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Company Branding</h4>
            <p className="text-[11px] text-slate-500">Upload a logo to brand this company's documents, reports & portal. <span className="font-semibold">Optional</span> — if skipped, the initials emblem ({newCompany.logo || (newCompany.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '—')}) is used automatically.</p>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Company Logo (Optional)</label>
            {!newCompany.logoImage ? (
              <label
                onDragOver={e => { e.preventDefault(); setLogoDragOver(true); }}
                onDragLeave={() => setLogoDragOver(false)}
                onDrop={e => { e.preventDefault(); setLogoDragOver(false); acceptCompanyLogo(e.dataTransfer.files?.[0]); }}
                className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-5 cursor-pointer transition ${logoDragOver ? 'border-brand-400 bg-brand-50' : 'border-slate-300 bg-slate-50 hover:bg-slate-100'}`}
              >
                <UploadCloud size={22} className="text-slate-400" />
                <span className="text-xs font-semibold text-brand-600">Upload Logo</span>
                <span className="text-[10px] text-slate-400">or drag &amp; drop image here</span>
                <span className="text-[9px] text-slate-400">Supported: PNG, JPG, JPEG, SVG · max {LOGO_MAX_MB} MB</span>
                <input type="file" accept=".png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml" className="hidden" onChange={e => acceptCompanyLogo(e.target.files?.[0])} />
              </label>
            ) : (
              <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2.5">
                <div className="h-14 w-14 shrink-0 rounded-lg bg-white border border-slate-200 flex items-center justify-center overflow-hidden">
                  <img src={newCompany.logoImage} alt="Company logo" className="h-full w-full object-contain p-1" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold text-emerald-700 flex items-center gap-1"><CheckCircle2 size={12} /> Logo Uploaded</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <a href={newCompany.logoImage} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-600 hover:text-brand-600"><ImageIcon size={12} /> Preview</a>
                    <label className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-600 hover:text-brand-600 cursor-pointer"><RefreshCw size={12} /> Replace
                      <input type="file" accept=".png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml" className="hidden" onChange={e => acceptCompanyLogo(e.target.files?.[0])} />
                    </label>
                    <button type="button" onClick={() => setNewCompany(prev => ({ ...prev, logoImage: '' }))} className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-600 hover:text-rose-700"><Trash2 size={12} /> Remove</button>
                  </div>
                </div>
              </div>
            )}
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
                { value: '#C77E52', label: 'Vibrant Blue' },
                { value: '#0f766e', label: 'Deep Teal' },
                { value: '#65a30d', label: 'Fresh Lime' },
                { value: '#ea580c', label: 'Construct Orange' },
                { value: '#e11d48', label: 'Rose Red' }
              ]}
            />
          </div>

        </div>
      </Modal>

      {/* Company Overview (Super Admin monitoring — READ-ONLY, no employee PII) */}
      <Modal
        open={!!overviewTarget}
        onClose={() => setOverviewTarget(null)}
        title={`Company Overview — ${overviewTarget?.company?.name || ''}`}
        size="lg"
        footer={<>
          <Button variant="outline" onClick={() => setOverviewTarget(null)}>Close</Button>
          {canEdit && <Button icon={<ShieldAlert size={14} />} onClick={() => setSupportForm(s => ({ ...s, open: true }))}>Start Support Session</Button>}
        </>}
      >
        {overviewLoading ? (
          <div className="py-16 text-center text-sm text-slate-500">Loading overview…</div>
        ) : !overviewData ? (
          <div className="py-16 text-center text-sm text-slate-500">No overview data available.</div>
        ) : (() => {
          const d = overviewData;
          const fmtBytes = (n: number) => !n ? '0 B' : n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n >= 1024 ? `${(n / 1024).toFixed(0)} KB` : `${n} B`;
          const Field = ({ label, value }: { label: string; value: any }) => (
            <div className="rounded-lg border border-slate-150 bg-white px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
              <p className="text-[12.5px] font-bold text-slate-800 break-words">{value === null || value === undefined || value === '' ? '—' : value}</p>
            </div>
          );
          const Stat = ({ label, value, tone }: { label: string; value: any; tone?: string }) => (
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-center">
              <p className={`text-xl font-extrabold ${tone || 'text-slate-800'}`}>{value}</p>
              <p className="text-[10px] font-semibold text-slate-400">{label}</p>
            </div>
          );
          return (
            <div className="space-y-4">
              <div className="flex items-start gap-2 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-[11px] text-brand-700">
                <Shield size={14} className="mt-0.5 shrink-0" />
                Platform monitoring only. Employee names, salary, payroll, attendance, leave, documents and personal data are private to the company and are never shown here. To assist this company, start an <b>audited Support Session</b>.
              </div>

              <div>
                <p className="mb-2 text-xs font-extrabold text-slate-700">Company</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <Field label="Company Name" value={d.company.name} />
                  <Field label="Company Code" value={d.company.code} />
                  <Field label="Status" value={d.company.status} />
                  <Field label="Company Head" value={d.company.head} />
                  <Field label="Email" value={d.company.email} />
                  <Field label="Contact Number" value={d.company.contactNumber} />
                  <Field label="Registered Address" value={[d.company.address, d.company.city, d.company.state].filter(Boolean).join(', ')} />
                  <Field label="Industry" value={d.company.industry} />
                  <Field label="Registration Date" value={formatDate(d.company.registrationDate)} />
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-extrabold text-slate-700">Subscription &amp; License</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <Field label="Plan" value={d.subscription.plan} />
                  <Field label="Subscription Status" value={d.subscription.status} />
                  <Field label="Expiry" value={d.subscription.expiry ? formatDate(d.subscription.expiry) : '—'} />
                  <Field label="Licensed Employees" value={d.subscription.licensedEmployeeLimit} />
                  <Field label="License Active" value={d.subscription.licenseActive === null ? '—' : d.subscription.licenseActive ? 'Yes' : 'No'} />
                  <Field label="License Status" value={d.subscription.licenseStatus} />
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-extrabold text-slate-700">Usage (counts only)</p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  <Stat label="Branches" value={d.branchesTotal} />
                  <Stat label="Active Branches" value={d.branchesActive} tone="text-emerald-600" />
                  <Stat label="Employees" value={d.employeesTotal} />
                  <Stat label="Active" value={d.employeesActive} tone="text-emerald-600" />
                  <Stat label="Inactive" value={d.employeesInactive} tone="text-slate-500" />
                  <Stat label="Storage" value={fmtBytes(d.storageBytes)} tone="text-brand-600" />
                </div>
                <p className="mt-2 text-[11px] text-slate-400">Last login: {d.lastLogin ? formatDate(d.lastLogin) : '—'}</p>
              </div>

              {d.branches?.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-extrabold text-slate-700">Branches (summary only)</p>
                  <div className="overflow-hidden rounded-xl border border-slate-200">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 text-slate-500"><tr>{['Branch', 'Code', 'Status', 'Manager', 'Employees', 'Active'].map(h => <th key={h} className="px-3 py-2 text-left font-bold">{h}</th>)}</tr></thead>
                      <tbody>
                        {d.branches.map((b: any) => (
                          <tr key={b.id} className="border-t border-slate-100">
                            <td className="px-3 py-2 font-semibold text-slate-700">{b.name}</td>
                            <td className="px-3 py-2">{b.code || '—'}</td>
                            <td className="px-3 py-2"><Badge variant={b.status === 'Active' ? 'green' : 'gray'}>{b.status}</Badge></td>
                            <td className="px-3 py-2">{b.manager || '—'}</td>
                            <td className="px-3 py-2">{b.employeeCount}</td>
                            <td className="px-3 py-2">{b.activeEmployeeCount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <p className="text-[10px] text-slate-400">Allowed platform actions (Suspend / Activate / Archive / change subscription) are available from the company row. HR management requires a Support Session.</p>
            </div>
          );
        })()}
      </Modal>

      {/* Start Support Session — reason + optional ticket, then enter the audited workspace */}
      <Modal
        open={supportForm.open}
        onClose={() => setSupportForm(s => ({ ...s, open: false }))}
        title="Start Support Session"
        size="md"
        footer={<>
          <Button variant="outline" onClick={() => setSupportForm(s => ({ ...s, open: false }))}>Cancel</Button>
          <Button icon={<ShieldAlert size={14} />} loading={startingSupport} onClick={startSupportSession}>Start &amp; Enter</Button>
        </>}
      >
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
            <ShieldAlert size={14} className="mt-0.5 shrink-0" />
            You are about to enter <b>{overviewTarget?.company?.name}</b>'s environment for support. The session and <b>every action you take</b> are recorded and auditable.
          </div>
          <Select
            label="Reason *"
            value={supportForm.reason}
            onChange={e => setSupportForm(s => ({ ...s, reason: e.target.value }))}
            options={[
              { value: '', label: 'Select a reason…' },
              { value: 'Customer-reported issue', label: 'Customer-reported issue' },
              { value: 'Payroll / attendance correction', label: 'Payroll / attendance correction' },
              { value: 'Configuration assistance', label: 'Configuration assistance' },
              { value: 'Data verification', label: 'Data verification' },
              { value: 'Bug investigation', label: 'Bug investigation' },
              { value: 'Other (see ticket)', label: 'Other (see ticket)' },
            ]}
          />
          <Input label="Ticket Number (optional)" value={supportForm.ticketNumber} onChange={e => setSupportForm(s => ({ ...s, ticketNumber: e.target.value }))} placeholder="e.g. TKT-1024" />
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
                                className="p-1 text-brand-500 hover:text-brand-700 hover:bg-brand-50 rounded"
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
                                className={`text-[10px] px-2 py-0.5 rounded font-bold text-white transition-colors ${u.status === 'Active' ? 'bg-red-650 bg-red-600 hover:bg-red-700' : 'bg-[#2563EB] hover:bg-[#99552F]'
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

      {/* Edit Company is now a dedicated page (see pages/CompanyEdit.tsx), reached
          via onEditCompany → /company-edit/:id. The former inline "page" Modal was
          removed so the Companies screen is a pure listing (no blank space, no
          inline edit form). */}

      {/* Branch Creation / Edition Modal — shared with the Company Dashboard */}
      <BranchFormModal
        open={branchModalOpen}
        onClose={() => setBranchModalOpen(false)}
        editingBranch={editingBranch}
        parentCompanyId={parentCompanyIdForBranch}
        companies={companies}
        onUpdateCompanies={onUpdateCompanies}
        userAccounts={userAccounts}
        onUpdateAccounts={onUpdateAccounts}
        onRefresh={onRefresh}
        breadcrumbRoot="Companies"
      />

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
                    className="rounded border-gray-300 text-brand-600 focus:ring-brand-500 w-4 h-4 disabled:opacity-50 disabled:cursor-not-allowed"
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
                      {comp.isHeadOffice && <span className="text-[9px] bg-brand-100 text-brand-700 px-1.5 py-0.5 rounded-full uppercase tracking-wider font-bold">HQ</span>}
                      {isInherited && <span className="text-[9px] bg-emerald-100 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-full uppercase tracking-wider font-bold">Inherited</span>}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{comp.branchName ? `Branch: ${comp.branchName}` : 'Parent Company'}</p>
                  </div>
                </label>
              )
            })}
          </div>
        </div>
      </Modal>

      {/* Enterprise Company/Branch Offboarding Modal */}
      <Modal open={!!offboardCompany} onClose={() => setOffboardCompany(null)} title="Enterprise Company & Tender Offboarding Workflow" size="lg">
        {offboardCompany && (
          <div className="space-y-6 text-sm text-left">
            <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="h-12 w-12 rounded-full overflow-hidden flex items-center justify-center font-bold text-lg text-white shadow-inner" style={!offboardCompany.logoImage ? { backgroundColor: offboardCompany.primaryColor || '#C77E52' } : {}}>
                {offboardCompany.logoImage ? (
                  <img src={offboardCompany.logoImage} alt="Logo" className="w-full h-full object-contain" />
                ) : (
                  getCompanyInitials(offboardCompany.name)
                )}
              </div>
              <div>
                <h3 className="font-semibold text-lg text-slate-800">{offboardCompany.name}</h3>
                <p className="text-slate-500 text-xs">{offboardCompany.branchCode ? `Code: ${offboardCompany.branchCode} • ` : ''}Domain: {offboardCompany.domain || '—'} • Admin: {offboardCompany.adminName || '—'}</p>
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
                  <input type="checkbox" checked={offboardCompany.offboardingState?.payrollVerified} onChange={e => setOffboardCompany({ ...offboardCompany, offboardingState: { ...offboardCompany.offboardingState, payrollVerified: e.target.checked } })} className="rounded border-slate-300 text-brand-600 focus:ring-brand-600" />
                </div>
              </Card>

              <Card padding={false} className="overflow-hidden">
                <div className="p-3 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
                  <CheckCircle2 size={16} className={offboardCompany.offboardingState?.invoiceCleared ? 'text-emerald-500' : 'text-slate-300'} />
                  <span className="font-medium text-slate-700">SaaS Invoices Cleared</span>
                </div>
                <div className="p-3 text-xs flex justify-between items-center">
                  <span className="text-slate-500">No pending SaaS subscription dues.</span>
                  <input type="checkbox" checked={offboardCompany.offboardingState?.invoiceCleared} onChange={e => setOffboardCompany({ ...offboardCompany, offboardingState: { ...offboardCompany.offboardingState, invoiceCleared: e.target.checked } })} className="rounded border-slate-300 text-brand-600 focus:ring-brand-600" />
                </div>
              </Card>

              <Card padding={false} className="overflow-hidden">
                <div className="p-3 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
                  <CheckCircle2 size={16} className={offboardCompany.offboardingState?.complianceVerified ? 'text-emerald-500' : 'text-slate-300'} />
                  <span className="font-medium text-slate-700">Govt Compliance Verified</span>
                </div>
                <div className="p-3 text-xs flex justify-between items-center">
                  <span className="text-slate-500">PF & ESIC filings marked complete.</span>
                  <input type="checkbox" checked={offboardCompany.offboardingState?.complianceVerified} onChange={e => setOffboardCompany({ ...offboardCompany, offboardingState: { ...offboardCompany.offboardingState, complianceVerified: e.target.checked } })} className="rounded border-slate-300 text-brand-600 focus:ring-brand-600" />
                </div>
              </Card>

              <Card padding={false} className="overflow-hidden">
                <div className="p-3 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
                  <CheckCircle2 size={16} className={offboardCompany.offboardingState?.assetCheckCompleted ? 'text-emerald-500' : 'text-slate-300'} />
                  <span className="font-medium text-slate-700">Company Assets Returned</span>
                </div>
                <div className="p-3 text-xs flex justify-between items-center">
                  <span className="text-slate-500">Hardware and licenses recovered.</span>
                  <input type="checkbox" checked={offboardCompany.offboardingState?.assetCheckCompleted} onChange={e => setOffboardCompany({ ...offboardCompany, offboardingState: { ...offboardCompany.offboardingState, assetCheckCompleted: e.target.checked } })} className="rounded border-slate-300 text-brand-600 focus:ring-brand-600" />
                </div>
              </Card>

              <Card padding={false} className="overflow-hidden">
                <div className="p-3 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
                  <CheckCircle2 size={16} className={offboardCompany.offboardingState?.financialSettlement ? 'text-emerald-500' : 'text-slate-300'} />
                  <span className="font-medium text-slate-700">Financial Settlement</span>
                </div>
                <div className="p-3 text-xs flex justify-between items-center">
                  <span className="text-slate-500">Full & final vendor settlement done.</span>
                  <input type="checkbox" checked={offboardCompany.offboardingState?.financialSettlement} onChange={e => setOffboardCompany({ ...offboardCompany, offboardingState: { ...offboardCompany.offboardingState, financialSettlement: e.target.checked } })} className="rounded border-slate-300 text-brand-600 focus:ring-brand-600" />
                </div>
              </Card>
            </div>

            <div className="p-5 border-t border-slate-200/60 bg-slate-50 flex justify-end gap-3 rounded-b-xl">
              <Button onClick={() => setOffboardCompany(null)} variant="outline">Cancel & Keep Active</Button>
              <Button onClick={executeCompleteOffboarding} variant="danger">Archive Tender & Workforce</Button>
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
                      ui.toast.success('Company/Branch archived successfully.');
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
                      ui.toast.success('Permanently deleted successfully.');
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
