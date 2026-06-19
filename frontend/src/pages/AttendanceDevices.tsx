import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Fingerprint, Plus, Eye, Edit2, Trash2, Inbox, Search, Wifi, WifiOff, ChevronDown, Activity, Radio } from 'lucide-react';
import { type Role, type Company } from '../types';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { Table, Thead, Tbody, Th, Td, Tr } from '../components/ui/Table';
import { type UserAccount } from './Login';
import { api } from '../api/apiClient';
import { formatDate } from '../utils/formatDate';

interface AttendanceDevicesProps {
  role: Role;
  activeCompanyId: string;
  companies?: Company[];
  authProfile?: UserAccount | null;
}

const DEVICE_TYPES = ['Biometric', 'Fingerprint', 'Face Recognition', 'RFID Card', 'Other'];
const STATUSES = ['ACTIVE', 'INACTIVE'];

const emptyForm = {
  deviceName: '', deviceIp: '', port: '', serialNumber: '',
  deviceType: 'Biometric', companyId: '', branchId: '', status: 'ACTIVE',
};

// Lightweight searchable single-select (combobox) — used for the Super Admin's
// company picker so they can type to filter across many companies.
const SearchableSelect: React.FC<{
  label?: string;
  value: string;
  placeholder?: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}> = ({ label, value, placeholder, options, onChange }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selectedLabel = options.find(o => o.value === value)?.label || '';
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter(o => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);
  return (
    <div className="flex flex-col gap-1.5 w-full relative">
      {label && <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">{label}</label>}
      <div className="relative">
        <input
          type="text"
          value={open ? query : selectedLabel}
          placeholder={placeholder || 'Select…'}
          onFocus={() => { setOpen(true); setQuery(''); }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          className="w-full rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur-md pl-3.5 pr-8 py-2 text-xs text-slate-100 placeholder-slate-500 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
        />
        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
      </div>
      {open && (
        <div className="absolute z-50 top-full mt-1 w-full max-h-52 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 shadow-xl">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-500">No companies found</div>
          ) : filtered.map(o => (
            <button
              key={o.value}
              type="button"
              onMouseDown={() => { onChange(o.value); setQuery(''); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-800 transition-colors ${o.value === value ? 'text-blue-400 font-semibold' : 'text-slate-200'}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export const AttendanceDevices: React.FC<AttendanceDevicesProps> = ({ role, activeCompanyId, companies = [], authProfile }) => {
  // Role gating (mirrors the backend): Super Admin = full incl. delete & company
  // assignment; Company Head = create/edit within own company; HR = view only.
  const isSuperAdmin = role === 'Super Admin';
  const canManage = ['Super Admin', 'Company Head'].includes(role);
  const canDelete = isSuperAdmin;

  const [devices, setDevices] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<any>(null);
  const [viewDevice, setViewDevice] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [form, setForm] = useState<any>(emptyForm);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const flash = (kind: 'ok' | 'err', msg: string) => { setToast({ kind, msg }); setTimeout(() => setToast(null), 4000); };

  const load = useCallback(async () => { try { setDevices(await api.attendanceDevices.getAll() || []); } catch { /* ignore */ } }, []);
  const loadBranches = useCallback(async () => { try { setBranches(await api.branches.getAll() || []); } catch { setBranches([]); } }, []);
  useEffect(() => { load(); loadBranches(); }, [load, loadBranches, activeCompanyId]);

  // Top-level companies (head offices) for the Super Admin's company picker.
  const companyOptions = useMemo(() => (companies || [])
    .filter((c: any) => !c.parentCompanyId && c.status !== 'Archived' && !c.isArchived)
    .map((c: any) => ({ value: String(c.id), label: c.name })), [companies]);

  // A Company Head's devices always belong to their own company.
  const effectiveCompanyId = isSuperAdmin ? form.companyId : String(authProfile?.companyId || activeCompanyId || '');
  const companyNameOf = (id: any) => (companies.find(c => String(c.id) === String(id)) as any)?.name || '—';

  // Branches available for the selected company (real Branch-table rows).
  const branchOptions = useMemo(() => branches
    .filter((b: any) => !effectiveCompanyId || String(b.companyId) === String(effectiveCompanyId))
    .map((b: any) => ({ value: String(b.id), label: b.branchName || b.name || `Branch ${b.id}` })), [branches, effectiveCompanyId]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return devices.filter(d => (!statusFilter || d.status === statusFilter)
      && (!q || `${d.deviceName} ${d.serialNumber || ''} ${d.deviceIp || ''} ${d.deviceType || ''}`.toLowerCase().includes(q)));
  }, [devices, search, statusFilter]);

  const counts = useMemo(() => ({
    total: devices.length,
    active: devices.filter(d => d.status === 'ACTIVE').length,
    inactive: devices.filter(d => d.status === 'INACTIVE').length,
  }), [devices]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm, companyId: isSuperAdmin ? '' : String(authProfile?.companyId || activeCompanyId || '') });
    setCreateOpen(true);
  };
  const openEdit = (d: any) => {
    setEditingId(d.id);
    setForm({
      deviceName: d.deviceName || '', deviceIp: d.deviceIp || '', port: d.port ?? '',
      serialNumber: d.serialNumber || '', deviceType: d.deviceType || 'Biometric',
      companyId: String(d.companyId || ''), branchId: d.branchId ? String(d.branchId) : '',
      status: d.status || 'ACTIVE',
    });
    setCreateOpen(true);
  };

  const submit = async () => {
    if (!form.deviceName.trim()) { flash('err', 'Device name is required.'); return; }
    if (isSuperAdmin && !form.companyId) { flash('err', 'Please select a company.'); return; }
    setBusy(true);
    try {
      const payload: any = {
        deviceName: form.deviceName, deviceIp: form.deviceIp, port: form.port,
        serialNumber: form.serialNumber, deviceType: form.deviceType,
        branchId: form.branchId || null, status: form.status,
      };
      // Only a Super Admin assigns the company; otherwise the backend pins it to
      // the caller's own company.
      if (isSuperAdmin) payload.companyId = form.companyId;
      if (editingId) { await api.attendanceDevices.update(editingId, payload); flash('ok', 'Device updated.'); }
      else { await api.attendanceDevices.create(payload); flash('ok', 'Device added.'); }
      setCreateOpen(false); setEditingId(null); setForm(emptyForm); await load();
    } catch (e: any) { flash('err', e?.message || 'Save failed.'); }
    finally { setBusy(false); }
  };

  const remove = async (d: any) => {
    if (!window.confirm(`Delete device "${d.deviceName}"? This removes it from the registry only and does not affect any attendance records.`)) return;
    try { await api.attendanceDevices.remove(d.id); flash('ok', 'Device deleted.'); await load(); }
    catch (e: any) { flash('err', e?.message || 'Delete failed.'); }
  };

  // ── Phase 5: read-only diagnostics ──
  const [diagDevice, setDiagDevice] = useState<any>(null);
  const [testing, setTesting] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [discoverResult, setDiscoverResult] = useState<any>(null);
  const openDiag = (d: any) => { setDiagDevice(d); setTestResult(null); setDiscoverResult(null); };
  const closeDiag = () => { setDiagDevice(null); setTestResult(null); setDiscoverResult(null); };

  const runTest = async () => {
    if (!diagDevice) return;
    setTesting(true); setTestResult(null);
    try {
      const r = await api.attendanceDevices.testConnection(diagDevice.id);
      setTestResult(r);
      if (r?.device) { setDiagDevice(r.device); setDevices(list => list.map(x => x.id === r.device.id ? r.device : x)); }
    } catch (e: any) { setTestResult({ ok: false, error: e?.message || 'Test failed' }); }
    finally { setTesting(false); }
  };
  const runDiscover = async () => {
    if (!diagDevice) return;
    setDiscovering(true); setDiscoverResult(null);
    try { setDiscoverResult(await api.attendanceDevices.discover(diagDevice.id)); }
    catch (e: any) { setDiscoverResult({ error: e?.message || 'Discovery failed' }); }
    finally { setDiscovering(false); }
  };

  // ── Phase 6: Live Device Monitor ──
  const [monitorOpen, setMonitorOpen] = useState(false);
  const [pushLogs, setPushLogs] = useState<any[]>([]);
  const [selectedLog, setSelectedLog] = useState<any>(null);
  const [monitorErr, setMonitorErr] = useState<string | null>(null);
  useEffect(() => {
    if (!monitorOpen) return;
    let alive = true;
    const tick = async () => {
      try { const l = await api.attendanceDevices.pushLogs(); if (alive) { setPushLogs(l || []); setMonitorErr(null); } }
      catch (e: any) { if (alive) setMonitorErr(e?.message || 'Failed to load push logs'); }
    };
    tick();
    const t = setInterval(tick, 3000);
    return () => { alive = false; clearInterval(t); };
  }, [monitorOpen]);

  const deviceLabel = (log: any) => {
    const d = devices.find(x => x.id === log.deviceId);
    return d ? `${d.deviceName}${d.deviceIp ? ' (' + d.deviceIp + ')' : ''}` : (log.deviceIp || 'Unknown');
  };
  const host = typeof window !== 'undefined' ? window.location.hostname : 'SERVER';
  const pushUrl = `http://${host}:5000/api/attendance-device/push`;
  const iclockUrl = `http://${host}:5000/iclock/cdata`;
  const pushStatus = (() => {
    const last = pushLogs[0];
    if (last && (Date.now() - new Date(last.receivedAt).getTime() < 120000)) return { label: 'Receiving Data', tone: 'green' };
    if (pushLogs.length) return { label: 'Connected (idle)', tone: 'blue' };
    return { label: 'No Data Received', tone: 'gray' };
  })();

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-[14px] border border-[#DBEAFE] shadow-sm">
        <div className="px-5 py-4 flex items-center justify-between border-b border-[#DBEAFE]">
          <div>
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Fingerprint size={18} className="text-indigo-600" /> Attendance Devices</h2>
            <p className="text-xs text-slate-500">Register and manage biometric attendance devices per company &amp; branch. Attendance punches continue to be stored in the existing Attendance module.</p>
          </div>
          <div className="flex items-center gap-2">
            {canManage && <Button variant="outline" icon={<Radio size={15} />} onClick={() => setMonitorOpen(true)}>Live Monitor</Button>}
            {canManage && <Button icon={<Plus size={15} />} onClick={openCreate}>Add Device</Button>}
          </div>
        </div>
      </div>

      {toast && <div className={`px-4 py-2.5 rounded-lg text-xs font-semibold ${toast.kind === 'ok' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>{toast.msg}</div>}

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-[#DBEAFE] bg-white p-4">
          <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Total Devices</p>
          <p className="text-3xl font-extrabold text-slate-700 mt-1">{counts.total}</p>
        </div>
        <div className="rounded-xl border border-[#DBEAFE] bg-gradient-to-br from-emerald-50 to-white p-4">
          <p className="text-[10px] font-extrabold text-emerald-400 uppercase tracking-wider">Active</p>
          <p className="text-3xl font-extrabold text-emerald-600 mt-1">{counts.active}</p>
        </div>
        <div className="rounded-xl border border-[#DBEAFE] bg-gradient-to-br from-rose-50 to-white p-4">
          <p className="text-[10px] font-extrabold text-rose-400 uppercase tracking-wider">Inactive</p>
          <p className="text-3xl font-extrabold text-rose-600 mt-1">{counts.inactive}</p>
        </div>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="text-sm font-bold text-slate-800">Registered Devices</h3>
          <div className="flex items-center gap-2">
            <Input icon={<Search size={14} />} placeholder="Search devices…" value={search} onChange={e => setSearch(e.target.value)} />
            <div className="w-40"><Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} options={[{ value: '', label: 'All statuses' }, ...STATUSES.map(s => ({ value: s, label: s }))]} /></div>
          </div>
        </div>
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-3"><Inbox className="text-slate-300" size={28} /></div>
            <p className="text-sm font-semibold text-slate-500">No attendance devices yet</p>
            <p className="text-xs text-slate-400 mt-1">{canManage ? 'Click “Add Device” to register one.' : 'Adjust your search or filters.'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <Thead><Tr><Th>Device</Th><Th>Type</Th><Th>IP : Port</Th><Th>Serial No</Th><Th>Company</Th><Th>Branch</Th><Th>Status</Th><Th>Actions</Th></Tr></Thead>
              <Tbody>
                {rows.map(d => (
                  <Tr key={d.id}>
                    <Td><span className="font-semibold text-slate-800">{d.deviceName}</span></Td>
                    <Td>{d.deviceType ? <Badge variant="indigo">{d.deviceType}</Badge> : '—'}</Td>
                    <Td><span className="font-mono text-[11px] text-slate-600">{d.deviceIp || '—'}{d.port ? `:${d.port}` : ''}</span></Td>
                    <Td><span className="font-mono text-[11px] text-slate-600">{d.serialNumber || '—'}</span></Td>
                    <Td>{d.company?.name || companyNameOf(d.companyId)}</Td>
                    <Td>{d.branch?.branchName || '—'}</Td>
                    <Td>
                      <Badge variant={d.status === 'ACTIVE' ? 'green' : 'gray'}>
                        <span className="inline-flex items-center gap-1">{d.status === 'ACTIVE' ? <Wifi size={11} /> : <WifiOff size={11} />}{d.status}</span>
                      </Badge>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => setViewDevice(d)} title="View" className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-400 hover:text-indigo-600 shadow-sm"><Eye size={13} /></button>
                        {canManage && <button onClick={() => openDiag(d)} title="Diagnostics" className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-400 hover:text-emerald-600 shadow-sm"><Activity size={13} /></button>}
                        {canManage && <button onClick={() => openEdit(d)} title="Edit" className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-400 hover:text-blue-600 shadow-sm"><Edit2 size={13} /></button>}
                        {canDelete && <button onClick={() => remove(d)} title="Delete" className="p-1.5 rounded-md border border-slate-200 bg-white text-rose-400 hover:text-rose-600 shadow-sm"><Trash2 size={13} /></button>}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </div>
        )}
      </Card>

      {/* Create / Edit */}
      <Modal open={createOpen} onClose={() => { setCreateOpen(false); setEditingId(null); }} title={editingId ? 'Edit Device' : 'Add Attendance Device'}
        footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => { setCreateOpen(false); setEditingId(null); }}>Cancel</Button><Button loading={busy} onClick={submit}>{editingId ? 'Update Device' : 'Save Device'}</Button></div>}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Device Name *" value={form.deviceName} onChange={e => setForm({ ...form, deviceName: e.target.value })} />
            <Select label="Device Type" value={form.deviceType} onChange={e => setForm({ ...form, deviceType: e.target.value })} options={DEVICE_TYPES.map(t => ({ value: t, label: t }))} />
            <Input label="Device IP Address" placeholder="192.168.1.50" value={form.deviceIp} onChange={e => setForm({ ...form, deviceIp: e.target.value })} />
            <Input label="Port" type="number" placeholder="4370" value={form.port} onChange={e => setForm({ ...form, port: e.target.value })} />
            <Input label="Serial Number" value={form.serialNumber} onChange={e => setForm({ ...form, serialNumber: e.target.value })} />
            <Select label="Status" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} options={STATUSES.map(s => ({ value: s, label: s }))} />
            {isSuperAdmin ? (
              <SearchableSelect label="Company *" value={form.companyId} placeholder="Select company…"
                options={companyOptions}
                onChange={(v) => setForm({ ...form, companyId: v, branchId: '' })} />
            ) : (
              <Input label="Company" value={companyNameOf(effectiveCompanyId)} disabled />
            )}
            <Select label="Branch (optional)" value={form.branchId} onChange={e => setForm({ ...form, branchId: e.target.value })}
              options={[{ value: '', label: 'No branch / company-wide' }, ...branchOptions]} />
          </div>
          <p className="text-[11px] text-slate-500">Phase 1 registers the device only — no biometric connection or sync is performed yet.</p>
        </div>
      </Modal>

      {/* View detail */}
      <Modal open={!!viewDevice} onClose={() => setViewDevice(null)} title={viewDevice?.deviceName || 'Device'}
        footer={<div className="flex justify-end"><Button variant="outline" onClick={() => setViewDevice(null)}>Close</Button></div>}>
        {viewDevice && (
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <Badge variant={viewDevice.status === 'ACTIVE' ? 'green' : 'gray'}>{viewDevice.status}</Badge>
              {viewDevice.deviceType && <Badge variant="indigo">{viewDevice.deviceType}</Badge>}
            </div>
            {[
              ['Device IP', viewDevice.deviceIp || '—'],
              ['Port', viewDevice.port ?? '—'],
              ['Serial Number', viewDevice.serialNumber || '—'],
              ['Company', viewDevice.company?.name || companyNameOf(viewDevice.companyId)],
              ['Branch', viewDevice.branch?.branchName || '—'],
              ['Last Sync', viewDevice.lastSync ? formatDate(viewDevice.lastSync) : 'Never'],
              ['Registered', formatDate(viewDevice.createdAt)],
            ].map(([k, v]) => (
              <div key={k as string} className="flex justify-between border-b border-slate-100 py-1.5"><span className="text-xs text-slate-500 font-semibold">{k}</span><span className="text-xs text-slate-800 font-bold">{v}</span></div>
            ))}
          </div>
        )}
      </Modal>

      {/* Phase 5 — Device Diagnostics (read-only): Test Connection + Discover + raw response */}
      <Modal open={!!diagDevice} onClose={closeDiag} title={`Device Diagnostics — ${diagDevice?.deviceName || ''}`}
        footer={<div className="flex justify-end"><Button variant="outline" onClick={closeDiag}>Close</Button></div>}>
        {diagDevice && (
          <div className="space-y-4 text-sm">
            <div className="text-[11px] text-slate-500">
              Target: <span className="font-mono text-slate-700">{diagDevice.deviceIp || '—'}:{diagDevice.port || '—'}</span> · read-only — no attendance data is created or modified.
            </div>

            {/* Phase 1 — Test Connection */}
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-700">1 · Test Connection</h4>
                <Button size="sm" loading={testing} onClick={runTest}>Test Connection</Button>
              </div>
              {(testResult || diagDevice.lastTestAt) && (
                <div className="mt-2 text-xs space-y-1">
                  {testResult && (
                    <div className={`font-semibold ${testResult.ok ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {testResult.ok ? 'Connected ✅' : 'Failed ❌'}{testResult.responseMs != null ? ` · ${testResult.responseMs} ms` : ''}{testResult.error ? ` · ${testResult.error}` : ''}
                    </div>
                  )}
                  <div className="text-slate-500">Last test: {diagDevice.lastTestAt ? new Date(diagDevice.lastTestAt).toLocaleString('en-IN') : '—'} · Status: {diagDevice.lastTestStatus || '—'} · Response: {diagDevice.lastTestResponseMs != null ? diagDevice.lastTestResponseMs + ' ms' : '—'}</div>
                </div>
              )}
            </div>

            {/* Phase 2 — Discover Device Data */}
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-700">2 · Discover Device Data</h4>
                <Button size="sm" variant="outline" loading={discovering} onClick={runDiscover}>Discover</Button>
              </div>
              {discoverResult && !discoverResult.error && (
                <div className="mt-2 text-xs grid grid-cols-1 gap-y-1">
                  {[
                    ['Reachable', discoverResult.reachable ? 'Yes' : 'No'],
                    ['Connect time', discoverResult.connectMs != null ? discoverResult.connectMs + ' ms' : '—'],
                    ['Protocol', discoverResult.protocol || 'unknown'],
                    ['Device Name', discoverResult.deviceInfo?.deviceName || '—'],
                    ['Model', discoverResult.deviceInfo?.model || '—'],
                    ['Serial Number', discoverResult.deviceInfo?.serialNumber || '—'],
                    ['Firmware Version', discoverResult.deviceInfo?.firmwareVersion || '—'],
                    ['User Count', discoverResult.counts?.userCount != null ? discoverResult.counts.userCount : '—'],
                    ['Attendance Log Count', discoverResult.counts?.attendanceLogCount != null ? discoverResult.counts.attendanceLogCount : '—'],
                  ].map(([k, v]) => (
                    <div key={k as string} className="flex justify-between border-b border-slate-100 py-1"><span className="text-slate-500">{k}</span><span className="font-semibold text-slate-800">{String(v)}</span></div>
                  ))}
                </div>
              )}
              {discoverResult?.error && <p className="mt-2 text-xs text-rose-600">{discoverResult.error}</p>}
              {discoverResult?.notes?.length > 0 && (
                <ul className="mt-2 list-disc list-inside text-[11px] text-amber-700">
                  {discoverResult.notes.map((n: string, i: number) => <li key={i}>{n}</li>)}
                </ul>
              )}
            </div>

            {/* Phase 3 — Raw response */}
            <div className="rounded-xl border border-slate-200 p-3">
              <h4 className="text-xs font-bold text-slate-700 mb-2">3 · Raw Response (Diagnostics)</h4>
              <pre className="text-[10px] bg-slate-950 text-emerald-300 rounded-lg p-2 overflow-x-auto max-h-48 whitespace-pre-wrap break-all">{discoverResult ? (discoverResult.rawHex ? discoverResult.rawHex : '(device returned no bytes)') : 'Run Discover to capture the raw device response.'}</pre>
            </div>
          </div>
        )}
      </Modal>

      {/* Phase 6 — Live Device Monitor (auto-refreshing, capture-only) */}
      <Modal open={monitorOpen} onClose={() => { setMonitorOpen(false); setSelectedLog(null); }} title="Live Device Monitor"
        footer={<div className="flex justify-end"><Button variant="outline" onClick={() => { setMonitorOpen(false); setSelectedLog(null); }}>Close</Button></div>}>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <Badge variant={pushStatus.tone as any}>{pushStatus.label}</Badge>
            <span className="text-[11px] text-slate-400">Auto-refreshing every 3s · {pushLogs.length} captured</span>
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-2 text-[11px] text-slate-600">
            Point the device's push server to <span className="font-mono text-indigo-700 break-all">{pushUrl}</span>. ADMS/iclock devices use <span className="font-mono text-indigo-700 break-all">{iclockUrl}</span>. Capture-only — no attendance is created.
          </div>
          {monitorErr && <p className="text-xs text-rose-600">{monitorErr}</p>}

          <div className="overflow-x-auto max-h-[45vh]">
            <Table>
              <Thead><Tr><Th>Received</Th><Th>Device</Th><Th>User ID</Th><Th>Punch Time</Th><Th>Raw Payload</Th></Tr></Thead>
              <Tbody>
                {pushLogs.length === 0 && <Tr><Td colSpan={5}><span className="text-slate-400 text-xs">No device requests received yet.</span></Td></Tr>}
                {pushLogs.map(log => (
                  <Tr key={log.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setSelectedLog(log)}>
                    <Td><span className="text-[11px] text-slate-500">{new Date(log.receivedAt).toLocaleString('en-IN')}</span></Td>
                    <Td><span className="text-[11px] text-slate-700">{deviceLabel(log)}</span></Td>
                    <Td><span className="font-mono text-[11px]">{log.userId || '—'}</span></Td>
                    <Td><span className="text-[11px]">{log.punchTime || '—'}</span></Td>
                    <Td><span className="font-mono text-[10px] text-slate-500 truncate block max-w-[220px]">{(log.rawPayload || '').slice(0, 80) || '—'}</span></Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </div>

          {selectedLog && (
            <div className="rounded-xl border border-slate-200 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-700">Request Detail #{selectedLog.id}</h4>
                <button className="text-[11px] text-slate-400 hover:text-slate-600" onClick={() => setSelectedLog(null)}>clear</button>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                {[
                  ['Time', new Date(selectedLog.receivedAt).toLocaleString('en-IN')],
                  ['Device IP', selectedLog.deviceIp || '—'],
                  ['Method', selectedLog.method || '—'],
                  ['Path', selectedLog.path || '—'],
                  ['Content-Type', selectedLog.contentType || '—'],
                  ['User ID', selectedLog.userId || '—'],
                  ['Biometric ID', selectedLog.biometricId || '—'],
                  ['Punch Type', selectedLog.punchType || '—'],
                  ['Result', selectedLog.processingResult || '—'],
                ].map(([k, v]) => (
                  <div key={k as string} className="flex justify-between border-b border-slate-100 py-0.5"><span className="text-slate-500">{k}</span><span className="font-semibold text-slate-800 break-all text-right ml-2">{v as string}</span></div>
                ))}
              </div>
              <div><p className="text-[10px] text-slate-400 uppercase font-bold mb-1">Headers</p><pre className="text-[10px] bg-slate-950 text-sky-300 rounded p-2 max-h-32 overflow-auto whitespace-pre-wrap break-all">{selectedLog.headers || '—'}</pre></div>
              <div><p className="text-[10px] text-slate-400 uppercase font-bold mb-1">Raw Payload</p><pre className="text-[10px] bg-slate-950 text-emerald-300 rounded p-2 max-h-32 overflow-auto whitespace-pre-wrap break-all">{selectedLog.rawPayload || '(empty)'}</pre></div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default AttendanceDevices;
