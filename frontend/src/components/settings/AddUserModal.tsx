import React, { useEffect, useMemo, useState } from 'react';
import { UserPlus, RefreshCw } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { api } from '@/api/apiClient';

// Add User workflow for Settings → User Roles & Permissions. Additive: it only
// creates a login user scoped to the caller's own company (backend forces the
// company + validates uniqueness / branch / role). Nothing else on the page is
// touched. Permissions come from a role default, a Role Template, a cloned user,
// or "Custom" (edit on the matrix after creation).

const ROLES = ['Company Head', 'HR', 'Manager', 'Payroll', 'Finance', 'Recruiter', 'Employee', 'Custom'];
const EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Contract', 'Intern', 'Consultant'];

type PermMode = 'role' | 'template' | 'clone' | 'custom';

interface AddUserModalProps {
  open: boolean;
  onClose: () => void;
  companyName: string;
  users: any[];
  templates: string[];
  resolvePermissions: (mode: 'template' | 'clone', value: string) => any;
  onCreated: (user: any) => void;
}

const EMPTY = {
  name: '', employeeId: '', designation: '', department: '', mobile: '', email: '', username: '',
  password: '', confirmPassword: '',
  branchId: '', reportingManagerId: '', employmentType: 'Full-time', status: 'Active',
  role: 'Employee', permMode: 'role' as PermMode, permTemplate: '', permCloneUserId: '',
  sendWelcomeEmail: false, forcePasswordChange: true, enableLogin: true,
};

const pwScore = (p: string) => {
  let s = 0;
  if (p.length >= 8) s++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++;
  if (/[0-9]/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  return s; // 0..4
};

export const AddUserModal: React.FC<AddUserModalProps> = ({ open, onClose, companyName, users, templates, resolvePermissions, onCreated }) => {
  const [f, setF] = useState({ ...EMPTY });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [branches, setBranches] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const set = (k: string, v: any) => { setF(p => ({ ...p, [k]: v })); setErrors(e => (e[k] ? { ...e, [k]: '' } : e)); setServerError(null); };

  useEffect(() => {
    if (!open) return;
    setF({ ...EMPTY }); setErrors({}); setServerError(null);
    (async () => {
      try { const list = await api.branches.getAll(); setBranches(Array.isArray(list) ? list : []); }
      catch { setBranches([]); }
    })();
  }, [open]);

  const strength = pwScore(f.password);
  const strengthLabel = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong'][strength];
  const strengthColor = ['bg-rose-400', 'bg-rose-400', 'bg-amber-400', 'bg-emerald-400', 'bg-emerald-500'][strength];

  const branchName = (b: any) => b.branchName || b.name || `Branch ${b.id}`;

  const validate = () => {
    const e: Record<string, string> = {};
    if (!f.name.trim()) e.name = 'Full name is required.';
    if (!f.email.trim()) e.email = 'Email is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = 'Enter a valid email address.';
    if (!f.mobile.trim()) e.mobile = 'Mobile number is required.';
    else if (f.mobile.replace(/\D/g, '').length < 7) e.mobile = 'Enter a valid mobile number.';
    if (!f.branchId) e.branchId = 'Select a branch.';
    if (!f.password) e.password = 'Temporary password is required.';
    else if (f.password.length < 8 || !/[A-Za-z]/.test(f.password) || !/[0-9]/.test(f.password)) e.password = 'Min 8 chars with letters and numbers.';
    if (!f.confirmPassword) e.confirmPassword = 'Confirm the password.';
    else if (f.password !== f.confirmPassword) e.confirmPassword = 'Passwords do not match.';
    if (f.permMode === 'template' && !f.permTemplate) e.permTemplate = 'Choose a template.';
    if (f.permMode === 'clone' && !f.permCloneUserId) e.permCloneUserId = 'Choose a user to clone.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    setSubmitting(true); setServerError(null);
    try {
      let permissions: any;
      if (f.permMode === 'template') permissions = resolvePermissions('template', f.permTemplate);
      else if (f.permMode === 'clone') permissions = resolvePermissions('clone', f.permCloneUserId);
      // 'role' and 'custom' → let the backend seed the role default (custom is then
      // edited on the matrix after creation).
      const payload: any = {
        name: f.name.trim(), email: f.email.trim(), mobile: f.mobile.trim(),
        username: f.username.trim() || undefined,
        password: f.password, role: f.role, status: f.status,
        employeeId: f.employeeId.trim() || undefined, designation: f.designation.trim() || undefined,
        department: f.department.trim() || undefined, employmentType: f.employmentType || undefined,
        branchId: f.branchId ? Number(f.branchId) : undefined,
        reportingManagerId: f.reportingManagerId ? Number(f.reportingManagerId) : undefined,
        sendWelcomeEmail: f.sendWelcomeEmail, forcePasswordChange: f.forcePasswordChange, enableLogin: f.enableLogin,
      };
      if (permissions) payload.permissions = permissions;
      const created = await api.users.createCompanyUser(payload);
      onCreated(created);
      onClose();
    } catch (e: any) {
      setServerError(e?.message || 'Could not create the user.');
    } finally {
      setSubmitting(false);
    }
  };

  const sectionTitle = 'text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-2 mt-1';
  const grid = 'grid grid-cols-1 sm:grid-cols-2 gap-3';

  const footer = (
    <div className="flex items-center justify-between gap-2 w-full">
      {serverError ? <span className="text-xs font-semibold text-rose-600 truncate">{serverError}</span> : <span />}
      <div className="flex items-center gap-2 shrink-0">
        <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" icon={<UserPlus size={14} />} loading={submitting} onClick={submit}>Create User</Button>
      </div>
    </div>
  );

  const managerOptions = useMemo(() => ([
    { value: '', label: 'None' },
    ...users.map(u => ({ value: String(u.id), label: `${u.name}${u.role ? ` · ${u.role}` : ''}` })),
  ]), [users]);

  return (
    <Modal open={open} onClose={onClose} title="Add User" size="lg" footer={footer}>
      <div className="space-y-4">
        {/* Basic Information */}
        <div>
          <div className={sectionTitle}>Basic Information</div>
          <div className={grid}>
            <Input label="Full Name *" value={f.name} error={errors.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Priya Sharma" />
            <Input label="Employee ID" value={f.employeeId} onChange={e => set('employeeId', e.target.value)} placeholder="Optional / auto" />
            <Input label="Designation" value={f.designation} onChange={e => set('designation', e.target.value)} placeholder="e.g. HR Manager" />
            <Input label="Department" value={f.department} onChange={e => set('department', e.target.value)} placeholder="e.g. Human Resources" />
            <Input label="Mobile Number *" value={f.mobile} error={errors.mobile} onChange={e => set('mobile', e.target.value)} placeholder="e.g. 9876543210" />
            <Input label="Email Address *" type="email" value={f.email} error={errors.email} onChange={e => set('email', e.target.value)} placeholder="name@company.com" />
            <Input label="Username" value={f.username} onChange={e => set('username', e.target.value)} placeholder="Optional / auto from email" />
            <div />
            <div>
              <Input label="Temporary Password *" type="password" value={f.password} error={errors.password} onChange={e => set('password', e.target.value)} placeholder="Min 8 chars, letters + numbers" />
              {f.password && (
                <div className="mt-1 flex items-center gap-2">
                  <div className="flex-1 h-1 rounded bg-slate-100 overflow-hidden"><div className={`h-full ${strengthColor}`} style={{ width: `${(strength / 4) * 100}%` }} /></div>
                  <span className="text-[10px] text-slate-400">{strengthLabel}</span>
                </div>
              )}
            </div>
            <Input label="Confirm Password *" type="password" value={f.confirmPassword} error={errors.confirmPassword} onChange={e => set('confirmPassword', e.target.value)} placeholder="Re-enter password" />
          </div>
        </div>

        {/* Organization */}
        <div>
          <div className={sectionTitle}>Organization</div>
          <div className={grid}>
            <Input label="Company" value={companyName} disabled readOnly />
            <Select label="Branch *" value={f.branchId} error={errors.branchId} onChange={e => set('branchId', e.target.value)}
              options={[{ value: '', label: 'Select branch…' }, ...branches.map(b => ({ value: String(b.id), label: branchName(b) }))]} />
            <Select label="Reporting Manager" value={f.reportingManagerId} onChange={e => set('reportingManagerId', e.target.value)} options={managerOptions} />
            <Select label="Employment Type" value={f.employmentType} onChange={e => set('employmentType', e.target.value)}
              options={EMPLOYMENT_TYPES.map(t => ({ value: t, label: t }))} />
            <Select label="User Status" value={f.status} onChange={e => set('status', e.target.value)}
              options={[{ value: 'Active', label: 'Active' }, { value: 'Inactive', label: 'Inactive' }]} />
          </div>
        </div>

        {/* Access & Permissions */}
        <div>
          <div className={sectionTitle}>Access &amp; Permissions</div>
          <div className={grid}>
            <Select label="Role" value={f.role} onChange={e => set('role', e.target.value)} options={ROLES.map(r => ({ value: r, label: r }))} />
            <Select label="Permissions From" value={f.permMode} onChange={e => set('permMode', e.target.value as PermMode)}
              options={[
                { value: 'role', label: 'Role default' },
                { value: 'template', label: 'Permission template' },
                { value: 'clone', label: 'Clone from existing user' },
                { value: 'custom', label: 'Custom (edit after creation)' },
              ]} />
            {f.permMode === 'template' && (
              <Select label="Template" value={f.permTemplate} error={errors.permTemplate} onChange={e => set('permTemplate', e.target.value)}
                options={[{ value: '', label: 'Select template…' }, ...templates.map(t => ({ value: t, label: t }))]} />
            )}
            {f.permMode === 'clone' && (
              <Select label="Clone Permissions From" value={f.permCloneUserId} error={errors.permCloneUserId} onChange={e => set('permCloneUserId', e.target.value)}
                options={[{ value: '', label: 'Select user…' }, ...users.map(u => ({ value: String(u.id), label: `${u.name} · ${u.role}` }))]} />
            )}
          </div>
          {f.permMode === 'custom' && <p className="text-[11px] text-slate-400 mt-1">The user starts with role defaults. After creating, select them in the list to fine-tune each permission.</p>}
        </div>

        {/* Login Options */}
        <div>
          <div className={sectionTitle}>Login Options</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600">
            <label className="flex items-center gap-2"><input type="checkbox" className="accent-brand-600 h-4 w-4" checked={f.sendWelcomeEmail} onChange={e => set('sendWelcomeEmail', e.target.checked)} />Send welcome email</label>
            <label className="flex items-center gap-2"><input type="checkbox" className="accent-brand-600 h-4 w-4" checked={f.forcePasswordChange} onChange={e => set('forcePasswordChange', e.target.checked)} />Force password change on first login</label>
            <label className="flex items-center gap-2"><input type="checkbox" className="accent-brand-600 h-4 w-4" checked={f.enableLogin} onChange={e => set('enableLogin', e.target.checked)} />Enable login</label>
            <label className="flex items-center gap-2 text-slate-300 cursor-not-allowed" title="Coming soon"><input type="checkbox" className="h-4 w-4" disabled />Two-factor authentication <span className="text-[9px] uppercase tracking-wide">(soon)</span></label>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default AddUserModal;
