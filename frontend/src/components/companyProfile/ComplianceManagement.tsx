import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ShieldCheck, ChevronDown, ChevronRight, Plus, Edit, Trash2, Upload, Download, Save,
  Search, AlertTriangle, FileClock, X, History, Eye,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { type ExportColumn } from '@/utils/exportUtils';
import { ExportWizard, type ExportReportType, type ExportWizardConfig } from '@/components/export/ExportWizard';
import { api } from '@/api/apiClient';
import { ui } from '@/components/ui/feedback';
import { formatDate } from '@/utils/formatDate';
import { getApiErrorMessage } from '@/utils/apiError';

// ── Compliance catalog (single UI source of truth) ───────────────────────────
// `companyField` prefills the registration number from the existing Company record
// so there is no duplicate entry; saving syncs it back to that field.
interface CatalogItem { key: string; label: string; mandatory?: boolean; companyField?: string; }
interface CatalogCategory { id: string; label: string; items: CatalogItem[]; }

const CATALOG: CatalogCategory[] = [
  { id: 'Labour', label: 'Labour Compliance', items: [
    { key: 'labour_license', label: 'Labour License', companyField: 'labourLicenseNumber' },
    { key: 'contract_labour_license', label: 'Contract Labour License' },
    { key: 'shops_establishment', label: 'Shops & Establishment Registration', mandatory: true, companyField: 'shopEstablishmentNumber' },
    { key: 'factory_license', label: 'Factory License', companyField: 'factoryLicenseNumber' },
  ] },
  { id: 'Payroll', label: 'Payroll Compliance', items: [
    { key: 'pf_registration', label: 'PF Registration', mandatory: true, companyField: 'pfCode' },
    { key: 'esi_registration', label: 'ESI Registration', mandatory: true, companyField: 'esiCode' },
    { key: 'professional_tax', label: 'Professional Tax Registration', mandatory: true, companyField: 'ptaxRegistrationNumber' },
    { key: 'labour_welfare_fund', label: 'Labour Welfare Fund' },
  ] },
  { id: 'Tax', label: 'Tax Compliance', items: [
    { key: 'gst_registration', label: 'GST Registration', mandatory: true, companyField: 'gstNumber' },
    { key: 'pan', label: 'PAN', mandatory: true, companyField: 'panNumber' },
    { key: 'tan', label: 'TAN', mandatory: true, companyField: 'tanNumber' },
    { key: 'tds_registration', label: 'TDS Registration' },
  ] },
  { id: 'Business', label: 'Business Registration', items: [
    { key: 'cin', label: 'CIN', companyField: 'cinNumber' },
    { key: 'msme_udyam', label: 'MSME / Udyam', companyField: 'msmeNumber' },
    { key: 'iec', label: 'IEC', companyField: 'iecCode' },
    { key: 'trade_license', label: 'Trade License' },
    { key: 'startup_india', label: 'Startup India Registration' },
  ] },
  { id: 'Industry', label: 'Industry Compliance', items: [
    { key: 'fssai', label: 'FSSAI', companyField: 'fssaiNumber' },
    { key: 'pollution_control', label: 'Pollution Control Board' },
    { key: 'fire_noc', label: 'Fire NOC' },
    { key: 'environmental_clearance', label: 'Environmental Clearance' },
    { key: 'electrical_safety', label: 'Electrical Safety' },
    { key: 'building_safety', label: 'Building Safety' },
    { key: 'iso', label: 'ISO Certifications', companyField: 'isoCertNumber' },
  ] },
  { id: 'Insurance', label: 'Insurance', items: [
    { key: 'workmen_compensation', label: 'Workmen Compensation Insurance' },
    { key: 'group_health', label: 'Group Medical Insurance' },
    { key: 'general_liability', label: 'General Liability Insurance' },
    { key: 'professional_indemnity', label: 'Professional Indemnity Insurance' },
    { key: 'asset_insurance', label: 'Asset Insurance' },
  ] },
  { id: 'Legal', label: 'Financial & Legal Documents', items: [
    { key: 'incorporation_certificate', label: 'Certificate of Incorporation' },
    { key: 'moa', label: 'Memorandum of Association (MOA)' },
    { key: 'aoa', label: 'Articles of Association (AOA)' },
    { key: 'partnership_llp_deed', label: 'Partnership Deed / LLP Agreement' },
    { key: 'bank_documents', label: 'Bank Documents (Cancelled Cheque, Bank Letter)' },
    { key: 'audit_reports', label: 'Audit Reports' },
    { key: 'financial_statements', label: 'Financial Statements' },
  ] },
  { id: 'HR', label: 'HR & Internal Policies', items: [
    { key: 'hr_policy', label: 'HR Policy' },
    { key: 'leave_policy', label: 'Leave Policy' },
    { key: 'attendance_policy', label: 'Attendance Policy' },
    { key: 'payroll_policy', label: 'Payroll Policy' },
    { key: 'posh_policy', label: 'POSH Policy' },
    { key: 'employee_handbook', label: 'Employee Handbook' },
    { key: 'code_of_conduct', label: 'Code of Conduct' },
    { key: 'org_chart', label: 'Organization Chart' },
  ] },
  // NOTE: The "Other Company Documents" category (Company Profile PDF, Brochure,
  // Authorized Signature, Company Seal, Letterhead, DSC) was intentionally removed
  // from this manual module. In an upcoming phase these are synced automatically
  // from their source modules (Branding & Assets, Digital Signature, Company
  // Profile). Legacy records with category 'Other' remain in the DB but are hidden
  // here (see HIDDEN_CATEGORIES) — no data is deleted.
];

// Categories that must never render in this manual module (managed elsewhere).
const HIDDEN_CATEGORIES = new Set(['Other']);
const CATALOG_BY_KEY: Record<string, CatalogItem & { category: string }> = {};
CATALOG.forEach(c => c.items.forEach(it => { CATALOG_BY_KEY[it.key] = { ...it, category: c.id }; }));

const dayMs = 86400000;
const daysUntil = (d?: string) => {
  if (!d) return null;
  const e = new Date(d); if (isNaN(e.getTime())) return null;
  const t = new Date();
  return Math.round((Date.UTC(e.getFullYear(), e.getMonth(), e.getDate()) - Date.UTC(t.getFullYear(), t.getMonth(), t.getDate())) / dayMs);
};

type Status = 'Active' | 'Expiring Soon' | 'Expired' | 'Pending Renewal' | 'Missing';
function computeStatus(rec: any, mandatory: boolean): { status: Status; days: number | null } {
  if (!rec) return { status: mandatory ? 'Missing' : 'Missing', days: null };
  const days = daysUntil(rec.expiryDate);
  if (days === null) return { status: (rec.status as Status) || 'Active', days: null };
  if (days < 0) return { status: 'Expired', days };
  const rdays = daysUntil(rec.renewalDate);
  if (rdays !== null && rdays < 0) return { status: 'Pending Renewal', days };
  if (days <= (Number(rec.reminderDays) || 45)) return { status: 'Expiring Soon', days };
  return { status: 'Active', days };
}
const STATUS_BADGE: Record<Status, 'green' | 'amber' | 'red' | 'indigo' | 'gray'> = {
  Active: 'green', 'Expiring Soon': 'amber', Expired: 'red', 'Pending Renewal': 'indigo', Missing: 'gray',
};
const STATUS_DOT: Record<Status, string> = {
  Active: '🟢', 'Expiring Soon': '🟡', Expired: '🔴', 'Pending Renewal': '🟠', Missing: '⚪',
};

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const formatBytes = (b: number) => b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(2)} MB`;
const readFile = (file: File): Promise<{ dataUrl: string; mimeType: string; size: string; fileName: string }> =>
  new Promise((resolve, reject) => {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!['pdf', 'jpg', 'jpeg', 'png', 'docx', 'xlsx'].includes(ext)) { reject(new Error('Allowed: PDF, DOCX, XLSX, JPG, PNG.')); return; }
    if (file.size > MAX_FILE_BYTES) { reject(new Error(`Too large (${formatBytes(file.size)}). Max ${formatBytes(MAX_FILE_BYTES)}.`)); return; }
    const r = new FileReader();
    r.onload = () => resolve({ dataUrl: String(r.result), mimeType: file.type || `application/${ext}`, size: formatBytes(file.size), fileName: file.name });
    r.onerror = () => reject(new Error('Could not read the file.'));
    r.readAsDataURL(file);
  });

interface DisplayItem {
  key: string; name: string; category: string; mandatory: boolean;
  record: any | null; status: Status; days: number | null;
}

// Full set drives the type + matchesFilter() — the extra values remain reachable
// internally (notifications, reports) even though only a few chips are shown.
const STATUS_FILTERS = ['All', 'Active', 'Expiring', 'Expired', 'Missing', 'Mandatory', 'Optional'] as const;
type StatusFilter = typeof STATUS_FILTERS[number];
// Only these quick-filter chips are shown in the toolbar (cleaner enterprise UI);
// the rest remain reachable via the Category dropdown / future advanced filter.
const VISIBLE_STATUS_FILTERS: StatusFilter[] = ['All', 'Active', 'Expired'];

interface Props { companyId: string; company: any; editable: boolean; generatedBy?: string; }

// Map a computed compliance Status → one of the 4 export status buckets.
const STATUS_BUCKET: Record<Status, 'Active' | 'Expiring' | 'Expired' | 'Missing'> = {
  Active: 'Active', 'Expiring Soon': 'Expiring', 'Pending Renewal': 'Expiring', Expired: 'Expired', Missing: 'Missing',
};

export const ComplianceManagement: React.FC<Props> = ({ companyId, company, editable, generatedBy }) => {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('All');
  const [catFilter, setCatFilter] = useState<string>('All');
  const [openCats, setOpenCats] = useState<Set<string>>(new Set(CATALOG.map(c => c.id)));
  const [modal, setModal] = useState(false);
  const [draft, setDraft] = useState<any>(null);
  const [catalogItem, setCatalogItem] = useState<(CatalogItem & { category: string }) | null>(null);
  const [versionsFor, setVersionsFor] = useState<any | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    try {
      const data = await api.companyProfile.compliance.list(true);
      setRecords(Array.isArray(data?.records) ? data.records : []);
    } catch (e) {
      ui.toast.error(getApiErrorMessage(e) || 'Could not load compliance data.');
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const recByKey = useMemo(() => {
    const m: Record<string, any> = {};
    for (const r of records) m[r.complianceKey] = r;
    return m;
  }, [records]);

  // Build the full display list: catalog items (merged with their record) + any
  // custom records that aren't in the catalog.
  const allItems: DisplayItem[] = useMemo(() => {
    const items: DisplayItem[] = [];
    for (const cat of CATALOG) {
      for (const it of cat.items) {
        const rec = recByKey[it.key] || null;
        const { status, days } = computeStatus(rec, !!it.mandatory);
        items.push({ key: it.key, name: it.label, category: cat.id, mandatory: !!it.mandatory, record: rec, status, days });
      }
    }
    for (const r of records) {
      // Skip records whose category is managed elsewhere (e.g. legacy 'Other').
      // Data stays in the DB; it is simply not surfaced in this manual module.
      if (!CATALOG_BY_KEY[r.complianceKey] && !HIDDEN_CATEGORIES.has(r.category || 'Other')) {
        const { status, days } = computeStatus(r, !!r.mandatory);
        items.push({ key: r.complianceKey, name: r.name, category: r.category || 'Other', mandatory: !!r.mandatory, record: r, status, days });
      }
    }
    return items;
  }, [records, recByKey]);

  const summary = useMemo(() => {
    const withRec = allItems.filter(i => i.record);
    return {
      total: withRec.length,
      active: withRec.filter(i => i.status === 'Active').length,
      expiring45: withRec.filter(i => i.days != null && i.days >= 0 && i.days <= 45).length,
      expired: withRec.filter(i => i.status === 'Expired').length,
    };
  }, [allItems]);

  const matchesFilter = (i: DisplayItem) => {
    if (filter === 'All') return true;
    if (filter === 'Active') return i.status === 'Active';
    if (filter === 'Expiring') return i.status === 'Expiring Soon';
    if (filter === 'Expired') return i.status === 'Expired';
    if (filter === 'Missing') return i.status === 'Missing';
    if (filter === 'Mandatory') return i.mandatory;
    if (filter === 'Optional') return !i.mandatory;
    return true;
  };
  const filteredItems = allItems.filter(i =>
    (!q || `${i.name} ${i.category} ${i.record?.registrationNumber || ''}`.toLowerCase().includes(q.toLowerCase()))
    && (catFilter === 'All' || i.category === catFilter) && matchesFilter(i)
  );

  // Categories to render = catalog + any extra category present only in records
  // (e.g. migrated company documents with a non-catalog category).
  const renderCats = useMemo(() => {
    const known = new Set(CATALOG.map(c => c.id));
    const extras = Array.from(new Set(records.map(r => r.category || 'Other').filter(c => !known.has(c) && !HIDDEN_CATEGORIES.has(c)))).map(id => ({ id, label: id }));
    return [...CATALOG.map(c => ({ id: c.id, label: c.label })), ...extras];
  }, [records]);

  // ── Master export config (drives the reusable <ExportWizard>) ──────────────
  const catLabel = (id: string) => renderCats.find(c => c.id === id)?.label || id;
  const exportConfig: ExportWizardConfig = useMemo(() => {
    const rows = allItems.map(i => ({
      name: i.name,
      categoryId: i.category,
      categoryLabel: catLabel(i.category),
      mandatoryLabel: i.mandatory ? 'Yes' : 'No',
      registrationNumber: i.record?.registrationNumber || '',
      certificateNumber: i.record?.certificateNumber || '',
      issueDate: i.record?.issueDate ? formatDate(i.record.issueDate) : '',
      expiryDate: i.record?.expiryDate ? formatDate(i.record.expiryDate) : '',
      uploadedDate: i.record?.createdAt ? formatDate(i.record.createdAt) : '',
      uploadedBy: i.record?.uploadedBy || '',
      statusLabel: i.status,
      daysLabel: i.days == null ? '' : i.days < 0 ? `${Math.abs(i.days)}d overdue` : `${i.days}d left`,
      // internals for filtering / sorting / attachments
      status: STATUS_BUCKET[i.status],
      hasRecord: !!i.record,
      days: i.days,
      _issueRaw: i.record?.issueDate || '',
      _expiryRaw: i.record?.expiryDate || '',
      _uploadedRaw: i.record?.createdAt || '',
      _attachment: i.record?.fileData ? { fileName: i.record.fileName, fileData: i.record.fileData, mimeType: i.record.mimeType } : null,
    }));

    const C = (header: string, key: string, width = 16): ExportColumn => ({ header, key, width });
    const reportTypes: ExportReportType[] = [
      { id: 'register', label: 'Company Document Register', baseFilter: r => r.hasRecord,
        columns: [C('Document', 'name', 26), C('Category', 'categoryLabel'), C('Reg. No', 'registrationNumber', 18), C('Certificate No', 'certificateNumber', 16), C('Issue', 'issueDate', 13), C('Expiry', 'expiryDate', 13), C('Status', 'statusLabel', 12), C('Uploaded By', 'uploadedBy', 16)] },
      { id: 'compliance', label: 'Compliance Report',
        columns: [C('Compliance', 'name', 26), C('Category', 'categoryLabel'), C('Mandatory', 'mandatoryLabel', 11), C('Status', 'statusLabel', 12), C('Expiry', 'expiryDate', 13), C('Days Left', 'daysLabel', 12)] },
      { id: 'expiry', label: 'Expiry Report', baseFilter: r => !!r._expiryRaw,
        columns: [C('Document', 'name', 26), C('Category', 'categoryLabel'), C('Expiry', 'expiryDate', 13), C('Days Left', 'daysLabel', 12), C('Status', 'statusLabel', 12)] },
      { id: 'expiring45', label: 'Expiring Within 45 Days', baseFilter: r => r.days != null && r.days >= 0 && r.days <= 45,
        columns: [C('Document', 'name', 26), C('Category', 'categoryLabel'), C('Expiry', 'expiryDate', 13), C('Days Left', 'daysLabel', 12), C('Status', 'statusLabel', 12)] },
      { id: 'expired', label: 'Expired Documents', baseFilter: r => r.status === 'Expired',
        columns: [C('Document', 'name', 26), C('Category', 'categoryLabel'), C('Expiry', 'expiryDate', 13), C('Days Left', 'daysLabel', 12), C('Status', 'statusLabel', 12)] },
      { id: 'missing', label: 'Missing Documents', baseFilter: r => r.status === 'Missing',
        columns: [C('Document', 'name', 28), C('Category', 'categoryLabel'), C('Mandatory', 'mandatoryLabel', 11)] },
      { id: 'active', label: 'Active Documents', baseFilter: r => r.status === 'Active',
        columns: [C('Document', 'name', 26), C('Category', 'categoryLabel'), C('Reg. No', 'registrationNumber', 18), C('Expiry', 'expiryDate', 13), C('Status', 'statusLabel', 12)] },
      { id: 'custom', label: 'Custom Report',
        columns: [C('Document', 'name', 26), C('Category', 'categoryLabel'), C('Mandatory', 'mandatoryLabel', 11), C('Reg. No', 'registrationNumber', 18), C('Certificate No', 'certificateNumber', 16), C('Issue', 'issueDate', 13), C('Expiry', 'expiryDate', 13), C('Uploaded', 'uploadedDate', 13), C('Uploaded By', 'uploadedBy', 16), C('Status', 'statusLabel', 12), C('Days Left', 'daysLabel', 12)] },
    ];

    return {
      entityName: 'Company Documents',
      title: 'Export Company Documents',
      reportTypes,
      rows,
      categories: renderCats,
      categoryOf: (r: any) => r.categoryId,
      statusOf: (r: any) => r.status,
      dateAccessors: { issue: (r: any) => r._issueRaw, expiry: (r: any) => r._expiryRaw, uploaded: (r: any) => r._uploadedRaw },
      sortAccessors: {
        name: (r: any) => (r.name || '').toLowerCase(), category: (r: any) => (r.categoryLabel || '').toLowerCase(),
        expiry: (r: any) => r._expiryRaw || '', issue: (r: any) => r._issueRaw || '', upload: (r: any) => r._uploadedRaw || '',
      },
      attachmentOf: (r: any) => r._attachment,
      company,
      // Only a real uploaded image is usable as a report logo (never the emblem text).
      companyLogo: /^data:image\//i.test(company?.logoImage || '') ? company.logoImage : undefined,
      generatedBy,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allItems, renderCats, company, generatedBy]);

  // ── Open the editor for a catalog/custom item ──────────────────────────────
  const openEditor = (item: DisplayItem) => {
    const cat = CATALOG_BY_KEY[item.key];
    setCatalogItem(cat || null);
    const base = item.record
      ? { ...item.record }
      : {
          complianceKey: item.key, name: item.name, category: item.category, mandatory: item.mandatory,
          registrationNumber: cat?.companyField ? (company?.[cat.companyField] || '') : '',
          certificateNumber: '', issuingAuthority: '', issueDate: '', expiryDate: '', renewalDate: '',
          reminderDays: 45, assignedTo: '', status: '', remarks: '', fileData: '', mimeType: '', fileName: '', fileSize: '',
          versionHistory: '',
        };
    setDraft(base);
    setModal(true);
  };

  // Add an ad-hoc company document not in the catalog (any category, free name).
  // Defaults to the first visible category so it never lands in a hidden one.
  const openCustom = () => {
    setCatalogItem(null);
    setDraft({
      complianceKey: `custom_${Date.now()}`, name: '', category: CATALOG[0]?.id || 'Legal', mandatory: false,
      registrationNumber: '', certificateNumber: '', issuingAuthority: '', issueDate: '', expiryDate: '', renewalDate: '',
      reminderDays: 45, assignedTo: '', status: '', remarks: '', fileData: '', mimeType: '', fileName: '', fileSize: '', versionHistory: '',
    });
    setModal(true);
  };

  const pickFile = async (file?: File) => {
    if (!file) return;
    try {
      const r = await readFile(file);
      setDraft((p: any) => {
        // Push the previous file (if any) into version history.
        let versions: any[] = [];
        try { versions = p.versionHistory ? JSON.parse(p.versionHistory) : []; } catch { versions = []; }
        if (p.fileData) {
          versions.unshift({ fileName: p.fileName, fileSize: p.fileSize, mimeType: p.mimeType, fileData: p.fileData, uploadedOn: new Date().toISOString().slice(0, 10) });
        }
        return { ...p, fileData: r.dataUrl, mimeType: r.mimeType, fileName: r.fileName, fileSize: r.size, versionHistory: JSON.stringify(versions.slice(0, 20)) };
      });
    } catch (e: any) { ui.toast.error(e?.message || 'Upload failed.'); }
  };

  const save = async () => {
    if (!draft?.name?.trim()) { ui.toast.error('Compliance name is required.'); return; }
    try {
      // Standardized policy: reminder is always 45 days and status is always
      // auto-computed from the dates — no manual override is exposed or saved.
      const payload = { ...draft, reminderDays: 45, status: '' };
      if (payload.id) await api.companyProfile.compliance.update(payload.id, payload);
      else await api.companyProfile.compliance.create(payload);
      // Keep the Company record as the single source of truth for the number.
      if (catalogItem?.companyField && draft.registrationNumber) {
        try { await api.companies.updateBranding(companyId, { [catalogItem.companyField]: draft.registrationNumber }); } catch { /* non-fatal */ }
      }
      ui.toast.success('Compliance record saved.');
      setModal(false); await load();
    } catch (e) { ui.toast.error(getApiErrorMessage(e) || 'Could not save the record.'); }
  };

  const remove = async (item: DisplayItem) => {
    if (!item.record) return;
    const ok = await ui.confirm({ message: `Delete the "${item.name}" compliance record?`, variant: 'danger', confirmText: 'Delete' });
    if (!ok) return;
    try { await api.companyProfile.compliance.remove(item.record.id); ui.toast.success('Deleted.'); await load(); }
    catch (e) { ui.toast.error(getApiErrorMessage(e) || 'Could not delete.'); }
  };

  const downloadFile = (fileData?: string, fileName?: string) => {
    if (!fileData) { ui.toast.info('No certificate attached.'); return; }
    const a = document.createElement('a'); a.href = fileData; a.download = fileName || 'certificate'; a.target = '_blank'; a.click();
  };

  // View/preview an uploaded document. PDFs & images open inline in a new tab;
  // other types fall back to download. Data URLs are converted to a Blob URL first
  // (browsers block top-level navigation to data: URLs). No document → friendly note.
  const previewFile = (rec?: any) => {
    const data = rec?.fileData || rec?.url;
    if (!data) { ui.toast.info('No document uploaded yet.'); return; }
    if (/^https?:\/\//i.test(data)) { window.open(data, '_blank', 'noopener'); return; }
    if (/^data:/i.test(data)) {
      try {
        const [meta, b64] = String(data).split(',');
        const mime = (meta.match(/data:([^;]+)/) || [])[1] || rec.mimeType || 'application/octet-stream';
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j);
        const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
        const w = window.open(url, '_blank', 'noopener');
        if (!w) downloadFile(data, rec.fileName); // popup blocked → download instead
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        return;
      } catch { downloadFile(data, rec.fileName); return; }
    }
    downloadFile(data, rec.fileName);
  };

  const toggleCat = (id: string) => setOpenCats(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  if (loading) return <p className="text-sm text-slate-400 p-6">Loading compliance data…</p>;

  const cards = [
    { label: 'Total Documents', value: summary.total, color: 'bg-brand-500' },
    { label: 'Active', value: summary.active, color: 'bg-emerald-500' },
    { label: 'Expiring in 45 Days', value: summary.expiring45, color: 'bg-amber-500' },
    { label: 'Expired', value: summary.expired, color: 'bg-rose-500' },
  ];

  return (
    <div className="space-y-5">
      {/* Dashboard summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map(c => (
          <div key={c.label} className="rounded-xl bg-white border border-slate-200 shadow-sm p-3.5">
            <div className={`w-7 h-7 rounded-lg ${c.color} flex items-center justify-center mb-2`}><ShieldCheck size={15} className="text-white" /></div>
            <p className="text-2xl font-extrabold text-slate-800">{c.value}</p>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search all company documents…" className="pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-700 w-60 focus:outline-none focus:border-[#6C3CF0]" />
          </div>
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)} className="py-2 px-3 text-xs rounded-xl border border-slate-200 bg-white text-slate-700 focus:outline-none focus:border-[#6C3CF0]">
            <option value="All">All Categories</option>
            {renderCats.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <div className="flex items-center gap-1 flex-wrap">
            {VISIBLE_STATUS_FILTERS.map(f => (
              <button key={f} onClick={() => setFilter(f)} className={`px-2.5 py-1.5 text-[11px] font-bold rounded-lg transition-colors ${filter === f ? 'bg-[#F3F0FF] text-[#6C3CF0]' : 'text-slate-500 hover:bg-slate-100'}`}>{f}</button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" icon={<Download size={14} />} onClick={() => setExportOpen(true)}>Reports</Button>
          {editable && <Button size="sm" icon={<Plus size={14} />} onClick={openCustom}>Add Document</Button>}
        </div>
      </div>

      {/* Professional master export wizard (reusable across modules) */}
      <ExportWizard open={exportOpen} onClose={() => setExportOpen(false)} config={exportConfig} />

      {/* Category accordions */}
      {renderCats.map(cat => {
        const items = filteredItems.filter(i => i.category === cat.id);
        if (!items.length) return null;
        const open = openCats.has(cat.id);
        const issues = items.filter(i => i.status === 'Expired' || i.status === 'Expiring Soon').length;
        return (
          <div key={cat.id} className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <button onClick={() => toggleCat(cat.id)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50">
              <span className="flex items-center gap-2 text-sm font-extrabold text-slate-800">
                {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}{cat.label}
                <span className="text-[11px] font-semibold text-slate-400">({items.length})</span>
              </span>
              {issues > 0 && <Badge variant="amber" dot>{issues} need attention</Badge>}
            </button>
            {open && (
              <div className="divide-y divide-slate-100">
                {items.map(i => (
                  <div
                    key={i.key}
                    onClick={() => { if (editable) openEditor(i); else previewFile(i.record); }}
                    title={editable ? (i.record ? 'Open document' : 'Upload document') : (i.record ? 'View document' : '')}
                    className={`flex flex-wrap items-center gap-3 px-4 py-3 transition-colors duration-150 ${(editable || i.record) ? 'cursor-pointer hover:bg-slate-50' : ''}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-slate-800">{i.name}</span>
                        <Badge variant={STATUS_BADGE[i.status]} dot>{STATUS_DOT[i.status]} {i.status}</Badge>
                        {i.days != null && i.status !== 'Expired' && <span className="text-[11px] text-slate-500 font-semibold">{i.days}d left</span>}
                        {i.status === 'Expired' && i.record?.expiryDate && <span className="text-[11px] text-rose-600 font-semibold">overdue {Math.abs(i.days || 0)}d</span>}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap gap-x-3">
                        {i.record?.registrationNumber && <span>Reg: {i.record.registrationNumber}</span>}
                        {i.record?.expiryDate && <span>Expires: {formatDate(i.record.expiryDate)}</span>}
                        {i.record?.assignedTo && <span>Owner: {i.record.assignedTo}</span>}
                      </div>
                    </div>
                    {/* Actions — do NOT trigger the row click. */}
                    <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                      <button onClick={() => previewFile(i.record)} className="text-slate-400 hover:text-[#6C3CF0]" title="View document"><Eye size={15} /></button>
                      {i.record?.fileData && <button onClick={() => downloadFile(i.record.fileData, i.record.fileName)} className="text-slate-400 hover:text-[#6C3CF0]" title="Download certificate"><Download size={15} /></button>}
                      {i.record?.versionHistory && i.record.versionHistory !== '[]' && <button onClick={() => setVersionsFor(i.record)} className="text-slate-400 hover:text-brand-500" title="Version history"><History size={15} /></button>}
                      {editable && <button onClick={() => openEditor(i)} className="text-slate-400 hover:text-brand-500" title={i.record ? 'Edit' : 'Add'}>{i.record ? <Edit size={15} /> : <Plus size={15} />}</button>}
                      {editable && i.record && <button onClick={() => remove(i)} className="text-slate-400 hover:text-rose-500" title="Delete"><Trash2 size={15} /></button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Editor modal */}
      {draft && (
        <Modal open={modal} onClose={() => setModal(false)} title={`${draft.id ? 'Edit' : 'Add'} Compliance — ${draft.name}`} size="lg"
          footer={<><Button variant="outline" onClick={() => setModal(false)}>Cancel</Button><Button onClick={save} icon={<Save size={14} />}>Save</Button></>}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Document / Compliance Name" value={draft.name || ''} onChange={e => setDraft({ ...draft, name: e.target.value })} disabled={!!catalogItem} />
            <Select label="Category" value={draft.category || 'Other'} disabled={!!catalogItem} onChange={e => setDraft({ ...draft, category: e.target.value })}
              options={CATALOG.map(c => ({ value: c.id, label: c.label }))} />
            <Input label="Registration Number" value={draft.registrationNumber || ''} onChange={e => setDraft({ ...draft, registrationNumber: e.target.value })} />
            <Input label="Certificate Number" value={draft.certificateNumber || ''} onChange={e => setDraft({ ...draft, certificateNumber: e.target.value })} />
            <Input label="Issue Date" type="date" value={draft.issueDate || ''} onChange={e => setDraft({ ...draft, issueDate: e.target.value })} />
            <Input label="Expiry Date" type="date" value={draft.expiryDate || ''} onChange={e => setDraft({ ...draft, expiryDate: e.target.value })} />
            {/* Reminder is standardized to 45 days (saved automatically); status is auto-computed from the dates. */}
            <div className="md:col-span-2"><Textarea label="Remarks" value={draft.remarks || ''} onChange={e => setDraft({ ...draft, remarks: e.target.value })} /></div>
            <div className="md:col-span-2">
              <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Certificate / Document (PDF, DOCX, XLSX, JPG, PNG)</label>
              <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                <Button variant="outline" size="sm" icon={<Upload size={14} />} onClick={() => fileRef.current?.click()}>{draft.fileData ? 'Replace' : 'Upload'}</Button>
                {draft.fileName && <span className="text-xs text-slate-500">{draft.fileName} {draft.fileSize ? `(${draft.fileSize})` : ''}</span>}
                {draft.fileData && <button onClick={() => downloadFile(draft.fileData, draft.fileName)} className="text-slate-400 hover:text-[#6C3CF0]"><Download size={14} /></button>}
                <input ref={fileRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx" onChange={e => pickFile(e.target.files?.[0])} />
              </div>
            </div>
            {draft.id && (
              <div className="md:col-span-2 text-[11px] text-slate-400 flex flex-wrap gap-x-4 border-t border-slate-100 pt-2">
                {draft.uploadedBy && <span>Uploaded by: <span className="text-slate-600 font-semibold">{draft.uploadedBy}</span></span>}
                {draft.createdAt && <span>Uploaded: {formatDate(draft.createdAt)}</span>}
                {draft.updatedAt && <span>Last modified: {formatDate(draft.updatedAt)}</span>}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Version history modal */}
      {versionsFor && (
        <Modal open={!!versionsFor} onClose={() => setVersionsFor(null)} title={`Version History — ${versionsFor.name}`} size="md"
          footer={<Button variant="outline" onClick={() => setVersionsFor(null)}>Close</Button>}>
          <VersionList record={versionsFor} onDownload={downloadFile} />
        </Modal>
      )}
    </div>
  );
};

const VersionList: React.FC<{ record: any; onDownload: (f?: string, n?: string) => void }> = ({ record, onDownload }) => {
  let versions: any[] = [];
  try { versions = record.versionHistory ? JSON.parse(record.versionHistory) : []; } catch { versions = []; }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2">
        <span className="text-xs font-bold text-emerald-700 flex items-center gap-1.5"><FileClock size={14} /> Current: {record.fileName || 'certificate'}</span>
        <button onClick={() => onDownload(record.fileData, record.fileName)} className="text-emerald-600 hover:text-emerald-800"><Download size={14} /></button>
      </div>
      {versions.length === 0 && <p className="text-xs text-slate-400">No previous versions.</p>}
      {versions.map((v, idx) => (
        <div key={idx} className="flex items-center justify-between rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
          <span className="text-xs font-semibold text-slate-600">{v.fileName || `version ${versions.length - idx}`} {v.uploadedOn ? `· ${v.uploadedOn}` : ''} {v.fileSize ? `· ${v.fileSize}` : ''}</span>
          <button onClick={() => onDownload(v.fileData, v.fileName)} className="text-slate-400 hover:text-[#6C3CF0]"><Download size={14} /></button>
        </div>
      ))}
    </div>
  );
};

export default ComplianceManagement;
