import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { Building2, Palette, BadgeCent, Plus, Trash2, Edit3, ArrowUp, ArrowDown, Briefcase, AlertCircle, UploadCloud, ShieldCheck, Landmark, Users, CalendarClock } from 'lucide-react';
import { PermissionManager } from '@/components/settings/PermissionManager';
import { type Company, type Role } from '@/data/mockData';
import { getCompanyDepartments } from '@/data/mockData';
import { resolveActiveWorkspace } from '@/types';
import { SAFE_COMPANY_FALLBACK } from '@/App';
import { usePermissions } from '@/context/PermissionContext';
import {
  validatePhone,
  validateEmail,
  validateCompanyName,
  validatePercentage,
  validateGST,
  validatePAN,
  validateCIN,
  validateTAN,
  validateIFSC,
  validatePFCode,
  validateESICode,
  validateWebsite,
  validatePincode,
  type ValidationResult,
} from '@/utils/validation';
import { api } from '@/api/apiClient';
import { getApiErrorMessage } from '@/utils/apiError';
import { PayrollComplianceEngine } from '@/components/settings/PayrollComplianceEngine';
import { LabourCompliance } from '@/components/settings/LabourCompliance';
import { Scale } from 'lucide-react';
import { ui } from '@/components/ui/feedback';

interface SettingsProps {
  role: Role;
  activeCompanyId: string;
  companies: Company[];
  onUpdateCompanies: (companies: Company[]) => void;
  onRefresh?: () => void;
}

export const Settings: React.FC<SettingsProps> = ({
  role,
  activeCompanyId,
  companies,
  onUpdateCompanies,
  onRefresh
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'profile' | 'payroll' | 'branding' | 'departments' | 'roles' | 'labour'>('profile');
  
  // Find current company context (kind-aware — resolves a branch workspace to
  // the branch, not the parent company it shares a numeric id with).
  const currentCompany = resolveActiveWorkspace(companies as any[], activeCompanyId)
    || companies.find(c => String(c.id) === String(activeCompanyId))
    || SAFE_COMPANY_FALLBACK;

  // Split phone format "+91 9876543210" securely
  const getPhoneParts = () => {
    const parts = (currentCompany.phone || '+91 ').split(' ');
    return {
      code: parts[0] || '+91',
      num: parts[1] || '',
    };
  };

  const initialPhone = getPhoneParts();

  // Forms state synced with companies props
  const [profileForm, setProfileForm] = useState({
    name: currentCompany.name,
    email: currentCompany.adminEmail || '',
    address: currentCompany.billingAddress || '',
    industry: currentCompany.industry,
    companyIndustry: currentCompany.companyIndustry || currentCompany.industry || 'Generic',
    departmentTemplateType: currentCompany.departmentTemplateType || 'Generic',
    inheritParentDepartments: currentCompany.inheritParentDepartments !== false,
  });

  const [phoneCode, setPhoneCode] = useState(initialPhone.code);
  const [phoneNum, setPhoneNum] = useState(initialPhone.num);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [payrollForm, setPayrollForm] = useState({
    pfRate: (currentCompany.pfRate ?? 12).toString(),
    esicRate: (currentCompany.esicRate ?? 3.25).toString(),
    basicPercent: (currentCompany.basicPercent ?? 50).toString(),
    overtimeRate: (currentCompany.overtimeRate ?? 1.5).toString(),
    profTaxRate: (currentCompany.profTaxRate ?? 200).toString(),
  });

  const brandingFromCompany = (co: any) => ({
    name: co.name || '',
    shortName: co.shortName || '',
    tagline: co.tagline || '',
    website: co.website || co.domain || '',
    contactEmail: co.contactEmail || co.adminEmail || '',
    contactNumber: co.contactNumber || co.phone || '',
    address: co.address || co.billingAddress || '',
    description: co.description || '',
    logoText: co.logo || '',
    logoImage: co.logoImage || '',
    primaryColor: co.primaryColor || '#3b82f6',
    headerText: co.headerText || '',
    footerText: co.footerText || '',
    signatureText: co.signatureText || '',
    themeStyle: co.themeStyle || 'Modern',
    // ── Merged profile-identity fields ──
    companyCode: co.companyCode || '',
    registrationNumber: co.registrationNumber || '',
    gstNumber: co.gstNumber || '',
    panNumber: co.panNumber || '',
    cinNumber: co.cinNumber || '',
    city: co.city || '',
    state: co.state || '',
    pincode: co.pincode || '',
    emailSignature: co.emailSignature || '',
    // ── Digital assets ──
    faviconImage: co.faviconImage || '',
    stampImage: co.stampImage || '',
    digitalSignatureImage: co.digitalSignatureImage || '',
    // ── Company Master: extended single-source-of-truth fields ──
    legalName: co.legalName || '',
    displayName: co.displayName || '',
    tradeName: co.tradeName || '',
    country: co.country || '',
    landline: co.landline || '',
    corporateAddress: co.corporateAddress || '',
    tanNumber: co.tanNumber || '',
    pfCode: co.pfCode || '',
    esiCode: co.esiCode || '',
    ptaxRegistrationNumber: co.ptaxRegistrationNumber || '',
    msmeNumber: co.msmeNumber || '',
    shopEstablishmentNumber: co.shopEstablishmentNumber || '',
    labourLicenseNumber: co.labourLicenseNumber || '',
    factoryLicenseNumber: co.factoryLicenseNumber || '',
    iecCode: co.iecCode || '',
    isoCertNumber: co.isoCertNumber || '',
    fssaiNumber: co.fssaiNumber || '',
    founderName: co.founderName || '',
    coFounderName: co.coFounderName || '',
    ceoName: co.ceoName || '',
    managingDirector: co.managingDirector || '',
    directors: co.directors || '',
    hrHeadName: co.hrHeadName || '',
    financeHeadName: co.financeHeadName || '',
    authorizedSignatory: co.authorizedSignatory || '',
    signatoryDesignation: co.signatoryDesignation || '',
    bankName: co.bankName || '',
    bankBranch: co.bankBranch || '',
    bankAccountNumber: co.bankAccountNumber || '',
    ifscCode: co.ifscCode || '',
    swiftCode: co.swiftCode || '',
    accountHolderName: co.accountHolderName || '',
    upiId: co.upiId || '',
    salaryCycle: co.salaryCycle || '',
    payrollStartDate: co.payrollStartDate || '',
    financialYearStart: co.financialYearStart || '',
    leaveYearStart: co.leaveYearStart || '',
    defaultCurrency: co.defaultCurrency || 'INR',
    defaultTimeZone: co.defaultTimeZone || 'Asia/Kolkata',
    motto: co.motto || '',
    watermarkText: co.watermarkText || '',
    letterheadImage: co.letterheadImage || '',
    dscImage: co.dscImage || '',
    gstCertificateImage: co.gstCertificateImage || '',
    panCardImage: co.panCardImage || '',
    registrationCertImage: co.registrationCertImage || '',
  });
  const [brandingForm, setBrandingForm] = useState(() => brandingFromCompany(currentCompany));

  // Custom Department List management states
  const [customDepartments, setCustomDepartments] = useState<string[]>([]);
  const [newDeptInput, setNewDeptInput] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState('');

  // Re-sync states when activeCompanyId or company list updates
  useEffect(() => {
    const parts = (currentCompany.phone || '+91 ').split(' ');
    setProfileForm({
      name: currentCompany.name,
      email: currentCompany.adminEmail || '',
      address: currentCompany.billingAddress || '',
      industry: currentCompany.industry,
      companyIndustry: currentCompany.companyIndustry || currentCompany.industry || 'Generic',
      departmentTemplateType: currentCompany.departmentTemplateType || 'Generic',
      inheritParentDepartments: currentCompany.inheritParentDepartments !== false,
    });
    setPhoneCode(parts[0] || '+91');
    setPhoneNum(parts[1] || '');
    setErrors({});

    setPayrollForm({
      pfRate: (currentCompany.pfRate ?? 12).toString(),
      esicRate: (currentCompany.esicRate ?? 3.25).toString(),
      basicPercent: (currentCompany.basicPercent ?? 50).toString(),
      overtimeRate: (currentCompany.overtimeRate ?? 1.5).toString(),
      profTaxRate: (currentCompany.profTaxRate ?? 200).toString(),
    });
    setBrandingForm(brandingFromCompany(currentCompany));

    // Populate customDepartments list from actual database resolution
    setCustomDepartments(getCompanyDepartments(currentCompany.id, companies as any));
  }, [activeCompanyId, currentCompany, companies]);


  // Generic image uploader for any branding asset (logo / favicon / stamp /
  // digital signature). Stores the file as a base64 data URL on brandingForm.
  const handleImageUpload = (field: 'logoImage' | 'faviconImage' | 'stampImage' | 'digitalSignatureImage' | 'letterheadImage' | 'dscImage' | 'gstCertificateImage' | 'panCardImage' | 'registrationCertImage') =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 1024 * 1024) {
        ui.toast.warning('Image size must be less than 1MB to ensure fast loading.');
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        setBrandingForm(prev => ({ ...prev, [field]: base64 }));
      };
      reader.readAsDataURL(file);
    };
  const handleLogoUpload = handleImageUpload('logoImage');

  // ─── Department List Management Actions ───
  const handleAddDepartment = () => {
    if (!newDeptInput.trim()) return;
    if (customDepartments.includes(newDeptInput.trim())) {
      ui.toast.warning('This department already exists.');
      return;
    }
    setCustomDepartments([...customDepartments, newDeptInput.trim()]);
    setNewDeptInput('');
  };

  const handleStartEditDepartment = (index: number, val: string) => {
    setEditingIndex(index);
    setEditingValue(val);
  };

  const handleSaveEditDepartment = (index: number) => {
    if (!editingValue.trim()) return;
    if (customDepartments.includes(editingValue.trim()) && customDepartments[index] !== editingValue.trim()) {
      ui.toast.warning('This department name already exists.');
      return;
    }
    const newList = [...customDepartments];
    newList[index] = editingValue.trim();
    setCustomDepartments(newList);
    setEditingIndex(null);
  };

  const handleRemoveDepartment = async (index: number) => {
    if (await ui.confirm({ message: 'Are you sure you want to remove this department? Employees currently assigned to it will need to be re-allocated.', variant: 'danger', confirmText: 'Remove' })) {
      setCustomDepartments(customDepartments.filter((_, idx) => idx !== index));
    }
  };

  const handleMoveDepartment = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= customDepartments.length) return;

    const newList = [...customDepartments];
    // Swap items
    const temp = newList[index];
    newList[index] = newList[targetIndex];
    newList[targetIndex] = temp;

    setCustomDepartments(newList);
  };

  const handleSaveAll = async () => {
    if (role !== 'Super Admin' && role !== 'Company Head') {
      ui.toast.error('HR operators are not authorized to edit settings.');
      return;
    }

    const nameErr = validateCompanyName(profileForm.name).error;
    const emailErr = validateEmail(profileForm.email).error;
    const phoneErr = validatePhone(phoneNum).error;
    const pfErr = validatePercentage(payrollForm.pfRate, 'PF Rate').error;
    const esicErr = validatePercentage(payrollForm.esicRate, 'ESIC Rate').error;
    const basicErr = validatePercentage(payrollForm.basicPercent, 'Basic Salary Percentage').error;

    if (nameErr || emailErr || phoneErr || pfErr || esicErr || basicErr || !profileForm.address) {
      const missing = [];
      if (!profileForm.address) missing.push('Corporate HQ Full Address');
      if (nameErr) missing.push('Corporate Name');
      if (emailErr) missing.push('Official Support Email');
      if (phoneErr) missing.push('Office Mobile Number');
      
      await ui.alert({ title: 'Error', message: `Please resolve validation errors before saving.\nMissing/Invalid: ${missing.join(', ')}`, variant: 'error' });
      return;
    }

    const payload = {
      name: profileForm.name,
      phone: `${phoneCode} ${phoneNum}`,
      adminEmail: profileForm.email,
      billingAddress: profileForm.address,
      industry: profileForm.industry,

      companyIndustry: profileForm.companyIndustry,
      departmentTemplateType: profileForm.departmentTemplateType,
      inheritParentDepartments: profileForm.inheritParentDepartments,
      customDepartments: customDepartments,

      pfRate: parseFloat(payrollForm.pfRate) || 12,
      esicRate: parseFloat(payrollForm.esicRate) || 3.25,
      basicPercent: parseFloat(payrollForm.basicPercent) || 50,
      overtimeRate: parseFloat(payrollForm.overtimeRate) || 1.5,
      profTaxRate: parseFloat(payrollForm.profTaxRate) || 200,

      logo: brandingForm.logoText,
      logoImage: brandingForm.logoImage,
      primaryColor: brandingForm.primaryColor,
      headerText: brandingForm.headerText,
      footerText: brandingForm.footerText,
      signatureText: brandingForm.signatureText,
      themeStyle: brandingForm.themeStyle as any,
      
      // Preserve entity relationships
      isHeadOffice: currentCompany.isHeadOffice,
      parentCompanyId: currentCompany.parentCompanyId
    };

    try {
      await api.companies.update(currentCompany.id, payload);
      
      if (onRefresh) {
        onRefresh();
      } else {
        const updatedCompanies = companies.map(c => {
          if (c.id === currentCompany.id) {
            return { ...c, ...payload };
          }
          return c;
        });
        onUpdateCompanies(updatedCompanies);
      }
      
      ui.toast.success('Company statutory profiles, templates, and branding configurations updated successfully! Changes immediately active.');
      // Force reload to apply theme changes everywhere globally
      window.location.reload();
    } catch (err) {
      console.error(err);
      ui.toast.error(getApiErrorMessage(err, 'Could not save settings.'));
    }
  };

  const handleColorPreset = (hex: string) => {
    setBrandingForm({ ...brandingForm, primaryColor: hex });
  };

  const { canEdit: canEditModule } = usePermissions();
  const canEdit = canEditModule('settings');
  const isSuperOrHead = (role === 'Super Admin' || role === 'Company Head') && canEdit;

  // Branding edit rights (independent of the Super-Admin-only company write):
  //   Super Admin & Company Head  → always
  //   HR                          → only if granted the settings "edit" permission
  //   Employee / others           → view only
  const canEditBranding =
    role === 'Super Admin' || role === 'Company Head' || (role === 'HR' && canEditModule('settings'));

  // Branding always lives on the TOP-LEVEL company. In a branch workspace,
  // currentCompany is the branch (kind-aware) — use its parent so we never send
  // a colliding branch id to the branding endpoint.
  const brandableCompanyId = (currentCompany as any).parentCompanyId || currentCompany.id;
  const [savingBranding, setSavingBranding] = useState(false);

  const handleSaveBranding = async () => {
    if (!canEditBranding) return;
    // ── Format validation (only non-empty values are checked; optional fields
    //    stay backward-compatible). First failure stops the save with a message. ──
    const checks: [string, ValidationResult][] = [
      ['GST Number', validateGST(brandingForm.gstNumber)],
      ['PAN Number', validatePAN(brandingForm.panNumber)],
      ['CIN Number', validateCIN(brandingForm.cinNumber)],
      ['TAN Number', validateTAN(brandingForm.tanNumber)],
      ['Email', validateEmail(brandingForm.contactEmail)],
      ['Website', validateWebsite(brandingForm.website)],
      ['PIN Code', validatePincode(brandingForm.pincode)],
      ['IFSC Code', validateIFSC(brandingForm.ifscCode)],
      ['PF Establishment Code', validatePFCode(brandingForm.pfCode)],
      ['ESI Employer Code', validateESICode(brandingForm.esiCode)],
    ];
    const firstError = checks.find(([, r]) => !r.isValid);
    if (firstError) { ui.toast.error(`${firstError[0]}: ${firstError[1].error}`); return; }

    setSavingBranding(true);
    try {
      const payload = {
        name: brandingForm.name,
        shortName: brandingForm.shortName,
        tagline: brandingForm.tagline,
        website: brandingForm.website,
        contactEmail: brandingForm.contactEmail,
        contactNumber: brandingForm.contactNumber,
        address: brandingForm.address,
        description: brandingForm.description,
        logo: brandingForm.logoText,
        logoImage: brandingForm.logoImage,
        primaryColor: brandingForm.primaryColor,
        themeStyle: brandingForm.themeStyle,
        headerText: brandingForm.headerText,
        footerText: brandingForm.footerText,
        signatureText: brandingForm.signatureText,
        // Merged profile-identity + digital assets
        companyCode: brandingForm.companyCode,
        registrationNumber: brandingForm.registrationNumber,
        gstNumber: brandingForm.gstNumber,
        panNumber: brandingForm.panNumber,
        cinNumber: brandingForm.cinNumber,
        city: brandingForm.city,
        state: brandingForm.state,
        pincode: brandingForm.pincode,
        emailSignature: brandingForm.emailSignature,
        faviconImage: brandingForm.faviconImage,
        stampImage: brandingForm.stampImage,
        digitalSignatureImage: brandingForm.digitalSignatureImage,
        // ── Company Master: extended single-source-of-truth fields ──
        legalName: brandingForm.legalName,
        displayName: brandingForm.displayName,
        tradeName: brandingForm.tradeName,
        country: brandingForm.country,
        landline: brandingForm.landline,
        corporateAddress: brandingForm.corporateAddress,
        tanNumber: brandingForm.tanNumber,
        pfCode: brandingForm.pfCode,
        esiCode: brandingForm.esiCode,
        ptaxRegistrationNumber: brandingForm.ptaxRegistrationNumber,
        msmeNumber: brandingForm.msmeNumber,
        shopEstablishmentNumber: brandingForm.shopEstablishmentNumber,
        labourLicenseNumber: brandingForm.labourLicenseNumber,
        factoryLicenseNumber: brandingForm.factoryLicenseNumber,
        iecCode: brandingForm.iecCode,
        isoCertNumber: brandingForm.isoCertNumber,
        fssaiNumber: brandingForm.fssaiNumber,
        founderName: brandingForm.founderName,
        coFounderName: brandingForm.coFounderName,
        ceoName: brandingForm.ceoName,
        managingDirector: brandingForm.managingDirector,
        directors: brandingForm.directors,
        hrHeadName: brandingForm.hrHeadName,
        financeHeadName: brandingForm.financeHeadName,
        authorizedSignatory: brandingForm.authorizedSignatory,
        signatoryDesignation: brandingForm.signatoryDesignation,
        bankName: brandingForm.bankName,
        bankBranch: brandingForm.bankBranch,
        bankAccountNumber: brandingForm.bankAccountNumber,
        ifscCode: brandingForm.ifscCode,
        swiftCode: brandingForm.swiftCode,
        accountHolderName: brandingForm.accountHolderName,
        upiId: brandingForm.upiId,
        salaryCycle: brandingForm.salaryCycle,
        payrollStartDate: brandingForm.payrollStartDate,
        financialYearStart: brandingForm.financialYearStart,
        leaveYearStart: brandingForm.leaveYearStart,
        defaultCurrency: brandingForm.defaultCurrency,
        defaultTimeZone: brandingForm.defaultTimeZone,
        motto: brandingForm.motto,
        watermarkText: brandingForm.watermarkText,
        letterheadImage: brandingForm.letterheadImage,
        dscImage: brandingForm.dscImage,
        gstCertificateImage: brandingForm.gstCertificateImage,
        panCardImage: brandingForm.panCardImage,
        registrationCertImage: brandingForm.registrationCertImage,
      };
      await api.companies.updateBranding(String(brandableCompanyId), payload);
      if (onRefresh) onRefresh();
      else onUpdateCompanies(companies.map(c => (String(c.id) === String(brandableCompanyId) ? { ...c, ...payload } as any : c)));
      ui.toast.success('Company branding saved. Logo and name will update across the app.');
      // Reload so the new logo/name/theme propagate to sidebar, header, slips & PDFs.
      window.location.reload();
    } catch (err: any) {
      ui.toast.error(err?.message || 'Failed to save branding.');
    } finally {
      setSavingBranding(false);
    }
  };



  // ── Super Admin → PLATFORM settings only ─────────────────────────────────
  // Company-specific configuration (profile, payroll, branding, departments,
  // roles) is managed INSIDE each company; a Super Admin enters a company
  // (masquerade) to edit it. This guard ensures even a direct /settings URL
  // never exposes a single tenant's config to a platform admin.
  if (role === 'Super Admin') {
    return (
      <div className="space-y-4 font-sans">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Platform Settings</h2>
          <p className="text-xs text-gray-500 mt-0.5">Platform-level configuration for the HRMS SaaS.</p>
        </div>
        <Card>
          <div className="p-6 flex items-start gap-4">
            <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <ShieldCheck size={22} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Company settings are managed per company</h3>
              <p className="text-sm text-gray-500 mt-1 max-w-2xl">
                Corporate profile, payroll &amp; statutory rates, branding, departments and role
                policies are <strong>company-specific</strong>. Open a company from the{' '}
                <strong>Companies</strong> module and choose <strong>Manage</strong> to enter it —
                its Settings become available there. This keeps each tenant's configuration
                isolated from the platform admin view.
              </p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Platform administration</h3>
            <p className="text-sm text-gray-500 max-w-2xl">
              Tenant provisioning and plans live under <strong>Companies</strong> and{' '}
              <strong>SaaS Subscriptions</strong>; user &amp; access control is under{' '}
              <strong>Users</strong>.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 font-sans">
      {/* Header */}
      <div>
        <h2 className="text-base font-semibold text-gray-900">Branding, Policy & Settings Hub</h2>
        <p className="text-xs text-gray-500 mt-0.5">Customize corporate profile details, statutory tax percentages, color templates, and signature policies</p>
      </div>

      {/* Sub Tabs menu */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveSubTab('profile')}
          className={`px-4 py-2 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
            activeSubTab === 'profile' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
        >
          <Building2 size={13} />
          Company Profile &amp; Branding
        </button>
        <button
          onClick={() => setActiveSubTab('payroll')}
          className={`px-4 py-2 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
            activeSubTab === 'payroll' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
        >
          <BadgeCent size={13} />
          Statutory Payroll Rules
        </button>
        <button
          onClick={() => setActiveSubTab('departments')}
          className={`px-4 py-2 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
            activeSubTab === 'departments' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
        >
          <Briefcase size={13} />
          Manage Departments
        </button>
        {role !== 'Employee' && (
          <button
            onClick={() => setActiveSubTab('roles')}
            className={`px-4 py-2 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
              activeSubTab === 'roles' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <ShieldCheck size={13} />
            User Roles & Permissions
          </button>
        )}
        {(role === 'Company Head' || role === 'HR') && (
          <button
            onClick={() => setActiveSubTab('labour')}
            className={`px-4 py-2 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
              activeSubTab === 'labour' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <Scale size={13} />
            Labour Compliance
          </button>
        )}
      </div>

      {/* User Roles & Permissions — full width (its matrix needs the room) */}
      {activeSubTab === 'roles' && (
        <PermissionManager role={role} />
      )}

      {/* Labour Compliance — full width (its own tabs + tables) */}
      {activeSubTab === 'labour' && (
        <LabourCompliance
          companyId={String((currentCompany as any).parentCompanyId || currentCompany.id)}
          branchNames={Array.from(new Set(
            companies
              .filter(c => String((c as any).parentCompanyId) === String((currentCompany as any).parentCompanyId || currentCompany.id))
              .map(c => (c as any).branchName || c.name)
              .filter(Boolean)
          ))}
          canEdit={canEditBranding}
          performedBy={role}
        />
      )}

      {/* Layout panels */}
      {activeSubTab !== 'roles' && activeSubTab !== 'labour' && (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Dynamic Editor Panel */}
        <div className="lg:col-span-2 space-y-4">

          {/* Legacy profile card — superseded by the merged "Company Profile &
              Branding" card below. Disabled (never rendered) but retained so the
              profileForm industry/department state stays intact for the
              Departments tab and the statutory Apply save. */}
          {false && (
            <Card>
              <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-3 pb-1.5 border-b border-gray-100">
                Corporate Address & Details
              </h3>
              <div className="space-y-3">
                <Input
                  label="Registered Corporate Name *"
                  disabled={!isSuperOrHead}
                  value={profileForm.name}
                  onChange={e => {
                    const clean = e.target.value.replace(/[^a-zA-Z0-9\s&.]/g, '');
                    setProfileForm({ ...profileForm, name: clean });
                    setErrors(prev => ({ ...prev, name: validateCompanyName(clean).error }));
                  }}
                  error={errors.name}
                  success={profileForm.name !== '' && !errors.name}
                />
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
                  <Input
                    label="Official Support Email *"
                    disabled={!isSuperOrHead}
                    value={profileForm.email}
                    onChange={e => {
                      const val = e.target.value;
                      setProfileForm({ ...profileForm, email: val });
                      setErrors(prev => ({ ...prev, email: validateEmail(val).error }));
                    }}
                    error={errors.email}
                    success={profileForm.email !== '' && !errors.email}
                  />

                  <PhoneInput
                    label="Office Mobile Number *"
                    disabled={!isSuperOrHead}
                    countryCode={phoneCode}
                    mobileNumber={phoneNum}
                    onChangeCountry={code => {
                      setPhoneCode(code);
                      const err = validatePhone(phoneNum, code).error;
                      setErrors(prevErrors => ({ ...prevErrors, phoneNum: err }));
                    }}
                    onChangeNumber={num => {
                      setPhoneNum(num);
                      const err = validatePhone(num, phoneCode).error;
                      setErrors(prevErrors => ({ ...prevErrors, phoneNum: err }));
                    }}
                    error={errors.phoneNum}
                    success={phoneNum !== '' && !errors.phoneNum}
                  />
                </div>

                <Textarea
                  label="Corporate HQ Full Address *"
                  disabled={!isSuperOrHead}
                  placeholder="Street, City, State, ZIP..."
                  value={profileForm.address}
                  onChange={e => setProfileForm({ ...profileForm, address: e.target.value })}
                />
                <Select
                  label="Industry Sector"
                  disabled={!isSuperOrHead}
                  value={profileForm.industry}
                  onChange={e => {
                    const val = e.target.value;
                    let templateVal = 'Generic';
                    if (val === 'Healthcare') templateVal = 'Healthcare';
                    else if (val === 'IT Company') templateVal = 'IT Company';
                    else if (val === 'Manufacturing') templateVal = 'Manufacturing';
                    else if (val === 'Education') templateVal = 'Education';
                    else if (val === 'Retail') templateVal = 'Retail';

                    setProfileForm({ 
                      ...profileForm, 
                      industry: val, 
                      companyIndustry: val,
                      departmentTemplateType: templateVal 
                    });
                  }}
                  options={[
                    { value: 'Healthcare', label: 'Healthcare / Hospitals' },
                    { value: 'IT Company', label: 'IT Company / Software' },
                    { value: 'Manufacturing', label: 'Manufacturing & Plant' },
                    { value: 'Education', label: 'Education & Academic' },
                    { value: 'Retail', label: 'Retail & Store Operations' },
                    { value: 'Generic', label: 'Generic Corporate' }
                  ]}
                />

                <Select
                  label="Statutory Department Template Preset"
                  disabled={!isSuperOrHead}
                  value={profileForm.departmentTemplateType}
                  onChange={e => setProfileForm({ ...profileForm, departmentTemplateType: e.target.value })}
                  options={[
                    { value: 'Healthcare', label: 'Healthcare / Hospital Template' },
                    { value: 'IT Company', label: 'IT Company / Tech Template' },
                    { value: 'Manufacturing', label: 'Manufacturing / Factory Template' },
                    { value: 'Education', label: 'Education / Academic Template' },
                    { value: 'Retail', label: 'Retail / Store Operations Template' },
                    { value: 'Generic', label: 'Generic / Default Corporate Template' }
                  ]}
                />

                {currentCompany.parentCompanyId && (
                  <div className="flex items-center gap-2 mt-2 pt-1">
                    <input
                      type="checkbox"
                      id="inheritParentDepartments"
                      checked={profileForm.inheritParentDepartments}
                      disabled={!isSuperOrHead}
                      onChange={e => setProfileForm({ ...profileForm, inheritParentDepartments: e.target.checked })}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                    />
                    <label htmlFor="inheritParentDepartments" className="text-xs font-semibold text-gray-700 cursor-pointer">
                      Inherit parent company department structure
                    </label>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* TAB 2: Payroll Settings Engine */}
          {activeSubTab === 'payroll' && (
            <PayrollComplianceEngine 
              currentCompany={currentCompany} 
              isSuperOrHead={isSuperOrHead} 
              onSave={(payload) => {
                setPayrollForm({
                  ...payrollForm,
                  pfRate: payload.pfRate?.toString() || payrollForm.pfRate,
                  esicRate: payload.esicRate?.toString() || payrollForm.esicRate,
                  profTaxRate: payload.profTaxRate?.toString() || payrollForm.profTaxRate,
                  overtimeRate: payload.overtimeRate?.toString() || payrollForm.overtimeRate
                });
              }}
            />
          )}

          {/* MERGED TAB: Company Profile & Branding */}
          {activeSubTab === 'profile' && (
            <Card>
              <div className="flex items-center justify-between mb-3 pb-1.5 border-b border-gray-100">
                <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                  Company Profile &amp; Branding
                </h3>
                {!canEditBranding && <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">View Only</span>}
              </div>

              {/* ── SECTION 1 · Company Profile ── */}
              <div className="mb-5">
                <label className="block text-[11px] font-extrabold text-blue-600 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Building2 size={13} /> Company Profile</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Input label="Company Name" disabled={!canEditBranding} value={brandingForm.name} onChange={e => setBrandingForm({ ...brandingForm, name: e.target.value })} placeholder="e.g. Vishv Enterprise Pvt Ltd" />
                  <Input label="Company Code" disabled={!canEditBranding} value={brandingForm.companyCode} onChange={e => setBrandingForm({ ...brandingForm, companyCode: e.target.value })} placeholder="e.g. VE" />
                  <Input label="Registration Number" disabled={!canEditBranding} value={brandingForm.registrationNumber} onChange={e => setBrandingForm({ ...brandingForm, registrationNumber: e.target.value })} placeholder="e.g. U12345GJ2020PTC000000" />
                  <Input label="GST Number" disabled={!canEditBranding} value={brandingForm.gstNumber} onChange={e => setBrandingForm({ ...brandingForm, gstNumber: e.target.value.toUpperCase() })} placeholder="e.g. 24ABCDE1234F1Z5" />
                  <Input label="PAN Number" disabled={!canEditBranding} value={brandingForm.panNumber} onChange={e => setBrandingForm({ ...brandingForm, panNumber: e.target.value.toUpperCase() })} placeholder="e.g. ABCDE1234F" />
                  <Input label="CIN Number" disabled={!canEditBranding} value={brandingForm.cinNumber} onChange={e => setBrandingForm({ ...brandingForm, cinNumber: e.target.value.toUpperCase() })} placeholder="e.g. U72200GJ2020PTC000000" />
                  <Input label="Email" disabled={!canEditBranding} value={brandingForm.contactEmail} onChange={e => setBrandingForm({ ...brandingForm, contactEmail: e.target.value })} placeholder="e.g. info@vishv.com" />
                  <Input label="Phone Number" disabled={!canEditBranding} value={brandingForm.contactNumber} onChange={e => setBrandingForm({ ...brandingForm, contactNumber: e.target.value })} placeholder="e.g. +91 9876543210" />
                  <Input label="Website" disabled={!canEditBranding} value={brandingForm.website} onChange={e => setBrandingForm({ ...brandingForm, website: e.target.value })} placeholder="e.g. www.vishv.com" />
                  <Input label="Company Short Name" disabled={!canEditBranding} value={brandingForm.shortName} onChange={e => setBrandingForm({ ...brandingForm, shortName: e.target.value })} placeholder="e.g. Vishv" />
                  <Input label="State" disabled={!canEditBranding} value={brandingForm.state} onChange={e => setBrandingForm({ ...brandingForm, state: e.target.value })} placeholder="e.g. Gujarat" />
                  <Input label="City" disabled={!canEditBranding} value={brandingForm.city} onChange={e => setBrandingForm({ ...brandingForm, city: e.target.value })} placeholder="e.g. Ahmedabad" />
                  <Input label="Pincode" disabled={!canEditBranding} value={brandingForm.pincode} onChange={e => setBrandingForm({ ...brandingForm, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) })} placeholder="e.g. 380001" />
                  <Input label="Company Tagline" disabled={!canEditBranding} value={brandingForm.tagline} onChange={e => setBrandingForm({ ...brandingForm, tagline: e.target.value })} placeholder="e.g. Excellence in Service" />
                  <div className="md:col-span-2">
                    <Input label="Address" disabled={!canEditBranding} value={brandingForm.address} onChange={e => setBrandingForm({ ...brandingForm, address: e.target.value })} placeholder="e.g. Ahmedabad, Gujarat, India" />
                  </div>
                  <div className="md:col-span-2">
                    <Textarea label="Company Description" disabled={!canEditBranding} value={brandingForm.description} onChange={e => setBrandingForm({ ...brandingForm, description: e.target.value })} placeholder="Short description of the company…" />
                  </div>
                </div>
              </div>

              {/* ── SECTION 1B · Extended Identity & Contact ── */}
              <div className="mb-5">
                <label className="block text-[11px] font-extrabold text-blue-600 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Building2 size={13} /> Extended Identity &amp; Contact</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Input label="Legal Name" disabled={!canEditBranding} value={brandingForm.legalName} onChange={e => setBrandingForm({ ...brandingForm, legalName: e.target.value })} placeholder="Registered legal entity name" />
                  <Input label="Display Name" disabled={!canEditBranding} value={brandingForm.displayName} onChange={e => setBrandingForm({ ...brandingForm, displayName: e.target.value })} placeholder="Name shown on screens" />
                  <Input label="Trade Name / Brand" disabled={!canEditBranding} value={brandingForm.tradeName} onChange={e => setBrandingForm({ ...brandingForm, tradeName: e.target.value })} placeholder="Doing-business-as name" />
                  <Input label="Country" disabled={!canEditBranding} value={brandingForm.country} onChange={e => setBrandingForm({ ...brandingForm, country: e.target.value })} placeholder="e.g. India" />
                  <Input label="Landline" disabled={!canEditBranding} value={brandingForm.landline} onChange={e => setBrandingForm({ ...brandingForm, landline: e.target.value })} placeholder="e.g. 079-12345678" />
                  <Input label="Company Motto" disabled={!canEditBranding} value={brandingForm.motto} onChange={e => setBrandingForm({ ...brandingForm, motto: e.target.value })} placeholder="e.g. Building the future" />
                  <div className="md:col-span-2">
                    <Input label="Corporate Office Address" disabled={!canEditBranding} value={brandingForm.corporateAddress} onChange={e => setBrandingForm({ ...brandingForm, corporateAddress: e.target.value })} placeholder="Head-office / corporate address" />
                  </div>
                </div>
              </div>

              {/* ── SECTION 1C · Statutory & Registration ── */}
              <div className="mb-5">
                <label className="block text-[11px] font-extrabold text-blue-600 uppercase tracking-wider mb-2 flex items-center gap-1.5"><ShieldCheck size={13} /> Statutory &amp; Registration</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Input label="TAN Number" disabled={!canEditBranding} value={brandingForm.tanNumber} onChange={e => setBrandingForm({ ...brandingForm, tanNumber: e.target.value.toUpperCase() })} placeholder="e.g. ABCD12345E" />
                  <Input label="PF Establishment Code" disabled={!canEditBranding} value={brandingForm.pfCode} onChange={e => setBrandingForm({ ...brandingForm, pfCode: e.target.value.toUpperCase() })} placeholder="e.g. GJ/AHD/1234567/000" />
                  <Input label="ESI Employer Code" disabled={!canEditBranding} value={brandingForm.esiCode} onChange={e => setBrandingForm({ ...brandingForm, esiCode: e.target.value })} placeholder="17-digit ESI code" />
                  <Input label="Professional Tax Reg. No." disabled={!canEditBranding} value={brandingForm.ptaxRegistrationNumber} onChange={e => setBrandingForm({ ...brandingForm, ptaxRegistrationNumber: e.target.value })} placeholder="PT registration number" />
                  <Input label="MSME / Udyam Number" disabled={!canEditBranding} value={brandingForm.msmeNumber} onChange={e => setBrandingForm({ ...brandingForm, msmeNumber: e.target.value.toUpperCase() })} placeholder="e.g. UDYAM-GJ-00-0000000" />
                  <Input label="Shop & Establishment Reg." disabled={!canEditBranding} value={brandingForm.shopEstablishmentNumber} onChange={e => setBrandingForm({ ...brandingForm, shopEstablishmentNumber: e.target.value })} placeholder="Registration number" />
                  <Input label="Labour License Number" disabled={!canEditBranding} value={brandingForm.labourLicenseNumber} onChange={e => setBrandingForm({ ...brandingForm, labourLicenseNumber: e.target.value })} placeholder="Labour license number" />
                  <Input label="Factory License Number" disabled={!canEditBranding} value={brandingForm.factoryLicenseNumber} onChange={e => setBrandingForm({ ...brandingForm, factoryLicenseNumber: e.target.value })} placeholder="Factory license number" />
                  <Input label="IEC Code (Import/Export)" disabled={!canEditBranding} value={brandingForm.iecCode} onChange={e => setBrandingForm({ ...brandingForm, iecCode: e.target.value.toUpperCase() })} placeholder="10-char IEC" />
                  <Input label="ISO Certification Number" disabled={!canEditBranding} value={brandingForm.isoCertNumber} onChange={e => setBrandingForm({ ...brandingForm, isoCertNumber: e.target.value })} placeholder="e.g. ISO 9001:2015 — cert no." />
                  <Input label="FSSAI License" disabled={!canEditBranding} value={brandingForm.fssaiNumber} onChange={e => setBrandingForm({ ...brandingForm, fssaiNumber: e.target.value })} placeholder="14-digit FSSAI (if applicable)" />
                </div>
              </div>

              {/* ── SECTION 1D · Management ── */}
              <div className="mb-5">
                <label className="block text-[11px] font-extrabold text-blue-600 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Users size={13} /> Management &amp; Signatory</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Input label="Founder Name" disabled={!canEditBranding} value={brandingForm.founderName} onChange={e => setBrandingForm({ ...brandingForm, founderName: e.target.value })} placeholder="Founder full name" />
                  <Input label="Co-Founder Name" disabled={!canEditBranding} value={brandingForm.coFounderName} onChange={e => setBrandingForm({ ...brandingForm, coFounderName: e.target.value })} placeholder="Co-founder full name" />
                  <Input label="CEO Name" disabled={!canEditBranding} value={brandingForm.ceoName} onChange={e => setBrandingForm({ ...brandingForm, ceoName: e.target.value })} placeholder="Chief Executive Officer" />
                  <Input label="Managing Director" disabled={!canEditBranding} value={brandingForm.managingDirector} onChange={e => setBrandingForm({ ...brandingForm, managingDirector: e.target.value })} placeholder="Managing Director" />
                  <Input label="HR Head" disabled={!canEditBranding} value={brandingForm.hrHeadName} onChange={e => setBrandingForm({ ...brandingForm, hrHeadName: e.target.value })} placeholder="Head of HR" />
                  <Input label="Finance Head" disabled={!canEditBranding} value={brandingForm.financeHeadName} onChange={e => setBrandingForm({ ...brandingForm, financeHeadName: e.target.value })} placeholder="Head of Finance" />
                  <Input label="Authorized Signatory" disabled={!canEditBranding} value={brandingForm.authorizedSignatory} onChange={e => setBrandingForm({ ...brandingForm, authorizedSignatory: e.target.value })} placeholder="Name on documents" />
                  <Input label="Designation of Signatory" disabled={!canEditBranding} value={brandingForm.signatoryDesignation} onChange={e => setBrandingForm({ ...brandingForm, signatoryDesignation: e.target.value })} placeholder="e.g. Director" />
                  <div className="md:col-span-2">
                    <Input label="Director Name(s)" disabled={!canEditBranding} value={brandingForm.directors} onChange={e => setBrandingForm({ ...brandingForm, directors: e.target.value })} placeholder="Comma-separated director names" />
                  </div>
                </div>
              </div>

              {/* ── SECTION 1E · Banking ── */}
              <div className="mb-5">
                <label className="block text-[11px] font-extrabold text-blue-600 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Landmark size={13} /> Banking Details</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Input label="Bank Name" disabled={!canEditBranding} value={brandingForm.bankName} onChange={e => setBrandingForm({ ...brandingForm, bankName: e.target.value })} placeholder="e.g. HDFC Bank" />
                  <Input label="Bank Branch" disabled={!canEditBranding} value={brandingForm.bankBranch} onChange={e => setBrandingForm({ ...brandingForm, bankBranch: e.target.value })} placeholder="Branch name" />
                  <Input label="Account Number" disabled={!canEditBranding} value={brandingForm.bankAccountNumber} onChange={e => setBrandingForm({ ...brandingForm, bankAccountNumber: e.target.value.replace(/[^0-9]/g, '') })} placeholder="Bank account number" />
                  <Input label="IFSC Code" disabled={!canEditBranding} value={brandingForm.ifscCode} onChange={e => setBrandingForm({ ...brandingForm, ifscCode: e.target.value.toUpperCase() })} placeholder="e.g. HDFC0001234" />
                  <Input label="SWIFT Code" disabled={!canEditBranding} value={brandingForm.swiftCode} onChange={e => setBrandingForm({ ...brandingForm, swiftCode: e.target.value.toUpperCase() })} placeholder="For international transfers" />
                  <Input label="Account Holder Name" disabled={!canEditBranding} value={brandingForm.accountHolderName} onChange={e => setBrandingForm({ ...brandingForm, accountHolderName: e.target.value })} placeholder="As per bank records" />
                  <Input label="UPI ID (optional)" disabled={!canEditBranding} value={brandingForm.upiId} onChange={e => setBrandingForm({ ...brandingForm, upiId: e.target.value })} placeholder="e.g. company@okhdfcbank" />
                </div>
              </div>

              {/* ── SECTION 1F · Payroll & Statutory Cycle ── */}
              <div className="mb-5">
                <label className="block text-[11px] font-extrabold text-blue-600 uppercase tracking-wider mb-2 flex items-center gap-1.5"><CalendarClock size={13} /> Payroll &amp; Statutory Cycle</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Select label="Salary Cycle" disabled={!canEditBranding} value={brandingForm.salaryCycle || ''} onChange={e => setBrandingForm({ ...brandingForm, salaryCycle: e.target.value })}
                    options={[{ value: '', label: 'Select…' }, { value: 'Monthly', label: 'Monthly' }, { value: 'Bi-Weekly', label: 'Bi-Weekly' }, { value: 'Weekly', label: 'Weekly' }]} />
                  <Input label="Payroll Start Date" disabled={!canEditBranding} value={brandingForm.payrollStartDate} onChange={e => setBrandingForm({ ...brandingForm, payrollStartDate: e.target.value })} placeholder="e.g. 1 (day of month)" />
                  <Input label="Financial Year Start" disabled={!canEditBranding} value={brandingForm.financialYearStart} onChange={e => setBrandingForm({ ...brandingForm, financialYearStart: e.target.value })} placeholder="e.g. April" />
                  <Input label="Leave Year Start" disabled={!canEditBranding} value={brandingForm.leaveYearStart} onChange={e => setBrandingForm({ ...brandingForm, leaveYearStart: e.target.value })} placeholder="e.g. January" />
                  <Select label="Default Currency" disabled={!canEditBranding} value={brandingForm.defaultCurrency || 'INR'} onChange={e => setBrandingForm({ ...brandingForm, defaultCurrency: e.target.value })}
                    options={[{ value: 'INR', label: 'INR (₹)' }, { value: 'USD', label: 'USD ($)' }, { value: 'EUR', label: 'EUR (€)' }, { value: 'GBP', label: 'GBP (£)' }, { value: 'AED', label: 'AED (د.إ)' }]} />
                  <Input label="Default Time Zone" disabled={!canEditBranding} value={brandingForm.defaultTimeZone} onChange={e => setBrandingForm({ ...brandingForm, defaultTimeZone: e.target.value })} placeholder="e.g. Asia/Kolkata" />
                  <div className="md:col-span-2">
                    <Input label="Document Watermark Text" disabled={!canEditBranding} value={brandingForm.watermarkText} onChange={e => setBrandingForm({ ...brandingForm, watermarkText: e.target.value })} placeholder="e.g. CONFIDENTIAL (shown faint on documents)" />
                  </div>
                </div>
              </div>

              {/* ── SECTION 1G · Statutory Documents & Digital Assets ── */}
              <div className="mb-5">
                <label className="block text-[11px] font-extrabold text-blue-600 uppercase tracking-wider mb-2 flex items-center gap-1.5"><UploadCloud size={13} /> Statutory Documents &amp; Digital Assets</label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {([
                    { field: 'letterheadImage', label: 'Letterhead' },
                    { field: 'dscImage', label: 'Digital Signature Cert.' },
                    { field: 'gstCertificateImage', label: 'GST Certificate' },
                    { field: 'panCardImage', label: 'PAN Copy' },
                    { field: 'registrationCertImage', label: 'Registration Cert.' },
                    { field: 'stampImage', label: 'Company Seal / Stamp' },
                  ] as const).map(({ field, label }) => (
                    <div key={field} className="border border-slate-200 rounded-xl p-2.5 flex flex-col items-center gap-1.5 bg-slate-50/60">
                      <div className="w-14 h-14 rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center bg-white overflow-hidden">
                        {brandingForm[field] ? <img src={brandingForm[field]} alt={label} className="w-full h-full object-contain p-1" /> : <UploadCloud size={15} className="text-slate-400" />}
                      </div>
                      <span className="text-[10px] font-semibold text-slate-600 text-center leading-tight">{label}</span>
                      {canEditBranding && (
                        <label className="cursor-pointer text-[10px] font-bold text-blue-600 hover:underline">
                          {brandingForm[field] ? 'Replace' : 'Upload'}
                          <input type="file" accept=".png,.jpg,.jpeg,.svg" className="hidden" onChange={handleImageUpload(field)} />
                        </label>
                      )}
                      {canEditBranding && brandingForm[field] && (
                        <button type="button" onClick={() => setBrandingForm(p => ({ ...p, [field]: '' }))} className="text-[9px] text-rose-600 font-bold hover:underline">Remove</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* ── SECTION 2 · Branding & Identity ── */}
              <label className="block text-[11px] font-extrabold text-blue-600 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Palette size={13} /> Branding &amp; Identity</label>

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Company Logo Identifier *"
                    disabled={!canEditBranding}
                    placeholder="e.g. TN (Max 3 letters)"
                    value={brandingForm.logoText}
                    onChange={e => setBrandingForm({ ...brandingForm, logoText: e.target.value.toUpperCase().slice(0, 3) })}
                  />
                <div className="pt-3 pb-2 border-t border-slate-800/60 mt-2">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Company Brand Logo (Image) *</label>
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-xl border-2 border-dashed border-slate-700/60 hover:border-blue-500/60 flex items-center justify-center bg-slate-900/40 hover:bg-slate-800/60 overflow-hidden relative group transition-all shadow-md">
                      {brandingForm.logoImage ? (
                        <img src={brandingForm.logoImage} alt="Brand Logo" className="w-full h-full object-contain p-1" />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-slate-500 group-hover:text-blue-400 transition-colors">
                          <UploadCloud size={16} className="mb-0.5 opacity-60 group-hover:opacity-100" />
                          <span className="text-[7px] font-bold uppercase tracking-wider">Upload</span>
                        </div>
                      )}
                      {canEditBranding && (
                        <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-[2px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <label className="cursor-pointer p-2 w-full h-full flex flex-col items-center justify-center">
                            <UploadCloud size={14} className="text-white mb-0.5" />
                            <span className="text-[7px] text-white font-bold uppercase tracking-wider">Change</span>
                            <input type="file" accept=".png,.jpg,.jpeg,.svg" className="hidden" onChange={handleLogoUpload} />
                          </label>
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-slate-200">Upload Premium Visual Logo</p>
                      <p className="text-[10px] text-slate-400 mt-1">Recommended: Transparent PNG or SVG. Max size: 1MB.</p>
                      {canEditBranding && brandingForm.logoImage && (
                        <button onClick={() => setBrandingForm(p => ({ ...p, logoImage: '' }))} type="button" className="text-[10px] text-rose-600 font-bold mt-1.5 hover:underline">
                          Delete / Remove Logo
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="pt-3 pb-2 border-t border-slate-800/60 mt-2">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Company Icon / Favicon</label>
                  <div className="flex items-center gap-3">
                    <div className="w-16 h-16 rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center bg-slate-50 overflow-hidden">
                      {brandingForm.faviconImage ? <img src={brandingForm.faviconImage} alt="Favicon" className="w-full h-full object-contain p-1" /> : <UploadCloud size={16} className="text-slate-400" />}
                    </div>
                    <div className="flex-1">
                      {canEditBranding && <label className="cursor-pointer text-[11px] font-semibold text-blue-600 hover:underline">Upload Favicon<input type="file" accept=".png,.jpg,.jpeg,.svg,.ico" className="hidden" onChange={handleImageUpload('faviconImage')} /></label>}
                      <p className="text-[10px] text-slate-400 mt-1">Square PNG/ICO recommended · Max 1MB.</p>
                      {canEditBranding && brandingForm.faviconImage && <button type="button" onClick={() => setBrandingForm(p => ({ ...p, faviconImage: '' }))} className="text-[10px] text-rose-600 font-bold hover:underline block mt-0.5">Remove</button>}
                    </div>
                  </div>
                </div>

                  <Select
                    label="Document Theme Layout"
                    disabled={!canEditBranding}
                    value={brandingForm.themeStyle}
                    onChange={e => setBrandingForm({ ...brandingForm, themeStyle: e.target.value as any })}
                    options={[
                      { value: 'Modern', label: 'Modern (Minimal Border)' },
                      { value: 'Classic', label: 'Classic (Formal Columns)' },
                      { value: 'Elegant', label: 'Elegant (Double Header Bar)' },
                      { value: 'Minimalist', label: 'Minimalist (Clean Page)' }
                    ]}
                  />
                </div>

                {/* Brand color presets */}
                {canEditBranding && (
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Branding Primary Color Preset *</label>
                    <div className="flex flex-wrap gap-2.5 items-center">
                      <button onClick={() => handleColorPreset('#3b82f6')} type="button" className="w-6 h-6 bg-blue-500 rounded border border-white shadow-sm hover:scale-105 transition-transform" title="Vibrant Blue" />
                      <button onClick={() => handleColorPreset('#0f766e')} type="button" className="w-6 h-6 bg-teal-700 rounded border border-white shadow-sm hover:scale-105 transition-transform" title="Financial Teal" />
                      <button onClick={() => handleColorPreset('#65a30d')} type="button" className="w-6 h-6 bg-lime-600 rounded border border-white shadow-sm hover:scale-105 transition-transform" title="Medicare Green" />
                      <button onClick={() => handleColorPreset('#ea580c')} type="button" className="w-6 h-6 bg-orange-600 rounded border border-white shadow-sm hover:scale-105 transition-transform" title="Construct Orange" />
                      <button onClick={() => handleColorPreset('#e11d48')} type="button" className="w-6 h-6 bg-rose-600 rounded border border-white shadow-sm hover:scale-105 transition-transform" title="Automotive Rose" />
                      <button onClick={() => handleColorPreset('#4f46e5')} type="button" className="w-6 h-6 bg-indigo-600 rounded border border-white shadow-sm hover:scale-105 transition-transform" title="Deep Indigo" />
                      
                      <div className="ml-2 flex items-center gap-1.5">
                        <span className="text-[10px] text-gray-400">Or Hex:</span>
                        <input
                          type="text"
                          value={brandingForm.primaryColor}
                          onChange={e => setBrandingForm({ ...brandingForm, primaryColor: e.target.value })}
                          className="w-20 px-1 py-0.5 border text-xs font-mono rounded"
                        />
                      </div>
                    </div>
                  </div>
                )}

                <Input
                  label="Document Header Corporate Text *"
                  disabled={!canEditBranding}
                  placeholder="e.g. TECHNOVA SOLUTIONS PRIVATE LIMITED"
                  value={brandingForm.headerText}
                  onChange={e => setBrandingForm({ ...brandingForm, headerText: e.target.value })}
                />

                <Textarea
                  label="Document Footer Corporate Text *"
                  disabled={!canEditBranding}
                  placeholder="TechNova Towers, Delhi · Confidential Document · www.technova.in"
                  value={brandingForm.footerText}
                  onChange={e => setBrandingForm({ ...brandingForm, footerText: e.target.value })}
                />

                <Textarea
                  label="Email Signature"
                  disabled={!canEditBranding}
                  placeholder="Best regards,&#10;Vishv Enterprise · info@vishv.com · www.vishv.com"
                  value={brandingForm.emailSignature}
                  onChange={e => setBrandingForm({ ...brandingForm, emailSignature: e.target.value })}
                />

                {/* ── SECTION 3 · Digital Assets ── */}
                <div className="pt-3 mt-2 border-t border-gray-100">
                  <label className="block text-[11px] font-extrabold text-blue-600 uppercase tracking-wider mb-2">Digital Assets</label>

                  <Input
                    label="Legal Signature Line Text *"
                    disabled={!canEditBranding}
                    placeholder="e.g. Vikram Singh, Operations Director"
                    value={brandingForm.signatureText}
                    onChange={e => setBrandingForm({ ...brandingForm, signatureText: e.target.value })}
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Company Stamp</label>
                      <div className="flex items-center gap-3">
                        <div className="w-16 h-16 rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center bg-slate-50 overflow-hidden">
                          {brandingForm.stampImage ? <img src={brandingForm.stampImage} alt="Stamp" className="w-full h-full object-contain p-1" /> : <UploadCloud size={16} className="text-slate-400" />}
                        </div>
                        <div className="flex-1">
                          {canEditBranding && <label className="cursor-pointer text-[11px] font-semibold text-blue-600 hover:underline">Upload Stamp<input type="file" accept=".png,.jpg,.jpeg,.svg" className="hidden" onChange={handleImageUpload('stampImage')} /></label>}
                          <p className="text-[10px] text-slate-400 mt-1">Transparent PNG · Max 1MB.</p>
                          {canEditBranding && brandingForm.stampImage && <button type="button" onClick={() => setBrandingForm(p => ({ ...p, stampImage: '' }))} className="text-[10px] text-rose-600 font-bold hover:underline block mt-0.5">Remove</button>}
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Digital Signature</label>
                      <div className="flex items-center gap-3">
                        <div className="w-16 h-16 rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center bg-slate-50 overflow-hidden">
                          {brandingForm.digitalSignatureImage ? <img src={brandingForm.digitalSignatureImage} alt="Digital Signature" className="w-full h-full object-contain p-1" /> : <UploadCloud size={16} className="text-slate-400" />}
                        </div>
                        <div className="flex-1">
                          {canEditBranding && <label className="cursor-pointer text-[11px] font-semibold text-blue-600 hover:underline">Upload Signature<input type="file" accept=".png,.jpg,.jpeg,.svg" className="hidden" onChange={handleImageUpload('digitalSignatureImage')} /></label>}
                          <p className="text-[10px] text-slate-400 mt-1">Transparent PNG · Max 1MB.</p>
                          {canEditBranding && brandingForm.digitalSignatureImage && <button type="button" onClick={() => setBrandingForm(p => ({ ...p, digitalSignatureImage: '' }))} className="text-[10px] text-rose-600 font-bold hover:underline block mt-0.5">Remove</button>}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {canEditBranding && (
                <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-gray-100">
                  <span className="text-[10px] text-slate-400 mr-auto">Saves to database · updates company profile, logo, name &amp; theme across the app</span>
                  <Button onClick={handleSaveBranding} loading={savingBranding}>Save Company Profile &amp; Branding</Button>
                </div>
              )}
            </Card>
          )}

          {/* TAB 4: Manage Departments */}
          {activeSubTab === 'departments' && (
            <Card>
              <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-1 pb-1.5 border-b border-gray-100 flex items-center gap-1.5">
                <Briefcase size={14} className="text-blue-600" />
                Custom Corporate Department Management
              </h3>
              <p className="text-xs text-gray-550 mb-4 leading-relaxed">
                Add, rename, delete, and change the ordering of your statutory department list. Be sure to click "Apply Company Statutory & Branding Settings" at the bottom to save your edits to the system.
              </p>

              {/* Industry & department template preset (moved here from the old
                  Company Profile tab — these drive the department structure). */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                <Select
                  label="Industry Sector"
                  disabled={!isSuperOrHead}
                  value={profileForm.industry}
                  onChange={e => {
                    const val = e.target.value;
                    let templateVal = 'Generic';
                    if (val === 'Healthcare') templateVal = 'Healthcare';
                    else if (val === 'IT Company') templateVal = 'IT Company';
                    else if (val === 'Manufacturing') templateVal = 'Manufacturing';
                    else if (val === 'Education') templateVal = 'Education';
                    else if (val === 'Retail') templateVal = 'Retail';
                    setProfileForm({ ...profileForm, industry: val, companyIndustry: val, departmentTemplateType: templateVal });
                  }}
                  options={[
                    { value: 'Healthcare', label: 'Healthcare / Hospitals' },
                    { value: 'IT Company', label: 'IT Company / Software' },
                    { value: 'Manufacturing', label: 'Manufacturing & Plant' },
                    { value: 'Education', label: 'Education & Academic' },
                    { value: 'Retail', label: 'Retail & Store Operations' },
                    { value: 'Generic', label: 'Generic Corporate' }
                  ]}
                />
                <Select
                  label="Statutory Department Template Preset"
                  disabled={!isSuperOrHead}
                  value={profileForm.departmentTemplateType}
                  onChange={e => setProfileForm({ ...profileForm, departmentTemplateType: e.target.value })}
                  options={[
                    { value: 'Healthcare', label: 'Healthcare / Hospital Template' },
                    { value: 'IT Company', label: 'IT Company / Tech Template' },
                    { value: 'Manufacturing', label: 'Manufacturing / Factory Template' },
                    { value: 'Education', label: 'Education / Academic Template' },
                    { value: 'Retail', label: 'Retail / Store Operations Template' },
                    { value: 'Generic', label: 'Generic / Default Corporate Template' }
                  ]}
                />
                {currentCompany.parentCompanyId && (
                  <div className="flex items-center gap-2 md:col-span-2">
                    <input
                      type="checkbox"
                      id="inheritParentDepartments"
                      checked={profileForm.inheritParentDepartments}
                      disabled={!isSuperOrHead}
                      onChange={e => setProfileForm({ ...profileForm, inheritParentDepartments: e.target.checked })}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                    />
                    <label htmlFor="inheritParentDepartments" className="text-xs font-semibold text-gray-700 cursor-pointer">
                      Inherit parent company department structure
                    </label>
                  </div>
                )}
              </div>

              {profileForm.inheritParentDepartments && currentCompany.parentCompanyId && (
                <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2 text-xs text-amber-800">
                  <AlertCircle size={15} className="text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Parent Company Inheritance Active:</span> This branch is currently configured to inherit its department structure directly from the parent company. Customizations below will be ignored unless you uncheck "Inherit parent company department structure" inside the Company Profile sub-tab.
                  </div>
                </div>
              )}

              {/* Add New Department Form */}
              {isSuperOrHead && (
                <div className="flex gap-2 mb-4">
                  <div className="flex-1">
                    <Input
                      placeholder="Enter new department name..."
                      value={newDeptInput}
                      onChange={e => setNewDeptInput(e.target.value)}
                    />
                  </div>
                  <Button
                    onClick={handleAddDepartment}
                    className="flex items-center gap-1 px-4 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl"
                  >
                    <Plus size={14} />
                    Add
                  </Button>
                </div>
              )}

              {/* Departments List */}
              <div className="border border-gray-100 rounded-xl divide-y divide-gray-100 overflow-hidden bg-white max-h-[350px] overflow-y-auto shadow-sm">
                {customDepartments.length === 0 ? (
                  <div className="p-6 text-center text-xs text-gray-400 font-medium">
                    No custom departments defined yet. Add some above or use template defaults!
                  </div>
                ) : (
                  customDepartments.map((dept, index) => {
                    const isEditing = editingIndex === index;
                    return (
                      <div key={index} className="p-3 flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors">
                        {isEditing ? (
                          <div className="flex-1 flex gap-2 items-center">
                            <input
                              type="text"
                              value={editingValue}
                              onChange={e => setEditingValue(e.target.value)}
                              className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                              autoFocus
                            />
                            <button
                              onClick={() => handleSaveEditDepartment(index)}
                              className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold transition-all"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingIndex(null)}
                              className="px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-[10px] font-bold transition-all"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <>
                            <span className="text-xs font-semibold text-gray-800">{dept}</span>
                            {isSuperOrHead && (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleMoveDepartment(index, 'up')}
                                  disabled={index === 0}
                                  className="p-1.5 text-gray-400 hover:text-blue-600 disabled:opacity-30 rounded-lg hover:bg-slate-100 transition-all"
                                  title="Move Up"
                                >
                                  <ArrowUp size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleMoveDepartment(index, 'down')}
                                  disabled={index === customDepartments.length - 1}
                                  className="p-1.5 text-gray-400 hover:text-blue-600 disabled:opacity-30 rounded-lg hover:bg-slate-100 transition-all"
                                  title="Move Down"
                                >
                                  <ArrowDown size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleStartEditDepartment(index, dept)}
                                  className="p-1.5 text-gray-400 hover:text-indigo-600 rounded-lg hover:bg-slate-100 transition-all"
                                  title="Rename Department"
                                >
                                  <Edit3 size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveDepartment(index)}
                                  className="p-1.5 text-gray-400 hover:text-rose-600 rounded-lg hover:bg-slate-100 transition-all"
                                  title="Remove Department"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </Card>
          )}

          {/* Action Trigger — statutory/department save (Departments tab only;
              Company Profile & Branding has its own Save button). */}
          {isSuperOrHead && activeSubTab === 'departments' && (
            <div className="pt-2">
              <Button onClick={handleSaveAll} className="w-full">
                Apply Department & Statutory Settings
              </Button>
            </div>
          )}

        </div>

        {/* Live dynamic preview widget */}
        <Card>
          <div className="flex items-center gap-1 mb-3 pb-1.5 border-b border-gray-100">
            <Palette size={14} className="text-gray-400" />
            <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Live Document Brand Preview</h4>
          </div>

          <div className="border rounded p-3.5 space-y-4 bg-white shadow-inner font-sans text-xs">
            
            {/* Headerpreview */}
            <div className="border-b pb-2 flex items-center justify-between" style={{ borderBottomColor: brandingForm.primaryColor, borderBottomWidth: '2px' }}>
              <div>
                <p className="font-extrabold text-[10px] leading-tight" style={{ color: brandingForm.primaryColor }}>
                  {brandingForm.headerText || brandingForm.name || profileForm.name}
                </p>
                <p className="text-[8px] text-gray-400 mt-0.5">{brandingForm.address || profileForm.address || 'Company Address'}</p>
                <p className="text-[8px] text-gray-400 mt-0.5">Phone: {brandingForm.contactNumber || `${phoneCode} ${phoneNum}`} · Email: {brandingForm.contactEmail || profileForm.email}</p>
              </div>
              <div className="flex items-center justify-center">
                {brandingForm.logoImage ? (
                  <img src={brandingForm.logoImage} alt="Logo" className="max-h-8 object-contain" />
                ) : (
                  <div className="w-7 h-7 rounded text-white flex items-center justify-center font-bold text-[10px]" style={{ backgroundColor: brandingForm.primaryColor }}>
                    {brandingForm.logoText}
                  </div>
                )}
              </div>
            </div>

            {/* Letter sample content */}
            <div className="space-y-2 py-1 text-gray-700">
              <p className="font-bold text-[9px] uppercase tracking-wider text-slate-800">SUBJECT: LETTER OF ENGAGEMENT</p>
              <p className="text-[9px] leading-relaxed">
                We are pleased to appoint you under the branding guidelines of <strong>{profileForm.name}</strong>. Your base corporate taxes have been aligned with statutory <strong>PF: {payrollForm.pfRate}%</strong> and <strong>ESIC: {payrollForm.esicRate}%</strong> formulas.
              </p>
            </div>

            {/* Sign off and footer */}
            <div className="pt-2 border-t border-gray-55 flex items-end justify-between text-[8px]">
              <div>
                <p className="font-bold text-gray-800">For {profileForm.name}</p>
                <p className="text-gray-400 mt-2">Authorized Signatory</p>
                <p className="text-gray-500 font-medium italic mt-0.5">{brandingForm.signatureText || 'Signatory Designation'}</p>
              </div>
              <div className="text-[7px] text-gray-300 font-mono text-right max-w-40 leading-normal">
                {brandingForm.footerText || 'Company Footer Lines'}
              </div>
            </div>

          </div>

        </Card>

      </div>
      )}
    </div>
  );
};
