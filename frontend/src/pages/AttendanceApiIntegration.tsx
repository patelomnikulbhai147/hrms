import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { ui } from '@/components/ui/feedback';
import { api } from '@/api/apiClient';
import { getApiErrorMessage } from '@/utils/apiError';
import { formatDateTime } from '@/utils/formatDate';
import type { Role } from '@/data/mockData';
import {
  Fingerprint, RefreshCw, Wifi, WifiOff, CheckCircle2, XCircle, AlertTriangle,
  Clock, Users, PlugZap, Save, Loader2, Play, UserPlus, Link2, Ban,
} from 'lucide-react';

interface Props {
  role: Role;
  activeCompanyId?: string;
  companies?: any[];
  authProfile?: any;
}

// The E-TimeOffice connection is per-company; the active workspace travels in the
// x-workspace-id header (set by apiClient), so no explicit companyId is needed for
// company-scoped users. Manage = Super Admin / Company Head; HR is view-only.
export const AttendanceApiIntegration: React.FC<Props> = ({ role, activeCompanyId, companies = [] }) => {
  const canManage = role === 'Super Admin' || role === 'Company Head';

  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [form, setForm] = useState<any>({
    enabled: false, apiBaseUrl: '', corporateId: '', apiUsername: '', apiPassword: '',
    empCode: 'ALL', syncIntervalMinutes: 30, syncWindowDays: 2,
    vendor: 'E-TimeOffice', branchId: '', deviceSerialNumber: '', deviceLocation: '',
  });
  const [apiPasswordSet, setApiPasswordSet] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<any>(null);
  // Unmatched Queue + biometric mapping
  const [unmatchedGroups, setUnmatchedGroups] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [mapSel, setMapSel] = useState<Record<string, string>>({}); // biometricCode → employeeId
  const [resolvingCode, setResolvingCode] = useState<string>('');

  // Company context + branch options are derived from the workspace list (branches
  // are companies with a parentCompanyId), so no extra API/module is introduced.
  const activeCompany = companies.find((c: any) => String(c.id) === String(activeCompanyId));
  const branchOptions = companies.filter((c: any) => String(c.parentCompanyId) === String(activeCompanyId));

  const hydrateForm = useCallback((conn: any) => {
    if (!conn) return;
    setForm({
      enabled: !!conn.enabled,
      apiBaseUrl: conn.apiBaseUrl || 'https://api.etimeoffice.com/api/',
      corporateId: conn.corporateId || '',
      apiUsername: conn.apiUsername || '',
      apiPassword: '', // never returned; blank means "leave unchanged"
      empCode: conn.empCode || 'ALL',
      syncIntervalMinutes: conn.syncIntervalMinutes ?? 30,
      syncWindowDays: conn.syncWindowDays ?? 2,
      vendor: conn.vendor || 'E-TimeOffice',
      branchId: conn.branchId != null ? String(conn.branchId) : '',
      deviceSerialNumber: conn.deviceSerialNumber || '',
      deviceLocation: conn.deviceLocation || '',
    });
    setApiPasswordSet(!!conn.apiPasswordSet);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dash, logRows, vendorRows, unmatchedRes, empRows] = await Promise.all([
        api.etimeoffice.dashboard().catch(() => null),
        api.etimeoffice.syncLogs().catch(() => []),
        api.attendanceVendors.getAll().catch(() => []),
        api.etimeoffice.unmatched().catch(() => ({ groups: [] })),
        api.etimeoffice.mappingEmployees().catch(() => []),
      ]);
      if (dash) { setDashboard(dash); hydrateForm(dash.connection); }
      setLogs(Array.isArray(logRows) ? logRows : []);
      setVendors(Array.isArray(vendorRows) ? vendorRows : []);
      const groups = Array.isArray(unmatchedRes?.groups) ? unmatchedRes.groups : [];
      setUnmatchedGroups(groups);
      setEmployees(Array.isArray(empRows) ? empRows : []);
      // Pre-select each group's suggested employee so a one-click Resolve is common.
      setMapSel(prev => {
        const next = { ...prev };
        for (const g of groups) { if (g.biometricCode && !next[g.biometricCode] && g.suggestedEmployee) next[g.biometricCode] = String(g.suggestedEmployee.id); }
        return next;
      });
    } catch (e) {
      ui.toast.error(getApiErrorMessage(e, 'Could not load the attendance integration.'));
    } finally {
      setLoading(false);
    }
  }, [hydrateForm]);

  useEffect(() => { load(); }, [load]);

  const setField = (k: string, v: any) => setForm((prev: any) => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    if (!canManage) return;
    setSaving(true);
    try {
      const payload: any = { ...form };
      if (!payload.apiPassword) delete payload.apiPassword; // blank = keep existing
      const saved = await api.etimeoffice.saveConnection(payload);
      hydrateForm(saved);
      ui.toast.success('E-TimeOffice connection saved.');
      load();
    } catch (e) {
      ui.toast.error(getApiErrorMessage(e, 'Could not save the connection.'));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!canManage) return;
    setTesting(true);
    try {
      const res = await api.etimeoffice.testConnection({});
      if (res?.ok) ui.toast.success(res.message || 'Connected to E-TimeOffice.');
      else ui.toast.error(res?.message || res?.error || 'Connection test failed.');
      load();
    } catch (e) {
      ui.toast.error(getApiErrorMessage(e, 'Connection test failed.'));
    } finally {
      setTesting(false);
    }
  };

  const handleSync = async (dryRun = false) => {
    if (!canManage) return;
    setSyncing(true);
    setLastSyncResult(null);
    try {
      const res = await api.etimeoffice.syncNow({ dryRun });
      if (res?.ok) {
        setLastSyncResult({ ...res.summary, dryRun });
        ui.toast.success(dryRun ? 'Dry run complete (no attendance written).' : 'Sync complete.');
      } else {
        ui.toast.error(res?.error || 'Sync failed.');
      }
      load();
    } catch (e) {
      ui.toast.error(getApiErrorMessage(e, 'Sync failed.'));
    } finally {
      setSyncing(false);
    }
  };

  const handleResolve = async (code: string) => {
    if (!canManage) return;
    const employeeId = mapSel[code];
    if (!employeeId) { ui.toast.error('Pick an employee to map this biometric code to.'); return; }
    setResolvingCode(code);
    try {
      const res = await api.etimeoffice.resolveUnmatched({ biometricCode: code, employeeId: Number(employeeId) });
      if (res?.ok) {
        ui.toast.success(`Mapped ${code} → ${res.employee?.name}. Imported ${res.imported}, updated ${res.updated}${res.failed ? `, failed ${res.failed}` : ''}.`);
        await load();
      } else {
        ui.toast.error(res?.error || 'Could not resolve.');
      }
    } catch (e) {
      ui.toast.error(getApiErrorMessage(e, 'Could not resolve the unmatched punches.'));
    } finally {
      setResolvingCode('');
    }
  };

  const handleIgnore = async (code: string) => {
    if (!canManage) return;
    if (!(await ui.confirm({ message: `Ignore all unmatched punches for biometric code "${code}"? They will not be imported.`, confirmText: 'Ignore', variant: 'danger' }))) return;
    try {
      const res = await api.etimeoffice.ignoreUnmatched({ biometricCode: code });
      if (res?.ok) { ui.toast.success(`Ignored ${res.ignored} punch(es).`); await load(); }
      else ui.toast.error(res?.error || 'Could not ignore.');
    } catch (e) {
      ui.toast.error(getApiErrorMessage(e, 'Could not ignore the punches.'));
    }
  };

  const stats = dashboard?.stats || {};
  const connected = stats.connectionStatus === 'connected';

  const statCard = (label: string, value: any, Icon: any, tone: string) => (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${tone}`}><Icon size={18} /></div>
        <div className="min-w-0">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide truncate">{label}</p>
          <p className="text-xl font-black text-slate-900 leading-none mt-1">{value}</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-5 font-sans max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center"><Fingerprint size={22} /></div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">Attendance API Integration</h2>
            <p className="text-xs text-gray-500 mt-0.5">Sync attendance from the E-TimeOffice cloud into HRMS. Matched by Biometric ID; duplicates prevented automatically.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" icon={<RefreshCw size={13} />} onClick={load} disabled={loading}>Refresh</Button>
          {canManage && (
            <Button size="sm" icon={syncing ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} loading={syncing} onClick={() => handleSync(false)}>
              Sync Attendance Now
            </Button>
          )}
        </div>
      </div>

      {/* Connection status banner */}
      <div className={`rounded-2xl border p-4 flex items-center gap-3 ${connected ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
        {connected ? <Wifi className="text-emerald-600" size={22} /> : <WifiOff className="text-slate-400" size={22} />}
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold ${connected ? 'text-emerald-700' : 'text-slate-600'}`}>{connected ? 'Connected' : 'Not Connected'}</p>
          <p className="text-xs text-slate-500">
            {stats.lastSyncAt ? <>Last sync {formatDateTime(stats.lastSyncAt)} · {stats.lastSyncStatus || '—'}</> : 'No sync has run yet.'}
            {stats.lastError ? <span className="text-rose-600"> · {stats.lastError}</span> : null}
          </p>
        </div>
        {stats.enabled
          ? <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full">AUTO-SYNC ON</span>
          : <span className="text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">AUTO-SYNC OFF</span>}
      </div>

      {/* Today's attendance (from the single-source-of-truth attendance table) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {statCard('Present Today', stats.presentToday ?? 0, CheckCircle2, 'bg-emerald-50 text-emerald-600')}
        {statCard('Absent Today', stats.absentToday ?? 0, XCircle, 'bg-rose-50 text-rose-600')}
        {statCard('Late Today', stats.lateToday ?? 0, Clock, 'bg-amber-50 text-amber-600')}
        {statCard('On Leave', stats.onLeaveToday ?? 0, Users, 'bg-violet-50 text-violet-600')}
        {statCard("Today's Records", stats.todaysAttendanceRecords ?? 0, Users, 'bg-blue-50 text-blue-600')}
      </div>

      {/* Sync health */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {statCard('Imported Today', stats.importedToday ?? 0, CheckCircle2, 'bg-emerald-50 text-emerald-600')}
        {statCard('Failed Today', stats.failedToday ?? 0, XCircle, 'bg-rose-50 text-rose-600')}
        {statCard('Duplicates Today', stats.duplicatesToday ?? 0, AlertTriangle, 'bg-amber-50 text-amber-600')}
        {statCard('Pending (Unmatched)', stats.pendingUnmatched ?? 0, AlertTriangle, 'bg-orange-50 text-orange-600')}
        {statCard('Sync Interval', `${stats.syncIntervalMinutes ?? form.syncIntervalMinutes} min`, Clock, 'bg-indigo-50 text-indigo-600')}
        {statCard('Last Sync', stats.lastSyncAt ? formatDateTime(stats.lastSyncAt).split(',')[0] : '—', RefreshCw, 'bg-slate-100 text-slate-500')}
      </div>

      {/* Last manual sync result */}
      {lastSyncResult && (
        <Card>
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <span className="font-bold text-slate-700">{lastSyncResult.dryRun ? 'Dry Run Result:' : 'Sync Result:'}</span>
            <span className="text-emerald-600 font-semibold">Imported: {lastSyncResult.imported}</span>
            <span className="text-blue-600 font-semibold">Updated: {lastSyncResult.updated}</span>
            <span className="text-slate-500 font-semibold">Skipped: {lastSyncResult.skipped}</span>
            <span className="text-orange-600 font-semibold">Unmatched: {lastSyncResult.unmatched}</span>
            <span className="text-amber-600 font-semibold">Duplicates: {lastSyncResult.duplicates}</span>
            <span className="text-rose-600 font-semibold">Errors: {lastSyncResult.failed}</span>
            <span className="text-slate-400">Duration: {lastSyncResult.durationMs}ms · Fetched {lastSyncResult.fetched}</span>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Configuration */}
        <Card>
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5"><PlugZap size={14} className="text-indigo-600" /> Connection Configuration</h3>
            {!canManage && <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">View Only</span>}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Company</p>
                <p className="text-xs font-semibold text-slate-800 truncate">{activeCompany?.name || '—'}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Status</p>
                <span className={`text-[11px] font-bold ${connected ? 'text-emerald-600' : 'text-slate-500'}`}>
                  {connected ? 'Active · Connected' : (form.enabled ? 'Enabled · Not tested' : 'Inactive')}
                </span>
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" className="accent-indigo-600 h-4 w-4" checked={form.enabled} disabled={!canManage}
                onChange={e => setField('enabled', e.target.checked)} />
              <span className="text-xs font-semibold text-slate-700">Enable automatic sync (scheduler pulls on the interval below)</span>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <Select label="Vendor" value={form.vendor} disabled={!canManage}
                onChange={(e: any) => setField('vendor', e.target.value)}
                options={(vendors.length ? vendors.map((v: any) => ({ value: v.name, label: v.displayName || v.name }))
                  : [{ value: 'E-TimeOffice', label: 'E-TimeOffice' }])} />
              <Select label="Branch (optional)" value={form.branchId} disabled={!canManage}
                onChange={(e: any) => setField('branchId', e.target.value)}
                options={[{ value: '', label: 'All / Company-wide' }, ...branchOptions.map((b: any) => ({ value: String(b.id), label: b.branchName || b.name }))]} />
            </div>

            <Input label="API Base URL" value={form.apiBaseUrl} disabled={!canManage}
              onChange={(e: any) => setField('apiBaseUrl', e.target.value)} placeholder="https://api.etimeoffice.com/api/" />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Corporate ID" value={form.corporateId} disabled={!canManage}
                onChange={(e: any) => setField('corporateId', e.target.value)} placeholder="e.g. support" />
              <Input label="API Username" value={form.apiUsername} disabled={!canManage}
                onChange={(e: any) => setField('apiUsername', e.target.value)} placeholder="e.g. support" />
            </div>
            <Input label={`API Password ${apiPasswordSet ? '(saved — leave blank to keep)' : ''}`} type="password"
              value={form.apiPassword} disabled={!canManage}
              onChange={(e: any) => setField('apiPassword', e.target.value)} placeholder={apiPasswordSet ? '••••••••' : 'Enter password'} />
            <div className="grid grid-cols-3 gap-3">
              <Input label="Emp Code" value={form.empCode} disabled={!canManage}
                onChange={(e: any) => setField('empCode', e.target.value)} placeholder="ALL" />
              <Input label="Interval (min)" type="number" value={form.syncIntervalMinutes} disabled={!canManage}
                onChange={(e: any) => setField('syncIntervalMinutes', Number(e.target.value))} />
              <Input label="Window (days)" type="number" value={form.syncWindowDays} disabled={!canManage}
                onChange={(e: any) => setField('syncWindowDays', Number(e.target.value))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Device Serial Number (optional)" value={form.deviceSerialNumber} disabled={!canManage}
                onChange={(e: any) => setField('deviceSerialNumber', e.target.value)} placeholder="e.g. ETO-000123" />
              <Input label="Device Location (optional)" value={form.deviceLocation} disabled={!canManage}
                onChange={(e: any) => setField('deviceLocation', e.target.value)} placeholder="e.g. Main Gate" />
            </div>

            {canManage && (
              <div className="flex items-center justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" icon={testing ? <Loader2 size={13} className="animate-spin" /> : <PlugZap size={13} />} loading={testing} onClick={handleTest}>Test Connection</Button>
                <Button variant="outline" size="sm" onClick={() => handleSync(true)} disabled={syncing}>Dry Run</Button>
                <Button size="sm" icon={<Save size={13} />} loading={saving} onClick={handleSave}>Save</Button>
              </div>
            )}
          </div>
        </Card>

        {/* Recent sync runs */}
        <Card>
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3 pb-2 border-b border-slate-100">Recent Sync Runs</h3>
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-left text-[11px]">
              <thead>
                <tr className="text-slate-400 uppercase tracking-wide border-b border-slate-100">
                  <th className="py-2 px-2">When</th>
                  <th className="py-2 px-2">Trigger</th>
                  <th className="py-2 px-2 text-center">Imp</th>
                  <th className="py-2 px-2 text-center">Upd</th>
                  <th className="py-2 px-2 text-center">Unm</th>
                  <th className="py-2 px-2 text-center">Err</th>
                  <th className="py-2 px-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading && <tr><td colSpan={7} className="py-6 text-center text-slate-400">Loading…</td></tr>}
                {!loading && logs.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-slate-400">No sync runs yet.</td></tr>}
                {logs.map(l => (
                  <tr key={l.id} className="hover:bg-slate-50/60">
                    <td className="py-2 px-2 text-slate-600 whitespace-nowrap">{formatDateTime(l.startedAt)}</td>
                    <td className="py-2 px-2 text-slate-500 capitalize">{l.trigger}</td>
                    <td className="py-2 px-2 text-center font-bold text-emerald-600">{l.imported}</td>
                    <td className="py-2 px-2 text-center font-bold text-blue-600">{l.updated}</td>
                    <td className="py-2 px-2 text-center font-bold text-orange-600">{l.unmatched}</td>
                    <td className="py-2 px-2 text-center font-bold text-rose-600">{l.failed}</td>
                    <td className="py-2 px-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        l.status === 'SUCCESS' ? 'bg-emerald-50 text-emerald-600'
                        : l.status === 'PARTIAL' ? 'bg-amber-50 text-amber-600'
                        : l.status === 'FAILED' ? 'bg-rose-50 text-rose-600'
                        : 'bg-slate-100 text-slate-500'}`}>{l.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {stats.pendingUnmatched > 0 && (
            <p className="text-[11px] text-orange-600 mt-3 flex items-center gap-1.5">
              <AlertTriangle size={13} /> {stats.pendingUnmatched} punch(es) couldn't be matched to an employee's Biometric ID — map them in the Unmatched Queue below.
            </p>
          )}
        </Card>
      </div>

      {/* ── Unmatched Queue — map a device code to an employee, then Resolve to ──
          replay ALL of that code's historical punches into Attendance. ───────── */}
      <Card>
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <Link2 size={14} className="text-orange-500" /> Unmatched Queue
            {unmatchedGroups.length > 0 && <span className="text-[10px] font-bold text-orange-600 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">{unmatchedGroups.reduce((n, g) => n + g.count, 0)} punches · {unmatchedGroups.length} codes</span>}
          </h3>
          <Button variant="outline" size="sm" icon={<RefreshCw size={12} />} onClick={load} disabled={loading}>Refresh</Button>
        </div>

        {unmatchedGroups.length === 0 ? (
          <div className="py-8 text-center">
            <CheckCircle2 size={26} className="text-emerald-500 mx-auto mb-2" />
            <p className="text-xs font-semibold text-slate-600">No unmatched punches — every synced punch is mapped to an employee.</p>
          </div>
        ) : (
          <>
            <p className="text-[11px] text-slate-500 mb-3">
              Each row is a device Biometric ID the sync couldn't match. Pick the employee it belongs to and click <b>Map &amp; Resolve</b> — this saves the Biometric ID on the employee (so future syncs match automatically) and imports every historical punch for that code into Attendance.
            </p>
            <div className="overflow-x-auto -mx-2">
              <table className="w-full text-left text-[11px]">
                <thead>
                  <tr className="text-slate-400 uppercase tracking-wide border-b border-slate-100">
                    <th className="py-2 px-2">Biometric ID</th>
                    <th className="py-2 px-2 text-center">Punches</th>
                    <th className="py-2 px-2">Latest Punch</th>
                    <th className="py-2 px-2">Device Name</th>
                    <th className="py-2 px-2">Reason</th>
                    <th className="py-2 px-2 min-w-[220px]">Map to Employee</th>
                    <th className="py-2 px-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {unmatchedGroups.map(g => {
                    const code = g.biometricCode || '';
                    const isBlank = !code;
                    return (
                      <tr key={code || '(blank)'} className="hover:bg-slate-50/60 align-middle">
                        <td className="py-2 px-2 font-mono font-bold text-slate-800">{code || <span className="italic text-slate-400">(blank)</span>}</td>
                        <td className="py-2 px-2 text-center"><span className="inline-block min-w-[22px] rounded-full bg-orange-50 text-orange-600 font-bold px-1.5 py-0.5">{g.count}</span></td>
                        <td className="py-2 px-2 text-slate-600 whitespace-nowrap">{g.samplePunch || '—'}</td>
                        <td className="py-2 px-2 text-slate-500 truncate max-w-[120px]" title={g.sampleName || ''}>{g.sampleName || '—'}</td>
                        <td className="py-2 px-2">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${g.reason === 'DUPLICATE_CODE' ? 'bg-rose-50 text-rose-600' : g.reason === 'NO_BIOMETRIC_CODE' ? 'bg-slate-100 text-slate-500' : 'bg-amber-50 text-amber-600'}`}>{g.reason}</span>
                        </td>
                        <td className="py-2 px-2">
                          {isBlank ? (
                            <span className="text-[10px] text-slate-400 italic">Blank code — cannot map (fix at the device)</span>
                          ) : (
                            <select
                              className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-700 focus:border-indigo-500 focus:outline-none disabled:opacity-60"
                              value={mapSel[code] || ''} disabled={!canManage || resolvingCode === code}
                              onChange={e => setMapSel(s => ({ ...s, [code]: e.target.value }))}>
                              <option value="">Select employee…</option>
                              {employees.map(emp => (
                                <option key={emp.id} value={String(emp.id)}>
                                  {emp.name} · {emp.employeeId}{emp.biometricId ? ` (BID: ${emp.biometricId})` : ''}
                                </option>
                              ))}
                            </select>
                          )}
                          {!isBlank && g.suggestedEmployee && (
                            <p className="mt-1 text-[10px] text-indigo-500 flex items-center gap-1">
                              <UserPlus size={10} /> Suggested: {g.suggestedEmployee.name} ({g.suggestedEmployee.employeeId})
                            </p>
                          )}
                        </td>
                        <td className="py-2 px-2 text-right whitespace-nowrap">
                          {canManage && (
                            <div className="inline-flex items-center gap-1.5">
                              {!isBlank && (
                                <Button size="sm" icon={resolvingCode === code ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />}
                                  loading={resolvingCode === code} onClick={() => handleResolve(code)}>Map &amp; Resolve</Button>
                              )}
                              <button title="Ignore (do not import)" onClick={() => handleIgnore(code)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50"><Ban size={14} /></button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
};

export default AttendanceApiIntegration;
