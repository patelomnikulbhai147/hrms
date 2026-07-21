import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { X, Zap, Download, AlertTriangle, CheckCircle2, FileText, History, ShieldCheck, Users, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Table, Thead, Tbody, Th, Td, Tr } from '@/components/ui/Table';
import { api } from '@/api/apiClient';
import { formatDateTime } from '@/utils/formatDate';
import type { Company } from '@/types';

/**
 * EPFO ECR (Electronic Challan cum Return) generation — a fully ISOLATED report
 * surfaced under Reports → PF Reports. It validates approved payroll, shows an
 * eligibility/error report, generates the official EPFO ECR text file, and keeps
 * a re-downloadable history. It calls ONLY the dedicated /api/epfo-ecr endpoints
 * and never touches any other report, payroll, or employee flow.
 */
interface Props {
  companyId: string;
  companies?: Company[];
  isSuperAdmin?: boolean;
  onClose: () => void;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const downloadBlob = (content: string, fileName: string, mime = 'text/plain;charset=utf-8') => {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const csvCell = (v: any) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

// ── Notepad (.txt) export helpers ───────────────────────────────────────────
// The EPFO upload format is a plain text file: no header, no BOM, one member per
// line. `new Blob([string])` encodes UTF-8 WITHOUT a BOM, so the only thing to
// normalise is the line ending — Windows Notepad (and the EPFO portal) expect
// CRLF. The member lines themselves are the untouched server-generated content,
// so the .txt is byte-identical to the official ECR apart from the line endings.
const toWindowsText = (content: string) => String(content || '').replace(/\r\n|\r|\n/g, '\r\n');

/** e.g. ECR_PulpitMobility_Jun_2026.txt */
const notepadFileName = (companyName: string, month: string, year: string) => {
  const safe = (s: string) => String(s || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 40);
  return `ECR_${safe(companyName) || 'Company'}_${safe(month).slice(0, 3)}_${safe(year)}.txt`;
};

export const EpfoEcrGeneration: React.FC<Props> = ({ companyId, companies = [], isSuperAdmin = false, onClose }) => {
  const now = new Date();
  // Default to the previous month (payroll is usually filed for a completed cycle).
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const [selCompany, setSelCompany] = useState<string>(companyId || '');
  const [branch, setBranch] = useState('all');
  const [month, setMonth] = useState(MONTHS[prev.getMonth()]);
  const [year, setYear] = useState(String(prev.getFullYear()));
  const [department, setDepartment] = useState('');
  const [status, setStatus] = useState('Active');

  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [errorsList, setErrorsList] = useState<any[]>([]);
  const [warnings, setWarnings] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const flash = (kind: 'ok' | 'err', msg: string) => { setToast({ kind, msg }); setTimeout(() => setToast(null), 4200); };

  const effectiveCompany = isSuperAdmin ? selCompany : (companyId || selCompany);

  const companyOptions = useMemo(
    () => (companies || []).filter((c: any) => !c.parentCompanyId && c.status !== 'Archived' && !c.isArchived).map((c: any) => ({ value: String(c.id), label: c.name })),
    [companies]
  );
  const branchOptions = useMemo(() => {
    const parent = Number(effectiveCompany);
    const brs = (companies || []).filter((c: any) => Number(c.parentCompanyId) === parent && c.status !== 'Archived').map((c: any) => c.branchName || c.name).filter(Boolean);
    return Array.from(new Set(brs));
  }, [companies, effectiveCompany]);
  const yearOptions = useMemo(() => { const y = now.getFullYear(); return [y + 1, y, y - 1, y - 2].map(String); }, []);

  const buildFilters = () => ({ companyId: effectiveCompany, branch, month, year, department: department.trim(), status });
  // Signature of the filter set a generated file belongs to, so an alternate
  // export format can REUSE the already-generated content instead of generating
  // (and re-recording history for) the very same period a second time.
  const filterSig = () => JSON.stringify(buildFilters());
  const [generated, setGenerated] = useState<{ sig: string; content: string; companyName: string } | null>(null);

  const loadHistory = useCallback(async () => {
    if (!effectiveCompany) { setHistory([]); return; }
    try { const r = await api.epfoEcr.history(effectiveCompany); setHistory(Array.isArray(r?.history) ? r.history : []); }
    catch { setHistory([]); }
  }, [effectiveCompany]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const runPreview = async () => {
    if (!effectiveCompany) { flash('err', 'Select a company first.'); return; }
    setBusy(true); setPreview(null); setErrorsList([]); setWarnings([]);
    try {
      const r = await api.epfoEcr.preview(buildFilters());
      if (r?.error) { flash('err', r.error); setBusy(false); return; }
      setPreview(r); setErrorsList(r.errors || []); setWarnings(r.warnings || []);
      if (!r.summary?.eligibleEmployees) flash('err', 'No eligible employees for the selected period — resolve the errors below.');
    } catch (e: any) { flash('err', e?.message || 'Failed to build the ECR preview.'); }
    setBusy(false);
  };

  const runGenerate = async () => {
    if (!effectiveCompany) { flash('err', 'Select a company first.'); return; }
    setBusy(true);
    try {
      const r = await api.epfoEcr.generate(buildFilters());
      if (r?.error) { flash('err', r.error); setBusy(false); return; }
      setPreview((p: any) => ({ ...(p || {}), summary: r.summary, company: r.company, branch: r.branch, period: r.period }));
      setErrorsList(r.errors || []); setWarnings(r.warnings || []);
      setGenerated({ sig: filterSig(), content: r.content || '', companyName: r.company?.name || '' });
      downloadBlob(r.content || '', r.fileName || 'ECR.txt');
      flash('ok', `ECR generated — ${r.summary?.eligibleEmployees || 0} members. Download started.`);
      loadHistory();
    } catch (e: any) { flash('err', e?.message || 'Failed to generate the ECR file.'); }
    setBusy(false);
  };

  /**
   * Export as Notepad (.txt) — the SAME validated ECR data as "Generate &
   * Download ECR", written as a plain UTF-8 (no BOM) text file with Windows
   * CRLF line endings so it opens cleanly in Notepad. It reuses the already
   * generated content when the filters are unchanged; otherwise it asks the
   * existing /generate endpoint for it. No calculation, validation, API or
   * export format is altered — this is purely an additional output.
   */
  const exportNotepad = async () => {
    if (!effectiveCompany) { flash('err', 'Select a company first.'); return; }
    setBusy(true);
    try {
      let src = generated && generated.sig === filterSig() ? generated : null;
      if (!src) {
        const r = await api.epfoEcr.generate(buildFilters());
        if (r?.error) { flash('err', r.error); setBusy(false); return; }
        setPreview((p: any) => ({ ...(p || {}), summary: r.summary, company: r.company, branch: r.branch, period: r.period }));
        setErrorsList(r.errors || []); setWarnings(r.warnings || []);
        src = { sig: filterSig(), content: r.content || '', companyName: r.company?.name || '' };
        setGenerated(src);
        loadHistory();
      }
      if (!src.content.trim()) { flash('err', 'No eligible employees — nothing to export.'); setBusy(false); return; }
      downloadBlob(toWindowsText(src.content), notepadFileName(src.companyName || preview?.company?.name || '', month, year));
      flash('ok', 'Notepad (.txt) file exported.');
    } catch (e: any) { flash('err', e?.message || 'Failed to export the .txt file.'); }
    setBusy(false);
  };

  const downloadErrorReport = () => {
    if (!errorsList.length) return;
    const rows = [['Employee Name', 'Employee Code', 'Reason'], ...errorsList.map((e) => [e.name, e.code, e.reason])];
    downloadBlob(rows.map((r) => r.map(csvCell).join(',')).join('\n'), `ECR_Error_Report_${month}_${year}.csv`, 'text/csv;charset=utf-8');
  };

  const downloadAgain = async (id: number) => {
    try {
      const r = await api.epfoEcr.download(id);
      if (r?.error) { flash('err', r.error); return; }
      downloadBlob(r.content || '', r.fileName || 'ECR.txt');
    } catch (e: any) { flash('err', e?.message || 'Download failed.'); }
  };

  const s = preview?.summary;
  const summaryTiles = s ? [
    { label: 'Total Employees', value: s.totalEmployees, cls: 'text-slate-700', icon: Users },
    { label: 'Eligible', value: s.eligibleEmployees, cls: 'text-emerald-600', icon: CheckCircle2 },
    { label: 'Missing UAN', value: s.missingUan, cls: 'text-rose-600', icon: AlertTriangle },
    { label: 'Missing PF No.', value: s.missingPf, cls: 'text-rose-600', icon: AlertTriangle },
    { label: 'Warnings', value: s.warningCount, cls: 'text-amber-600', icon: AlertTriangle },
    { label: 'Errors', value: s.errorCount, cls: 'text-rose-600', icon: AlertTriangle },
  ] : [];

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-3 sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-5xl bg-white rounded-2xl shadow-2xl my-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 bg-gradient-to-r from-indigo-50 to-white rounded-t-2xl">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-indigo-600 text-white grid place-items-center shrink-0"><ShieldCheck size={20} /></div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Electronic Challan Cum Return (ECR)</h2>
              <p className="text-xs text-slate-500 mt-0.5">Generate monthly EPFO ECR files from approved payroll data.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-5">
          {/* Filters */}
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3">Filters</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {isSuperAdmin && (
                <Select label="Company" value={selCompany} onChange={(e) => setSelCompany(e.target.value)}
                  options={[{ value: '', label: 'Select company…' }, ...companyOptions]} />
              )}
              <Select label="Branch" value={branch} onChange={(e) => setBranch(e.target.value)}
                options={[{ value: 'all', label: 'All Branches' }, ...branchOptions.map((b) => ({ value: b, label: b }))]} />
              <Select label="Payroll Month" value={month} onChange={(e) => setMonth(e.target.value)}
                options={MONTHS.map((m) => ({ value: m, label: m }))} />
              <Select label="Payroll Year" value={year} onChange={(e) => setYear(e.target.value)}
                options={yearOptions.map((y) => ({ value: y, label: y }))} />
              <Input label="Department (optional)" placeholder="All Departments" value={department} onChange={(e) => setDepartment(e.target.value)} />
              <Select label="Employee Status" value={status} onChange={(e) => setStatus(e.target.value)}
                options={[{ value: 'Active', label: 'Active' }, { value: 'Inactive', label: 'Inactive' }, { value: 'all', label: 'All' }]} />
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              <Button onClick={runPreview} disabled={busy} icon={busy ? <Loader2 size={14} className="animate-spin" /> : <Eye14 />}>Generate Preview</Button>
              {preview && s?.eligibleEmployees > 0 && (
                <>
                  <Button variant="primary" onClick={runGenerate} disabled={busy} icon={<Download size={14} />} className="bg-emerald-600 hover:bg-emerald-700">Generate &amp; Download ECR</Button>
                  {/* Additional output format only — same validated records, plain text. */}
                  <Button variant="outline" onClick={exportNotepad} disabled={busy} icon={<FileText size={14} />}>Export as Notepad (.txt)</Button>
                </>
              )}
            </div>
          </div>

          {/* Preview summary */}
          {preview && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {summaryTiles.map((t) => (
                  <div key={t.label} className="rounded-xl border border-slate-200 p-3 text-center">
                    <p className={`text-2xl font-extrabold ${t.cls}`}>{t.value}</p>
                    <p className="text-[10px] font-semibold text-slate-500 mt-1 uppercase tracking-wide">{t.label}</p>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 text-xs">
                {s?.eligibleEmployees > 0
                  ? <span className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold"><CheckCircle2 size={14} /> Validation passed — {s.eligibleEmployees} member(s) will be written to the ECR file.</span>
                  : <span className="inline-flex items-center gap-1.5 text-rose-700 font-semibold"><AlertTriangle size={14} /> No eligible employees — fix the errors below, then re-run the preview.</span>}
                <span className="text-slate-400">·</span>
                <span className="text-slate-500">{preview.company?.name}{preview.company?.pfCode ? ` · PF Code ${preview.company.pfCode}` : ''} · {preview.branch} · {preview.period?.month} {preview.period?.year}</span>
              </div>

              {/* Error report */}
              {errorsList.length > 0 && (
                <div className="rounded-xl border border-rose-200 overflow-hidden">
                  <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-rose-50 border-b border-rose-200">
                    <p className="text-xs font-bold text-rose-800 flex items-center gap-1.5"><AlertTriangle size={13} /> Excluded Employees ({errorsList.length})</p>
                    <Button size="sm" variant="outline" className="h-7 text-[11px]" icon={<Download size={12} />} onClick={downloadErrorReport}>Download Error Report</Button>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    <Table>
                      <Thead><Tr><Th>Employee Name</Th><Th>Employee Code</Th><Th>Reason</Th></Tr></Thead>
                      <Tbody>
                        {errorsList.slice(0, 500).map((e, i) => (
                          <Tr key={i}><Td>{e.name}</Td><Td className="font-mono text-[11px]">{e.code}</Td><Td><span className="text-rose-700">{e.reason}</span></Td></Tr>
                        ))}
                      </Tbody>
                    </Table>
                    {errorsList.length > 500 && <p className="text-[11px] text-slate-400 text-center py-2">Showing first 500 — download the report for the full list.</p>}
                  </div>
                </div>
              )}

              {/* Warnings */}
              {warnings.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3">
                  <p className="text-xs font-bold text-amber-800 flex items-center gap-1.5 mb-1.5"><AlertTriangle size={13} /> Warnings ({warnings.length}) — included, but review</p>
                  <ul className="text-[11px] text-amber-800 space-y-0.5 max-h-32 overflow-y-auto">
                    {warnings.slice(0, 50).map((w, i) => <li key={i}>• {w.name} ({w.code}) — {w.note}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* History */}
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
              <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5"><History size={13} /> ECR History</p>
            </div>
            {history.length === 0 ? (
              <p className="text-[11px] text-slate-400 text-center py-6">No ECR files generated yet for this company.</p>
            ) : (
              <div className="max-h-64 overflow-y-auto">
                <Table>
                  <Thead><Tr><Th>Payroll Month</Th><Th>Company</Th><Th>Branch</Th><Th>Generated By</Th><Th>Generated Date</Th><Th>Employees</Th><Th>Download</Th></Tr></Thead>
                  <Tbody>
                    {history.map((h) => (
                      <Tr key={h.id}>
                        <Td className="font-semibold text-slate-700">{h.month} {h.year}</Td>
                        <Td>{h.companyName || '—'}</Td>
                        <Td>{h.branchName || 'All Branches'}</Td>
                        <Td>{h.generatedByName || '—'}</Td>
                        <Td className="text-[11px] text-slate-500">{formatDateTime(h.createdAt)}</Td>
                        <Td className="text-center font-semibold">{h.employeeCount}</Td>
                        <Td><button onClick={() => downloadAgain(h.id)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800"><Download size={12} /> Download</button></Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </div>
            )}
          </div>

          <p className="text-[10px] text-slate-400 flex items-center gap-1"><FileText size={11} /> The ECR file follows the official EPFO format: one line per member, fields separated by <span className="font-mono">#~#</span> (UAN, Name, Gross/EPF/EPS/EDLI wages, EPF/EPS/Diff contributions, NCP days, Refund).</p>
        </div>
      </div>

      {toast && (
        <div className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-[70] px-4 py-2.5 rounded-lg text-sm font-semibold shadow-lg ${toast.kind === 'ok' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>{toast.msg}</div>
      )}
    </div>
  );
};

// Small inline eye icon to avoid an extra import name clash.
const Eye14 = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>);

export default EpfoEcrGeneration;
