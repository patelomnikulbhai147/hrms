// ─────────────────────────────────────────────────────────────────────────────
// DepartmentFormModal — professional Create / Edit Department dialog for
// Settings → Manage Departments. Collects the department name (the value stored
// in the company's customDepartments name array) plus rich metadata (code,
// description, status, colour, icon, order, branch, head, email, phone…) that is
// persisted in the additive Company.departmentMeta JSON map, keyed by name.
//
// Pure form component: it validates and hands a clean payload to onSubmit; the
// parent owns persistence (so create/edit/delete all flow through one save path).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Building2, Save, AlertTriangle } from 'lucide-react';

export interface DeptMeta {
  code?: string;
  description?: string;
  status?: 'Active' | 'Inactive';
  color?: string;
  icon?: string;
  order?: number | null;
  branchId?: string;
  parent?: string;
  reportsTo?: string;
  head?: string;
  allowEmployees?: boolean;
  email?: string;
  phone?: string;
}

export interface DeptFormValue extends DeptMeta { name: string }

interface Props {
  open: boolean;
  onClose: () => void;
  /** null → create; otherwise the existing name + meta being edited. */
  initial: { name: string; meta: DeptMeta } | null;
  /** All existing department names (for duplicate-name validation). */
  existingNames: string[];
  /** name → code map (for duplicate-code validation). */
  existingCodes: Record<string, string>;
  /** Branch options for the Organization section. */
  branches: { value: string; label: string }[];
  /** Existing department names (for Parent / Reports-To selects). */
  allDepartments: string[];
  onSubmit: (value: DeptFormValue, originalName: string | null) => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const inputCls = 'w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500';

const Field: React.FC<{ label: string; required?: boolean; error?: string; hint?: string; children: React.ReactNode }> = ({ label, required, error, hint, children }) => (
  <div>
    <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1">{label}{required && <span className="text-rose-500"> *</span>}</label>
    {children}
    {error ? <p className="text-[10px] text-rose-500 mt-1 flex items-center gap-1"><AlertTriangle size={10} /> {error}</p>
      : hint ? <p className="text-[10px] text-slate-400 mt-1">{hint}</p> : null}
  </div>
);

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wide col-span-full mt-1 mb-0.5 pb-1 border-b border-slate-100">{children}</p>
);

const EMPTY: DeptFormValue = { name: '', code: '', description: '', status: 'Active', color: '#4F7CFF', icon: '', order: null, branchId: '', parent: '', reportsTo: '', head: '', allowEmployees: true, email: '', phone: '' };

export const DepartmentFormModal: React.FC<Props> = ({ open, onClose, initial, existingNames, existingCodes, branches, allDepartments, onSubmit }) => {
  const [form, setForm] = useState<DeptFormValue>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Seed the form whenever the modal opens (create → blank; edit → prefilled).
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm(initial ? { ...EMPTY, ...initial.meta, name: initial.name } : { ...EMPTY });
  }, [open, initial]);

  const isEdit = !!initial;
  const set = (k: keyof DeptFormValue, v: any) => setForm(f => ({ ...f, [k]: v }));

  const otherNames = useMemo(
    () => existingNames.filter(n => !initial || n.toLowerCase() !== initial.name.toLowerCase()).map(n => n.toLowerCase()),
    [existingNames, initial],
  );
  const otherCodes = useMemo(
    () => Object.entries(existingCodes)
      .filter(([n]) => !initial || n.toLowerCase() !== initial.name.toLowerCase())
      .map(([, c]) => String(c || '').toLowerCase()).filter(Boolean),
    [existingCodes, initial],
  );

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    const name = form.name.trim();
    if (!name) e.name = 'Department name is required.';
    else if (otherNames.includes(name.toLowerCase())) e.name = 'A department with this name already exists.';
    const code = (form.code || '').trim();
    if (code && otherCodes.includes(code.toLowerCase())) e.code = 'This department code is already in use.';
    if (form.order !== null && form.order !== undefined && String(form.order) !== '' && !Number.isFinite(Number(form.order))) e.order = 'Display order must be a number.';
    if ((form.email || '').trim() && !EMAIL_RE.test(form.email!.trim())) e.email = 'Enter a valid email address.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = () => {
    if (!validate()) return;
    onSubmit({
      ...form,
      name: form.name.trim(),
      code: (form.code || '').trim(),
      order: (form.order === null || String(form.order) === '') ? null : Number(form.order),
      email: (form.email || '').trim(),
    }, initial ? initial.name : null);
  };

  const deptOptions = [{ value: '', label: '— None —' }, ...allDepartments.filter(n => !initial || n !== initial.name).map(n => ({ value: n, label: n }))];

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Department' : 'Create Department'} size="lg"
      subtitle={isEdit ? 'Update department details' : 'Add a new department to this company'}
      footer={<>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button icon={isEdit ? <Save size={14} /> : <Building2 size={14} />} onClick={submit}>{isEdit ? 'Save Changes' : 'Create Department'}</Button>
      </>}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SectionTitle>Basic Information</SectionTitle>
        <Field label="Department Name" required error={errors.name}>
          <input className={inputCls} value={form.name} autoFocus onChange={e => set('name', e.target.value)} placeholder="e.g. Finance" />
        </Field>
        <Field label="Department Code" error={errors.code} hint="Must be unique within the company.">
          <input className={inputCls} value={form.code || ''} onChange={e => set('code', e.target.value)} placeholder="e.g. FIN" />
        </Field>
        <div className="md:col-span-2">
          <Field label="Description">
            <textarea className={`${inputCls} resize-none`} rows={2} value={form.description || ''} onChange={e => set('description', e.target.value)} placeholder="What this department does…" />
          </Field>
        </div>
        <Field label="Status">
          <select className={inputCls} value={form.status} onChange={e => set('status', e.target.value)}>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </Field>
        <Field label="Display Order" error={errors.order} hint="Numeric — controls list position.">
          <input type="number" className={inputCls} value={form.order ?? ''} onChange={e => set('order', e.target.value === '' ? null : Number(e.target.value))} placeholder="e.g. 1" />
        </Field>
        <Field label="Colour">
          <div className="flex items-center gap-2">
            <input type="color" value={form.color || '#4F7CFF'} onChange={e => set('color', e.target.value)} className="h-8 w-10 rounded border border-slate-200 p-0" />
            <input className={`${inputCls} font-mono`} value={form.color || ''} onChange={e => set('color', e.target.value)} placeholder="#4F7CFF" />
          </div>
        </Field>
        <Field label="Icon (emoji or name)">
          <input className={inputCls} value={form.icon || ''} onChange={e => set('icon', e.target.value)} placeholder="e.g. 💼 or briefcase" />
        </Field>

        <SectionTitle>Organization</SectionTitle>
        <Field label="Branch">
          <select className={inputCls} value={form.branchId || ''} onChange={e => set('branchId', e.target.value)}>
            <option value="">All / Company-wide</option>
            {branches.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
          </select>
        </Field>
        <Field label="Parent Department">
          <select className={inputCls} value={form.parent || ''} onChange={e => set('parent', e.target.value)}>
            {deptOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="Reports To Department">
          <select className={inputCls} value={form.reportsTo || ''} onChange={e => set('reportsTo', e.target.value)}>
            {deptOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>

        <SectionTitle>Settings</SectionTitle>
        <Field label="Department Head">
          <input className={inputCls} value={form.head || ''} onChange={e => set('head', e.target.value)} placeholder="e.g. Priya Sharma" />
        </Field>
        <Field label="Department Email" error={errors.email}>
          <input className={inputCls} value={form.email || ''} onChange={e => set('email', e.target.value)} placeholder="dept@company.com" />
        </Field>
        <Field label="Department Phone">
          <input className={inputCls} value={form.phone || ''} onChange={e => set('phone', e.target.value)} placeholder="+91 …" />
        </Field>
        <div className="flex items-center gap-2 pt-5">
          <input type="checkbox" id="allowEmployees" className="accent-blue-600 h-4 w-4" checked={form.allowEmployees !== false} onChange={e => set('allowEmployees', e.target.checked)} />
          <label htmlFor="allowEmployees" className="text-xs font-semibold text-slate-700 cursor-pointer">Allow employees in this department</label>
        </div>
      </div>
    </Modal>
  );
};

export default DepartmentFormModal;
