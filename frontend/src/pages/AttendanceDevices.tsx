import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Fingerprint, Plus, Eye, Edit2, Trash2, Inbox, Search, ChevronDown } from 'lucide-react';
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

// Vendors are loaded from the configurable registry API — NOT hardcoded — so new
// vendors (eSSL, Matrix, ZKTeco, BioMax, …) appear here with no code change.
const STATUS_OPTIONS = [{ value: 'ACTIVE', label: 'Active' }, { value: 'INACTIVE', label: 'Inactive' }];

const emptyForm = {
  deviceName: '', companyId: '', branchId: '', attendanceVendor: '', apiBaseUrl: '',
  corporateId: '', apiUsername: '', apiPassword: '', serialNumber: '',
  deviceLocation: '', status: 'ACTIVE', syncEnabled: false, syncIntervalMinutes: '',
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

/**
 * Attendance Devices — Phase 2 (device configuration storage).
 *
 * Stores vendor connection configuration (vendor, corporate id, API username /
 * encrypted password, location, sync flag) per company & branch. Deliberately
 * performs NO device communication, NO attendance sync/import, NO test/monitor.
 */
export const AttendanceDevices: React.FC<AttendanceDevicesProps> = ({ role, activeCompanyId, companies = [], authProfile }) => {
  // Role gating (mirrors the backend): Super Admin = full incl. delete & company
  // assignment; Company Head = create/edit within own company; HR = view only.
  const isSuperAdmin = role === 'Super Admin';
  const canManage = ['Super Admin', 'Company Head'].includes(role);
  const canDelete = isSuperAdmin;

  const [devices, setDevices] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<any>(null);
  const [editPasswordSet, setEditPasswordSet] = useState(false);
  const [viewDevice, setViewDevice] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [form, setForm] = useState<any>(emptyForm);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const flash = (kind: 'ok' | 'err', msg: string) => { setToast({ kind, msg }); setTimeout(() => setToast(null), 4000); };

  // Load the company-scoped registry. A raw Prisma/DB error is never surfaced to
  // the user — on failure we show a friendly message and an empty list.
  const load = useCallback(async () => {
    try { setDevices(await api.attendanceDevices.getAll() || []); setLoadError(null); }
    catch { setDevices([]); setLoadError('Device list is temporarily unavailable. Please try again later.'); }
  }, []);
  const loadBranches = useCallback(async () => { try { setBranches(await api.branches.getAll() || []); } catch { setBranches([]); } }, []);
  const loadVendors = useCallback(async () => { try { setVendors(await api.attendanceVendors.getAll() || []); } catch { setVendors([]); } }, []);
  useEffect(() => { load(); loadBranches(); loadVendors(); }, [load, loadBranches, loadVendors, activeCompanyId]);

  // Vendor dropdown options + lookup (registry-driven, not hardcoded).
  const vendorOptions = useMemo(() => vendors.map((v: any) => ({ value: v.name, label: v.displayName || v.name })), [vendors]);
  const vendorByName = (name: string) => vendors.find((v: any) => v.name === name);
  // Selecting a vendor prefills the API Base URL from its default — unless the
  // user already typed a custom URL (then we keep their value).
  const onVendorChange = (name: string) => {
    setForm((f: any) => {
      const prevDefault = vendorByName(f.attendanceVendor)?.defaultBaseUrl || '';
      const keepCustom = f.apiBaseUrl && f.apiBaseUrl !== prevDefault;
      return { ...f, attendanceVendor: name, apiBaseUrl: keepCustom ? f.apiBaseUrl : (vendorByName(name)?.defaultBaseUrl || '') };
    });
  };

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
      && (!q || `${d.deviceName} ${d.attendanceVendor || ''} ${d.serialNumber || ''} ${d.deviceLocation || ''}`.toLowerCase().includes(q)));
  }, [devices, search, statusFilter]);

  const counts = useMemo(() => ({
    total: devices.length,
    active: devices.filter(d => d.status === 'ACTIVE').length,
    inactive: devices.filter(d => d.status === 'INACTIVE').length,
  }), [devices]);

  const openCreate = () => {
    setEditingId(null);
    setEditPasswordSet(false);
    setForm({ ...emptyForm, companyId: isSuperAdmin ? '' : String(authProfile?.companyId || activeCompanyId || '') });
    setCreateOpen(true);
  };
  const openEdit = (d: any) => {
    setEditingId(d.id);
    setEditPasswordSet(!!d.apiPasswordSet);
    setForm({
      deviceName: d.deviceName || '',
      companyId: String(d.companyId || ''),
      branchId: d.branchId ? String(d.branchId) : '',
      attendanceVendor: d.attendanceVendor || '',
      apiBaseUrl: d.apiBaseUrl || '',
      corporateId: d.corporateId || '',
      apiUsername: d.apiUsername || '',
      apiPassword: '', // never prefilled — blank keeps the stored (encrypted) password
      serialNumber: d.serialNumber || '',
      deviceLocation: d.deviceLocation || '',
      status: d.status || 'ACTIVE',
      syncEnabled: !!d.syncEnabled,
      syncIntervalMinutes: d.syncIntervalMinutes ?? '',
    });
    setCreateOpen(true);
  };

  const submit = async () => {
    // Required: Device Name, Vendor, Company, Branch.
    if (!form.deviceName.trim()) { flash('err', 'Device name is required.'); return; }
    if (!form.attendanceVendor) { flash('err', 'Attendance vendor is required.'); return; }
    if (isSuperAdmin && !form.companyId) { flash('err', 'Please select a company.'); return; }
    if (!form.branchId) { flash('err', 'Branch is required.'); return; }
    setBusy(true);
    try {
      const payload: any = {
        deviceName: form.deviceName,
        attendanceVendor: form.attendanceVendor,
        apiBaseUrl: form.apiBaseUrl,
        corporateId: form.corporateId,
        apiUsername: form.apiUsername,
        serialNumber: form.serialNumber,
        deviceLocation: form.deviceLocation,
        branchId: form.branchId,
        status: form.status,
        syncEnabled: form.syncEnabled,
        syncIntervalMinutes: form.syncIntervalMinutes === '' ? null : Number(form.syncIntervalMinutes),
      };
      // Only send the password when the user typed one (blank keeps the existing).
      if (form.apiPassword && form.apiPassword.trim() !== '') payload.apiPassword = form.apiPassword;
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
    if (!window.confirm(`Delete device "${d.deviceName}"? This removes the configuration only and does not affect any attendance records.`)) return;
    try { await api.attendanceDevices.remove(d.id); flash('ok', 'Device deleted.'); await load(); }
    catch (e: any) { flash('err', e?.message || 'Delete failed.'); }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-[14px] border border-[#DBEAFE] shadow-sm">
        <div className="px-5 py-4 flex items-center justify-between border-b border-[#DBEAFE]">
          <div>
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Fingerprint size={18} className="text-indigo-600" /> Attendance Devices</h2>
            <p className="text-xs text-slate-500">Store attendance-device vendor configuration per company &amp; branch. No device connection or attendance sync is performed yet.</p>
          </div>
          <div className="flex items-center gap-2">
            {canManage && <Button icon={<Plus size={15} />} onClick={openCreate}>Add Device</Button>}
          </div>
        </div>
      </div>

      {toast && <div className={`px-4 py-2.5 rounded-lg text-xs font-semibold ${toast.kind === 'ok' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>{toast.msg}</div>}
      {loadError && <div className="px-4 py-2.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">{loadError}</div>}

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
            <div className="w-40"><Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} options={[{ value: '', label: 'All statuses' }, ...STATUS_OPTIONS]} /></div>
          </div>
        </div>
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-3"><Inbox className="text-slate-300" size={28} /></div>
            <p className="text-sm font-semibold text-slate-500">No Devices Found</p>
            <p className="text-xs text-slate-400 mt-1">{canManage ? 'Click “Add Device” to register one.' : 'No attendance devices for your company yet.'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <Thead><Tr><Th>Device Name</Th><Th>Vendor</Th><Th>Company</Th><Th>Branch</Th><Th>Status</Th><Th>Sync Enabled</Th><Th>Created Date</Th><Th>Actions</Th></Tr></Thead>
              <Tbody>
                {rows.map(d => (
                  <Tr key={d.id}>
                    <Td><span className="font-semibold text-slate-800">{d.deviceName}</span></Td>
                    <Td>{d.attendanceVendor ? <Badge variant="indigo">{d.attendanceVendor}</Badge> : '—'}</Td>
                    <Td>{d.company?.name || companyNameOf(d.companyId)}</Td>
                    <Td>{d.branch?.branchName || '—'}</Td>
                    <Td><Badge variant={d.status === 'ACTIVE' ? 'green' : 'gray'}>{d.status === 'ACTIVE' ? 'Active' : 'Inactive'}</Badge></Td>
                    <Td><Badge variant={d.syncEnabled ? 'green' : 'gray'}>{d.syncEnabled ? 'ON' : 'OFF'}</Badge></Td>
                    <Td><span className="text-[11px] text-slate-500">{d.createdAt ? formatDate(d.createdAt) : '—'}</span></Td>
                    <Td>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => setViewDevice(d)} title="View" className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-400 hover:text-indigo-600 shadow-sm"><Eye size={13} /></button>
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
            {isSuperAdmin ? (
              <SearchableSelect label="Company *" value={form.companyId} placeholder="Select company…"
                options={companyOptions}
                onChange={(v) => setForm({ ...form, companyId: v, branchId: '' })} />
            ) : (
              <Input label="Company *" value={companyNameOf(effectiveCompanyId)} disabled />
            )}
            <Select label="Branch *" value={form.branchId} onChange={e => setForm({ ...form, branchId: e.target.value })}
              options={[{ value: '', label: 'Select branch…' }, ...branchOptions]} />
            <Select label="Attendance Vendor *" value={form.attendanceVendor} onChange={e => onVendorChange(e.target.value)}
              options={[{ value: '', label: vendorOptions.length ? 'Select vendor…' : 'No vendors configured' }, ...vendorOptions]} />
            <Input label="API Base URL" placeholder="https://api.vendor.com/" value={form.apiBaseUrl} onChange={e => setForm({ ...form, apiBaseUrl: e.target.value })} />
            <Input label="Corporate ID" value={form.corporateId} onChange={e => setForm({ ...form, corporateId: e.target.value })} />
            <Input label="API Username" value={form.apiUsername} onChange={e => setForm({ ...form, apiUsername: e.target.value })} />
            <Input label="API Password" type="password" autoComplete="new-password"
              placeholder={editingId && editPasswordSet ? '•••••• (leave blank to keep)' : ''}
              value={form.apiPassword} onChange={e => setForm({ ...form, apiPassword: e.target.value })} />
            <Input label="Device Serial Number" value={form.serialNumber} onChange={e => setForm({ ...form, serialNumber: e.target.value })} />
            <Input label="Device Location" value={form.deviceLocation} onChange={e => setForm({ ...form, deviceLocation: e.target.value })} />
            <Select label="Status" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} options={STATUS_OPTIONS} />
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Sync Enabled</label>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setForm({ ...form, syncEnabled: !form.syncEnabled })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.syncEnabled ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.syncEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
                <span className="text-xs font-semibold text-slate-600">{form.syncEnabled ? 'ON' : 'OFF'}</span>
              </div>
            </div>
            <Input label="Sync Interval (Minutes)" type="number" placeholder="e.g. 30 (optional)" value={form.syncIntervalMinutes} onChange={e => setForm({ ...form, syncIntervalMinutes: e.target.value })} />
          </div>
          <p className="text-[11px] text-slate-500">This stores device configuration only — no connection, sync, or API calls are performed. The API password is encrypted before storage.</p>
        </div>
      </Modal>

      {/* View detail */}
      <Modal open={!!viewDevice} onClose={() => setViewDevice(null)} title={viewDevice?.deviceName || 'Device'}
        footer={<div className="flex justify-end"><Button variant="outline" onClick={() => setViewDevice(null)}>Close</Button></div>}>
        {viewDevice && (
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <Badge variant={viewDevice.status === 'ACTIVE' ? 'green' : 'gray'}>{viewDevice.status === 'ACTIVE' ? 'Active' : 'Inactive'}</Badge>
              {viewDevice.attendanceVendor && <Badge variant="indigo">{viewDevice.attendanceVendor}</Badge>}
              <Badge variant={viewDevice.syncEnabled ? 'green' : 'gray'}>Sync {viewDevice.syncEnabled ? 'ON' : 'OFF'}</Badge>
            </div>
            {[
              ['Vendor', viewDevice.attendanceVendor || '—'],
              ['Company', viewDevice.company?.name || companyNameOf(viewDevice.companyId)],
              ['Branch', viewDevice.branch?.branchName || '—'],
              ['API Base URL', viewDevice.apiBaseUrl || '—'],
              ['Corporate ID', viewDevice.corporateId || '—'],
              ['API Username', viewDevice.apiUsername || '—'],
              ['API Password', viewDevice.apiPasswordSet ? '•••••• (stored, encrypted)' : 'Not set'],
              ['Serial Number', viewDevice.serialNumber || '—'],
              ['Location', viewDevice.deviceLocation || '—'],
              ['Sync Interval', viewDevice.syncIntervalMinutes != null ? `${viewDevice.syncIntervalMinutes} min` : '—'],
              ['Created', formatDate(viewDevice.createdAt)],
            ].map(([k, v]) => (
              <div key={k as string} className="flex justify-between border-b border-slate-100 py-1.5"><span className="text-xs text-slate-500 font-semibold">{k}</span><span className="text-xs text-slate-800 font-bold">{v}</span></div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default AttendanceDevices;
