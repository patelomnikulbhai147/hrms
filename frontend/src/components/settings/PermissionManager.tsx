import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ShieldCheck, Search, RotateCcw, Save } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { api } from '@/api/apiClient';
import { type AppModules } from '@/pages/Login';
import { foldPermissions } from '@/utils/permissionFold';

// Modules shown in the matrix (label → AppModules key). Mirrors the spec list,
// limited to modules that exist in the permission system.
const MODULES: { key: AppModules; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'employees', label: 'Employees' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'leaves', label: 'Leave Management' },
  { key: 'payroll', label: 'Payroll' },
  { key: 'documents', label: 'Documents' },
  { key: 'reports', label: 'Reports' },
  { key: 'settings', label: 'Settings' },
  { key: 'tasks', label: 'Task Manager' },
  { key: 'tenders', label: 'Tender Management' },
  { key: 'contracts', label: 'Contract Management' },
  { key: 'users', label: 'User Management' },
];

// The matrix controls ONLY these three permissions: VIEW (read/search/open/view
// reports), EDIT (edit/save/update/modify — folds create/delete/approve/import),
// EXPORT (PDF/Excel/CSV/Print/report export). Edit & Export auto-include View.
const ACTIONS = ['view', 'edit', 'export'] as const;
type Action = typeof ACTIONS[number];

const blankPerm = () => ({ view: false, edit: false, export: false });

// Role templates — quick presets applied across all modules (3-action model).
const TEMPLATES: Record<string, (m: AppModules) => any> = {
  'View Only': () => ({ view: true, edit: false, export: true }),
  'HR Admin': (m) => ['employees', 'attendance', 'leaves', 'payroll', 'documents', 'reports', 'tasks', 'dashboard', 'settings'].includes(m)
    ? { view: true, edit: true, export: true }
    : { view: m === 'tenders', edit: false, export: m === 'tenders' },
  'Finance': (m) => ['payroll', 'reports', 'dashboard'].includes(m)
    ? { view: true, edit: true, export: true }
    : blankPerm(),
  'Full (Company)': () => ({ view: true, edit: true, export: true }),
};

interface Props { role: string; }

export const PermissionManager: React.FC<Props> = ({ role }) => {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<any>(null);
  const [perms, setPerms] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const flash = (kind: 'ok' | 'err', msg: string) => { setToast({ kind, msg }); setTimeout(() => setToast(null), 4000); };

  const load = useCallback(async () => {
    setLoading(true);
    try { setUsers(await api.users.getManageable() || []); setDenied(false); }
    catch (e: any) { if (String(e?.message || '').includes('permission')) setDenied(true); setUsers([]); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => users.filter(u =>
    !search || u.name.toLowerCase().includes(search.toLowerCase()) || (u.email || '').toLowerCase().includes(search.toLowerCase()) || (u.role || '').toLowerCase().includes(search.toLowerCase())
  ), [users, search]);

  const selected = users.find(u => String(u.id) === String(selectedId));

  const selectUser = (u: any) => {
    setSelectedId(u.id);
    const p: Record<string, any> = {};
    // Fold any legacy (create/delete/approve/import/print) grants into the 3-action
    // model so the matrix shows the converted state and saves it cleanly.
    MODULES.forEach(m => { p[m.key] = foldPermissions(u.permissions?.[m.key]); });
    setPerms(p);
  };

  // Toggle one action, enforcing the dependency rules: enabling Edit/Export
  // auto-enables View; disabling View disables Edit and Export.
  const toggle = (mod: AppModules, action: Action) => {
    setPerms(prev => {
      const row = { ...blankPerm(), ...(prev[mod] || {}) };
      const turningOn = !row[action];
      row[action] = turningOn;
      if ((action === 'edit' || action === 'export') && turningOn) row.view = true;
      if (action === 'view' && !turningOn) { row.edit = false; row.export = false; }
      return { ...prev, [mod]: row };
    });
  };

  // "ALL" is a UI helper (not persisted). It maps to the granular actions.
  const allChecked = (mod: AppModules) => ACTIONS.every(a => !!perms[mod]?.[a]);
  const toggleAll = (mod: AppModules) => {
    const next = !allChecked(mod);
    setPerms(prev => {
      const row = { ...prev[mod] };
      ACTIONS.forEach(a => { row[a] = next; });
      return { ...prev, [mod]: row };
    });
  };

  const applyTemplate = (name: string) => {
    const fn = TEMPLATES[name]; if (!fn) return;
    const p: Record<string, any> = {};
    MODULES.forEach(m => { p[m.key] = fn(m.key); });
    setPerms(p);
    flash('ok', `Applied "${name}" template — review and Save.`);
  };

  const cloneFrom = (sourceId: any) => {
    const src = users.find(u => String(u.id) === String(sourceId)); if (!src) return;
    const p: Record<string, any> = {};
    MODULES.forEach(m => { p[m.key] = foldPermissions(src.permissions?.[m.key]); });
    setPerms(p);
    flash('ok', `Cloned permissions from ${src.name} — review and Save.`);
  };

  const save = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const moduleAccess = Object.fromEntries(MODULES.map(m => [m.key, true]));
      await api.users.updatePermissions(selected.id, { permissions: perms, moduleAccess });
      flash('ok', `Permissions updated for ${selected.name}.`);
      await load();
    } catch (e: any) { flash('err', e?.message || 'Failed to save permissions.'); }
    finally { setBusy(false); }
  };

  if (denied) {
    return <Card><div className="py-8 text-center text-sm text-slate-500">You do not have permission to manage user roles & permissions. Ask your Company Admin to enable it.</div></Card>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <ShieldCheck size={14} className="text-indigo-600" />
        Manage permissions for users {role === 'Super Admin' ? 'across all companies' : 'within your company'}. Changes are audited.
      </div>
      {toast && <div className={`px-3 py-2 rounded-lg text-xs font-semibold ${toast.kind === 'ok' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>{toast.msg}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* User list */}
        <Card className="lg:col-span-1">
          <div className="mb-2"><Input icon={<Search size={14} />} placeholder="Search users…" value={search} onChange={e => setSearch(e.target.value)} /></div>
          <div className="max-h-[420px] overflow-y-auto space-y-1">
            {loading && <p className="text-xs text-slate-400 py-3 text-center">Loading…</p>}
            {!loading && filtered.length === 0 && <p className="text-xs text-slate-400 py-3 text-center">No manageable users.</p>}
            {filtered.map(u => (
              <button key={u.id} onClick={() => selectUser(u)}
                className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${String(selectedId) === String(u.id) ? 'bg-indigo-50 border border-indigo-200' : 'hover:bg-slate-50 border border-transparent'}`}>
                <p className="text-xs font-bold text-slate-800">{u.name}</p>
                <p className="text-[10px] text-slate-500">{u.role} · {u.branchName ? `${u.branchName} Branch` : 'Company-wide'} · {u.companyName || '—'}</p>
              </button>
            ))}
          </div>
        </Card>

        {/* Editor */}
        <Card className="lg:col-span-2">
          {!selected ? (
            <div className="py-12 text-center text-sm text-slate-400">Select a user to manage their roles & permissions.</div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-2 border-b border-slate-100">
                <div>
                  <p className="text-sm font-bold text-slate-800">{selected.name} <Badge variant="indigo">{selected.role}</Badge></p>
                  <p className="text-[10px] text-slate-500">{selected.email} · {selected.branchName ? `${selected.branchName} Branch` : 'Company-wide'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-36"><Select value="" onChange={e => e.target.value && applyTemplate(e.target.value)} options={[{ value: '', label: 'Role template…' }, ...Object.keys(TEMPLATES).map(t => ({ value: t, label: t }))]} /></div>
                  <div className="w-36"><Select value="" onChange={e => e.target.value && cloneFrom(e.target.value)} options={[{ value: '', label: 'Clone from…' }, ...users.filter(u => String(u.id) !== String(selectedId)).map(u => ({ value: String(u.id), label: u.name }))]} /></div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse table-fixed">
                  <thead>
                    <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                      <th className="py-2.5 pr-2 w-[34%]">Module</th>
                      <th className="py-2.5 px-2 text-center w-[12%] text-indigo-500">All</th>
                      {ACTIONS.map(a => <th key={a} className="py-2.5 px-2 text-center w-[18%]">{a}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {MODULES.map(m => (
                      <tr key={m.key} className="hover:bg-slate-50/60">
                        <td className="py-2.5 pr-2 text-xs font-semibold text-slate-700">{m.label}</td>
                        <td className="py-2.5 px-2 text-center">
                          <input
                            type="checkbox"
                            className="accent-indigo-600 h-5 w-5 align-middle cursor-pointer"
                            checked={allChecked(m.key)}
                            onChange={() => toggleAll(m.key)}
                            title="Select View, Edit and Export for this module"
                          />
                        </td>
                        {ACTIONS.map(a => (
                          <td key={a} className="py-2.5 px-2 text-center">
                            <input
                              type="checkbox"
                              className="accent-indigo-600 h-5 w-5 align-middle cursor-pointer"
                              checked={!!perms[m.key]?.[a]}
                              onChange={() => toggle(m.key, a)}
                              title={`${a.charAt(0).toUpperCase() + a.slice(1)} — ${m.label}`}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-slate-100">
                <Button variant="outline" size="sm" icon={<RotateCcw size={13} />} onClick={() => selectUser(selected)}>Reset</Button>
                <Button size="sm" icon={<Save size={13} />} loading={busy} onClick={save}>Save Permissions</Button>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
};

export default PermissionManager;
