import React, { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { api } from '../api/apiClient';

interface Props {
  open: boolean;
  onClose: () => void;
  role: string;
  companyId?: any;       // target company (used for Super Admin; Company Head is pinned server-side)
  onDone?: () => void;   // called after a successful import so the parent can refresh
}

type Row = { employeeId: string; biometricCode: string };

/**
 * Bulk-import Biometric Codes from an Excel sheet with two columns:
 *   Employee ID | Biometric Code
 * Employee IDs are matched (never modified). Codes are validated per-company on
 * the server. No attendance is synced — this only sets the mapping.
 */
export const BiometricImportModal: React.FC<Props> = ({ open, onClose, role, companyId, onDone }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [fileName, setFileName] = useState('');
  const [parseError, setParseError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);

  const reset = () => { setRows([]); setFileName(''); setParseError(''); setResult(null); };
  const close = () => { reset(); onClose(); };

  const pick = (obj: any, ...names: string[]) => {
    const keys = Object.keys(obj);
    for (const n of names) {
      const k = keys.find(key => key.toLowerCase().replace(/[\s_]/g, '') === n.toLowerCase().replace(/[\s_]/g, ''));
      if (k != null) return obj[k];
    }
    return '';
  };

  const onFile = async (file?: File) => {
    if (!file) return;
    setParseError(''); setResult(null); setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
      const parsed: Row[] = json.map(r => ({
        employeeId: String(pick(r, 'Employee ID', 'EmployeeID', 'EmpCode', 'Employee Code', 'Code')).trim(),
        biometricCode: String(pick(r, 'Biometric Code', 'BiometricCode', 'Machine Employee Code', 'Attendance Code', 'Biometric Employee Code')).trim(),
      })).filter(r => r.employeeId || r.biometricCode);
      if (!parsed.length) { setParseError('No rows found. Expected columns: "Employee ID" and "Biometric Code".'); setRows([]); return; }
      setRows(parsed);
    } catch (e: any) {
      setParseError(e?.message || 'Could not read the file.'); setRows([]);
    }
  };

  const runImport = async () => {
    if (!rows.length) return;
    setBusy(true); setResult(null);
    try {
      const r = await api.biometricMappings.bulk(rows, companyId);
      setResult(r);
      if (r?.updated > 0 && onDone) onDone();
    } catch (e: any) {
      setResult({ error: e?.message || 'Import failed.' });
    } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={close} title="Import Biometric Codes"
      footer={<div className="flex justify-end gap-2">
        <Button variant="outline" onClick={close}>Close</Button>
        <Button loading={busy} disabled={!rows.length} onClick={runImport}>Import {rows.length ? `(${rows.length})` : ''}</Button>
      </div>}>
      <div className="space-y-3 text-sm">
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-[11px] text-slate-600">
          Upload an Excel file (<span className="font-mono">.xlsx/.xls</span>) with two columns: <b>Employee ID</b> and <b>Biometric Code</b>.
          Employee IDs are matched only — they are never changed. Codes are validated to be unique within the company.
          {role === 'Super Admin' && <div className="mt-1 text-amber-700">Importing into the currently selected company workspace.</div>}
        </div>

        <button type="button" onClick={() => fileRef.current?.click()}
          className="w-full border-2 border-dashed border-slate-300 rounded-xl py-6 text-center hover:border-indigo-400 transition-colors">
          <p className="text-xs font-semibold text-slate-600">{fileName || 'Click to choose an Excel file'}</p>
          <p className="text-[10px] text-slate-400 mt-1">Columns: Employee ID | Biometric Code</p>
          <input type="file" ref={fileRef} accept=".xlsx,.xls" className="hidden"
            onChange={e => onFile(e.target.files?.[0])} />
        </button>

        {parseError && <p className="text-[11px] text-rose-600 font-semibold">{parseError}</p>}

        {rows.length > 0 && !result && (
          <div className="rounded-lg border border-slate-200 max-h-48 overflow-y-auto">
            <table className="w-full text-[11px]">
              <thead className="bg-slate-50 text-slate-500"><tr><th className="text-left px-3 py-1.5">Employee ID</th><th className="text-left px-3 py-1.5">Biometric Code</th></tr></thead>
              <tbody>
                {rows.slice(0, 100).map((r, i) => (
                  <tr key={i} className="border-t border-slate-100"><td className="px-3 py-1 font-mono">{r.employeeId || '—'}</td><td className="px-3 py-1 font-mono">{r.biometricCode || '—'}</td></tr>
                ))}
              </tbody>
            </table>
            {rows.length > 100 && <p className="text-[10px] text-slate-400 px-3 py-1">…and {rows.length - 100} more</p>}
          </div>
        )}

        {result && (
          result.error ? <p className="text-xs text-rose-600 font-semibold">{result.error}</p> : (
            <div className="space-y-2">
              <div className="flex gap-2">
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">Updated: {result.updated}</span>
                <span className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">Skipped: {result.skipped}</span>
              </div>
              {result.errors?.length > 0 && (
                <div className="rounded-lg border border-rose-200 max-h-40 overflow-y-auto">
                  <table className="w-full text-[11px]">
                    <thead className="bg-rose-50 text-rose-600"><tr><th className="text-left px-3 py-1.5">Row</th><th className="text-left px-3 py-1.5">Employee ID</th><th className="text-left px-3 py-1.5">Reason</th></tr></thead>
                    <tbody>
                      {result.errors.map((er: any, i: number) => (
                        <tr key={i} className="border-t border-rose-100"><td className="px-3 py-1">{er.row}</td><td className="px-3 py-1 font-mono">{er.employeeId || '—'}</td><td className="px-3 py-1 text-rose-700">{er.error}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        )}
      </div>
    </Modal>
  );
};

export default BiometricImportModal;
