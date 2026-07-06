// ─────────────────────────────────────────────────────────────────────────────
// Salary Advances — a dedicated, self-explanatory workspace for short-term salary
// advances that are recovered automatically from payroll. It is built on the same
// Loan engine (an advance is a zero-interest loan of an "Advance" type), but HR
// users never need to know that: they click "New Salary Advance", fill an
// advance-shaped form, and on approval the recovery schedule is generated and
// deducted during payroll — exactly like the EMI flow, with payslip + reports +
// employee financial history integration inherited from the loan module.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Wallet, Plus, Search, Eye, Send, CheckCircle2, XCircle, Banknote, Ban, Trash2,
  Paperclip, X, FileText, UploadCloud, Info, ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { ui } from '@/components/ui/feedback';
import { api } from '@/api/apiClient';
import { getApiErrorMessage } from '@/utils/apiError';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const inr = (n: any) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
const ADVANCE_ATTACHMENT_CATEGORIES = ['Employee Request', 'Advance Approval Letter', 'Recovery Schedule', 'HR Approval', 'Supporting Document'];

const STATUS_VARIANT: Record<string, any> = {
  Draft: 'gray', 'Pending Approval': 'yellow', Approved: 'blue', Rejected: 'red',
  Disbursed: 'blue', Running: 'green', Completed: 'green', Closed: 'gray',
};
const statusBadge = (s: string) => <Badge variant={STATUS_VARIANT[s] || 'gray'}>{s}</Badge>;

// Is a loan record actually a salary advance? (type name contains "advance").
const isAdvanceType = (name?: string) => /advance/i.test(String(name || ''));

const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`rounded-2xl border border-slate-200 bg-white p-4 ${className}`}>{children}</div>
);
const IconBtn: React.FC<{ title: string; onClick: () => void; children: React.ReactNode }> = ({ title, onClick, children }) => (
  <button title={title} onClick={onClick} className="p-1.5 rounded-lg hover:bg-slate-100 transition">{children}</button>
);

// A file the user picked in the create modal but hasn't uploaded yet.
interface PendingFile { fileData: string; fileName: string; mimeType: string; size: string; category: string; }
const fmtBytes = (n: number) => (!n ? '—' : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`);
const readFile = (file: File): Promise<Omit<PendingFile, 'category'>> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve({ fileData: String(r.result), fileName: file.name, mimeType: file.type, size: fmtBytes(file.size) });
    r.onerror = reject;
    r.readAsDataURL(file);
  });

// ─────────────────────────────────────────────────────────────────────────────
// Section — table + empty state + New Salary Advance button + creation modal.
// ─────────────────────────────────────────────────────────────────────────────
export const SalaryAdvancesSection: React.FC<{
  canEdit: boolean; canApprove: boolean; canManage: boolean;
  companyId?: string;
  onOpen: (id: number) => void;
  /** Increment to open the "New Salary Advance" modal from an external button. */
  openToken?: number;
}> = ({ canEdit, canApprove, canManage, companyId, onOpen, openToken = 0 }) => {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await api.loans.list({ status, q, pageSize: 200 }); setRows(r?.loans || []); }
    catch (e) { ui.toast.error(getApiErrorMessage(e)); }
    finally { setLoading(false); }
  }, [status, q]);
  useEffect(() => { const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t); }, [load, q]);

  // External trigger (the header "New Salary Advance" button).
  useEffect(() => { if (openToken > 0 && canEdit) setCreating(true); }, [openToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const advances = useMemo(() => rows.filter((l) => isAdvanceType(l.loanTypeName)), [rows]);

  const act = async (id: number, action: string) => {
    let extra: any = {};
    if (action === 'reject') { const reason = await ui.prompt({ title: 'Reject advance', message: 'Reason for rejection:', confirmText: 'Reject' }); if (reason == null) return; extra.reason = reason; }
    if (action === 'close') { const ok = await ui.confirm({ message: 'Force-close this advance? Any remaining recovery will stop deducting.', variant: 'danger', confirmText: 'Close' }); if (!ok) return; }
    try { await api.loans.setStatus(id, action, extra); ui.toast.success('Salary advance updated.'); load(); }
    catch (e) { ui.toast.error(getApiErrorMessage(e)); }
  };
  const del = async (id: number) => {
    if (!(await ui.confirm({ message: 'Delete this salary advance? Only Draft/Rejected advances can be deleted.', variant: 'danger', confirmText: 'Delete' }))) return;
    try { await api.loans.remove(id); ui.toast.success('Salary advance deleted.'); load(); }
    catch (e) { ui.toast.error(getApiErrorMessage(e)); }
  };

  const recoveryLabel = (l: any) => (Number(l.tenureMonths) <= 1 ? 'One-Time' : `EMI · ${l.tenureMonths}×`);

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search employee or advance #…"
            className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-slate-200 focus:border-[#4F7CFF] outline-none" />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="text-xs rounded-lg border border-slate-200 px-2 py-2">
          <option value="">All statuses</option>
          {['Draft', 'Pending Approval', 'Approved', 'Rejected', 'Disbursed', 'Running', 'Completed', 'Closed'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {canEdit && <Button size="sm" icon={<Plus size={14} />} onClick={() => setCreating(true)}>New Salary Advance</Button>}
      </div>

      {loading ? (
        <Card><p className="text-xs text-slate-400 py-8 text-center">Loading salary advances…</p></Card>
      ) : advances.length === 0 ? (
        // ── Professional empty state ─────────────────────────────────────────
        <Card className="!p-0">
          <div className="flex flex-col items-center justify-center text-center px-6 py-14">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EDF4FF] text-[#4F7CFF]"><Wallet size={26} /></div>
            <h3 className="text-sm font-extrabold text-slate-800">No salary advances yet</h3>
            <p className="mt-1 max-w-md text-xs text-slate-500">
              Grant an employee a short-term salary advance and recover it automatically from payroll —
              in one instalment or spread over several months. Everything is deducted during payroll
              processing and reflected on the payslip; no manual work after approval.
            </p>
            {canEdit && (
              <Button className="mt-5" icon={<Plus size={15} />} onClick={() => setCreating(true)}>Create Salary Advance</Button>
            )}
          </div>
        </Card>
      ) : (
        // ── Records table ────────────────────────────────────────────────────
        <Card className="!p-0 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500"><tr>
              {['Advance #', 'Employee', 'Amount', 'Recovered', 'Remaining', 'Recovery', 'Next Deduction', 'Status', 'Actions'].map((h) => (
                <th key={h} className="p-2.5 text-left font-bold whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {advances.map((l) => {
                const d = l.derived || {};
                return (
                  <tr key={l.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="p-2.5 font-semibold text-slate-700 whitespace-nowrap">{l.loanNumber}</td>
                    <td className="p-2.5 whitespace-nowrap">{l.employeeName}</td>
                    <td className="p-2.5 tabular-nums">{inr(l.principalAmount)}</td>
                    <td className="p-2.5 tabular-nums text-emerald-700">{inr(d.paidPrincipal || 0)}</td>
                    <td className="p-2.5 tabular-nums font-semibold text-slate-800">{inr(d.outstandingPrincipal ?? l.principalAmount)}</td>
                    <td className="p-2.5 whitespace-nowrap">{recoveryLabel(l)}</td>
                    <td className="p-2.5 whitespace-nowrap">{d.nextDueMonth || (['Completed', 'Closed', 'Rejected'].includes(l.status) ? '—' : 'On approval')}</td>
                    <td className="p-2.5">{statusBadge(l.status)}</td>
                    <td className="p-2.5">
                      <div className="flex items-center gap-1">
                        <IconBtn title="View" onClick={() => onOpen(l.id)}><Eye size={14} /></IconBtn>
                        {canEdit && l.status === 'Draft' && <IconBtn title="Submit for approval" onClick={() => act(l.id, 'submit')}><Send size={14} className="text-blue-600" /></IconBtn>}
                        {canApprove && l.status === 'Pending Approval' && <IconBtn title="Approve" onClick={() => act(l.id, 'approve')}><CheckCircle2 size={14} className="text-emerald-600" /></IconBtn>}
                        {canApprove && l.status === 'Pending Approval' && <IconBtn title="Reject" onClick={() => act(l.id, 'reject')}><XCircle size={14} className="text-rose-600" /></IconBtn>}
                        {(canApprove || canEdit) && l.status === 'Approved' && <IconBtn title="Mark disbursed" onClick={() => act(l.id, 'disburse')}><Banknote size={14} className="text-emerald-600" /></IconBtn>}
                        {canManage && ['Approved', 'Disbursed', 'Running'].includes(l.status) && <IconBtn title="Close" onClick={() => act(l.id, 'close')}><Ban size={14} className="text-slate-500" /></IconBtn>}
                        {canManage && ['Draft', 'Rejected'].includes(l.status) && <IconBtn title="Delete" onClick={() => del(l.id)}><Trash2 size={14} className="text-rose-600" /></IconBtn>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {creating && (
        <NewSalaryAdvanceModal companyId={companyId} onClose={() => setCreating(false)} onDone={() => { setCreating(false); load(); }} />
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Creation modal — advance-shaped form (no loan jargon).
// ─────────────────────────────────────────────────────────────────────────────
const NewSalaryAdvanceModal: React.FC<{ companyId?: string; onClose: () => void; onDone: () => void }> = ({ companyId, onClose, onDone }) => {
  const now = new Date();
  const [employees, setEmployees] = useState<any[]>([]);
  const [advType, setAdvType] = useState<any>(null);
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [form, setForm] = useState<any>({
    employeeId: '',
    amount: '',
    recoveryType: 'EMI', // 'One-Time' | 'EMI'
    installments: 3,
    startMonth: MONTHS[now.getMonth()],
    startYear: now.getFullYear(),
    reason: '',
    approvalAuthority: '',
    remarks: '',
  });

  useEffect(() => {
    (async () => {
      try { const e = await api.employees.getAll(); setEmployees(Array.isArray(e) ? e : (e?.employees || e?.data || [])); }
      catch (e) { ui.toast.error(getApiErrorMessage(e, 'Could not load employees.')); }
      // Find (or fall back to) the "Salary Advance" loan type so the record is
      // classified — and surfaced — as an advance.
      try {
        const types = await api.loans.listTypes() || [];
        const active = types.filter((t: any) => t.active !== false);
        const adv = active.find((t: any) => /salary advance/i.test(t.name)) || active.find((t: any) => isAdvanceType(t.name)) || null;
        setAdvType(adv);
      } catch (e) { /* type is optional — we still send a 'Salary Advance' name */ }
    })();
  }, []);

  const amount = Number(form.amount) || 0;
  const months = form.recoveryType === 'One-Time' ? 1 : Math.max(1, Math.round(Number(form.installments) || 1));
  const monthly = months > 0 ? Math.round(amount / months) : 0;

  const pickFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    for (const file of Array.from(list)) {
      try { const f = await readFile(file); setFiles((prev) => [...prev, { ...f, category: ADVANCE_ATTACHMENT_CATEGORIES[0] }]); }
      catch { ui.toast.error(`Could not read ${file.name}.`); }
    }
  };
  const removeFile = (i: number) => setFiles((prev) => prev.filter((_, j) => j !== i));

  const submit = async (asDraft: boolean) => {
    if (!form.employeeId) return ui.toast.warning('Select an employee.');
    if (!(amount > 0)) return ui.toast.warning('Enter an advance amount greater than zero.');
    if (form.recoveryType === 'EMI' && months < 1) return ui.toast.warning('Enter the number of installments.');
    const emp = employees.find((e) => String(e.id) === String(form.employeeId));
    setSaving(true);
    try {
      const created = await api.loans.create({
        companyId,
        employeeId: form.employeeId,
        loanTypeId: advType?.id,
        loanTypeName: advType?.name || 'Salary Advance',
        principalAmount: amount,
        tenureMonths: months,
        interestType: 'None',
        interestRate: 0,
        deductionStartMonth: form.startMonth,
        deductionStartYear: Number(form.startYear),
        purpose: form.reason || null,
        approvalAuthority: form.approvalAuthority || null,
        remarks: form.remarks || null,
        submit: !asDraft,
        status: asDraft ? 'Draft' : 'Pending Approval',
      });
      // Persist any attachments against this advance record (same store the
      // detail view reads from), so they travel with the advance.
      if (created?.id && files.length) {
        for (const f of files) {
          try {
            await api.complianceDocuments.create({
              name: f.fileName.replace(/\.[^.]+$/, ''), category: f.category,
              source: 'Advance', sourceRef: String(created.id),
              employeeId: emp?.id || null, employeeName: emp?.name || null,
              fileData: f.fileData, fileName: f.fileName, mimeType: f.mimeType, size: f.size,
            });
          } catch (e) { ui.toast.error(getApiErrorMessage(e, `Advance saved, but "${f.fileName}" could not be attached.`)); }
        }
      }
      ui.toast.success(asDraft ? 'Salary advance saved as draft.' : 'Salary advance submitted for approval.');
      onDone();
    } catch (e) { ui.toast.error(getApiErrorMessage(e, 'Could not create the salary advance.')); }
    finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title="New Salary Advance" size="lg"
      footer={<>
        <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="outline" size="sm" loading={saving} onClick={() => submit(true)}>Save as Draft</Button>
        <Button size="sm" icon={<Send size={13} />} loading={saving} onClick={() => submit(false)}>Submit for Approval</Button>
      </>}>
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-xl border border-sky-100 bg-sky-50/60 px-3 py-2 text-[11px] text-slate-600">
          <Info size={13} className="text-sky-500 mt-0.5 shrink-0" />
          <span>Once approved, this advance is recovered <b>automatically from payroll</b> on the schedule below and shown on the payslip — no manual deduction needed.</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select label="Employee" value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
            options={[{ value: '', label: 'Select employee…' }, ...employees.map((e) => ({ value: String(e.id), label: `${e.name}${e.employeeId ? ` (${e.employeeId})` : ''}` }))]} />
          <Input label="Advance Amount (₹)" type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="e.g. 25000" />

          <Select label="Recovery Type" value={form.recoveryType} onChange={(e) => setForm({ ...form, recoveryType: e.target.value })}
            options={[{ value: 'One-Time', label: 'One-Time (single deduction)' }, { value: 'EMI', label: 'EMI (spread over months)' }]} />
          <Input label="Number of Installments" type="number" value={form.recoveryType === 'One-Time' ? 1 : form.installments}
            onChange={(e) => setForm({ ...form, installments: e.target.value })} disabled={form.recoveryType === 'One-Time'} />

          <Select label="Recovery Start Month" value={form.startMonth} onChange={(e) => setForm({ ...form, startMonth: e.target.value })}
            options={MONTHS.map((m) => ({ value: m, label: m }))} />
          <Input label="Recovery Start Year" type="number" value={form.startYear} onChange={(e) => setForm({ ...form, startYear: e.target.value })} />

          <Input label="Approval Authority" value={form.approvalAuthority} onChange={(e) => setForm({ ...form, approvalAuthority: e.target.value })} placeholder="e.g. Finance Head" />
          <Input label="Reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Medical emergency" />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Remarks</label>
          <textarea value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} rows={2}
            placeholder="Internal HR / Finance note (optional)"
            className="w-full text-xs rounded-lg border border-slate-200 focus:border-[#4F7CFF] outline-none px-3 py-2 resize-none" />
        </div>

        {/* Recovery preview */}
        {amount > 0 && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span className="text-slate-500">Recovery plan:</span>
            {form.recoveryType === 'One-Time'
              ? <span className="font-bold text-slate-800">{inr(amount)} deducted once in {form.startMonth} {form.startYear}</span>
              : <span className="font-bold text-slate-800 flex items-center gap-1.5">{inr(monthly)} / month <span className="text-slate-400">×</span> {months} month(s) <ArrowRight size={12} className="text-slate-400" /> from {form.startMonth} {form.startYear}</span>}
          </div>
        )}

        {/* Attachments */}
        <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5"><Paperclip size={13} /> Attachments{files.length ? <span className="text-slate-400 font-semibold normal-case">· {files.length}</span> : null}</p>
            <Button size="sm" variant="outline" icon={<UploadCloud size={13} />} onClick={() => fileInput.current?.click()}>Add File</Button>
            <input ref={fileInput} type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,application/pdf,image/*" className="hidden"
              onChange={(e) => { pickFiles(e.target.files); e.target.value = ''; }} />
          </div>
          {files.length === 0
            ? <p className="text-[11px] text-slate-400 py-2 text-center rounded-lg bg-white/70">Attach the employee request, approval letter or supporting documents (optional).</p>
            : (
              <div className="space-y-1">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg border border-slate-100 bg-white px-2.5 py-1.5 text-xs">
                    <FileText size={14} className="text-slate-400 shrink-0" />
                    <span className="font-semibold text-slate-700 truncate flex-1" title={f.fileName}>{f.fileName}</span>
                    <select value={f.category} onChange={(e) => setFiles((prev) => prev.map((x, j) => j === i ? { ...x, category: e.target.value } : x))}
                      className="text-[11px] rounded-md border border-slate-200 px-1.5 py-1">
                      {ADVANCE_ATTACHMENT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <span className="text-slate-400">{f.size}</span>
                    <button title="Remove" onClick={() => removeFile(i)} className="p-1 rounded hover:bg-rose-50"><X size={13} className="text-rose-500" /></button>
                  </div>
                ))}
              </div>
            )}
        </div>
      </div>
    </Modal>
  );
};

export default SalaryAdvancesSection;
