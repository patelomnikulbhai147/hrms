import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { BadgeCent, Plus, Trash2, Edit3, ArrowUp, ArrowDown, Briefcase, AlertCircle, ShieldCheck, Search } from 'lucide-react';
import { PermissionManager } from '@/components/settings/PermissionManager';
import { DepartmentFormModal, type DeptFormValue } from '@/components/settings/DepartmentFormModal';
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
} from '@/utils/validation';
import { api } from '@/api/apiClient';
import { getApiErrorMessage } from '@/utils/apiError';
import { PayrollComplianceEngine } from '@/components/settings/PayrollComplianceEngine';
import { LabourCompliance } from '@/components/settings/LabourCompliance';
import { GoogleMapsIntegration } from '@/components/settings/GoogleMapsIntegration';
import { SecuritySettings } from '@/components/settings/SecuritySettings';
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
  const [activeSubTab, setActiveSubTab] = useState<'payroll' | 'departments' | 'roles' | 'labour'>('payroll');
  
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

  const [payrollForm, setPayrollForm] = useState({
    pfRate: (currentCompany.pfRate ?? 12).toString(),
    esicRate: (currentCompany.esicRate ?? 3.25).toString(),
    basicPercent: (currentCompany.basicPercent ?? 50).toString(),
    overtimeRate: (currentCompany.overtimeRate ?? 1.5).toString(),
    profTaxRate: (currentCompany.profTaxRate ?? 200).toString(),
  });

  // Department management state. Names live in customDepartments (the array every
  // consumer reads); rich per-department fields live in departmentMeta keyed by name.
  const [customDepartments, setCustomDepartments] = useState<string[]>([]);
  const [departmentMeta, setDepartmentMeta] = useState<Record<string, any>>({});
  const [deptSearch, setDeptSearch] = useState('');
  const [deptModalOpen, setDeptModalOpen] = useState(false);
  const [editingDeptName, setEditingDeptName] = useState<string | null>(null); // null = create mode

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

    setPayrollForm({
      pfRate: (currentCompany.pfRate ?? 12).toString(),
      esicRate: (currentCompany.esicRate ?? 3.25).toString(),
      basicPercent: (currentCompany.basicPercent ?? 50).toString(),
      overtimeRate: (currentCompany.overtimeRate ?? 1.5).toString(),
      profTaxRate: (currentCompany.profTaxRate ?? 200).toString(),
    });

    // Populate customDepartments list from actual database resolution
    setCustomDepartments(getCompanyDepartments(currentCompany.id, companies as any));
    setDepartmentMeta(((currentCompany as any).departmentMeta as Record<string, any>) || {});
  }, [activeCompanyId, currentCompany, companies]);


  // ─── Department Management Actions ───
  // Persist BOTH the name list (customDepartments — read by every consumer) and
  // the metadata map (departmentMeta) via the dedicated `updateDepartments`
  // endpoint. It is authorized by the SETTINGS permission (View/Edit) — NOT company
  // branding — so a Settings-Edit user manages departments without any branding
  // authorization. (Super Admin any company, Company Head own company, HR/Finance
  // if granted; branch→parent resolved; partial write.)
  // Optimistic update with revert on failure; NO page reload.
  const persistAll = async (nextList: string[], nextMeta: Record<string, any>, prevList: string[], prevMeta: Record<string, any>, successMsg?: string) => {
    setCustomDepartments(nextList);
    setDepartmentMeta(nextMeta);
    try {
      await api.companies.updateDepartments(String(currentCompany.id), { customDepartments: nextList, departmentMeta: nextMeta });
      if (onRefresh) onRefresh();
      else onUpdateCompanies(companies.map(c => (String(c.id) === String(currentCompany.id) ? ({ ...c, customDepartments: nextList, departmentMeta: nextMeta } as any) : c)));
      if (successMsg) ui.toast.success(successMsg);
    } catch (err) {
      setCustomDepartments(prevList);
      setDepartmentMeta(prevMeta);
      ui.toast.error(getApiErrorMessage(err, 'Could not save the department. Please try again.'));
    }
  };

  const openCreateDepartment = () => { setEditingDeptName(null); setDeptModalOpen(true); };
  const openEditDepartment = (name: string) => { setEditingDeptName(name); setDeptModalOpen(true); };

  // Create or update a department from the modal. `originalName` is null on create.
  const handleSaveDepartment = (value: DeptFormValue, originalName: string | null) => {
    const name = value.name.trim();
    const { name: _n, ...meta } = value; // name → customDepartments; rest → departmentMeta
    const prevList = customDepartments, prevMeta = departmentMeta;
    const nextList = [...customDepartments];
    const nextMeta: Record<string, any> = { ...departmentMeta };
    if (originalName === null) {
      if (nextList.some(d => d.toLowerCase() === name.toLowerCase())) { ui.toast.warning('This department already exists.'); return; }
      nextList.push(name);
    } else {
      const idx = nextList.findIndex(d => d === originalName);
      if (idx === -1) { ui.toast.error('Department not found.'); return; }
      if (name.toLowerCase() !== originalName.toLowerCase() && nextList.some(d => d.toLowerCase() === name.toLowerCase())) { ui.toast.warning('This department already exists.'); return; }
      nextList[idx] = name;                       // preserve position
      if (originalName !== name) delete nextMeta[originalName]; // move meta on rename
    }
    nextMeta[name] = meta;
    setDeptModalOpen(false);
    persistAll(nextList, nextMeta, prevList, prevMeta, originalName === null ? 'Department created successfully.' : 'Department updated successfully.');
  };

  const handleRemoveDepartment = async (name: string) => {
    if (!(await ui.confirm({ message: `Remove the department "${name}"? Employees currently assigned to it will need to be re-allocated.`, variant: 'danger', confirmText: 'Remove' }))) return;
    const nextMeta = { ...departmentMeta }; delete nextMeta[name];
    persistAll(customDepartments.filter(d => d !== name), nextMeta, customDepartments, departmentMeta, 'Department removed.');
  };

  const handleMoveDepartment = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= customDepartments.length) return;
    const newList = [...customDepartments];
    const temp = newList[index];
    newList[index] = newList[targetIndex];
    newList[targetIndex] = temp;
    persistAll(newList, departmentMeta, customDepartments, departmentMeta); // reorder; meta unchanged
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
      
      ui.toast.success('Company statutory profiles and department templates updated successfully! Changes immediately active.');
      // Force reload so updated department/statutory config propagates everywhere.
      window.location.reload();
    } catch (err) {
      console.error(err);
      ui.toast.error(getApiErrorMessage(err, 'Could not save settings.'));
    }
  };

  const { canEdit: canEditModule } = usePermissions();
  const canEdit = canEditModule('settings');
  const isSuperOrHead = (role === 'Super Admin' || role === 'Company Head') && canEdit;

  // Labour Compliance edit rights:
  //   Super Admin & Company Head  → always
  //   HR                          → only if granted the settings "edit" permission
  //   Employee / others           → view only
  const canEditLabour =
    role === 'Super Admin' || role === 'Company Head' || (role === 'HR' && canEditModule('settings'));

  // Branch options for the department modal (branches = companies whose parent is
  // the current company).
  const departmentBranchOptions = companies
    .filter((c: any) => String(c.parentCompanyId) === String(currentCompany.id))
    .map((b: any) => ({ value: String(b.id), label: b.branchName || b.name }));

  // Departments filtered by the search box (by name or code); each keeps its REAL
  // index in customDepartments so reorder stays correct.
  const deptQuery = deptSearch.trim().toLowerCase();
  const visibleDepartments = customDepartments
    .map((name, index) => ({ name, index }))
    .filter(({ name }) => !deptQuery
      || name.toLowerCase().includes(deptQuery)
      || String(departmentMeta[name]?.code || '').toLowerCase().includes(deptQuery));

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
            <div className="w-11 h-11 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
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

        {/* Third Party Integrations — global, installation-wide configuration. */}
        <div className="space-y-6 pt-1">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Third Party Integrations</h3>
            <p className="text-xs text-gray-500 mt-0.5">Configure once for the whole installation. Every company uses these automatically.</p>
          </div>
          <GoogleMapsIntegration />
          <SecuritySettings />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 font-sans">
      {/* Header */}
      <div>
        <h2 className="text-base font-semibold text-gray-900">Policy & Settings Hub</h2>
        <p className="text-xs text-gray-500 mt-0.5">Configure statutory tax percentages, department templates, roles and labour compliance</p>
      </div>

      {/* Sub Tabs menu */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveSubTab('payroll')}
          className={`px-4 py-2 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
            activeSubTab === 'payroll' ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
        >
          <BadgeCent size={13} />
          Statutory Payroll Rules
        </button>
        <button
          onClick={() => setActiveSubTab('departments')}
          className={`px-4 py-2 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
            activeSubTab === 'departments' ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
        >
          <Briefcase size={13} />
          Manage Departments
        </button>
        {role !== 'Employee' && (
          <button
            onClick={() => setActiveSubTab('roles')}
            className={`px-4 py-2 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
              activeSubTab === 'roles' ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-900'
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
              activeSubTab === 'labour' ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-900'
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
          canEdit={canEditLabour}
          performedBy={role}
        />
      )}

      {/* Layout panels */}
      {activeSubTab !== 'roles' && activeSubTab !== 'labour' && (
      <div className="space-y-4">

          {/* TAB 2: Payroll Settings Engine */}
          {activeSubTab === 'payroll' && (
            <PayrollComplianceEngine
              currentCompany={currentCompany}
              isSuperOrHead={isSuperOrHead}
              performedBy={role}
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

          {/* TAB 4: Manage Departments */}
          {activeSubTab === 'departments' && (
            <>
            <Card>
              <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-1 pb-1.5 border-b border-gray-100 flex items-center gap-1.5">
                <Briefcase size={14} className="text-brand-600" />
                Custom Corporate Department Management
              </h3>
              <p className="text-xs text-gray-550 mb-4 leading-relaxed">
                Add, rename, delete, and change the ordering of your statutory department list. Be sure to click "Apply Department & Statutory Settings" at the bottom to save your edits to the system.
              </p>

              {/* Parent-company inheritance toggle (branches only). */}
              {currentCompany.parentCompanyId && (
                <div className="flex items-center gap-2 mb-4">
                  <input
                    type="checkbox"
                    id="inheritParentDepartments"
                    checked={profileForm.inheritParentDepartments}
                    disabled={!isSuperOrHead}
                    onChange={e => setProfileForm({ ...profileForm, inheritParentDepartments: e.target.checked })}
                    className="rounded border-gray-300 text-brand-600 focus:ring-brand-500 w-4 h-4 cursor-pointer"
                  />
                  <label htmlFor="inheritParentDepartments" className="text-xs font-semibold text-gray-700 cursor-pointer">
                    Inherit parent company department structure
                  </label>
                </div>
              )}

              {profileForm.inheritParentDepartments && currentCompany.parentCompanyId && (
                <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2 text-xs text-amber-800">
                  <AlertCircle size={15} className="text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Parent Company Inheritance Active:</span> This branch is currently configured to inherit its department structure directly from the parent company. Customizations below will be ignored unless you uncheck "Inherit parent company department structure" inside the Company Profile sub-tab.
                  </div>
                </div>
              )}

              {/* Search + Add toolbar — the search box ONLY filters the list; the
                  Add button opens the Create Department modal (never adds directly). */}
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <div className="relative flex-1 min-w-[220px]">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={deptSearch}
                    onChange={e => setDeptSearch(e.target.value)}
                    placeholder="Search departments…"
                    className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-800 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  />
                </div>
                {isSuperOrHead && (
                  <Button
                    onClick={openCreateDepartment}
                    className="flex items-center gap-1 px-4 py-2 text-xs font-bold bg-brand-600 hover:bg-brand-700 text-white rounded-xl"
                  >
                    <Plus size={14} />
                    Add Department
                  </Button>
                )}
              </div>

              {/* Departments List (filtered by search; reorder shown only when not searching) */}
              <div className="border border-gray-100 rounded-xl divide-y divide-gray-100 overflow-hidden bg-white max-h-[380px] overflow-y-auto shadow-sm">
                {customDepartments.length === 0 ? (
                  <div className="p-6 text-center text-xs text-gray-400 font-medium">
                    No departments yet. Click “Add Department” to create your first one.
                  </div>
                ) : visibleDepartments.length === 0 ? (
                  <div className="p-6 text-center text-xs text-gray-400 font-medium">
                    No departments match “{deptSearch}”.
                  </div>
                ) : (
                  visibleDepartments.map(({ name, index }) => {
                    const meta = departmentMeta[name] || {};
                    const inactive = meta.status === 'Inactive';
                    return (
                      <div key={name} className="p-3 flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: meta.color || '#9ca3af' }} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-xs font-semibold ${inactive ? 'text-gray-400' : 'text-gray-800'}`}>{name}</span>
                              {meta.code && <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{meta.code}</span>}
                              {inactive && <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">Inactive</span>}
                            </div>
                            {(meta.head || meta.description) && (
                              <p className="text-[10px] text-slate-400 truncate max-w-[320px]">{meta.head ? `Head: ${meta.head}` : meta.description}</p>
                            )}
                          </div>
                        </div>
                        {isSuperOrHead && (
                          <div className="flex items-center gap-1 shrink-0">
                            {!deptSearch && (
                              <>
                                <button type="button" onClick={() => handleMoveDepartment(index, 'up')} disabled={index === 0} className="p-1.5 text-gray-400 hover:text-brand-600 disabled:opacity-30 rounded-lg hover:bg-slate-100 transition-all" title="Move Up"><ArrowUp size={13} /></button>
                                <button type="button" onClick={() => handleMoveDepartment(index, 'down')} disabled={index === customDepartments.length - 1} className="p-1.5 text-gray-400 hover:text-brand-600 disabled:opacity-30 rounded-lg hover:bg-slate-100 transition-all" title="Move Down"><ArrowDown size={13} /></button>
                              </>
                            )}
                            <button type="button" onClick={() => openEditDepartment(name)} className="p-1.5 text-gray-400 hover:text-brand-600 rounded-lg hover:bg-slate-100 transition-all" title="Edit Department"><Edit3 size={13} /></button>
                            <button type="button" onClick={() => handleRemoveDepartment(name)} className="p-1.5 text-gray-400 hover:text-rose-600 rounded-lg hover:bg-slate-100 transition-all" title="Remove Department"><Trash2 size={13} /></button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </Card>
            <DepartmentFormModal
              open={deptModalOpen}
              onClose={() => setDeptModalOpen(false)}
              initial={editingDeptName ? { name: editingDeptName, meta: departmentMeta[editingDeptName] || {} } : null}
              existingNames={customDepartments}
              existingCodes={Object.fromEntries(Object.entries(departmentMeta).map(([n, m]) => [n, (m as any)?.code || '']))}
              branches={departmentBranchOptions}
              allDepartments={customDepartments}
              onSubmit={handleSaveDepartment}
            />
            </>
          )}

          {/* Action Trigger — statutory/department save (Departments tab only). */}
          {isSuperOrHead && activeSubTab === 'departments' && (
            <div className="pt-2">
              <Button onClick={handleSaveAll} className="w-full">
                Apply Department & Statutory Settings
              </Button>
            </div>
          )}

      </div>
      )}
    </div>
  );
};
