import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Gift, Plus, Edit2, Trash2, Inbox, Settings2, Users, Calculator, PlayCircle, FileBarChart, History, Download, CheckCircle2, Send, XCircle, RefreshCw } from 'lucide-react';
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
import { ui } from '../components/ui/feedback';

interface Props { role: Role; activeCompanyId: string; companies?: Company[]; authProfile?: UserAccount | null; }

const BONUS_TYPES = ['Statutory', 'Festival', 'Performance', 'Ex-Gratia', 'Special'];
const FY_OPTIONS = ['2023-2024', '2024-2025', '2025-2026', '2026-2027'];
const inr = (n: any) => `₹${(Number(n) || 0).toLocaleString('en-IN')}`;

type SubTab = 'config' | 'eligibility' | 'calculation' | 'processing' | 'reports' | 'payments';
const TABS: { key: SubTab; label: string; icon: React.ReactNode }[] = [
  { key: 'config', label: 'Bonus Configuration', icon: <Settings2 size={13} /> },
  { key: 'eligibility', label: 'Bonus Eligibility', icon: <Users size={13} /> },
  { key: 'calculation', label: 'Bonus Calculation', icon: <Calculator size={13} /> },
  { key: 'processing', label: 'Bonus Processing', icon: <PlayCircle size={13} /> },
  { key: 'reports', label: 'Bonus Reports', icon: <FileBarChart size={13} /> },
  { key: 'payments', label: 'Bonus Payment History', icon: <History size={13} /> },
];

const STATUS_TONE: Record<string, any> = { Draft: 'gray', Calculated: 'blue', Approved: 'indigo', Paid: 'green', Cancelled: 'red' };
const emptyConfig = { bonusType: 'Statutory', financialYear: '2025-2026', minBonusPercent: '8.33', maxBonusPercent: '20', salaryCeiling: '21000', minWorkingDays: '30', includeLeaveDays: true, includeOvertime: false, isActive: true };

export const BonusManagement: React.FC<Props> = ({ role, activeCompanyId, companies = [], authProfile }) => {
  const isSuperAdmin = role === 'Super Admin';
  const isEmployee = role === 'Employee';
  const canManageConfig = ['Super Admin', 'Company Head'].includes(role);
  const canGenerate = ['Super Admin', 'Company Head', 'HR'].includes(role);
  const canApprove = ['Super Admin', 'Company Head'].includes(role);
  const canRelease = ['Super Admin', 'Company Head', 'Finance'].includes(role);

  const [tab, setTab] = useState<SubTab>('config');
  const [configs, setConfigs] = useState<any[]>([]);
  const [cycles, setCycles] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedCycleId, setSelectedCycleId] = useState<any>('');
  const [lines, setLines] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [dash, setDash] = useState<any>(null);
  const [myBonus, setMyBonus] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const flash = (kind: 'ok' | 'err', msg: string) => { setToast({ kind, msg }); setTimeout(() => setToast(null), 4000); };

  // Config modal
  const [cfgOpen, setCfgOpen] = useState(false);
  const [cfgEditId, setCfgEditId] = useState<any>(null);
  const [cfgForm, setCfgForm] = useState<any>(emptyConfig);
  // New-cycle modal
  const [cycOpen, setCycOpen] = useState(false);
  const [cycForm, setCycForm] = useState<any>({ bonusType: 'Statutory', financialYear: '2025-2026', name: '' });
  // Generate scope
  const [scope, setScope] = useState<'all' | 'department' | 'branch' | 'selected'>('all');
  const [scopeDept, setScopeDept] = useState('');
  const [scopeBranch, setScopeBranch] = useState('');
  const [selectedEmpIds, setSelectedEmpIds] = useState<number[]>([]);

  const companyOptions = useMemo(() => (companies || []).filter((c: any) => !c.parentCompanyId && c.status !== 'Archived' && !c.isArchived).map((c: any) => ({ value: String(c.id), label: c.name })), [companies]);
  const companyNameOf = (id: any) => (companies.find(c => String(c.id) === String(id)) as any)?.name || '—';

  const selectedCycle = cycles.find(c => String(c.id) === String(selectedCycleId)) || null;

  const loadConfigs = useCallback(async () => { try { setConfigs(await api.bonus.configs.getAll() || []); } catch { setConfigs([]); } }, []);
  const loadCycles = useCallback(async () => { try { const c = await api.bonus.cycles.getAll() || []; setCycles(c); setSelectedCycleId((prev: any) => prev || (c[0]?.id ?? '')); } catch { setCycles([]); } }, []);
  const loadEmployees = useCallback(async () => { try { const e = await api.employees.getAll(); setEmployees(Array.isArray(e) ? e : (e?.employees || [])); } catch { setEmployees([]); } }, []);
  const loadPayments = useCallback(async () => { try { setPayments(await api.bonus.payments() || []); } catch { setPayments([]); } }, []);
  const loadDash = useCallback(async () => { try { setDash(await api.bonus.dashboard()); } catch { setDash(null); } }, []);
  const loadLines = useCallback(async (cycleId: any) => { if (!cycleId) { setLines([]); return; } try { const r = await api.bonus.cycles.lines(cycleId); setLines(r?.rows || []); } catch { setLines([]); } }, []);

  useEffect(() => {
    if (isEmployee) { api.bonus.mine().then(setMyBonus).catch(() => setMyBonus([])); return; }
    loadConfigs(); loadCycles(); loadEmployees(); loadPayments(); loadDash();
  }, [isEmployee, loadConfigs, loadCycles, loadEmployees, loadPayments, loadDash, activeCompanyId]);
  useEffect(() => { if (!isEmployee) loadLines(selectedCycleId); }, [isEmployee, selectedCycleId, loadLines]);

  // Scope dropdown options from the company's employees.
  const deptOptions = useMemo(() => Array.from(new Set(employees.map(e => e.department).filter(Boolean))).sort(), [employees]);
  const branchOptions = useMemo(() => Array.from(new Set(employees.map(e => e.branchLocation).filter(Boolean))).sort(), [employees]);

  // ── Config CRUD ──
  const openCfgCreate = () => { setCfgEditId(null); setCfgForm({ ...emptyConfig, companyId: isSuperAdmin ? '' : String(authProfile?.companyId || activeCompanyId || '') }); setCfgOpen(true); };
  const openCfgEdit = (c: any) => { setCfgEditId(c.id); setCfgForm({ bonusType: c.bonusType, financialYear: c.financialYear, minBonusPercent: String(c.minBonusPercent), maxBonusPercent: String(c.maxBonusPercent), salaryCeiling: c.salaryCeiling != null ? String(c.salaryCeiling) : '', minWorkingDays: String(c.minWorkingDays), includeLeaveDays: !!c.includeLeaveDays, includeOvertime: !!c.includeOvertime, isActive: !!c.isActive, companyId: String(c.companyId) }); setCfgOpen(true); };
  const submitCfg = async () => {
    if (isSuperAdmin && !cfgForm.companyId) return flash('err', 'Select a company.');
    if (Number(cfgForm.maxBonusPercent) < Number(cfgForm.minBonusPercent)) return flash('err', 'Maximum % cannot be less than minimum %.');
    setBusy(true);
    try {
      const p: any = { ...cfgForm };
      if (cfgEditId) await api.bonus.configs.update(cfgEditId, p); else await api.bonus.configs.create(p);
      flash('ok', 'Configuration saved.'); setCfgOpen(false); setCfgEditId(null); await loadConfigs();
    } catch (e: any) { flash('err', e?.message || 'Save failed.'); } finally { setBusy(false); }
  };
  const removeCfg = async (c: any) => { if (!(await ui.confirm({ message: `Delete ${c.bonusType} config for ${c.financialYear}?`, variant: 'danger', confirmText: 'Delete' }))) return; try { await api.bonus.configs.remove(c.id); flash('ok', 'Deleted.'); await loadConfigs(); } catch (e: any) { flash('err', e?.message || 'Delete failed.'); } };

  // ── Cycle workflow ──
  const createCycle = async () => {
    setBusy(true);
    try {
      const p: any = { ...cycForm };
      if (isSuperAdmin) p.companyId = cfgForm.companyId || (configs[0]?.companyId);
      const c = await api.bonus.cycles.create(p);
      flash('ok', 'Bonus cycle created.'); setCycOpen(false); await loadCycles(); setSelectedCycleId(c.id);
    } catch (e: any) { flash('err', e?.message || 'Failed to create cycle.'); } finally { setBusy(false); }
  };
  const doGenerate = async () => {
    if (!selectedCycle) return;
    setBusy(true);
    try {
      const body: any = { scope };
      if (scope === 'department') body.department = scopeDept;
      if (scope === 'branch') body.branch = scopeBranch;
      if (scope === 'selected') body.employeeIds = selectedEmpIds;
      const r = await api.bonus.cycles.generate(selectedCycle.id, body);
      flash('ok', `Calculated ${r.eligible}/${r.evaluated} eligible · ${inr(r.totalAmount)}.`);
      await loadCycles(); await loadLines(selectedCycle.id); await loadDash();
    } catch (e: any) { flash('err', e?.message || 'Generation failed.'); } finally { setBusy(false); }
  };
  const doAction = async (fn: () => Promise<any>, okMsg: string) => { setBusy(true); try { await fn(); flash('ok', okMsg); await loadCycles(); await loadLines(selectedCycleId); await loadPayments(); await loadDash(); } catch (e: any) { flash('err', e?.message || 'Action failed.'); } finally { setBusy(false); } };

  const overrideLine = async (row: any) => {
    const v = await ui.prompt({ message: `Override bonus amount for ${row.name} (${row.code}):`, defaultValue: String(row.bonusAmount) });
    if (v == null) return;
    try { await api.bonus.cycles.override(selectedCycle.id, row.employeeId, { bonusAmount: Number(v) }); flash('ok', 'Amount overridden.'); await loadLines(selectedCycle.id); await loadCycles(); }
    catch (e: any) { flash('err', e?.message || 'Override failed.'); }
  };

  const toggleEmp = (id: number) => setSelectedEmpIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  // ── Exports ──
  const exportExcel = async () => {
    const XLSX = await import('xlsx');
    const data = lines.map((r, i) => ({ 'Sr': i + 1, 'Employee ID': r.code, 'Name': r.name, 'Department': r.department, 'Branch': r.branch, 'Working Days': r.workingDays, 'Eligibility': r.eligibilityStatus, 'Eligible Salary': r.eligibleSalary, 'Bonus %': r.bonusPercent, 'Bonus Amount': r.bonusAmount }));
    const ws = XLSX.utils.json_to_sheet(data); const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Bonus Register');
    XLSX.writeFile(wb, `Bonus_Register_${selectedCycle?.name || 'cycle'}.xlsx`);
  };
  const exportPdf = async () => {
    const { default: jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).default;
    const doc = new jsPDF();
    doc.setFontSize(13); doc.text(`Bonus Register — ${selectedCycle?.name || ''}`, 14, 14);
    doc.setFontSize(9); doc.text(`${selectedCycle?.bonusType} · FY ${selectedCycle?.financialYear} · Total ${inr(selectedCycle?.totalAmount)}`, 14, 20);
    autoTable(doc, { startY: 24, styles: { fontSize: 7 },
      head: [['Sr', 'Emp ID', 'Name', 'Dept', 'Days', 'Eligibility', 'Elig. Salary', '%', 'Bonus']],
      body: lines.map((r, i) => [i + 1, r.code, r.name, r.department, r.workingDays, r.eligibilityStatus, r.eligibleSalary, r.bonusPercent, r.bonusAmount]) });
    doc.save(`Bonus_Register_${selectedCycle?.name || 'cycle'}.pdf`);
  };

  // ── Employee Self-Service view ──
  if (isEmployee) {
    return (
      <div className="space-y-4">
        <div className="bg-white rounded-[14px] border border-[#DBEAFE] shadow-sm px-5 py-4">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Gift size={18} className="text-indigo-600" /> My Bonus</h2>
          <p className="text-xs text-slate-500">Your bonus payments (read-only).</p>
        </div>
        <Card>
          {myBonus.length === 0 ? <div className="py-12 text-center text-sm text-slate-400">No bonus payments yet.</div> : (
            <Table><Thead><Tr><Th>Type</Th><Th>Financial Year</Th><Th>Amount</Th><Th>Payment Date</Th><Th>Mode</Th><Th>Status</Th></Tr></Thead>
              <Tbody>{myBonus.map(p => (<Tr key={p.id}><Td>{p.cycle?.bonusType || '—'}</Td><Td>{p.cycle?.financialYear || '—'}</Td><Td className="font-bold">{inr(p.amount)}</Td><Td>{p.paymentDate ? formatDate(p.paymentDate) : '—'}</Td><Td>{p.paymentMode || '—'}</Td><Td><Badge variant="green">{p.status}</Badge></Td></Tr>))}</Tbody>
            </Table>
          )}
        </Card>
      </div>
    );
  }

  const Toggle: React.FC<{ on: boolean; onClick: () => void; label: string }> = ({ on, onClick, label }) => (
    <div className="flex flex-col gap-1.5"><label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">{label}</label>
      <div className="flex items-center gap-2"><button type="button" onClick={onClick} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${on ? 'bg-emerald-500' : 'bg-slate-300'}`}><span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${on ? 'translate-x-6' : 'translate-x-1'}`} /></button><span className="text-xs font-semibold text-slate-600">{on ? 'Yes' : 'No'}</span></div></div>
  );

  const cycleSelector = (
    <div className="flex items-center gap-2 mb-3">
      <div className="w-72"><Select value={String(selectedCycleId)} onChange={e => setSelectedCycleId(e.target.value)}
        options={[{ value: '', label: cycles.length ? 'Select a bonus cycle…' : 'No cycles yet' }, ...cycles.map(c => ({ value: String(c.id), label: `${c.name} · ${c.status}` }))]} /></div>
      {selectedCycle && <Badge variant={STATUS_TONE[selectedCycle.status]}>{selectedCycle.status}</Badge>}
      {selectedCycle && <span className="text-xs text-slate-500">Eligible: {selectedCycle.employeeCount} · Total: {inr(selectedCycle.totalAmount)}</span>}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-[14px] border border-[#DBEAFE] shadow-sm">
        <div className="px-5 py-4 border-b border-[#DBEAFE]">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Gift size={18} className="text-indigo-600" /> Bonus Management</h2>
          <p className="text-xs text-slate-500">Configuration · eligibility · statutory calculation · approval workflow · payments — a separate, audited bonus transaction system.</p>
        </div>
        {/* Dashboard widgets */}
        {dash && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 px-5 py-3 border-b border-[#DBEAFE]">
            {[['Total Bonus Budget', inr(dash.totalBudget)], ['Employees Eligible', dash.employeesEligible], ['Pending Approvals', dash.pendingApprovals], ['Bonus Paid', inr(dash.bonusPaid)], ['Upcoming Cycle', dash.upcomingCycle ? `${dash.upcomingCycle.financialYear} (${dash.upcomingCycle.status})` : '—']].map(([k, v]) => (
              <div key={k as string} className="rounded-xl border border-[#DBEAFE] bg-white p-3"><p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">{k}</p><p className="text-lg font-extrabold text-slate-700 mt-0.5">{v}</p></div>
            ))}
          </div>
        )}
        <div className="px-3 pt-2 flex flex-wrap gap-1">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${tab === t.key ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{t.icon}{t.label}</button>
          ))}
        </div>
      </div>

      {toast && <div className={`px-4 py-2.5 rounded-lg text-xs font-semibold ${toast.kind === 'ok' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>{toast.msg}</div>}

      {/* CONFIG */}
      {tab === 'config' && (
        <Card>
          <div className="flex items-center justify-between mb-3"><h3 className="text-sm font-bold text-slate-800">Bonus Configuration</h3>{canManageConfig && <Button icon={<Plus size={15} />} onClick={openCfgCreate}>Add Configuration</Button>}</div>
          {configs.length === 0 ? <div className="py-12 text-center"><Inbox className="mx-auto text-slate-300 mb-2" size={28} /><p className="text-sm font-semibold text-slate-500">No bonus configurations yet</p></div> : (
            <div className="overflow-x-auto"><Table><Thead><Tr><Th>Type</Th><Th>FY</Th><Th>Min %</Th><Th>Max %</Th><Th>Ceiling</Th><Th>Min Days</Th><Th>Leave</Th><Th>OT</Th><Th>Status</Th><Th>Actions</Th></Tr></Thead>
              <Tbody>{configs.map(c => (<Tr key={c.id}><Td><Badge variant="indigo">{c.bonusType}</Badge></Td><Td className="font-semibold">{c.financialYear}</Td><Td>{c.minBonusPercent}%</Td><Td>{c.maxBonusPercent}%</Td><Td>{c.salaryCeiling != null ? inr(c.salaryCeiling) : '—'}</Td><Td>{c.minWorkingDays}</Td><Td>{c.includeLeaveDays ? 'Yes' : 'No'}</Td><Td>{c.includeOvertime ? 'Yes' : 'No'}</Td><Td><Badge variant={c.isActive ? 'green' : 'gray'}>{c.isActive ? 'Active' : 'Inactive'}</Badge></Td>
                <Td><div className="flex gap-1.5">{canManageConfig && <button onClick={() => openCfgEdit(c)} className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-400 hover:text-blue-600"><Edit2 size={13} /></button>}{canManageConfig && <button onClick={() => removeCfg(c)} className="p-1.5 rounded-md border border-slate-200 bg-white text-rose-400 hover:text-rose-600"><Trash2 size={13} /></button>}</div></Td></Tr>))}</Tbody></Table></div>
          )}
        </Card>
      )}

      {/* PROCESSING */}
      {tab === 'processing' && (
        <Card>
          <div className="flex items-center justify-between mb-3"><h3 className="text-sm font-bold text-slate-800">Bonus Processing</h3>{canGenerate && <Button icon={<Plus size={15} />} onClick={() => { setCycForm({ bonusType: 'Statutory', financialYear: '2025-2026', name: '' }); setCycOpen(true); }}>New Bonus Cycle</Button>}</div>
          {cycleSelector}
          {!selectedCycle ? <div className="py-10 text-center text-sm text-slate-400">Create or select a bonus cycle to begin.</div> : (
            <div className="space-y-4">
              {['Draft', 'Calculated'].includes(selectedCycle.status) && canGenerate && (
                <div className="rounded-xl border border-slate-200 p-3 space-y-3">
                  <p className="text-xs font-bold text-slate-700">Calculate Bonus</p>
                  <div className="flex flex-wrap gap-3 items-end">
                    <div className="w-44"><Select label="Scope" value={scope} onChange={e => setScope(e.target.value as any)} options={[{ value: 'all', label: 'All Employees' }, { value: 'department', label: 'Department Wise' }, { value: 'branch', label: 'Branch Wise' }, { value: 'selected', label: 'Selected Employees' }]} /></div>
                    {scope === 'department' && <div className="w-52"><Select label="Department" value={scopeDept} onChange={e => setScopeDept(e.target.value)} options={[{ value: '', label: 'Select…' }, ...deptOptions.map(d => ({ value: d, label: d }))]} /></div>}
                    {scope === 'branch' && <div className="w-52"><Select label="Branch" value={scopeBranch} onChange={e => setScopeBranch(e.target.value)} options={[{ value: '', label: 'Select…' }, ...branchOptions.map(b => ({ value: b, label: b }))]} /></div>}
                    <Button icon={<RefreshCw size={14} />} loading={busy} onClick={doGenerate}>Calculate{scope === 'selected' ? ` (${selectedEmpIds.length})` : ''}</Button>
                  </div>
                  {scope === 'selected' && (
                    <div className="max-h-40 overflow-y-auto border border-slate-100 rounded-lg p-2 grid grid-cols-2 md:grid-cols-3 gap-1">
                      {employees.map(e => (<label key={e.id} className="flex items-center gap-1.5 text-[11px] text-slate-700"><input type="checkbox" checked={selectedEmpIds.includes(e.id)} onChange={() => toggleEmp(e.id)} />{e.name} <span className="text-slate-400 font-mono">{e.employeeId}</span></label>))}
                    </div>
                  )}
                </div>
              )}
              {/* Workflow actions */}
              <div className="flex flex-wrap items-center gap-2">
                {selectedCycle.status === 'Calculated' && canApprove && <Button variant="outline" icon={<CheckCircle2 size={14} />} loading={busy} onClick={() => doAction(() => api.bonus.cycles.approve(selectedCycle.id), 'Cycle approved.')}>Approve</Button>}
                {selectedCycle.status === 'Approved' && canRelease && <Button icon={<Send size={14} />} loading={busy} onClick={() => doAction(() => api.bonus.cycles.release(selectedCycle.id, {}), 'Bonus released & marked Paid.')}>Release Payment</Button>}
                {['Draft', 'Calculated', 'Approved'].includes(selectedCycle.status) && canApprove && <Button variant="outline" icon={<XCircle size={14} />} loading={busy} onClick={async () => { if (await ui.confirm({ message: 'Cancel this bonus cycle?', variant: 'danger', confirmText: 'Cancel Cycle' })) doAction(() => api.bonus.cycles.cancel(selectedCycle.id), 'Cycle cancelled.'); }}>Cancel</Button>}
                <span className="text-[11px] text-slate-400 ml-auto">Workflow: Draft → Calculated → Approved → Paid</span>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ELIGIBILITY */}
      {tab === 'eligibility' && (
        <Card>{cycleSelector}
          {lines.length === 0 ? <div className="py-10 text-center text-sm text-slate-400">No data. Generate a cycle in Processing.</div> : (
            <div className="overflow-x-auto"><Table><Thead><Tr><Th>Emp ID</Th><Th>Name</Th><Th>DOJ</Th><Th>Department</Th><Th>Branch</Th><Th>Salary</Th><Th>Working Days</Th><Th>Eligibility</Th></Tr></Thead>
              <Tbody>{lines.map(r => (<Tr key={r.employeeId}><Td className="font-mono text-[11px]">{r.code}</Td><Td className="font-semibold">{r.name}</Td><Td>{r.doj ? formatDate(r.doj) : '—'}</Td><Td>{r.department || '—'}</Td><Td>{r.branch || '—'}</Td><Td>{inr(r.salary)}</Td><Td>{r.workingDays}</Td>
                <Td><Badge variant={r.eligibilityStatus === 'Eligible' ? 'green' : r.eligibilityStatus === 'Not Eligible' ? 'red' : 'amber'}>{r.eligibilityStatus}</Badge></Td></Tr>))}</Tbody></Table></div>
          )}
        </Card>
      )}

      {/* CALCULATION */}
      {tab === 'calculation' && (
        <Card>{cycleSelector}
          {lines.length === 0 ? <div className="py-10 text-center text-sm text-slate-400">No data. Generate a cycle in Processing.</div> : (
            <div className="overflow-x-auto"><Table><Thead><Tr><Th>Emp ID</Th><Th>Name</Th><Th>Eligible Salary</Th><Th>Bonus %</Th><Th>Bonus Amount</Th><Th>Override</Th>{canApprove && <Th>Action</Th>}</Tr></Thead>
              <Tbody>{lines.map(r => (<Tr key={r.employeeId}><Td className="font-mono text-[11px]">{r.code}</Td><Td className="font-semibold">{r.name}</Td><Td>{inr(r.eligibleSalary)}</Td><Td>{r.bonusPercent}%</Td><Td className="font-bold">{inr(r.bonusAmount)}</Td><Td>{r.isManualOverride ? <Badge variant="amber">Manual</Badge> : <span className="text-slate-400 text-xs">Auto</span>}</Td>
                {canApprove && <Td>{selectedCycle && ['Draft', 'Calculated'].includes(selectedCycle.status) && r.eligibilityStatus === 'Eligible' && <button onClick={() => overrideLine(r)} className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-400 hover:text-blue-600"><Edit2 size={13} /></button>}</Td>}</Tr>))}</Tbody></Table></div>
          )}
        </Card>
      )}

      {/* REPORTS */}
      {tab === 'reports' && (
        <Card>{cycleSelector}
          <div className="flex items-center justify-between mb-3"><h3 className="text-sm font-bold text-slate-800">Bonus Register</h3>
            <div className="flex gap-2"><Button variant="outline" size="sm" icon={<Download size={13} />} disabled={!lines.length} onClick={exportExcel}>Excel</Button><Button variant="outline" size="sm" icon={<Download size={13} />} disabled={!lines.length} onClick={exportPdf}>PDF</Button></div></div>
          {lines.length === 0 ? <div className="py-10 text-center text-sm text-slate-400">No data to report. Generate a cycle first.</div> : (
            <div className="overflow-x-auto"><Table><Thead><Tr><Th>Emp ID</Th><Th>Name</Th><Th>Department</Th><Th>Eligibility</Th><Th>Eligible Salary</Th><Th>%</Th><Th>Bonus</Th></Tr></Thead>
              <Tbody>{lines.map(r => (<Tr key={r.employeeId}><Td className="font-mono text-[11px]">{r.code}</Td><Td>{r.name}</Td><Td>{r.department || '—'}</Td><Td>{r.eligibilityStatus}</Td><Td>{inr(r.eligibleSalary)}</Td><Td>{r.bonusPercent}%</Td><Td className="font-bold">{inr(r.bonusAmount)}</Td></Tr>))}</Tbody></Table></div>
          )}
        </Card>
      )}

      {/* PAYMENT HISTORY */}
      {tab === 'payments' && (
        <Card>
          <h3 className="text-sm font-bold text-slate-800 mb-3">Bonus Payment History</h3>
          {payments.length === 0 ? <div className="py-10 text-center text-sm text-slate-400">No bonus payments released yet.</div> : (
            <div className="overflow-x-auto"><Table><Thead><Tr><Th>Employee</Th><Th>Type</Th><Th>FY</Th><Th>Amount</Th><Th>Payment Date</Th><Th>Mode</Th><Th>Status</Th></Tr></Thead>
              <Tbody>{payments.map(p => (<Tr key={p.id}><Td className="font-semibold">{p.employee?.name || '—'} <span className="text-slate-400 font-mono text-[10px]">{p.employee?.employeeId || ''}</span></Td><Td>{p.cycle?.bonusType || '—'}</Td><Td>{p.cycle?.financialYear || '—'}</Td><Td className="font-bold">{inr(p.amount)}</Td><Td>{p.paymentDate ? formatDate(p.paymentDate) : '—'}</Td><Td>{p.paymentMode || '—'}</Td><Td><Badge variant="green">{p.status}</Badge></Td></Tr>))}</Tbody></Table></div>
          )}
        </Card>
      )}

      {/* Config modal */}
      <Modal open={cfgOpen} onClose={() => { setCfgOpen(false); setCfgEditId(null); }} title={cfgEditId ? 'Edit Bonus Configuration' : 'Add Bonus Configuration'}
        footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => { setCfgOpen(false); setCfgEditId(null); }}>Cancel</Button><Button loading={busy} onClick={submitCfg}>{cfgEditId ? 'Update' : 'Save'}</Button></div>}>
        <div className="grid grid-cols-2 gap-3">
          {isSuperAdmin ? <Select label="Company *" value={cfgForm.companyId || ''} onChange={e => setCfgForm({ ...cfgForm, companyId: e.target.value })} options={[{ value: '', label: 'Select company…' }, ...companyOptions]} /> : <Input label="Company" value={companyNameOf(authProfile?.companyId || activeCompanyId)} disabled />}
          <Select label="Bonus Type *" value={cfgForm.bonusType} onChange={e => setCfgForm({ ...cfgForm, bonusType: e.target.value })} options={BONUS_TYPES.map(t => ({ value: t, label: t }))} />
          <Select label="Financial Year *" value={cfgForm.financialYear} onChange={e => setCfgForm({ ...cfgForm, financialYear: e.target.value })} options={FY_OPTIONS.map(y => ({ value: y, label: y }))} />
          <Input label="Salary Ceiling (₹)" type="number" value={cfgForm.salaryCeiling} onChange={e => setCfgForm({ ...cfgForm, salaryCeiling: e.target.value })} />
          <Input label="Minimum Bonus %" type="number" value={cfgForm.minBonusPercent} onChange={e => setCfgForm({ ...cfgForm, minBonusPercent: e.target.value })} />
          <Input label="Maximum Bonus %" type="number" value={cfgForm.maxBonusPercent} onChange={e => setCfgForm({ ...cfgForm, maxBonusPercent: e.target.value })} />
          <Input label="Eligibility Min Working Days" type="number" value={cfgForm.minWorkingDays} onChange={e => setCfgForm({ ...cfgForm, minWorkingDays: e.target.value })} />
          <Toggle on={cfgForm.includeLeaveDays} onClick={() => setCfgForm({ ...cfgForm, includeLeaveDays: !cfgForm.includeLeaveDays })} label="Include Leave Days" />
          <Toggle on={cfgForm.includeOvertime} onClick={() => setCfgForm({ ...cfgForm, includeOvertime: !cfgForm.includeOvertime })} label="Include Overtime" />
          <Toggle on={cfgForm.isActive} onClick={() => setCfgForm({ ...cfgForm, isActive: !cfgForm.isActive })} label="Active" />
        </div>
        <p className="text-[11px] text-slate-500 mt-3">Statutory default (Payment of Bonus Act): 8.33% min, 20% max.</p>
      </Modal>

      {/* New cycle modal */}
      <Modal open={cycOpen} onClose={() => setCycOpen(false)} title="New Bonus Cycle"
        footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setCycOpen(false)}>Cancel</Button><Button loading={busy} onClick={createCycle}>Create Cycle</Button></div>}>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Bonus Type *" value={cycForm.bonusType} onChange={e => setCycForm({ ...cycForm, bonusType: e.target.value })} options={BONUS_TYPES.map(t => ({ value: t, label: t }))} />
          <Select label="Financial Year *" value={cycForm.financialYear} onChange={e => setCycForm({ ...cycForm, financialYear: e.target.value })} options={FY_OPTIONS.map(y => ({ value: y, label: y }))} />
          <div className="col-span-2"><Input label="Cycle Name (optional)" placeholder="e.g. Diwali Bonus 2025" value={cycForm.name} onChange={e => setCycForm({ ...cycForm, name: e.target.value })} /></div>
        </div>
        <p className="text-[11px] text-slate-500 mt-3">Uses the active configuration for this type &amp; financial year. Create one in the Configuration tab first.</p>
      </Modal>
    </div>
  );
};

export default BonusManagement;
