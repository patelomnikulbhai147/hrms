import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ChevronLeft, Save, Upload, Download, Trash2, FileText, Paperclip, Link2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { api } from '@/api/apiClient';
import { ui } from '@/components/ui/feedback';
import { formatDate } from '@/utils/formatDate';

// ── Option lists ─────────────────────────────────────────────────────────────
const CONTRACT_STATUSES = ['Draft', 'Active', 'Expiring Soon', 'Expired', 'Renewed', 'Closed'];
const CONTRACT_TYPES = ['Service', 'Supply', 'AMC', 'Project', 'Labour', 'Consultancy', 'Maintenance', 'Turnkey', 'Rate Contract', 'Other'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];
const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD'];
const PAY_FREQ = ['One-time', 'Monthly', 'Quarterly', 'Half-Yearly', 'Annually', 'Milestone-based'];
const YESNO = ['Yes', 'No'];
const BG_STATUSES = ['Active', 'Expiring Soon', 'Expired', 'Released', 'Claimed', 'Cancelled'];
const DEPOSIT_TYPES = ['Cash', 'Bank Guarantee', 'Demand Draft', 'Cheque', 'Online Transfer'];
const DEPOSIT_STATUSES = ['Held', 'Refunded', 'Forfeited', 'Partially Refunded'];
const PG_STATUSES = ['Active', 'Expired', 'Released', 'Invoked', 'Cancelled'];
const APPROVAL_STATUSES = ['Draft', 'Pending Approval', 'Approved', 'Rejected', 'Closed', 'Cancelled'];
const DOC_CATEGORIES = [
  'Signed Contract', 'Agreement Copy', 'Purchase Order', 'Work Order', 'Bank Guarantee',
  'Performance Guarantee', 'Insurance Certificate', 'NDA', 'GST Certificate', 'PAN Card',
  'Company Registration', 'Client Documents', 'Supporting Documents', 'Drawings', 'BOQ',
  'Technical Specifications', 'Annexures', 'Other Attachments',
];
const ALLOWED_RE = /\.(pdf|jpe?g|png|gif|webp|docx?|xlsx?|csv|txt|pptx?)$/i;
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB / file

const prettySize = (b: number) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

interface Props {
  editing: any | null;          // the contract being edited, or null for create
  activeCompanyId: string;
  onCancel: () => void;
  onSaved: () => void;
}

const TABS = [
  { id: 'info', label: 'Information' },
  { id: 'client', label: 'Client' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'financial', label: 'Financial' },
  { id: 'guarantees', label: 'Guarantees' },
  { id: 'documents', label: 'Documents' },
  { id: 'tender', label: 'Tender Link' },
  { id: 'approval', label: 'Approval' },
  { id: 'renewal', label: 'Renewal' },
  { id: 'compliance', label: 'Compliance' },
  { id: 'notes', label: 'Notes' },
  { id: 'activity', label: 'Activity' },
] as const;

export const ContractForm: React.FC<Props> = ({ editing, activeCompanyId, onCancel, onSaved }) => {
  // Core columns (existing schema) kept top-level; everything else under `details`.
  const [core, setCore] = useState<any>({
    contractNumber: editing?.contractNumber || '',
    contractName: editing?.contractName || '',
    clientName: editing?.clientName || '',
    contractValue: editing?.contractValue ?? '',
    startDate: (editing?.startDate || '').slice(0, 10),
    endDate: (editing?.endDate || '').slice(0, 10),
    status: editing?.status || 'Active',
    notes: editing?.notes || '',
  });
  const [details, setDetails] = useState<any>(editing?.details && typeof editing.details === 'object' ? editing.details : {});
  const [documents, setDocuments] = useState<any[]>(Array.isArray(editing?.documents) ? editing.documents : []);
  const [tab, setTab] = useState<string>('info');
  const [busy, setBusy] = useState(false);
  const [tenders, setTenders] = useState<any[]>([]);
  const [docCategory, setDocCategory] = useState<string>(DOC_CATEGORIES[0]);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const activity: any[] = Array.isArray(editing?.activity) ? editing.activity : [];

  useEffect(() => { api.tenders.getAll().then((t: any) => setTenders(Array.isArray(t) ? t : [])).catch(() => setTenders([])); }, []);

  // ── details path get/set (nested per section) ──
  const get = (path: string) => path.split('.').reduce((o: any, k) => (o == null ? undefined : o[k]), details);
  const setPath = (path: string, value: any) => setDetails((prev: any) => {
    const clone = { ...prev }; const keys = path.split('.'); let cur = clone;
    for (let i = 0; i < keys.length - 1; i++) { cur[keys[i]] = { ...(cur[keys[i]] || {}) }; cur = cur[keys[i]]; }
    cur[keys[keys.length - 1]] = value; return clone;
  });

  // Field renderer (plain function → no remount/focus-loss). `core` binds to a
  // top-level column; otherwise the value lives under details at `base.k`.
  type FCfg = { base?: string; k: string; label: string; type?: string; options?: string[]; full?: boolean; core?: boolean };
  const field = (cfg: FCfg) => {
    const { base, k, label, type = 'text', options, full, core: isCore } = cfg;
    const path = base ? `${base}.${k}` : k;
    const val = isCore ? (core[k] ?? '') : (get(path) ?? '');
    const onChange = (e: any) => isCore ? setCore({ ...core, [k]: e.target.value }) : setPath(path, e.target.value);
    const span = full ? 'sm:col-span-2 lg:col-span-3' : '';
    if (type === 'textarea') return <div key={path} className="sm:col-span-2 lg:col-span-3"><Textarea label={label} rows={3} value={val} onChange={onChange} /></div>;
    if (type === 'select') return <div key={path} className={span}><Select label={label} value={val} onChange={onChange} options={[{ value: '', label: '— Select —' }, ...(options || []).map(o => ({ value: o, label: o }))]} /></div>;
    return <div key={path} className={span}><Input label={label} type={type} value={val} onChange={onChange} /></div>;
  };

  const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4">
      <p className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mb-3">{title}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{children}</div>
    </div>
  );

  // ── Documents: read files → base64, validate, version-bump on same name ──
  const ingest = (files: FileList | File[]) => {
    Array.from(files).forEach((file) => {
      if (!ALLOWED_RE.test(file.name)) { ui.toast.error(`${file.name}: file type not allowed.`); return; }
      if (file.size > MAX_BYTES) { ui.toast.error(`${file.name}: exceeds 8 MB.`); return; }
      const reader = new FileReader();
      reader.onload = () => {
        setDocuments((prev) => {
          const priorSame = prev.filter(d => d.category === docCategory && d.name === file.name);
          const version = priorSame.length ? Math.max(...priorSame.map(d => d.version || 1)) + 1 : 1;
          const doc = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, category: docCategory, name: file.name, dataUrl: reader.result as string, size: file.size, type: file.type, uploadedAt: new Date().toISOString(), version };
          return [...prev, doc];
        });
      };
      reader.readAsDataURL(file);
    });
  };
  const onDrop = (e: React.DragEvent) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer?.files?.length) ingest(e.dataTransfer.files); };
  const download = (d: any) => { const a = document.createElement('a'); a.href = d.dataUrl; a.download = d.name; document.body.appendChild(a); a.click(); a.remove(); };
  const removeDoc = (id: string) => setDocuments(prev => prev.filter(d => d.id !== id));

  // ── Tender link → snapshot + auto-fill empties (never overwrites the tenderId column) ──
  const linkTender = (id: string) => {
    const t = tenders.find((x: any) => String(x.id) === String(id));
    if (!t) { setPath('tender', { tenderId: '' }); return; }
    setPath('tender', { tenderId: t.id, tenderNumber: t.tenderNumber || '', tenderName: t.tenderName || '', tenderValue: t.tenderValue || '', awardDate: (t.endDate || t.closingDate || '').slice(0, 10), tenderStatus: t.status || '' });
    setCore((c: any) => ({
      ...c,
      contractName: c.contractName || t.tenderName || '',
      clientName: c.clientName || t.clientName || '',
      contractValue: (c.contractValue === '' || c.contractValue == null) ? (t.tenderValue ?? '') : c.contractValue,
      startDate: c.startDate || (t.startDate || '').slice(0, 10),
      endDate: c.endDate || (t.endDate || '').slice(0, 10),
    }));
    ui.toast.success('Tender details linked & auto-filled.');
  };

  const submit = async () => {
    if (!core.contractName.trim()) { ui.toast.warning('Contract Title / Name is required.'); setTab('info'); return; }
    setBusy(true);
    try {
      const payload = { ...core, details, documents };
      if (editing) { await api.contracts.update(editing.id, payload); ui.toast.success('Contract updated.'); }
      else { await api.contracts.create({ ...payload, companyId: activeCompanyId }); ui.toast.success('Contract created.'); }
      onSaved();
    } catch (e: any) { ui.toast.error(e?.message || 'Save failed.'); }
    finally { setBusy(false); }
  };

  const docsByCat = useMemo(() => {
    const m: Record<string, any[]> = {};
    documents.forEach(d => { (m[d.category] = m[d.category] || []).push(d); });
    return m;
  }, [documents]);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <button onClick={onCancel} className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-indigo-600 transition"><ChevronLeft size={15} /> Back to contracts</button>
        <h3 className="text-base font-extrabold text-slate-800">{editing ? 'Edit Contract' : 'Create Contract'}</h3>
        <Button icon={<Save size={14} />} loading={busy} onClick={submit}>{editing ? 'Update Contract' : 'Save Contract'}</Button>
      </div>

      {/* Section navigation */}
      <div className="flex flex-wrap gap-1">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${tab === t.id ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}>
            {t.label}{t.id === 'documents' && documents.length ? <span className="ml-1 opacity-80">({documents.length})</span> : null}
          </button>
        ))}
      </div>

      <div className="space-y-4 max-w-5xl">
        {tab === 'info' && (
          <Section title="Contract Information">
            {field({ k: 'contractNumber', label: 'Contract Number (auto if blank)', core: true })}
            {field({ k: 'contractName', label: 'Contract Title / Name *', core: true })}
            {field({ base: 'info', k: 'contractType', label: 'Contract Type', type: 'select', options: CONTRACT_TYPES })}
            {field({ base: 'info', k: 'category', label: 'Contract Category' })}
            {field({ base: 'info', k: 'priority', label: 'Priority', type: 'select', options: PRIORITIES })}
            {field({ k: 'status', label: 'Contract Status', type: 'select', options: CONTRACT_STATUSES, core: true })}
            {field({ k: 'contractValue', label: 'Contract Value', type: 'number', core: true })}
            {field({ base: 'info', k: 'currency', label: 'Currency', type: 'select', options: CURRENCIES })}
            {field({ base: 'info', k: 'gstPercent', label: 'Tax / GST (%)', type: 'number' })}
            {field({ base: 'info', k: 'paymentTerms', label: 'Payment Terms' })}
            {field({ base: 'info', k: 'owner', label: 'Contract Owner' })}
            {field({ base: 'info', k: 'department', label: 'Department' })}
            {field({ base: 'info', k: 'branch', label: 'Branch' })}
            {field({ base: 'info', k: 'description', label: 'Contract Description', type: 'textarea' })}
          </Section>
        )}

        {tab === 'client' && (
          <Section title="Client Information">
            {field({ k: 'clientName', label: 'Client Name', core: true })}
            {field({ base: 'client', k: 'companyName', label: 'Company Name' })}
            {field({ base: 'client', k: 'contactPerson', label: 'Contact Person' })}
            {field({ base: 'client', k: 'mobile', label: 'Mobile Number' })}
            {field({ base: 'client', k: 'email', label: 'Email Address', type: 'email' })}
            {field({ base: 'client', k: 'gstNumber', label: 'GST Number' })}
            {field({ base: 'client', k: 'panNumber', label: 'PAN Number' })}
            {field({ base: 'client', k: 'city', label: 'City' })}
            {field({ base: 'client', k: 'state', label: 'State' })}
            {field({ base: 'client', k: 'country', label: 'Country' })}
            {field({ base: 'client', k: 'pinCode', label: 'PIN Code' })}
            {field({ base: 'client', k: 'address', label: 'Address', type: 'textarea' })}
          </Section>
        )}

        {tab === 'timeline' && (
          <Section title="Contract Timeline">
            {field({ k: 'startDate', label: 'Start Date', type: 'date', core: true })}
            {field({ k: 'endDate', label: 'End Date', type: 'date', core: true })}
            {field({ base: 'timeline', k: 'effectiveDate', label: 'Effective Date', type: 'date' })}
            {field({ base: 'timeline', k: 'signingDate', label: 'Signing Date', type: 'date' })}
            {field({ base: 'timeline', k: 'renewalDate', label: 'Renewal Date', type: 'date' })}
            {field({ base: 'timeline', k: 'expiryDate', label: 'Expiry Date', type: 'date' })}
            {field({ base: 'timeline', k: 'noticePeriod', label: 'Notice Period (days)', type: 'number' })}
            {field({ base: 'timeline', k: 'autoRenewal', label: 'Auto Renewal', type: 'select', options: YESNO })}
          </Section>
        )}

        {tab === 'financial' && (
          <Section title="Financial Information">
            {field({ base: 'financial', k: 'contractAmount', label: 'Contract Amount', type: 'number' })}
            {field({ base: 'financial', k: 'gstAmount', label: 'GST Amount', type: 'number' })}
            {field({ base: 'financial', k: 'securityDeposit', label: 'Security Deposit', type: 'number' })}
            {field({ base: 'financial', k: 'retentionAmount', label: 'Retention Amount', type: 'number' })}
            {field({ base: 'financial', k: 'advancePayment', label: 'Advance Payment', type: 'number' })}
            {field({ base: 'financial', k: 'remainingBalance', label: 'Remaining Balance', type: 'number' })}
            {field({ base: 'financial', k: 'paymentFrequency', label: 'Payment Frequency', type: 'select', options: PAY_FREQ })}
            {field({ base: 'financial', k: 'penaltyAmount', label: 'Penalty Amount', type: 'number' })}
            {field({ base: 'financial', k: 'performanceIncentives', label: 'Performance Incentives', type: 'number' })}
            {field({ base: 'financial', k: 'milestonePayments', label: 'Milestone Payments (describe schedule)', type: 'textarea' })}
          </Section>
        )}

        {tab === 'guarantees' && (
          <div className="space-y-4">
            <Section title="Bank Guarantee">
              {field({ base: 'bankGuarantee', k: 'required', label: 'BG Required', type: 'select', options: YESNO })}
              {field({ base: 'bankGuarantee', k: 'bgNumber', label: 'BG Number' })}
              {field({ base: 'bankGuarantee', k: 'issuingBank', label: 'Issuing Bank' })}
              {field({ base: 'bankGuarantee', k: 'branch', label: 'Bank Branch' })}
              {field({ base: 'bankGuarantee', k: 'bgAmount', label: 'BG Amount', type: 'number' })}
              {field({ base: 'bankGuarantee', k: 'issueDate', label: 'Issue Date', type: 'date' })}
              {field({ base: 'bankGuarantee', k: 'expiryDate', label: 'Expiry Date', type: 'date' })}
              {field({ base: 'bankGuarantee', k: 'claimExpiryDate', label: 'Claim Expiry Date', type: 'date' })}
              {field({ base: 'bankGuarantee', k: 'status', label: 'BG Status', type: 'select', options: BG_STATUSES })}
              {field({ base: 'bankGuarantee', k: 'remarks', label: 'BG Remarks', type: 'textarea' })}
              <p className="sm:col-span-2 lg:col-span-3 text-[11px] text-slate-400">Upload the BG document in the <b>Documents</b> tab using the “Bank Guarantee” category.</p>
            </Section>
            <Section title="Security Deposit">
              {field({ base: 'securityDeposit', k: 'required', label: 'Deposit Required', type: 'select', options: YESNO })}
              {field({ base: 'securityDeposit', k: 'amount', label: 'Deposit Amount', type: 'number' })}
              {field({ base: 'securityDeposit', k: 'type', label: 'Deposit Type', type: 'select', options: DEPOSIT_TYPES })}
              {field({ base: 'securityDeposit', k: 'depositDate', label: 'Deposit Date', type: 'date' })}
              {field({ base: 'securityDeposit', k: 'refundDate', label: 'Refund Date', type: 'date' })}
              {field({ base: 'securityDeposit', k: 'status', label: 'Deposit Status', type: 'select', options: DEPOSIT_STATUSES })}
            </Section>
            <Section title="Performance Guarantee">
              {field({ base: 'performanceGuarantee', k: 'required', label: 'Required', type: 'select', options: YESNO })}
              {field({ base: 'performanceGuarantee', k: 'amount', label: 'Guarantee Amount', type: 'number' })}
              {field({ base: 'performanceGuarantee', k: 'validUntil', label: 'Valid Until', type: 'date' })}
              {field({ base: 'performanceGuarantee', k: 'status', label: 'Status', type: 'select', options: PG_STATUSES })}
              <p className="sm:col-span-2 lg:col-span-3 text-[11px] text-slate-400">Upload the PG document in the <b>Documents</b> tab using the “Performance Guarantee” category.</p>
            </Section>
          </div>
        )}

        {tab === 'documents' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4">
              <p className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mb-3">Upload Documents</p>
              <div className="flex flex-wrap items-end gap-3 mb-3">
                <div className="w-64"><Select label="Document Category" value={docCategory} onChange={e => setDocCategory(e.target.value)} options={DOC_CATEGORIES.map(c => ({ value: c, label: c }))} /></div>
                <input ref={fileRef} type="file" multiple className="hidden" onChange={e => { if (e.target.files) ingest(e.target.files); e.target.value = ''; }} />
                <Button variant="outline" icon={<Upload size={14} />} onClick={() => fileRef.current?.click()}>Choose Files</Button>
              </div>
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                className={`rounded-xl border-2 border-dashed p-6 text-center transition ${dragOver ? 'border-indigo-400 bg-indigo-50/50' : 'border-slate-300 bg-white'}`}>
                <Paperclip className="mx-auto text-slate-300 mb-1" size={22} />
                <p className="text-xs text-slate-500">Drag & drop files here, or use “Choose Files”.</p>
                <p className="text-[10px] text-slate-400 mt-1">PDF, images, Word, Excel, CSV, PPT · up to 8 MB each</p>
              </div>
            </div>

            {documents.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">No documents uploaded yet.</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(docsByCat).map(([cat, list]) => (
                  <div key={cat} className="rounded-xl border border-slate-200 bg-white p-3">
                    <p className="text-[11px] font-bold text-slate-600 mb-2">{cat} <span className="text-slate-400">({list.length})</span></p>
                    <div className="space-y-1.5">
                      {list.map(d => (
                        <div key={d.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <FileText size={15} className="text-indigo-500 shrink-0" />
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-slate-700 truncate">{d.name}</p>
                              <p className="text-[10px] text-slate-400">{prettySize(d.size)} · v{d.version || 1} · {formatDate(d.uploadedAt)}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => download(d)} title="Download" className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-400 hover:text-indigo-600"><Download size={13} /></button>
                            <button onClick={() => removeDoc(d.id)} title="Delete" className="p-1.5 rounded-md border border-slate-200 bg-white text-rose-400 hover:text-rose-600"><Trash2 size={13} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'tender' && (
          <Section title="Tender Link">
            <div className="sm:col-span-2 lg:col-span-3">
              <Select label="Link a Tender (auto-fills available info)" value={String(get('tender.tenderId') ?? '')} onChange={e => linkTender(e.target.value)}
                options={[{ value: '', label: '— Not linked —' }, ...tenders.map((t: any) => ({ value: String(t.id), label: `${t.tenderNumber ? t.tenderNumber + ' · ' : ''}${t.tenderName}` }))]} />
            </div>
            {field({ base: 'tender', k: 'tenderNumber', label: 'Tender Number' })}
            {field({ base: 'tender', k: 'tenderName', label: 'Tender Name' })}
            {field({ base: 'tender', k: 'tenderValue', label: 'Tender Value', type: 'number' })}
            {field({ base: 'tender', k: 'awardDate', label: 'Award Date', type: 'date' })}
            {field({ base: 'tender', k: 'tenderStatus', label: 'Tender Status' })}
          </Section>
        )}

        {tab === 'approval' && (
          <Section title="Approval Workflow">
            {field({ base: 'approval', k: 'status', label: 'Approval Status', type: 'select', options: APPROVAL_STATUSES })}
            {field({ base: 'approval', k: 'approver', label: 'Approver' })}
            {field({ base: 'approval', k: 'approvalDate', label: 'Approval Date', type: 'date' })}
            {field({ base: 'approval', k: 'approvalNotes', label: 'Approval Notes', type: 'textarea' })}
            {field({ base: 'approval', k: 'rejectionReason', label: 'Rejection Reason', type: 'textarea' })}
          </Section>
        )}

        {tab === 'renewal' && (
          <Section title="Renewal Management">
            {field({ base: 'renewal', k: 'reminderEnabled', label: 'Renewal Reminder', type: 'select', options: YESNO })}
            {field({ base: 'renewal', k: 'reminderBeforeDays', label: 'Reminder Before (days)', type: 'number' })}
            {field({ base: 'renewal', k: 'status', label: 'Renewal Status' })}
            {field({ base: 'renewal', k: 'history', label: 'Renewal History / Notes', type: 'textarea' })}
          </Section>
        )}

        {tab === 'compliance' && (
          <Section title="Compliance">
            {field({ base: 'compliance', k: 'insuranceValidity', label: 'Insurance Validity', type: 'date' })}
            {field({ base: 'compliance', k: 'licenseValidity', label: 'License Validity', type: 'date' })}
            {field({ base: 'compliance', k: 'labourLicense', label: 'Labour License No.' })}
            {field({ base: 'compliance', k: 'pfCompliance', label: 'PF Compliance', type: 'select', options: YESNO })}
            {field({ base: 'compliance', k: 'esiCompliance', label: 'ESI Compliance', type: 'select', options: YESNO })}
            {field({ base: 'compliance', k: 'gstCompliance', label: 'GST Compliance', type: 'select', options: YESNO })}
            {field({ base: 'compliance', k: 'other', label: 'Other Compliance Notes', type: 'textarea' })}
          </Section>
        )}

        {tab === 'notes' && (
          <Section title="Notes & Remarks">
            {field({ k: 'notes', label: 'General Notes', type: 'textarea', core: true })}
            {field({ base: 'notes', k: 'internal', label: 'Internal Notes (not client-facing)', type: 'textarea' })}
            {field({ base: 'notes', k: 'client', label: 'Client-facing Notes', type: 'textarea' })}
          </Section>
        )}

        {tab === 'activity' && (
          <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4">
            <p className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5"><Clock size={13} /> Activity Timeline</p>
            {activity.length === 0 ? (
              <p className="text-xs text-slate-400">{editing ? 'No activity recorded yet.' : 'Activity is recorded automatically once the contract is saved.'}</p>
            ) : (
              <div className="space-y-1.5">
                {[...activity].reverse().map((a, i) => (
                  <div key={i} className="flex items-start justify-between gap-3 rounded-lg border border-slate-100 bg-white px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-700">{a.action}{a.field ? <span className="text-slate-400 font-normal"> · {a.field}</span> : null}</p>
                      {(a.old !== undefined || a.new !== undefined) && (
                        <p className="text-[11px] text-slate-500"><span className="text-rose-500 line-through">{a.old || '—'}</span> → <span className="text-emerald-600 font-semibold">{a.new || '—'}</span></p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[10px] text-slate-500 font-semibold">{a.by}</p>
                      <p className="text-[10px] text-slate-400">{formatDate(a.at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 pt-1 max-w-5xl">
        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          {documents.length > 0 && <Badge variant="gray"><Paperclip size={11} className="inline mr-1" />{documents.length} document(s)</Badge>}
          {get('tender.tenderNumber') && <Badge variant="gray"><Link2 size={11} className="inline mr-1" />Tender {get('tender.tenderNumber')}</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button icon={<Save size={14} />} loading={busy} onClick={submit}>{editing ? 'Update Contract' : 'Save Contract'}</Button>
        </div>
      </div>
    </div>
  );
};

export default ContractForm;
