import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { Upload, Download, FileText, Database, CheckCircle2, AlertCircle, XCircle, Loader2, Users, RefreshCcw, CalendarRange, ChevronLeft, ChevronRight, History, ClipboardCheck, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { api } from '@/api/apiClient';
import { ui } from '@/components/ui/feedback';
import { getApiErrorMessage } from '@/utils/apiError';
import { formatDate, formatDateTime } from '@/utils/formatDate';

interface Props {
  role: string;
  companyId?: any;         // active workspace (Super Admin selects; Company Head pinned server-side)
  onRefresh?: () => void;  // refresh dashboard/reports/payroll after a successful import
}

// ── Column auto-detection ────────────────────────────────────────────────────
// Normalise a header for fuzzy matching: lowercase, strip spaces/underscores/dots.
const nk = (s: string) => String(s || '').toLowerCase().replace(/[\s_.\-#]/g, '');
// Each canonical field maps to a list of normalised header aliases (superset of the
// common ZKTeco / eSSL / Matrix / BioMax / TeamOffice / E-Time / Suprema exports).
const ALIASES: Record<string, string[]> = {
  employeeKey: ['employeeid', 'employeecode', 'empid', 'empcode', 'employeeno', 'empno', 'staffid', 'biometricid', 'bioid', 'userid', 'usercode', 'attendanceid', 'cardno', 'enrollid', 'enrollno', 'acno', 'machineno', 'code', 'id'],
  altKey: ['employeecode', 'empcode', 'employeeid', 'staffid'],
  employeeName: ['employeename', 'name', 'empname', 'fullname', 'staffname', 'username'],
  date: ['attendancedate', 'punchdate', 'date', 'day', 'attdate', 'logdate'],
  dateTime: ['datetime', 'punchdatetime', 'logdatetime', 'timestamp', 'punchtimestamp', 'attendancedatetime'],
  inTime: ['intime', 'checkin', 'firstpunch', 'punchin', 'in', 'timein', 'clockin', 'entry', 'firstin', 'onduty'],
  outTime: ['outtime', 'checkout', 'lastpunch', 'punchout', 'out', 'timeout', 'clockout', 'exit', 'lastout', 'offduty'],
  punchTime: ['punchtime', 'time', 'logtime', 'punch', 'swipetime', 'attendancetime'],
  status: ['status', 'attendancestatus', 'remark', 'remarks', 'presentabsent'],
  shift: ['shift', 'shiftname', 'shiftcode'],
};

function detectColumns(headers: string[]) {
  const map: Record<string, number> = {};
  const used = new Set<number>();
  const norm = headers.map(nk);
  for (const field of Object.keys(ALIASES)) {
    for (const alias of ALIASES[field]) {
      const idx = norm.findIndex((h, i) => !used.has(i) && (h === alias || h.includes(alias)));
      if (idx >= 0) { map[field] = idx; used.add(idx); break; }
    }
  }
  // altKey must be a DIFFERENT column than employeeKey to be useful.
  if (map.altKey === map.employeeKey) delete map.altKey;
  return map;
}

// ── Cell → canonical string normalisers (defensive; server re-normalises too) ──
const pad2 = (n: number) => String(n).padStart(2, '0');
function cellDate(v: any): string {
  if (v == null || v === '') return '';
  if (v instanceof Date && !isNaN(v.getTime())) return `${v.getFullYear()}-${pad2(v.getMonth() + 1)}-${pad2(v.getDate())}`;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/); if (m) return `${m[1]}-${pad2(+m[2])}-${pad2(+m[3])}`;
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (m) { let y = +m[3]; if (y < 100) y += 2000; return `${y}-${pad2(+m[2])}-${pad2(+m[1])}`; } // day-first (India)
  const d = new Date(s); return isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function cellTime(v: any): string {
  if (v == null || v === '') return '';
  if (v instanceof Date && !isNaN(v.getTime())) return `${pad2(v.getHours())}:${pad2(v.getMinutes())}`;
  if (typeof v === 'number' && v > 0 && v < 1) { const mins = Math.round(v * 24 * 60); return `${pad2(Math.floor(mins / 60))}:${pad2(mins % 60)}`; }
  const s = String(v).trim();
  const m = s.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?/);
  if (!m) return '';
  let h = +m[1]; const min = +m[2]; const ap = (m[3] || '').toUpperCase();
  if (ap === 'PM' && h < 12) h += 12; if (ap === 'AM' && h === 12) h = 0;
  if (h > 23 || min > 59) return ''; return `${pad2(h)}:${pad2(min)}`;
}

type Canon = { rowNo: number; employeeKey: string; altKey?: string; date: string; inTime?: string; outTime?: string; punchTime?: string; status?: string; shift?: string };

interface Parsed {
  fileName: string;
  headers: string[];
  mapping: Record<string, number>;
  rows: Canon[];
  issues: { invalidDate: number; missingId: number; future: number; blank: number };
}

const DEVICES = ['ZKTeco', 'eSSL', 'Matrix', 'BioMax', 'TeamOffice', 'E-Time Office', 'Suprema'];
const PAGE_SIZE = 25;

// Pretty a 'YYYY-MM-DD' (or blank) as "01 Jun 2026".
const fmtDay = (iso?: string) => (iso ? formatDate(iso) : '—');

export const AttendanceSheetImport: React.FC<Props> = ({ role, companyId, onRefresh }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [parseError, setParseError] = useState('');
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [preview, setPreview] = useState<any>(null);   // dry-run result from server
  const [result, setResult] = useState<any>(null);     // committed result
  const [busy, setBusy] = useState<'analyzing' | 'commit' | ''>('');

  const [employees, setEmployees] = useState<any[]>([]);          // for manual mapping
  const [overrides, setOverrides] = useState<Record<string, string>>({}); // fileKey(norm) → employeeCode
  const [ignoreUnmatched, setIgnoreUnmatched] = useState(false);
  const [page, setPage] = useState(0);
  const [history, setHistory] = useState<any[] | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const reset = () => {
    setParsed(null); setPreview(null); setResult(null); setParseError('');
    setOverrides({}); setIgnoreUnmatched(false); setPage(0);
    if (fileRef.current) fileRef.current.value = '';
  };

  const todayISO = useMemo(() => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }, []);

  // Company employees (for the "Map Employee" dropdown). Company-scoped server-side.
  useEffect(() => {
    let alive = true;
    api.employees.getAll()
      .then((e: any) => { if (alive) setEmployees(Array.isArray(e) ? e : (e?.employees || e?.data || e?.items || [])); })
      .catch(() => { if (alive) setEmployees([]); });
    return () => { alive = false; };
  }, [companyId]);

  const loadHistory = () => api.attendanceImport.history()
    .then((h: any) => setHistory(Array.isArray(h) ? h : []))
    .catch(() => setHistory([]));
  useEffect(() => { loadHistory(); }, [companyId]);

  // ── Parse (upload → read → auto-detect columns) ─────────────────────────────
  const parseFile = async (file?: File) => {
    if (!file) return;
    reset();
    if (file.size > 15 * 1024 * 1024) { setParseError('File exceeds 15MB. Split it into smaller files.'); return; }
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', cellDates: true, raw: false });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const grid: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: false });
      if (!grid.length) { setParseError('The sheet is empty.'); return; }
      const headers = (grid[0] || []).map((h) => String(h ?? '').trim());
      const mapping = detectColumns(headers);
      if (mapping.employeeKey == null) { setParseError('Could not find an Employee/Biometric ID column. Expected a header like "Employee ID", "Emp Code", or "Biometric ID".'); return; }
      if (mapping.date == null && mapping.dateTime == null) { setParseError('Could not find a Date column. Expected "Date", "Attendance Date", or a combined "DateTime".'); return; }

      const issues = { invalidDate: 0, missingId: 0, future: 0, blank: 0 };
      const rows: Canon[] = [];
      for (let r = 1; r < grid.length; r++) {
        const raw = grid[r] || [];
        const nonEmpty = raw.some((c) => String(c ?? '').trim() !== '');
        if (!nonEmpty) { issues.blank++; continue; }
        const get = (f: string) => (mapping[f] != null ? raw[mapping[f]] : '');
        const employeeKey = String(get('employeeKey') ?? '').trim();
        // Date: prefer explicit date column, else derive from a combined datetime.
        let date = cellDate(get('date'));
        const dtRaw = get('dateTime');
        if (!date && dtRaw) date = cellDate(dtRaw);
        // Times: explicit in/out, else the datetime/punch column as a single punch.
        let inTime = cellTime(get('inTime'));
        let outTime = cellTime(get('outTime'));
        let punchTime = cellTime(get('punchTime'));
        if (!punchTime && dtRaw && !inTime && !outTime) punchTime = cellTime(dtRaw);

        if (!employeeKey) issues.missingId++;
        if (!date) issues.invalidDate++;
        else if (date > todayISO) issues.future++;

        rows.push({
          rowNo: r + 1, employeeKey, date,
          altKey: mapping.altKey != null ? String(get('altKey') ?? '').trim() : undefined,
          inTime: inTime || undefined, outTime: outTime || undefined, punchTime: punchTime || undefined,
          status: mapping.status != null ? String(get('status') ?? '').trim() : undefined,
          shift: mapping.shift != null ? String(get('shift') ?? '').trim() : undefined,
        });
      }
      if (!rows.length) { setParseError('No data rows found under the header.'); return; }
      setParsed({ fileName: file.name, headers, mapping, rows, issues });
    } catch (e: any) {
      setParseError(e?.message || 'Could not read the file.');
    }
  };

  // ── Apply manual employee mappings, then analyse ────────────────────────────
  // A mapping rewrites the unmatched file key onto the chosen employee's code (which
  // the server matches by employee code) — no attendance logic changes, the same
  // engine simply now finds the employee.
  const effectiveRows = useMemo(() => {
    if (!parsed) return [];
    if (!Object.keys(overrides).length) return parsed.rows;
    return parsed.rows.map((r) => {
      const ov = overrides[nk(r.employeeKey)] ?? (r.altKey ? overrides[nk(r.altKey)] : undefined);
      return ov ? { ...r, altKey: ov } : r;
    });
  }, [parsed, overrides]);

  // Client-side period + duplicate-line count (over the whole file, incl. unmatched).
  const clientMeta = useMemo(() => {
    if (!parsed) return { period: null as null | { start: string; end: string }, duplicates: 0 };
    const dates = parsed.rows.map((r) => r.date).filter(Boolean).sort();
    const period = dates.length ? { start: dates[0], end: dates[dates.length - 1] } : null;
    const seen = new Set<string>(); let duplicates = 0;
    for (const r of parsed.rows) {
      const k = [nk(r.employeeKey), r.date, r.inTime || '', r.outTime || '', r.punchTime || ''].join('|');
      if (seen.has(k)) duplicates++; else seen.add(k);
    }
    return { period, duplicates };
  }, [parsed]);

  // Auto-analyse whenever the file (or a mapping) changes — never writes.
  useEffect(() => {
    if (!parsed) { setPreview(null); return; }
    let stale = false;
    setBusy('analyzing'); setResult(null); setPage(0);
    api.attendanceImport.process({ companyId, fileName: parsed.fileName, dryRun: true, rows: effectiveRows })
      .then((r: any) => { if (!stale) setPreview(r); })
      .catch((e: any) => { if (!stale) { ui.toast.error(getApiErrorMessage(e) || 'Preview failed.'); setPreview(null); } })
      .finally(() => { if (!stale) setBusy(''); });
    return () => { stale = true; };
  }, [effectiveRows, companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const runCommit = async (mode: 'all' | 'matched') => {
    if (!parsed) return;
    setBusy('commit');
    try {
      const r = await api.attendanceImport.process({ companyId, fileName: parsed.fileName, dryRun: false, rows: effectiveRows });
      setResult(r);
      ui.toast.success(`Attendance imported — ${r.summary.imported} new, ${r.summary.updated} updated${mode === 'matched' ? ' (matched only)' : ''}.`);
      onRefresh?.();
      loadHistory();
    } catch (e: any) { ui.toast.error(getApiErrorMessage(e) || 'Import failed.'); }
    finally { setBusy(''); }
  };

  const mapEmployee = (fileKey: string, code: string) => {
    setOverrides((o) => {
      const next = { ...o };
      if (code) next[nk(fileKey)] = code; else delete next[nk(fileKey)];
      return next;
    });
  };

  const downloadErrorReport = (res: any) => {
    const rows = res?.errors || [];
    if (!rows.length) return;
    const head = ['Row', 'Employee ID', 'Employee Name', 'Error', 'Suggested Fix'];
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [head.join(','), ...rows.map((e: any) => [e.row, e.employeeId, e.employeeName, e.error, e.fix].map(esc).join(','))].join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `attendance-import-errors-${parsed?.fileName || 'report'}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };

  // ── Derived preview slices ──────────────────────────────────────────────────
  const s = preview?.summary;
  const unmatchedList: any[] = preview?.unmatched || [];
  const willUpdate: any[] = preview?.willUpdate || [];
  const sample: any[] = preview?.sample || [];
  const timeline = preview?.timeline || (clientMeta.period ? { start: clientMeta.period.start, end: clientMeta.period.end } : null);
  // Genuinely invalid rows (missing id / bad date / future) — unmatched & offboarded
  // are reported in their own panels, not here.
  const invalidRows: any[] = (preview?.errors || []).filter((e: any) => !/No employee|offboarded/i.test(e.error || ''));
  const unmatchedCount = s?.unmatchedEmployees ?? unmatchedList.length;
  const matchedEmp = s?.matchedEmployees ?? 0;
  const totalEmpAttempted = matchedEmp + unmatchedCount;
  const matchPct = totalEmpAttempted ? Math.round((matchedEmp / totalEmpAttempted) * 100) : 100;
  const canImportAll = !!s && s.records > 0 && (unmatchedCount === 0 || ignoreUnmatched);

  const empOptions = useMemo(
    () => employees
      .filter((e) => e && (e.employeeId || e.id))
      .map((e) => ({ code: String(e.employeeId || e.id), label: `${e.employeeId || e.id} — ${e.name || 'Unnamed'}` }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    [employees],
  );

  const pageCount = Math.max(1, Math.ceil(sample.length / PAGE_SIZE));
  const pageRows = sample.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 animate-in fade-in">
      {/* ── Left: upload + preview ─────────────────────────────────────────── */}
      <div className="lg:col-span-2 space-y-4">
        {/* Upload box — unchanged */}
        <Card>
          <h4 className="font-bold text-sm text-slate-800 mb-1">Smart Excel / Biometric Import</h4>
          <p className="text-xs text-slate-500 mb-4">Upload a biometric export (XLSX, XLS or CSV). Columns are detected automatically — employees are matched by Biometric ID → Employee Code, attendance is validated, and a full preview is shown <b>before</b> anything is saved. Approved leave, holidays and weekly-offs are respected.</p>

          {!parsed && (
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); parseFile(e.dataTransfer.files?.[0]); }}
              className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition-colors ${drag ? 'border-brand-500 bg-brand-50' : 'border-brand-200 bg-brand-50/40 hover:bg-brand-50'}`}
            >
              <Upload size={32} className="text-brand-500 mb-3" />
              <p className="text-sm font-bold text-brand-800">Click to upload or drag & drop</p>
              <p className="text-xs text-brand-600/70 mt-1">XLSX, XLS or CSV · up to 15MB</p>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => parseFile(e.target.files?.[0])} />
            </div>
          )}

          {parseError && <div className="mt-3 flex items-start gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3"><AlertCircle size={14} className="mt-0.5 shrink-0" /><span>{parseError}</span></div>}

          {parsed && (
            <div className="space-y-3">
              {/* File + detected mapping */}
              <div className="flex items-center justify-between rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-700"><FileText size={14} className="text-brand-500" />{parsed.fileName}</div>
                <button onClick={reset} className="text-[11px] text-slate-500 hover:text-rose-600 flex items-center gap-1"><RefreshCcw size={12} /> Choose another</button>
              </div>

              <div>
                <p className="text-[11px] font-bold text-slate-500 uppercase mb-1.5">Detected columns</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(parsed.mapping).map(([field, idx]) => (
                    <span key={field} className="text-[10px] font-medium bg-white border border-slate-200 rounded-full px-2 py-0.5 text-slate-600">
                      <span className="text-brand-600 font-bold">{field}</span> ← {parsed.headers[idx] || `col ${idx + 1}`}
                    </span>
                  ))}
                </div>
              </div>

              {busy === 'analyzing' && (
                <div className="flex items-center gap-2 text-xs text-brand-600 bg-brand-50 border border-brand-100 rounded-lg p-3">
                  <Loader2 size={14} className="animate-spin" /> Analysing {parsed.rows.length} rows — matching employees & validating…
                </div>
              )}
            </div>
          )}
        </Card>

        {/* ── PREVIEW (dry run) ──────────────────────────────────────────────── */}
        {preview && !result && (
          <>
            {/* Import Summary */}
            <Card>
              <h4 className="font-bold text-sm text-slate-800 flex items-center gap-2 mb-3"><ClipboardCheck size={16} className="text-brand-500" /> Attendance Import Summary</h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                <Info label="File Name" value={parsed?.fileName || '—'} tone="slate" mono />
                <Info label="Attendance Period" value={timeline ? `${fmtDay(timeline.start)} → ${fmtDay(timeline.end)}` : '—'} tone="brand" />
                <Info label="Total Rows" value={String(s.total)} tone="slate" />
                <Info label="Matched Employees" value={String(matchedEmp)} tone="emerald" />
                <Info label="New Attendance Records" value={String(s.imported)} tone="emerald" />
                <Info label="Existing (Will Update)" value={String(s.updated)} tone="brand" />
                <Info label="Unmatched Employees" value={String(unmatchedCount)} tone={unmatchedCount ? 'amber' : 'slate'} />
                <Info label="Invalid Rows" value={String(invalidRows.length)} tone={invalidRows.length ? 'rose' : 'slate'} />
                <Info label="Duplicate Rows" value={String(clientMeta.duplicates)} tone={clientMeta.duplicates ? 'amber' : 'slate'} />
              </div>
            </Card>

            {/* Attendance Timeline */}
            {timeline && (
              <Card>
                <h4 className="font-bold text-sm text-slate-800 flex items-center gap-2 mb-3"><CalendarRange size={16} className="text-brand-500" /> Attendance Timeline</h4>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-brand-50 border border-brand-200 px-3 py-2 text-center">
                      <div className="text-[9px] font-bold uppercase text-brand-500">From</div>
                      <div className="text-sm font-extrabold text-brand-800">{fmtDay(timeline.start)}</div>
                    </div>
                    <ChevronRight size={16} className="text-slate-400" />
                    <div className="rounded-lg bg-brand-50 border border-brand-200 px-3 py-2 text-center">
                      <div className="text-[9px] font-bold uppercase text-brand-500">To</div>
                      <div className="text-sm font-extrabold text-brand-800">{fmtDay(timeline.end)}</div>
                    </div>
                  </div>
                  <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2 min-w-[240px]">
                    <Stat label="Total Days" value={timeline.totalDays ?? '—'} tone="slate" />
                    <Stat label="Working Days" value={timeline.workingDays ?? '—'} tone="emerald" />
                    <Stat label="Holidays" value={timeline.holidayDays ?? 0} tone={timeline.holidayDays ? 'amber' : 'slate'} />
                    <Stat label="Records Found" value={timeline.recordsFound ?? s.total} tone="brand" />
                  </div>
                </div>
              </Card>
            )}

            {/* Validation Panel */}
            <Card>
              <h4 className="font-bold text-sm text-slate-800 flex items-center gap-2 mb-2"><CheckCircle2 size={16} className="text-emerald-600" /> Validation Results</h4>
              <ul className="space-y-1 text-xs">
                <Check ok label={`${matchedEmp} employees matched`} />
                {unmatchedCount > 0 && <Check warn label={`${unmatchedCount} employees not found`} />}
                {invalidRows.length > 0 && <Check warn label={`${invalidRows.length} invalid rows (skipped)`} />}
                {clientMeta.duplicates > 0 && <Check warn label={`${clientMeta.duplicates} duplicate rows in file (collapsed)`} />}
                {s.updated > 0 && <Check ok label={`${s.updated} existing attendance records will be updated`} />}
                {s.overtimeQueued > 0 && <Check ok label={`${s.overtimeQueued} overtime entries queued for approval`} />}
              </ul>
            </Card>

            {/* Employee Preview Table */}
            {sample.length > 0 && (
              <Card>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-bold text-sm text-slate-800 flex items-center gap-2"><Users size={16} className="text-brand-500" /> Employee Preview <span className="text-[11px] font-normal text-slate-400">(first {sample.length} of {s.records} records)</span></h4>
                  {pageCount > 1 && (
                    <div className="flex items-center gap-1 text-[11px] text-slate-500">
                      <button disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className="p-1 rounded hover:bg-slate-100 disabled:opacity-40"><ChevronLeft size={14} /></button>
                      Page {page + 1} / {pageCount}
                      <button disabled={page >= pageCount - 1} onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} className="p-1 rounded hover:bg-slate-100 disabled:opacity-40"><ChevronRight size={14} /></button>
                    </div>
                  )}
                </div>
                <div className="rounded-lg border border-slate-200 overflow-x-auto">
                  <table className="w-full text-[11px] whitespace-nowrap">
                    <thead className="bg-slate-50 text-slate-500 uppercase text-[10px]">
                      <tr>
                        <th className="text-left px-2 py-1.5">#</th>
                        <th className="text-left px-2 py-1.5">Emp Code</th>
                        <th className="text-left px-2 py-1.5">Name</th>
                        <th className="text-left px-2 py-1.5">Biometric</th>
                        <th className="text-left px-2 py-1.5">Date</th>
                        <th className="text-left px-2 py-1.5">In</th>
                        <th className="text-left px-2 py-1.5">Out</th>
                        <th className="text-right px-2 py-1.5">Hours</th>
                        <th className="text-left px-2 py-1.5">Status</th>
                        <th className="text-left px-2 py-1.5">Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((r: any, i: number) => (
                        <tr key={i} className="border-t border-slate-100">
                          <td className="px-2 py-1 text-slate-400">{r.rowNo ?? page * PAGE_SIZE + i + 1}</td>
                          <td className="px-2 py-1 font-mono text-slate-700">{r.employeeCode || '—'}</td>
                          <td className="px-2 py-1 font-medium text-slate-800">{r.employeeName}</td>
                          <td className="px-2 py-1 font-mono text-slate-500">{r.biometricId || '—'}</td>
                          <td className="px-2 py-1 text-slate-600">{fmtDay(r.date)}</td>
                          <td className="px-2 py-1 text-slate-600">{r.punchIn || '—'}</td>
                          <td className="px-2 py-1 text-slate-600">{r.punchOut || '—'}</td>
                          <td className="px-2 py-1 text-right text-slate-600">{r.hoursWorked ? Number(r.hoursWorked).toFixed(2) : '—'}</td>
                          <td className="px-2 py-1"><StatusChip status={r.status} /></td>
                          <td className="px-2 py-1">
                            <span className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 ${r.result === 'Update' ? 'bg-brand-50 text-brand-700' : 'bg-emerald-50 text-emerald-700'}`}>{r.result === 'Update' ? 'Will Update' : 'Ready'}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* Unmatched Employees — with manual mapping */}
            {unmatchedList.length > 0 && (
              <Card>
                <h4 className="font-bold text-sm text-amber-700 flex items-center gap-2 mb-1"><AlertTriangle size={16} /> Unmatched Employees ({unmatchedList.length})</h4>
                <p className="text-[11px] text-slate-500 mb-2">Map each ID to an employee — the preview re-validates automatically. Unmapped IDs are skipped on import.</p>
                <div className="rounded-lg border border-amber-200 overflow-x-auto">
                  <table className="w-full text-[11px] whitespace-nowrap">
                    <thead className="bg-amber-50 text-amber-700 uppercase text-[10px]"><tr>
                      <th className="text-left px-3 py-1.5">ID in File</th>
                      <th className="text-left px-3 py-1.5">Punches</th>
                      <th className="text-left px-3 py-1.5">Map Employee</th>
                      <th className="text-left px-3 py-1.5">Status</th>
                    </tr></thead>
                    <tbody>
                      {unmatchedList.map((u: any, i: number) => {
                        const mappedCode = overrides[nk(u.employeeKey)];
                        return (
                          <tr key={i} className="border-t border-amber-100">
                            <td className="px-3 py-1 font-mono text-slate-700">{u.employeeKey}</td>
                            <td className="px-3 py-1 text-slate-600">{u.count}</td>
                            <td className="px-3 py-1">
                              <select
                                value={mappedCode || ''}
                                onChange={(e) => mapEmployee(u.employeeKey, e.target.value)}
                                className="text-[11px] rounded-md border border-slate-200 bg-white px-2 py-1 max-w-[220px] focus:border-brand-500 focus:outline-none"
                              >
                                <option value="">— Select employee —</option>
                                {empOptions.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
                              </select>
                            </td>
                            <td className="px-3 py-1">
                              {mappedCode
                                ? <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 rounded-full px-1.5 py-0.5">Mapped</span>
                                : <span className="text-[10px] font-bold text-amber-700">No Match</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* Duplicate Attendance (will update) */}
            {willUpdate.length > 0 && (
              <Card>
                <h4 className="font-bold text-sm text-slate-800 flex items-center gap-2 mb-1"><RefreshCcw size={16} className="text-brand-500" /> Duplicate Attendance — Will Update ({s.updated})</h4>
                <p className="text-[11px] text-slate-500 mb-2">These employee/date records already exist and will be overwritten with the imported values.</p>
                <div className="rounded-lg border border-slate-200 max-h-56 overflow-y-auto overflow-x-auto">
                  <table className="w-full text-[11px] whitespace-nowrap">
                    <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] sticky top-0"><tr>
                      <th className="text-left px-3 py-1.5">Employee</th>
                      <th className="text-left px-3 py-1.5">Date</th>
                      <th className="text-left px-3 py-1.5">Existing</th>
                      <th className="text-left px-3 py-1.5">New</th>
                      <th className="text-left px-3 py-1.5">Action</th>
                    </tr></thead>
                    <tbody>
                      {willUpdate.map((w: any, i: number) => (
                        <tr key={i} className="border-t border-slate-100">
                          <td className="px-3 py-1 font-medium text-slate-800">{w.employeeName} <span className="text-slate-400 font-mono">{w.employeeCode}</span></td>
                          <td className="px-3 py-1 text-slate-600">{fmtDay(w.date)}</td>
                          <td className="px-3 py-1"><StatusChip status={w.existingStatus} /></td>
                          <td className="px-3 py-1"><StatusChip status={w.newStatus} /></td>
                          <td className="px-3 py-1"><span className="text-[10px] font-bold text-brand-700 bg-brand-50 rounded-full px-1.5 py-0.5">Update</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* Invalid Records */}
            {invalidRows.length > 0 && (
              <Card>
                <div className="flex items-center justify-between mb-1">
                  <h4 className="font-bold text-sm text-rose-700 flex items-center gap-2"><XCircle size={16} /> Invalid Records ({invalidRows.length}) — skipped</h4>
                  <button onClick={() => downloadErrorReport(preview)} className="text-[11px] text-brand-600 hover:underline flex items-center gap-1"><Download size={12} /> Error report (CSV)</button>
                </div>
                <div className="rounded-lg border border-rose-200 max-h-48 overflow-y-auto">
                  <table className="w-full text-[11px]">
                    <thead className="bg-rose-50 text-rose-600 uppercase text-[10px] sticky top-0"><tr>
                      <th className="text-left px-3 py-1.5">Row</th>
                      <th className="text-left px-3 py-1.5">Problem</th>
                      <th className="text-left px-3 py-1.5">Suggestion</th>
                    </tr></thead>
                    <tbody>
                      {invalidRows.slice(0, 200).map((e: any, i: number) => (
                        <tr key={i} className="border-t border-rose-100">
                          <td className="px-3 py-1">{e.row}</td>
                          <td className="px-3 py-1 text-rose-700">{e.error}</td>
                          <td className="px-3 py-1 text-slate-500">{e.fix}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-[11px] text-slate-500">Invalid rows do not block the import — only valid rows are written.</p>
              </Card>
            )}

            {/* Import Statistics + Actions */}
            <Card>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-center">
                  <div className="text-base font-extrabold text-slate-800">{matchedEmp} / {totalEmpAttempted}</div>
                  <div className="text-[9px] font-bold uppercase text-slate-500 mt-0.5">Employees Matched · {matchPct}%</div>
                </div>
                <Stat label="Attendance Ready" value={s.imported} tone="emerald" />
                <Stat label="Will Update" value={s.updated} tone="brand" />
                <Stat label="Need Attention" value={unmatchedCount} tone={unmatchedCount ? 'amber' : 'slate'} />
              </div>

              {unmatchedCount > 0 && (
                <label className="flex items-center gap-2 text-xs text-slate-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3 cursor-pointer">
                  <input type="checkbox" checked={ignoreUnmatched} onChange={(e) => setIgnoreUnmatched(e.target.checked)} className="accent-brand-600" />
                  Ignore the {unmatchedCount} unmatched employee(s) and import the rest. (Or map them above to include them.)
                </label>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={reset}>Cancel</Button>
                {preview.errors?.length > 0 && <Button variant="outline" icon={<Download size={14} />} onClick={() => downloadErrorReport(preview)}>Download Error Report</Button>}
                <div className="flex-1" />
                <Button variant="outline" disabled={!s.records || busy === 'commit'} loading={busy === 'commit'} onClick={() => runCommit('matched')}>
                  Import Matched Records Only ({s.records})
                </Button>
                <Button disabled={!canImportAll || busy === 'commit'} loading={busy === 'commit'} onClick={() => runCommit('all')}>
                  Import All Valid Records
                </Button>
              </div>
              {!canImportAll && unmatchedCount > 0 && (
                <p className="mt-2 text-[11px] text-amber-600">Resolve the unmatched employees (map them or tick “ignore”) to enable <b>Import All Valid Records</b>.</p>
              )}
            </Card>
          </>
        )}

        {/* ── SUCCESS SUMMARY (after commit) ─────────────────────────────────── */}
        {result && (
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-bold text-sm text-slate-800 flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-600" /> Attendance Import Completed</h4>
              <div className="flex gap-1.5">
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">Dashboard Updated</span>
                <span className="text-[10px] font-bold text-brand-700 bg-brand-50 border border-brand-200 rounded-full px-2 py-0.5">Payroll Synced</span>
              </div>
            </div>
            <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
              <Stat label="Total Rows" value={result.summary.total} tone="slate" />
              <Stat label="Imported" value={result.summary.imported} tone="emerald" />
              <Stat label="Updated" value={result.summary.updated} tone="brand" />
              <Stat label="Skipped" value={result.summary.skipped} tone={result.summary.skipped ? 'amber' : 'slate'} />
              <Stat label="Errors" value={result.summary.errors} tone={result.summary.errors ? 'rose' : 'slate'} />
            </div>
            <div className="mt-4 flex items-center gap-2">
              {result.errors?.length > 0 && <Button variant="outline" icon={<Download size={14} />} onClick={() => downloadErrorReport(result)}>Error report</Button>}
              <Button variant="outline" className="flex-1" onClick={reset}>Import another file</Button>
            </div>
          </Card>
        )}
      </div>

      {/* ── Right: resources / status / history ────────────────────────────── */}
      <div className="space-y-4">
        <Card>
          <h4 className="font-bold text-sm text-slate-800 mb-2">How it works</h4>
          <ol className="text-[11px] text-slate-600 space-y-1.5 list-decimal list-inside">
            <li>Columns auto-detected (no manual mapping)</li>
            <li>Employees matched by Biometric ID → Employee Code</li>
            <li>A full preview is shown before saving</li>
            <li>Approved leave, holidays &amp; weekly-offs respected</li>
            <li>One record per employee/date — never duplicated</li>
            <li>Dashboard, reports &amp; payroll flagged to recompute</li>
          </ol>
        </Card>

        {/* Audit history */}
        <Card>
          <button onClick={() => setShowHistory((v) => !v)} className="w-full flex items-center justify-between">
            <h4 className="font-bold text-sm text-slate-800 flex items-center gap-2"><History size={14} className="text-brand-500" /> Previous Imports {history ? `(${history.length})` : ''}</h4>
            <ChevronRight size={14} className={`text-slate-400 transition-transform ${showHistory ? 'rotate-90' : ''}`} />
          </button>
          {showHistory && (
            <div className="mt-3 space-y-2 max-h-72 overflow-y-auto">
              {!history && <div className="text-[11px] text-slate-400 flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Loading…</div>}
              {history && history.length === 0 && <div className="text-[11px] text-slate-400">No imports yet.</div>}
              {history && history.map((h) => (
                <div key={h.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-700 truncate max-w-[150px]" title={h.fileName}>{h.fileName}</span>
                    <span className="text-slate-400">{formatDateTime(h.importDate)}</span>
                  </div>
                  <div className="text-slate-500 mt-0.5">By {h.importedBy}</div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[10px] text-slate-600">
                    <span>Total <b>{h.total ?? '—'}</b></span>
                    <span className="text-emerald-700">Imported <b>{h.imported ?? '—'}</b></span>
                    <span className="text-brand-700">Updated <b>{h.updated ?? '—'}</b></span>
                    <span className="text-amber-700">Skipped <b>{h.skipped ?? '—'}</b></span>
                    <span className="text-rose-700">Errors <b>{h.errors ?? '—'}</b></span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="bg-slate-900 text-white border-none">
          <h4 className="font-bold text-sm text-white mb-2 flex items-center gap-2"><Database size={14} className="text-brand-400" /> Compatible devices</h4>
          <div className="flex flex-wrap gap-1.5">
            {DEVICES.map((d) => <span key={d} className="text-[10px] bg-slate-800 px-2 py-1 rounded text-slate-300">{d}</span>)}
          </div>
          <p className="text-[11px] text-slate-400 mt-3">Any generic biometric export with an ID, date and punch columns is supported.</p>
          {role === 'Super Admin' && <p className="text-[11px] text-amber-300/90 mt-2">Importing into the currently selected company workspace.</p>}
        </Card>
      </div>
    </div>
  );
};

// ── small presentational helpers ─────────────────────────────────────────────
const TONES: Record<string, string> = {
  slate: 'bg-slate-50 border-slate-200 text-slate-700',
  emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  brand: 'bg-brand-50 border-brand-200 text-brand-700',
  amber: 'bg-amber-50 border-amber-200 text-amber-700',
  rose: 'bg-rose-50 border-rose-200 text-rose-700',
  blue: 'bg-blue-50 border-blue-200 text-blue-700',
};
const Stat: React.FC<{ label: string; value: React.ReactNode; tone: string }> = ({ label, value, tone }) => (
  <div className={`rounded-lg border px-2 py-1.5 text-center ${TONES[tone] || TONES.slate}`}>
    <div className="text-base font-extrabold leading-none">{value}</div>
    <div className="text-[9px] font-bold uppercase mt-1 opacity-80">{label}</div>
  </div>
);
const Info: React.FC<{ label: string; value: string; tone: string; mono?: boolean }> = ({ label, value, tone, mono }) => (
  <div className={`rounded-lg border px-2.5 py-1.5 ${TONES[tone] || TONES.slate}`}>
    <div className="text-[9px] font-bold uppercase opacity-70">{label}</div>
    <div className={`text-xs font-bold leading-tight truncate ${mono ? 'font-mono' : ''}`} title={value}>{value}</div>
  </div>
);
const Check: React.FC<{ label: string; ok?: boolean; warn?: boolean }> = ({ label, ok, warn }) => (
  <li className="flex items-center gap-2">
    {ok && <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />}
    {warn && <AlertTriangle size={13} className="text-amber-600 shrink-0" />}
    <span className={ok ? 'text-slate-700' : 'text-amber-700'}>{label}</span>
  </li>
);
const STATUS_TONE: Record<string, string> = {
  Present: 'text-emerald-700 bg-emerald-50', 'Half Day': 'text-amber-700 bg-amber-50',
  Absent: 'text-rose-700 bg-rose-50', Leave: 'text-blue-700 bg-blue-50',
  Holiday: 'text-purple-700 bg-purple-50', 'Weekly Off': 'text-slate-600 bg-slate-100',
  'Work From Home': 'text-cyan-700 bg-cyan-50',
};
const StatusChip: React.FC<{ status?: string }> = ({ status }) => (
  <span className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 ${STATUS_TONE[status || ''] || 'text-slate-600 bg-slate-100'}`}>{status || '—'}</span>
);

export default AttendanceSheetImport;
