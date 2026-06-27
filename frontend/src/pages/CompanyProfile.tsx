import React, { useState, useEffect, useRef } from 'react';
import {
  Building2, FileText, ShieldCheck, Palette, Users, GitBranch, History,
  Plus, Edit, Trash2, Upload, X, Download, Save, AlertTriangle, CheckCircle2,
  Clock, Search,
} from 'lucide-react';
import type { Role, Company } from '@/types';
import type { UserAccount } from '@/pages/Login';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Table, Thead, Tbody, Th, Td, Tr } from '@/components/ui/Table';
import { ExportMenu } from '@/components/ui/ExportMenu';
import { usePermissions } from '@/context/PermissionContext';
import { api } from '@/api/apiClient';
import { ui } from '@/components/ui/feedback';
import { formatDate, formatDateTime } from '@/utils/formatDate';
import { getApiErrorMessage } from '@/utils/apiError';
import { ComplianceManagement } from '@/components/companyProfile/ComplianceManagement';

// ── Field configuration ──────────────────────────────────────────────────────
type FieldType = 'text' | 'textarea' | 'date' | 'email' | 'select';
interface FieldDef { key: string; label: string; type?: FieldType; options?: string[]; readOnly?: boolean; }

const COMPANY_TYPES = ['Private Limited', 'Public Limited', 'LLP', 'Partnership', 'Proprietorship', 'Trust', 'NGO', 'Government', 'Other'];

const BASIC_FIELDS: FieldDef[] = [
  { key: 'legalName', label: 'Company Legal Name' },
  { key: 'tradeName', label: 'Trade Name' },
  { key: 'displayName', label: 'Display Name' },
  { key: 'companyCode', label: 'Company Code' },
  { key: 'companyType', label: 'Company Type', type: 'select', options: COMPANY_TYPES },
  { key: 'industry', label: 'Industry' },
  { key: 'businessCategory', label: 'Business Category' },
  { key: 'natureOfBusiness', label: 'Nature of Business' },
  { key: 'dateOfEstablishment', label: 'Date of Establishment', type: 'date' },
  { key: 'dateOfIncorporation', label: 'Date of Incorporation', type: 'date' },
  { key: 'companyStatusLabel', label: 'Company Status' },
  { key: 'employeeCount', label: 'Employee Strength', readOnly: true },
];
const ADDRESS_FIELDS: FieldDef[] = [
  { key: 'registeredOfficeAddress', label: 'Registered Office Address', type: 'textarea' },
  { key: 'corporateAddress', label: 'Corporate Office Address', type: 'textarea' },
  { key: 'headOfficeAddress', label: 'Head Office Address', type: 'textarea' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'country', label: 'Country' },
  { key: 'pincode', label: 'PIN Code' },
  { key: 'googleMapLocation', label: 'Google Map Location', type: 'textarea' },
];
const CONTACT_FIELDS: FieldDef[] = [
  { key: 'contactNumber', label: 'Mobile Number' },
  { key: 'landline', label: 'Landline' },
  { key: 'contactEmail', label: 'Official Email', type: 'email' },
  { key: 'supportEmail', label: 'Support Email', type: 'email' },
  { key: 'hrEmail', label: 'HR Email', type: 'email' },
  { key: 'payrollEmail', label: 'Payroll Email', type: 'email' },
  { key: 'website', label: 'Website' },
  { key: 'socialLinks', label: 'Social Media Links', type: 'textarea' },
];
const REGISTRATION_FIELDS: FieldDef[] = [
  { key: 'cinNumber', label: 'CIN Number' },
  { key: 'gstNumber', label: 'GST Number' },
  { key: 'panNumber', label: 'PAN Number' },
  { key: 'tanNumber', label: 'TAN Number' },
  { key: 'msmeNumber', label: 'MSME / Udyam Registration' },
  { key: 'shopEstablishmentNumber', label: 'Shop & Establishment Registration' },
  { key: 'labourLicenseNumber', label: 'Labour License Number' },
  { key: 'factoryLicenseNumber', label: 'Factory License Number' },
  { key: 'ptaxRegistrationNumber', label: 'Professional Tax Registration' },
  { key: 'pfCode', label: 'PF Establishment Code' },
  { key: 'esiCode', label: 'ESI Employer Code' },
  { key: 'iecCode', label: 'IEC Code' },
  { key: 'isoCertNumber', label: 'ISO Certification Number' },
  { key: 'fssaiNumber', label: 'FSSAI License' },
  { key: 'otherRegistrations', label: 'Other Registration Numbers', type: 'textarea' },
];
const STATUTORY_CYCLE_FIELDS: FieldDef[] = [
  { key: 'salaryCycle', label: 'Salary Cycle' },
  { key: 'payrollStartDate', label: 'Payroll Start Date' },
  { key: 'financialYearStart', label: 'Financial Year Start' },
  { key: 'leaveYearStart', label: 'Leave Year Start' },
  { key: 'defaultTimeZone', label: 'Default Time Zone' },
];
const BRANDING_TEXT_FIELDS: FieldDef[] = [
  { key: 'logo', label: 'Logo Text (Emblem)' },
  { key: 'motto', label: 'Company Motto / Tagline' },
  { key: 'headerText', label: 'Report Header Text' },
  { key: 'footerText', label: 'Report Footer Text', type: 'textarea' },
  { key: 'emailSignature', label: 'Email Signature', type: 'textarea' },
  { key: 'signatureText', label: 'Authorized Signature Line' },
  { key: 'watermarkText', label: 'Company Watermark Text' },
  { key: 'primaryColor', label: 'Brand Primary Color' },
];
const BRANDING_IMAGE_FIELDS: FieldDef[] = [
  { key: 'logoImage', label: 'Company Logo' },
  { key: 'stampImage', label: 'Company Seal / Stamp' },
  { key: 'digitalSignatureImage', label: 'Authorized Signature' },
  { key: 'letterheadImage', label: 'Letterhead' },
  { key: 'reportHeaderImage', label: 'Report Header' },
  { key: 'reportFooterImage', label: 'Report Footer' },
  { key: 'watermarkImage', label: 'Company Watermark' },
  { key: 'faviconImage', label: 'Favicon' },
];

// Every editable company scalar this page manages (sent to updateBranding on save).
// Banking fields are intentionally excluded — that tab was removed from Company
// Profile (banking is still editable in Settings; DB fields/APIs are untouched).
const ALL_EDIT_FIELDS = [
  ...BASIC_FIELDS, ...ADDRESS_FIELDS, ...CONTACT_FIELDS, ...REGISTRATION_FIELDS,
  ...STATUTORY_CYCLE_FIELDS, ...BRANDING_TEXT_FIELDS, ...BRANDING_IMAGE_FIELDS,
].filter(f => !f.readOnly).map(f => f.key);

const DOC_CATEGORIES = ['Legal', 'Tax', 'Labour', 'Business', 'Financial', 'Insurance', 'HR', 'Other'];
const DOC_STATUSES = ['Verified', 'Pending', 'Rejected'];
const CONTACT_ROLES = ['Founder', 'Co-Founder', 'CEO', 'Managing Director', 'Director', 'Company Secretary', 'HR Head', 'Payroll Manager', 'Finance Head', 'Compliance Officer', 'Authorized Signatory'];

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_IMG_BYTES = 2 * 1024 * 1024;
const formatBytes = (b: number) => b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(2)} MB`;

const readFileAsDataUrl = (file: File, maxBytes: number): Promise<{ dataUrl: string; mimeType: string; size: string; fileName: string }> =>
  new Promise((resolve, reject) => {
    if (file.size > maxBytes) { reject(new Error(`File too large (${formatBytes(file.size)}). Max ${formatBytes(maxBytes)}.`)); return; }
    const reader = new FileReader();
    reader.onload = () => resolve({ dataUrl: String(reader.result), mimeType: file.type || 'application/octet-stream', size: formatBytes(file.size), fileName: file.name });
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.readAsDataURL(file);
  });

// Expiry → badge color + label (mirrors backend bucketing).
const dayMs = 86400000;
function expiryInfo(expiryDate?: string): { label: string; variant: 'green' | 'amber' | 'red' | 'gray'; days: number | null } {
  if (!expiryDate) return { label: 'No expiry', variant: 'gray', days: null };
  const e = new Date(expiryDate);
  if (isNaN(e.getTime())) return { label: '—', variant: 'gray', days: null };
  const t = new Date();
  const d = Math.round((Date.UTC(e.getFullYear(), e.getMonth(), e.getDate()) - Date.UTC(t.getFullYear(), t.getMonth(), t.getDate())) / dayMs);
  if (d < 0) return { label: `Expired ${-d}d ago`, variant: 'red', days: d };
  if (d === 0) return { label: 'Expires today', variant: 'red', days: 0 };
  if (d <= 90) return { label: `${d}d left`, variant: 'amber', days: d };
  return { label: `${d}d left`, variant: 'green', days: d };
}

const TABS = [
  { id: 'information', label: 'Company Information', icon: <Building2 size={15} /> },
  { id: 'statutory', label: 'Company Documents', icon: <ShieldCheck size={15} /> },
  { id: 'branding', label: 'Branding & Assets', icon: <Palette size={15} /> },
  { id: 'contacts', label: 'Contacts & Management', icon: <Users size={15} /> },
  { id: 'branches', label: 'Branch Information', icon: <GitBranch size={15} /> },
  { id: 'audit', label: 'Audit Timeline', icon: <History size={15} /> },
] as const;
type TabId = typeof TABS[number]['id'];

interface CompanyProfileProps {
  role: Role;
  activeCompanyId: string;
  companies: Company[];
  authProfile: UserAccount | null;
  onUpdateCompanies?: (companies: any) => void;
  onNavigate?: (page: any) => void;
}

export const CompanyProfile: React.FC<CompanyProfileProps> = ({ onUpdateCompanies, onNavigate }) => {
  const { canEdit } = usePermissions();
  const editable = canEdit('company-profile');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<TabId>('information');
  const [profile, setProfile] = useState<any>(null);
  const [form, setForm] = useState<Record<string, any>>({});

  const load = async () => {
    try {
      const data = await api.companyProfile.get();
      setProfile(data);
      const f: Record<string, any> = {};
      for (const k of ALL_EDIT_FIELDS) f[k] = (data?.company?.[k] ?? '');
      setForm(f);
    } catch (e) {
      ui.toast.error(getApiErrorMessage(e) || 'Could not load the company profile.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setField = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!editable || !profile?.company?.id) return;
    setSaving(true);
    try {
      await api.companies.updateBranding(String(profile.company.id), form);
      ui.toast.success('Company profile saved.');
      await load();
      if (onUpdateCompanies) {
        try { const cos = await api.companies.getAll(); onUpdateCompanies(cos); } catch { /* non-fatal */ }
      }
    } catch (e) {
      ui.toast.error(getApiErrorMessage(e) || 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full p-12 text-slate-400 text-sm">Loading company profile…</div>;
  }
  if (!profile?.company) {
    return <div className="flex items-center justify-center h-full p-12 text-slate-400 text-sm">No company in context.</div>;
  }

  const company = profile.company;
  const companyName = company.legalName || company.name || company.displayName || 'Company';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-[#EDF4FF] flex items-center justify-center overflow-hidden border border-[#E5EFFF]">
            {company.logoImage ? <img src={company.logoImage} alt="" className="w-full h-full object-cover" /> : <Building2 size={20} className="text-[#4F7CFF]" />}
          </div>
          <div>
            <h1 className="text-lg font-extrabold text-slate-800 tracking-tight">{companyName}</h1>
            <p className="text-xs text-slate-500 font-semibold">Company Profile — master repository {!editable && '· Read-only'}</p>
          </div>
        </div>
        {editable && (tab === 'information' || tab === 'branding') && (
          <Button onClick={handleSave} loading={saving} icon={<Save size={14} />}>Save Changes</Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-slate-200 pb-px">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 -mb-px transition-colors ${tab === t.id ? 'border-[#4F7CFF] text-[#4F7CFF]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {tab === 'information' && (
        <div className="space-y-5">
          <FieldSection title="Basic Information" fields={BASIC_FIELDS} form={form} company={company} editable={editable} onChange={setField} />
          <FieldSection title="Registration Information" fields={REGISTRATION_FIELDS} form={form} company={company} editable={editable} onChange={setField} />
          <FieldSection title="Address" fields={ADDRESS_FIELDS} form={form} company={company} editable={editable} onChange={setField} />
          <FieldSection title="Contact Details" fields={CONTACT_FIELDS} form={form} company={company} editable={editable} onChange={setField} />
        </div>
      )}

      {tab === 'statutory' && (
        <ComplianceManagement companyId={String(company.id)} company={company} editable={editable} />
      )}

      {tab === 'branding' && (
        <div className="space-y-5">
          <FieldSection title="Branding Text" fields={BRANDING_TEXT_FIELDS} form={form} company={company} editable={editable} onChange={setField} />
          <Card className="!bg-white !border-slate-200 !text-slate-700 !shadow-sm">
            <h2 className="text-sm font-extrabold text-slate-800 mb-4">Branding & Assets</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {BRANDING_IMAGE_FIELDS.map(f => (
                <ImageField key={f.key} label={f.label} value={form[f.key]} editable={editable} onChange={(v) => setField(f.key, v)} />
              ))}
            </div>
          </Card>
        </div>
      )}

      {tab === 'contacts' && (
        <CompanyContacts profile={profile} editable={editable} reload={load} />
      )}

      {tab === 'branches' && (
        <CompanyBranches profile={profile} onNavigate={onNavigate} />
      )}

      {tab === 'audit' && (
        <CompanyAudit />
      )}
    </div>
  );
};

// ── Document-health banner ───────────────────────────────────────────────────
const DocumentHealthBanner: React.FC<{ health: any; onOpen: () => void }> = ({ health, onOpen }) => {
  const c = health.counts || {};
  const expired = c.expired || 0;
  const soon = (c.today || 0) + (c.d30 || 0) + (c.d60 || 0) + (c.d90 || 0);
  const missing = (health.missing || []).length;
  if (!expired && !soon && !missing) {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-xs font-bold text-emerald-700">
        <CheckCircle2 size={15} /> All company documents are valid and complete.
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-amber-50 border border-amber-200 px-4 py-2.5">
      <AlertTriangle size={16} className="text-amber-600" />
      <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
        {expired > 0 && <span className="text-rose-600">🔴 {expired} expired</span>}
        {soon > 0 && <span className="text-amber-700">🟡 {soon} expiring soon</span>}
        {missing > 0 && <span className="text-slate-600">📄 {missing} required missing</span>}
      </div>
      <button onClick={onOpen} className="ml-auto text-xs font-bold text-[#4F7CFF] hover:underline">Review documents →</button>
    </div>
  );
};

// ── Reusable field section ───────────────────────────────────────────────────
const FieldSection: React.FC<{ title: string; fields: FieldDef[]; form: Record<string, any>; company: any; editable: boolean; onChange: (k: string, v: any) => void; }> =
  ({ title, fields, form, company, editable, onChange }) => (
    <Card className="!bg-white !border-slate-200 !text-slate-700 !shadow-sm">
      <h2 className="text-sm font-extrabold text-slate-800 mb-4">{title}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {fields.map(f => {
          const value = f.readOnly ? (company?.[f.key] ?? '') : (form[f.key] ?? '');
          const disabled = !editable || f.readOnly;
          if (f.type === 'textarea') {
            return <div key={f.key} className="md:col-span-2 lg:col-span-3"><Textarea label={f.label} value={value} disabled={disabled} onChange={e => onChange(f.key, e.target.value)} /></div>;
          }
          if (f.type === 'select') {
            return <Select key={f.key} label={f.label} value={value} disabled={disabled} onChange={e => onChange(f.key, e.target.value)}
              options={[{ value: '', label: '— Select —' }, ...(f.options || []).map(o => ({ value: o, label: o }))]} />;
          }
          return <Input key={f.key} label={f.label} type={f.type === 'date' ? 'date' : f.type === 'email' ? 'email' : 'text'} value={value} disabled={disabled} onChange={e => onChange(f.key, e.target.value)} />;
        })}
      </div>
    </Card>
  );

// ── Image upload field ───────────────────────────────────────────────────────
const ImageField: React.FC<{ label: string; value?: string; editable: boolean; onChange: (v: string) => void; }> = ({ label, value, editable, onChange }) => {
  const ref = useRef<HTMLInputElement>(null);
  const pick = async (file?: File) => {
    if (!file) return;
    try { const r = await readFileAsDataUrl(file, MAX_IMG_BYTES); onChange(r.dataUrl); }
    catch (e: any) { ui.toast.error(e?.message || 'Upload failed.'); }
  };
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">{label}</label>
      <div className="relative h-24 rounded-xl border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center overflow-hidden">
        {value
          ? <img src={value} alt={label} className="w-full h-full object-contain" />
          : <span className="text-[10px] text-slate-400 font-semibold">No image</span>}
        {editable && (
          <div className="absolute bottom-1 right-1 flex gap-1">
            <button onClick={() => ref.current?.click()} className="p-1 rounded-md bg-white border border-slate-200 text-slate-600 hover:text-[#4F7CFF] shadow-sm" title="Upload"><Upload size={12} /></button>
            {value && <button onClick={() => onChange('')} className="p-1 rounded-md bg-white border border-slate-200 text-rose-500 shadow-sm" title="Remove"><X size={12} /></button>}
          </div>
        )}
        <input ref={ref} type="file" accept="image/*" className="hidden" onChange={e => pick(e.target.files?.[0])} />
      </div>
    </div>
  );
};

// ── Company Documents ────────────────────────────────────────────────────────
const blankDoc = { name: '', category: 'Legal', type: '', documentNumber: '', issuingAuthority: '', issueDate: '', expiryDate: '', renewalDate: '', status: 'Verified', remarks: '', fileData: '', mimeType: '', size: '' };

const CompanyDocuments: React.FC<{ profile: any; editable: boolean; reload: () => Promise<void> }> = ({ profile, editable, reload }) => {
  const docs: any[] = profile.documents || [];
  const missing: any[] = profile.documentHealth?.missing || [];
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<any>(null);
  const [draft, setDraft] = useState<any>(blankDoc);
  const [q, setQ] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = docs.filter(d => !q || `${d.name} ${d.category} ${d.documentNumber}`.toLowerCase().includes(q.toLowerCase()));

  const openNew = () => { setEditId(null); setDraft(blankDoc); setOpen(true); };
  const openEdit = (d: any) => { setEditId(d.id); setDraft({ ...blankDoc, ...d }); setOpen(true); };

  const pickFile = async (file?: File) => {
    if (!file) return;
    try { const r = await readFileAsDataUrl(file, MAX_FILE_BYTES); setDraft((p: any) => ({ ...p, fileData: r.dataUrl, mimeType: r.mimeType, size: r.size, name: p.name || r.fileName })); }
    catch (e: any) { ui.toast.error(e?.message || 'Upload failed.'); }
  };

  const save = async () => {
    if (!draft.name?.trim()) { ui.toast.error('Document name is required.'); return; }
    try {
      if (editId) await api.companyProfile.documents.update(editId, draft);
      else await api.companyProfile.documents.create(draft);
      ui.toast.success('Document saved.');
      setOpen(false); await reload();
    } catch (e) { ui.toast.error(getApiErrorMessage(e) || 'Could not save the document.'); }
  };

  const remove = async (d: any) => {
    const ok = await ui.confirm({ message: `Delete "${d.name}"? This cannot be undone.`, variant: 'danger', confirmText: 'Delete' });
    if (!ok) return;
    try { await api.companyProfile.documents.remove(d.id); ui.toast.success('Document deleted.'); await reload(); }
    catch (e) { ui.toast.error(getApiErrorMessage(e) || 'Could not delete.'); }
  };

  const download = (d: any) => {
    if (!d.fileData && !d.url) { ui.toast.info('No file attached.'); return; }
    const a = document.createElement('a'); a.href = d.fileData || d.url; a.download = d.name || 'document'; a.target = '_blank'; a.click();
  };

  return (
    <div className="space-y-4">
      {missing.length > 0 && (
        <Card className="!bg-white !border-slate-200 !text-slate-700 !shadow-sm">
          <h3 className="text-xs font-extrabold text-slate-800 mb-2">Required Documents Checklist</h3>
          <div className="flex flex-wrap gap-2">
            {missing.map((m: any) => <Badge key={m.key} variant="red">Missing: {m.label}</Badge>)}
          </div>
        </Card>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search documents…" className="pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-700 w-64 focus:outline-none focus:border-[#4F7CFF]" />
        </div>
        <div className="flex items-center gap-2">
          <ExportMenu
            fileName="Company_Documents"
            title="Company Documents"
            columns={[
              { header: 'Name', key: 'name', width: 28 }, { header: 'Category', key: 'category', width: 16 },
              { header: 'Number', key: 'documentNumber', width: 18 }, { header: 'Issue Date', key: 'issueDate', width: 14 },
              { header: 'Expiry Date', key: 'expiryDate', width: 14 }, { header: 'Status', key: 'status', width: 12 },
            ]}
            rows={() => filtered}
            size="sm"
          />
          {editable && <Button size="sm" icon={<Plus size={14} />} onClick={openNew}>Add Document</Button>}
        </div>
      </div>

      <Table>
        <Thead><Tr>
          <Th>Document</Th><Th>Category</Th><Th>Number</Th><Th>Issue</Th><Th>Expiry</Th><Th>Status</Th><Th>Actions</Th>
        </Tr></Thead>
        <Tbody>
          {filtered.length === 0 && <Tr><Td colSpan={7}><span className="text-slate-400">No company documents yet.</span></Td></Tr>}
          {filtered.map(d => {
            const exp = expiryInfo(d.expiryDate);
            return (
              <Tr key={d.id}>
                <Td className="!text-slate-200">{d.name}</Td>
                <Td>{d.category || d.type || '—'}</Td>
                <Td>{d.documentNumber || '—'}</Td>
                <Td>{d.issueDate ? formatDate(d.issueDate) : '—'}</Td>
                <Td><Badge variant={exp.variant} dot>{exp.label}</Badge></Td>
                <Td>{d.status || '—'}</Td>
                <Td>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => download(d)} className="text-slate-400 hover:text-[#4F7CFF]" title="Download/Preview"><Download size={14} /></button>
                    {editable && <button onClick={() => openEdit(d)} className="text-slate-400 hover:text-indigo-400" title="Edit"><Edit size={14} /></button>}
                    {editable && <button onClick={() => remove(d)} className="text-slate-400 hover:text-rose-400" title="Delete"><Trash2 size={14} /></button>}
                  </div>
                </Td>
              </Tr>
            );
          })}
        </Tbody>
      </Table>

      <Modal open={open} onClose={() => setOpen(false)} title={editId ? 'Edit Document' : 'Add Company Document'} size="lg"
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} icon={<Save size={14} />}>Save</Button></>}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="Document Name" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
          <Select label="Category" value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })} options={DOC_CATEGORIES.map(c => ({ value: c, label: c }))} />
          <Input label="Document Number" value={draft.documentNumber} onChange={e => setDraft({ ...draft, documentNumber: e.target.value })} />
          <Input label="Issuing Authority" value={draft.issuingAuthority} onChange={e => setDraft({ ...draft, issuingAuthority: e.target.value })} />
          <Input label="Issue Date" type="date" value={draft.issueDate || ''} onChange={e => setDraft({ ...draft, issueDate: e.target.value })} />
          <Input label="Expiry Date" type="date" value={draft.expiryDate || ''} onChange={e => setDraft({ ...draft, expiryDate: e.target.value })} />
          <Input label="Renewal Date" type="date" value={draft.renewalDate || ''} onChange={e => setDraft({ ...draft, renewalDate: e.target.value })} />
          <Select label="Status" value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value })} options={DOC_STATUSES.map(s => ({ value: s, label: s }))} />
          <div className="md:col-span-2"><Textarea label="Remarks" value={draft.remarks || ''} onChange={e => setDraft({ ...draft, remarks: e.target.value })} /></div>
          <div className="md:col-span-2">
            <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">File Attachment</label>
            <div className="mt-1.5 flex items-center gap-2">
              <Button variant="outline" size="sm" icon={<Upload size={14} />} onClick={() => fileRef.current?.click()}>{draft.fileData ? 'Replace File' : 'Upload File'}</Button>
              {draft.size && <span className="text-xs text-slate-500">{draft.size}</span>}
              {draft.fileData && <Badge variant="green" dot>Attached</Badge>}
              <input ref={fileRef} type="file" className="hidden" accept=".jpg,.jpeg,.png,.pdf,.doc,.docx" onChange={e => pickFile(e.target.files?.[0])} />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};

// ── Contacts & Management ────────────────────────────────────────────────────
const blankContact = { name: '', designation: '', roleKey: '', mobile: '', email: '', photo: '', signature: '' };

const CompanyContacts: React.FC<{ profile: any; editable: boolean; reload: () => Promise<void> }> = ({ profile, editable, reload }) => {
  const contacts: any[] = profile.contacts || [];
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<any>(null);
  const [draft, setDraft] = useState<any>(blankContact);

  const openNew = () => { setEditId(null); setDraft(blankContact); setOpen(true); };
  const openEdit = (c: any) => { setEditId(c.id); setDraft({ ...blankContact, ...c }); setOpen(true); };

  const save = async () => {
    if (!draft.name?.trim()) { ui.toast.error('Name is required.'); return; }
    try {
      if (editId) await api.companyProfile.contacts.update(editId, draft);
      else await api.companyProfile.contacts.create(draft);
      ui.toast.success('Contact saved.'); setOpen(false); await reload();
    } catch (e) { ui.toast.error(getApiErrorMessage(e) || 'Could not save the contact.'); }
  };
  const remove = async (c: any) => {
    const ok = await ui.confirm({ message: `Remove ${c.name}?`, variant: 'danger', confirmText: 'Remove' });
    if (!ok) return;
    try { await api.companyProfile.contacts.remove(c.id); ui.toast.success('Contact removed.'); await reload(); }
    catch (e) { ui.toast.error(getApiErrorMessage(e) || 'Could not remove.'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">{editable && <Button size="sm" icon={<Plus size={14} />} onClick={openNew}>Add Contact</Button>}</div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {contacts.length === 0 && <p className="text-sm text-slate-400 col-span-full">No key personnel added yet.</p>}
        {contacts.map(c => (
          <Card key={c.id} className="!bg-white !border-slate-200 !text-slate-700 !shadow-sm">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-full bg-[#EDF4FF] overflow-hidden flex items-center justify-center flex-shrink-0">
                {c.photo ? <img src={c.photo} alt="" className="w-full h-full object-cover" /> : <Users size={18} className="text-[#4F7CFF]" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-extrabold text-slate-800 truncate">{c.name}</p>
                <p className="text-xs text-slate-500 font-semibold truncate">{c.designation || c.roleKey || '—'}</p>
                {c.email && <p className="text-[11px] text-slate-400 truncate">{c.email}</p>}
                {c.mobile && <p className="text-[11px] text-slate-400 truncate">{c.mobile}</p>}
              </div>
              {editable && (
                <div className="flex flex-col gap-1">
                  <button onClick={() => openEdit(c)} className="text-slate-400 hover:text-indigo-500" title="Edit"><Edit size={14} /></button>
                  <button onClick={() => remove(c)} className="text-slate-400 hover:text-rose-500" title="Remove"><Trash2 size={14} /></button>
                </div>
              )}
            </div>
            {c.signature && <img src={c.signature} alt="signature" className="mt-3 h-10 object-contain" />}
          </Card>
        ))}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editId ? 'Edit Contact' : 'Add Key Person'} size="lg"
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} icon={<Save size={14} />}>Save</Button></>}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="Name" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
          <Select label="Designation / Role" value={draft.designation} onChange={e => setDraft({ ...draft, designation: e.target.value })}
            options={[{ value: '', label: '— Select —' }, ...CONTACT_ROLES.map(r => ({ value: r, label: r }))]} />
          <Input label="Mobile" value={draft.mobile} onChange={e => setDraft({ ...draft, mobile: e.target.value })} />
          <Input label="Email" type="email" value={draft.email} onChange={e => setDraft({ ...draft, email: e.target.value })} />
          <ImageField label="Photo" value={draft.photo} editable onChange={(v) => setDraft({ ...draft, photo: v })} />
          <ImageField label="Digital Signature" value={draft.signature} editable onChange={(v) => setDraft({ ...draft, signature: v })} />
        </div>
      </Modal>
    </div>
  );
};

// ── Branch Information (read-only) ───────────────────────────────────────────
const CompanyBranches: React.FC<{ profile: any; onNavigate?: (p: string) => void }> = ({ profile, onNavigate }) => {
  const branches: any[] = profile.branches || [];
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <ExportMenu fileName="Branches" title="Branches"
          columns={[
            { header: 'Branch', key: 'branchName', width: 26 }, { header: 'Code', key: 'branchCode', width: 14 },
            { header: 'Location', key: 'location', width: 26 }, { header: 'Manager', key: 'adminName', width: 20 },
            { header: 'Employees', key: 'headcount', width: 12 }, { header: 'Status', key: 'status', width: 12 },
          ]}
          rows={() => branches} size="sm" />
      </div>
      <Table>
        <Thead><Tr><Th>Branch</Th><Th>Code</Th><Th>Location</Th><Th>Manager</Th><Th>Employees</Th><Th>Status</Th></Tr></Thead>
        <Tbody>
          {branches.length === 0 && <Tr><Td colSpan={6}><span className="text-slate-400">No branches.</span></Td></Tr>}
          {branches.map(b => (
            <Tr key={b.id} onClick={onNavigate ? () => onNavigate('companies') : undefined}>
              <Td className="!text-slate-200">{b.branchName}</Td>
              <Td>{b.branchCode || '—'}</Td>
              <Td>{b.location || '—'}</Td>
              <Td>{b.adminName || '—'}</Td>
              <Td>{b.headcount ?? 0}</Td>
              <Td><Badge variant={String(b.status).toLowerCase() === 'active' ? 'green' : 'gray'}>{b.status || '—'}</Badge></Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </div>
  );
};

// ── Audit Timeline ───────────────────────────────────────────────────────────
const CompanyAudit: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.companyProfile.audit().then((d: any) => setLogs(Array.isArray(d) ? d : [])).catch(() => setLogs([])).finally(() => setLoading(false));
  }, []);
  if (loading) return <p className="text-sm text-slate-400 p-6">Loading timeline…</p>;
  const parse = (s: string) => { try { return JSON.parse(s || '{}'); } catch { return {}; } };
  return (
    <Table>
      <Thead><Tr><Th>When</Th><Th>Action</Th><Th>Module</Th><Th>By</Th><Th>Details</Th></Tr></Thead>
      <Tbody>
        {logs.length === 0 && <Tr><Td colSpan={5}><span className="text-slate-400">No changes recorded yet.</span></Td></Tr>}
        {logs.map(l => {
          const d = parse(l.details);
          return (
            <Tr key={l.id}>
              <Td><span className="flex items-center gap-1.5"><Clock size={12} className="text-slate-500" />{formatDateTime(l.createdAt)}</span></Td>
              <Td className="!text-slate-200">{l.action}</Td>
              <Td>{l.module}</Td>
              <Td>{l.actorName}{l.actorRole ? ` (${l.actorRole})` : ''}</Td>
              <Td>{d.fields ? `Fields: ${(d.fields || []).join(', ')}` : (d.op || '—')}</Td>
            </Tr>
          );
        })}
      </Tbody>
    </Table>
  );
};

export default CompanyProfile;
