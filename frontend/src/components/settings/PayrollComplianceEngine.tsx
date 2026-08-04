import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { ShieldCheck, FileText, Database, Plus, Trash2, Save, Download, Upload, Activity, Layers, PenTool, BarChart3, GripVertical, CheckCircle2, History, CalendarClock, Clock, Calculator, RefreshCw, Sparkles, Info } from 'lucide-react';
import { type Company } from '@/data/mockData';
import { ui } from '@/components/ui/feedback';
import { api } from '@/api/apiClient';
import { previewPolicy, type PreviewInputs } from '@/utils/deductionPolicy';
import { EsicSettings, PtSettings, LwfSettings, OvertimeSettings } from '@/components/settings/statutory/StatutoryConfig';
import { PayrollComponentBuilder } from '@/components/settings/PayrollComponentBuilder';
import { FormulaBuilder } from '@/components/settings/FormulaBuilder';
import { PayrollSettings } from '@/components/settings/PayrollSettings';
// utils/formatDate.ts is the only date formatter — a bare toLocaleString()
// renders in the viewer's locale and time zone, so an audit timestamp read
// differently for every user looking at the same record.
import { formatDate, formatDateTime } from '@/utils/formatDate';

interface PayrollComplianceEngineProps {
  currentCompany: Company;
  isSuperOrHead: boolean;
  onSave: (payload: any) => void;
  performedBy?: string;
}

// Default Attendance & Salary Deduction Policy. Used for the initial engine state
// AND as a display fallback so a previously-saved snapshot (that predates this
// section) never renders blank/uncontrolled fields.
const ATT_POLICY_DEFAULTS = {
  enabled: true,
  // Attendance rules
  graceMins: 10,
  lateMarksAllowed: 3,
  lateMarksPerDeduction: 3,
  lateDeductionUnit: 'half',      // 'half' | 'full'
  earlyExitGraceMins: 10,
  minHoursFullDay: 8,
  minHoursHalfDay: 4,
  // Salary deduction rules
  lopBasis: 'working',            // 'working' | 'calendar' | 'fixed30'
  absentDeductionDays: 1,
  halfDayPayFraction: 0.5,        // fraction of a day PAID on a half-day (0.5 = 50%)
  lwpDeductionPercent: 100,       // % of an LWP day deducted (100 = full)
  overtimeMultiplier: 1.5,        // OT pay multiplier (1×, 1.5×, 2×…)
  rounding: 'nearest',            // 'nearest' | 'down' | 'none'
  weeklyOffPaid: true,
  holidayPaid: true,
  sandwichPolicy: false,
};

// Label + control wrapper matching the module's form styling.
const PolicyField: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <div>
    <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
    {children}
    {hint && <p className="text-[10px] text-slate-400 mt-1">{hint}</p>}
  </div>
);

export const PayrollComplianceEngine: React.FC<PayrollComplianceEngineProps> = ({ currentCompany, isSuperOrHead, onSave, performedBy = 'Administrator' }) => {
  const [activeSection, setActiveSection] = useState('customComponents');
  
  // Engine State simulating a deep database structure for dynamic columns
  const [engineState, setEngineState] = useState<any>({
    pf: { enabled: true, employeePct: 12, employerPct: 3.67, epsPct: 8.33, edliPct: 0.5, adminCharges: 0.5, wageCeiling: 15000, regNo: '', effectiveDate: '2025-04-01' },
    esic: { enabled: true, employeePct: 0.75, employerPct: 3.25, wageLimit: 21000, regNo: '', effectiveDate: '2025-04-01' },
    pt: { enabled: true, state: 'Maharashtra', amount: 200, genderRules: false, frequency: 'Monthly' },
    lwf: { enabled: true, employeeContrib: 10, employerContrib: 20, state: 'Maharashtra', frequency: 'Half-Yearly' },
    tds: { enabled: true, tanNo: '', regime: 'New', slabs: [{ min: 0, max: 300000, rate: 0 }] },
    overtime: { enabled: true, multiplier: 1.5, maxPerDay: 4, maxPerMonth: 50, holidayMultiplier: 2.0, weekendMultiplier: 1.5 },
    attendanceDeduction: { ...ATT_POLICY_DEFAULTS },
    customComponents: [
      { id: 'c1', name: 'Fuel Allowance', type: 'Earnings', calculation: 'Fixed', value: 2000, enabled: true },
      { id: 'c2', name: 'Retention Bonus', type: 'Benefits', calculation: 'Percentage', value: 10, enabled: true },
      { id: 'c3', name: 'Uniform Deduction', type: 'Deductions', calculation: 'Fixed', value: 500, enabled: true }
    ],
    formulas: [
      { id: 'f1', target: 'Basic', expression: 'CTC * 0.50' },
      { id: 'f2', target: 'HRA', expression: 'Basic * 0.40' },
      { id: 'f3', target: 'PF', expression: 'Basic * 0.12' }
    ],
    templateSections: [
      { id: 's1', name: 'Company Details', visible: true, order: 1 },
      { id: 's2', name: 'Employee Bio', visible: true, order: 2 },
      { id: 's3', name: 'Attendance Summary', visible: true, order: 3 },
      { id: 's4', name: 'Earnings & Deductions', visible: true, order: 4 },
      { id: 's5', name: 'Employer Contributions', visible: false, order: 5 },
      { id: 's6', name: 'Digital Signature & QR', visible: true, order: 6 }
    ],
    auditLogs: []
  });

  const [saving, setSaving] = useState(false);

  // Load from local storage to simulate Database Sync
  useEffect(() => {
    const raw = localStorage.getItem(`hrms_compliance_${currentCompany.id}`);
    if (raw) {
      try { setEngineState(JSON.parse(raw)); } catch (e) {}
    }
  }, [currentCompany.id]);

  const handleUpdate = (section: string, key: string, value: any) => {
    const next = { ...engineState, [section]: { ...engineState[section], [key]: value } };
    setEngineState(next);
  };

  const saveToDb = () => {
    setSaving(true);
    setTimeout(() => {
      localStorage.setItem(`hrms_compliance_${currentCompany.id}`, JSON.stringify(engineState));
      ui.alert({ title: 'Database Sync Success', message: `Schema successfully updated for company: ${currentCompany.name}.\nAll custom components, formulas, and templates are now instantly active in the core Payroll Engine and Salary Slips.`, variant: 'success' });

      onSave({
        pfRate: engineState.pf.employeePct,
        esicRate: engineState.esic.employerPct,
        profTaxRate: engineState.pt.amount,
        overtimeRate: engineState.overtime.multiplier
      });
      setSaving(false);
    }, 600);
  };

  // ── Per-module helpers (statutory config workspaces) ──────────────────────
  // Persist the whole engine snapshot to the existing localStorage store and
  // propagate the headline rates up to the parent (Company statutory fields).
  const persist = (next: any) => {
    localStorage.setItem(`hrms_compliance_${currentCompany.id}`, JSON.stringify(next));
    onSave({
      pfRate: next.pf?.employeePct,
      esicRate: next.esic?.employerPct,
      profTaxRate: next.pt?.amount,
      overtimeRate: next.overtime?.multiplier,
    });
  };

  // Shallow-merge a patch into one module's config (live editing, no save).
  const setModule = (section: string, patch: any) =>
    setEngineState((prev: any) => ({ ...prev, [section]: { ...prev[section], ...patch } }));

  // Save one module: snapshot its current config as a new immutable version
  // (History tab + rollback), then persist. Reason is optional.
  const saveModule = async (section: string, label: string) => {
    const reason = await ui.prompt({ message: `Describe this change to ${label} (optional):`, defaultValue: '' });
    setEngineState((prev: any) => {
      const cur = prev[section] || {};
      const { history: _omit, ...snapshot } = cur;
      const version = (cur.history?.[0]?.version || 0) + 1;
      const entry = { version, changedBy: performedBy, date: new Date().toISOString(), reason: reason || 'Configuration updated', snapshot };
      const nextModule = { ...cur, history: [entry, ...(cur.history || [])] };
      const next = { ...prev, [section]: nextModule };
      persist(next);
      return next;
    });
    logAudit(`Saved ${label} configuration`, label);
    ui.toast.success(`${label} saved.`);
  };

  // Reset a module to its last saved version (or clear edits if never saved).
  const resetModule = async (section: string, label: string) => {
    if (!(await ui.confirm({ message: `Discard unsaved changes to ${label} and revert to the last saved version?`, confirmText: 'Reset' }))) return;
    setEngineState((prev: any) => {
      const cur = prev[section] || {};
      const last = cur.history?.[0]?.snapshot;
      if (!last) return prev;
      return { ...prev, [section]: { ...last, history: cur.history } };
    });
  };

  // Roll back a module to a chosen historical version (recorded as a new version).
  const rollbackModule = async (section: string, label: string, target: any) => {
    if (!(await ui.confirm({ message: `Roll ${label} back to version v${target?.version}? The current settings will be replaced.`, confirmText: 'Rollback' }))) return;
    const snapshot = target?.snapshot || {};
    setEngineState((prev: any) => {
      const cur = prev[section] || {};
      const version = (cur.history?.[0]?.version || 0) + 1;
      const entry = { version, changedBy: performedBy, date: new Date().toISOString(), reason: `Rolled back to v${target?.version}`, snapshot };
      const next = { ...prev, [section]: { ...snapshot, history: [entry, ...(cur.history || [])] } };
      persist(next);
      return next;
    });
    logAudit(`Rolled back ${label} configuration`, label);
    ui.toast.success(`${label} rolled back.`);
  };

  const logAudit = (action: string, module: string) => {
    const log = { 
      user: 'Super Admin', 
      role: 'System Administrator',
      action, 
      module,
      ip: '192.168.1.42',
      time: formatDateTime(new Date()) 
    };
    setEngineState((prev: any) => ({ ...prev, auditLogs: [log, ...prev.auditLogs] }));
  };

  // Persist a formula-list change from the redesigned Formula Builder: update the
  // engine snapshot, append an audit entry, and write the existing localStorage
  // store — all in one atomic state update. No payroll/API/schema change.
  const commitFormulas = (next: any[], auditAction?: string) => {
    setEngineState((prev: any) => {
      const logs = auditAction
        ? [{ user: performedBy || 'Company Head', role: 'Payroll Administrator', action: auditAction, module: 'Formula Builder', ip: '—', time: formatDateTime(new Date()) }]
        : [];
      const nextState = { ...prev, formulas: next, auditLogs: [...logs, ...(prev.auditLogs || [])] };
      try { localStorage.setItem(`hrms_compliance_${currentCompany.id}`, JSON.stringify(nextState)); } catch { /* storage optional */ }
      return nextState;
    });
  };

  const exportSettings = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(engineState, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `payroll_engine_rules_${currentCompany.id}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    logAudit('Exported compliance settings to JSON', 'System Import/Export');
  };

  const sections = [
    { id: 'customComponents', label: '1. Component Builder', icon: Layers },
    { id: 'formulas', label: '2. Formula Builder', icon: PenTool },
    { id: 'templateDesigner', label: '3. Salary Slip Designer', icon: FileText },
    { id: 'payrollCycle', label: '4. Payroll Cycle & Leave Policy', icon: CalendarClock },
    { id: 'attendanceDeduction', label: '5. Attendance & Salary Deduction Policy', icon: Clock },
    { id: 'reports', label: '6. Compliance Reports', icon: BarChart3 },
    { id: 'pf', label: '7. PF Settings', icon: ShieldCheck },
    { id: 'esic', label: '8. ESIC Settings', icon: ShieldCheck },
    { id: 'pt', label: '9. Professional Tax', icon: ShieldCheck },
    { id: 'lwf', label: '10. Labour Welfare Fund', icon: ShieldCheck },
    { id: 'overtime', label: '11. Overtime Settings', icon: Activity },
    { id: 'audit', label: '12. Advanced Audit Logs', icon: History },
  ];

  return (
    <Card padding={false} className="overflow-hidden border border-slate-200">
      <div className="flex border-b border-slate-200 bg-slate-900 text-white p-4 items-center justify-between">
        <div>
          <h3 className="text-sm font-bold flex items-center gap-2 text-white">
            <Database size={16} className="text-brand-400" />
            Enterprise Payroll Rules & Compliance Engine
          </h3>
          <p className="text-xs text-slate-400 mt-1">Multi-Company Scalable Architecture • Fully Database-Driven • No Hardcoded Components</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportSettings} className="flex items-center gap-1 border-slate-600 text-slate-200 hover:bg-slate-800"><Download size={14}/> Export Config</Button>
          <Button variant="outline" size="sm" onClick={() => ui.toast.info('Import functionality opens file dialogue.')} className="flex items-center gap-1 border-slate-600 text-slate-200 hover:bg-slate-800"><Upload size={14}/> Import Excel</Button>
          {isSuperOrHead && (
            <Button size="sm" onClick={saveToDb} disabled={saving} className="flex items-center gap-1 bg-brand-600 hover:bg-brand-700 border-none">
              <Save size={14}/> {saving ? 'Syncing...' : 'Sync with Database'}
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col md:flex-row min-h-[650px] bg-slate-50">
        {/* Sidebar Nav */}
        <div className="w-full md:w-64 border-r border-slate-200 bg-white flex flex-col p-2 gap-1 overflow-y-auto max-h-[650px] shadow-sm z-10">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-3 mt-2 mb-1">Core Architecture</div>
          {sections.slice(0, 6).map(s => (
            <button key={s.id} onClick={() => setActiveSection(s.id)} className={`flex items-center gap-2 px-3 py-2.5 text-xs font-semibold rounded-lg transition-all text-left ${activeSection === s.id ? 'bg-brand-50 text-brand-700 border border-brand-100 shadow-sm' : 'text-slate-600 hover:bg-slate-50 border border-transparent'}`}>
              <s.icon size={15} className={activeSection === s.id ? "text-brand-600" : "text-slate-400"} /> {s.label}
            </button>
          ))}
          
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-3 mt-4 mb-1">Statutory Compliance</div>
          {sections.slice(6, 11).map(s => (
            <button key={s.id} onClick={() => setActiveSection(s.id)} className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-md transition-all text-left ${activeSection === s.id ? 'bg-brand-50 text-brand-700 shadow-sm border border-brand-100' : 'text-slate-600 hover:bg-slate-50 border border-transparent'}`}>
              <s.icon size={14} className={activeSection === s.id ? "text-brand-600" : "text-slate-400"} /> {s.label}
            </button>
          ))}

          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-3 mt-4 mb-1">System Administration</div>
          {sections.slice(11).map(s => (
            <button key={s.id} onClick={() => setActiveSection(s.id)} className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-md transition-all text-left ${activeSection === s.id ? 'bg-brand-50 text-brand-700 shadow-sm border border-brand-100' : 'text-slate-600 hover:bg-slate-50 border border-transparent'}`}>
              <s.icon size={14} className={activeSection === s.id ? "text-brand-600" : "text-slate-400"} /> {s.label}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="flex-1 p-6 overflow-y-auto max-h-[650px] relative">
          
          {/* Section 1: Payroll Component Builder — full DB-backed CRUD module */}
          {activeSection === 'customComponents' && (
            <PayrollComponentBuilder isSuperOrHead={isSuperOrHead} performedBy={performedBy} />
          )}

          {/* Section 2: Formula Builder — professional editable cards with live
              validation, preview, version history & rollback (see FormulaBuilder). */}
          {activeSection === 'formulas' && (
            <FormulaBuilder
              formulas={engineState.formulas || []}
              canEdit={isSuperOrHead}
              performedBy={performedBy}
              onCommit={commitFormulas}
            />
          )}

          {/* Section 4: Payroll Cycle & Leave Policy — moved out of the Settings
              bottom accordion into this nav (loads here in the content panel).
              Company Head edits; HR / others read-only. Configuration only — no
              payroll/leave/attendance calculation, API or schema change. */}
          {activeSection === 'payrollCycle' && (
            <PayrollSettings
              companyId={String((currentCompany as any).parentCompanyId || currentCompany.id)}
              canEdit={performedBy === 'Company Head' && isSuperOrHead}
              performedBy={performedBy}
            />
          )}

          {/* Section 5: Attendance & Salary Deduction Policy — the MASTER
              attendance→salary calculation engine. Backend-backed (per company +
              optional branch override), versioned, with a live impact preview and
              a save→confirm→recalculate cascade. See AttendanceDeductionPolicySection. */}
          {activeSection === 'attendanceDeduction' && (
            <AttendanceDeductionPolicySection currentCompany={currentCompany} canEdit={isSuperOrHead} performedBy={performedBy} />
          )}

          {/* Section 3: Template Designer */}
          {activeSection === 'templateDesigner' && (
            <div className="space-y-4 animate-in fade-in duration-300">
              <div className="flex justify-between items-end border-b border-slate-200 pb-3">
                <div>
                  <h4 className="font-bold text-slate-800 text-lg">Visual Template Designer (Salary Slips)</h4>
                  <p className="text-xs text-slate-500 mt-1">Configure layout, visibility, and section ordering for your PDF & Excel exports.</p>
                </div>
                <Select disabled value="corporate" onChange={() => {}} options={[{value: 'corporate', label: 'Corporate Template (Active)'}, {value: 'factory', label: 'Factory Template'}]} />
              </div>

              <div className="flex gap-6 mt-4">
                <div className="flex-1 space-y-2">
                  <h5 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Drag & Drop Document Sections</h5>
                  {engineState.templateSections.map((s: any, idx: number) => (
                    <div key={s.id} className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-lg shadow-sm hover:border-brand-300 transition-colors cursor-grab">
                      <GripVertical size={16} className="text-slate-400" />
                      <div className="flex-1 font-semibold text-sm text-slate-700">{s.name}</div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-slate-500">Visible</label>
                        <input type="checkbox" checked={s.visible} onChange={(e) => {
                          const next = [...engineState.templateSections];
                          next[idx].visible = e.target.checked;
                          setEngineState({...engineState, templateSections: next});
                        }} className="rounded text-brand-600 focus:ring-brand-500 w-4 h-4" />
                      </div>
                    </div>
                  ))}
                </div>
                
                <div className="w-[300px] hidden lg:block">
                  <h5 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Live Document Map</h5>
                  <div className="bg-slate-100 p-4 rounded-xl border border-slate-200 h-[400px] shadow-inner flex flex-col gap-2 opacity-80 pointer-events-none">
                    {engineState.templateSections.filter((s:any) => s.visible).map((s: any) => (
                      <div key={'prev'+s.id} className="h-10 border-2 border-dashed border-slate-300 bg-white rounded flex items-center justify-center text-[10px] font-bold text-slate-400">
                        {s.name}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Section 4: Reports */}
          {activeSection === 'reports' && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div className="border-b border-slate-200 pb-3">
                <h4 className="font-bold text-slate-800 text-lg">Statutory Compliance Reports</h4>
                <p className="text-xs text-slate-500 mt-1">Export auto-generated compliance sheets exactly as requested by government bodies.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { name: 'PF Electronic Challan Return (ECR)', desc: 'Monthly PF upload format' },
                  { name: 'ESIC Monthly Return', desc: 'Standardized ESIC contribution file' },
                  { name: 'PT State Return', desc: 'Professional Tax deduction records' },
                  { name: 'TDS Quarterly (24Q)', desc: 'Income tax deductions for payroll' },
                  { name: 'Salary Register (Form IV)', desc: 'Comprehensive wage breakdown' },
                  { name: 'Attendance Register (Form T)', desc: 'Daily tracking mapped to payroll' },
                ].map((r, i) => (
                  <div key={i} className="p-4 bg-white border border-slate-200 rounded-xl hover:shadow-md transition-shadow">
                    <BarChart3 size={24} className="text-brand-500 mb-3" />
                    <h5 className="font-bold text-slate-800 text-sm">{r.name}</h5>
                    <p className="text-[10px] text-slate-500 mt-1 mb-4">{r.desc}</p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="w-full text-[10px] h-7" onClick={() => ui.toast.success('Generated PDF')}>PDF</Button>
                      <Button size="sm" variant="outline" className="w-full text-[10px] h-7" onClick={() => ui.toast.success('Generated CSV')}>CSV</Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section: Statutory Configs */}
          {activeSection === 'pf' && (
            <div className="space-y-4 animate-in fade-in duration-300 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <h4 className="font-bold text-slate-800 text-base border-b pb-2 mb-4">Provident Fund (PF) Settings</h4>
              <div className="grid grid-cols-2 gap-5">
                <Input type="number" label="Employee PF Contribution %" value={engineState.pf.employeePct} onChange={e => handleUpdate('pf', 'employeePct', e.target.value)} disabled={!isSuperOrHead} />
                <Input type="number" label="Employer PF Contribution %" value={engineState.pf.employerPct} onChange={e => handleUpdate('pf', 'employerPct', e.target.value)} disabled={!isSuperOrHead} />
                <Input type="number" label="EPS Contribution %" value={engineState.pf.epsPct} onChange={e => handleUpdate('pf', 'epsPct', e.target.value)} disabled={!isSuperOrHead} />
                <Input type="number" label="PF Admin Charges %" value={engineState.pf.adminCharges} onChange={e => handleUpdate('pf', 'adminCharges', e.target.value)} disabled={!isSuperOrHead} />
                <Input type="number" label="Wage Ceiling (INR)" value={engineState.pf.wageCeiling} onChange={e => handleUpdate('pf', 'wageCeiling', e.target.value)} disabled={!isSuperOrHead} />
                <Input label="PF Registration Number" value={engineState.pf.regNo} onChange={e => handleUpdate('pf', 'regNo', e.target.value)} disabled={!isSuperOrHead} />
              </div>
            </div>
          )}

          {activeSection === 'audit' && (
            <div className="space-y-4 animate-in fade-in duration-300">
              <div className="border-b border-slate-200 pb-3">
                <h4 className="font-bold text-slate-800 text-lg">Advanced Audit Logs</h4>
                <p className="text-xs text-slate-500 mt-1">Immutable tracking of all system and configuration changes across all branches.</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr><th className="p-3">Timestamp</th><th className="p-3">User & Role</th><th className="p-3">Action</th><th className="p-3">Module</th><th className="p-3">IP Address</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {engineState.auditLogs.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-slate-400">No recent logs found.</td></tr>}
                    {engineState.auditLogs.map((log: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="p-3 whitespace-nowrap text-slate-500">{log.time}</td>
                        <td className="p-3 font-semibold text-slate-700">{log.user} <span className="block text-[10px] text-slate-400 font-normal">{log.role}</span></td>
                        <td className="p-3 text-brand-700 font-medium">{log.action}</td>
                        <td className="p-3"><span className="bg-slate-100 px-2 py-1 rounded">{log.module}</span></td>
                        <td className="p-3 text-slate-400 font-mono">{log.ip}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Statutory configuration workspaces (full Overview/Config/Rules/
              Validation/Preview/History layout — replaces the old placeholders). */}
          {activeSection === 'esic' && (
            <EsicSettings cfg={engineState.esic} canEdit={isSuperOrHead}
              onChange={(patch) => setModule('esic', patch)}
              onSave={() => saveModule('esic', 'ESIC Settings')}
              onReset={() => resetModule('esic', 'ESIC Settings')}
              onRollback={(entry) => rollbackModule('esic', 'ESIC Settings', entry)} />
          )}
          {activeSection === 'pt' && (
            <PtSettings cfg={engineState.pt} canEdit={isSuperOrHead}
              onChange={(patch) => setModule('pt', patch)}
              onSave={() => saveModule('pt', 'Professional Tax')}
              onReset={() => resetModule('pt', 'Professional Tax')}
              onRollback={(entry) => rollbackModule('pt', 'Professional Tax', entry)} />
          )}
          {activeSection === 'lwf' && (
            <LwfSettings cfg={engineState.lwf} canEdit={isSuperOrHead}
              onChange={(patch) => setModule('lwf', patch)}
              onSave={() => saveModule('lwf', 'Labour Welfare Fund')}
              onReset={() => resetModule('lwf', 'Labour Welfare Fund')}
              onRollback={(entry) => rollbackModule('lwf', 'Labour Welfare Fund', entry)} />
          )}
          {activeSection === 'overtime' && (
            <OvertimeSettings cfg={engineState.overtime} canEdit={isSuperOrHead}
              onChange={(patch) => setModule('overtime', patch)}
              onSave={() => saveModule('overtime', 'Overtime Settings')}
              onReset={() => resetModule('overtime', 'Overtime Settings')}
              onRollback={(entry) => rollbackModule('overtime', 'Overtime Settings', entry)} />
          )}
        </div>
      </div>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Attendance & Salary Deduction Policy — the MASTER attendance→salary engine.
// Backend-backed (deduction_policy table) per company (+ optional branch
// override), versioned. Saving writes a new version, then offers a one-click
// recalculation cascade (attendance summaries → payroll engine → every payroll
// surface). A live impact preview updates instantly as fields change — even
// before saving. NO hardcoded deduction values live in payroll/attendance; they
// all read this policy.
// ─────────────────────────────────────────────────────────────────────────────
const inr = (n: number) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');

const AttendanceDeductionPolicySection: React.FC<{ currentCompany: Company; canEdit: boolean; performedBy: string }> = ({ currentCompany, canEdit }) => {
  const [policy, setPolicy] = useState<any>({ ...ATT_POLICY_DEFAULTS });
  const [meta, setMeta] = useState<{ version: number; enabled: boolean; exists: boolean; branchScoped: boolean }>({ version: 0, enabled: true, exists: false, branchScoped: false });
  const [versions, setVersions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [recalcing, setRecalcing] = useState(false);
  const [dirty, setDirty] = useState(false);
  // Sample employee for the live preview (mirrors the spec example).
  const [sample, setSample] = useState<PreviewInputs>({ monthlySalary: 30000, workingDays: 27, calendarDays: 30, present: 24, absent: 2, halfDay: 1, lateMarks: 5, otHours: 0 });

  const loadVersions = async () => { try { const r = await api.deductionPolicy.versions(); setVersions(r.versions || []); } catch { setVersions([]); } };

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.deductionPolicy.get();
      setPolicy({ ...ATT_POLICY_DEFAULTS, ...(res.config || {}) });
      setMeta({ version: res.version || 0, enabled: res.enabled !== false, exists: !!res.exists, branchScoped: !!res.branchScoped });
      setDirty(false);
      loadVersions();
    } catch {
      // Backend not migrated / offline → usable defaults so the page still works.
      setPolicy({ ...ATT_POLICY_DEFAULTS });
      setMeta({ version: 0, enabled: true, exists: false, branchScoped: false });
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* reload when the active company changes */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCompany.id]);

  const set = (k: string, v: any) => { setPolicy((p: any) => ({ ...p, [k]: v })); setDirty(true); };
  const setSampleField = (k: keyof PreviewInputs, v: number) => setSample(s => ({ ...s, [k]: v }));

  const result = previewPolicy(policy, sample);

  const validate = (): string | null => {
    const nn = (k: string) => Number(policy[k]);
    if (nn('lateMarksPerDeduction') < 1) return 'Late marks per deduction must be at least 1.';
    for (const k of ['graceMins', 'lateMarksAllowed', 'earlyExitGraceMins', 'minHoursFullDay', 'minHoursHalfDay', 'absentDeductionDays', 'overtimeMultiplier']) {
      if (!Number.isFinite(nn(k)) || nn(k) < 0) return `"${k}" must be a valid non-negative number.`;
    }
    if (nn('halfDayPayFraction') < 0 || nn('halfDayPayFraction') > 1) return 'Half-day pay must be between 0% and 100%.';
    if (nn('lwpDeductionPercent') < 0 || nn('lwpDeductionPercent') > 100) return 'LWP deduction must be between 0% and 100%.';
    return null;
  };

  const runRecalc = async () => {
    setRecalcing(true);
    try {
      const r = await api.deductionPolicy.recalculate({});
      ui.alert({
        title: 'Recalculation complete',
        message: `Recalculated ${r.recalculated} payroll record(s) for ${r.month} ${r.year} across ${r.employees} employee(s) using policy v${r.version ?? meta.version}.\n\nThe Payroll Dashboard, Summary, Workflow, Employee table, Salary & Payslip previews and Reports now reflect the new policy.`,
        variant: 'info',
      });
    } catch (e: any) {
      ui.alert({ title: 'Recalculation failed', message: e?.message || 'Could not recalculate. You can retry from the Payroll module.', variant: 'error' });
    } finally { setRecalcing(false); }
  };

  const onSave = async () => {
    const err = validate();
    if (err) { ui.alert({ title: 'Please fix the policy', message: err, variant: 'warning' }); return; }
    const reason = await ui.prompt({ title: 'Save policy', message: 'Describe this policy change (optional):', defaultValue: '' });
    setSaving(true);
    try {
      const res = await api.deductionPolicy.save({ config: policy, enabled: policy.enabled !== false, reason: reason || undefined });
      setMeta(m => ({ ...m, version: res.version, enabled: res.enabled !== false, exists: true }));
      setDirty(false);
      loadVersions();
      ui.toast.success('Attendance & Salary Deduction Policy saved successfully.');
      const go = await ui.confirm({
        title: 'Recalculate payroll?',
        message: 'Attendance & Salary Deduction Policy has changed.\n\nPayroll calculations based on old rules may now be outdated.\n\nWould you like to recalculate attendance and payroll using the new policy?',
        confirmText: 'Recalculate Now',
        cancelText: 'Later',
      });
      if (go) await runRecalc();
    } catch (e: any) {
      ui.alert({ title: 'Save failed', message: e?.message || 'Could not save the policy. Ensure the backend migration (deduction_policy) has been applied.', variant: 'error' });
    } finally { setSaving(false); }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-16 text-slate-400 text-sm"><RefreshCw size={16} className="animate-spin mr-2" /> Loading policy…</div>;
  }

  const pct = (frac: number) => Math.round((Number(frac) || 0) * 100);

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-end gap-3 border-b border-slate-200 pb-3">
        <div>
          <h4 className="font-bold text-slate-800 text-lg flex items-center gap-2">
            Attendance &amp; Salary Deduction Policy
            <span className="text-[10px] font-bold uppercase tracking-wide bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">Master Engine</span>
          </h4>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">The single source of truth for how attendance converts to salary. Every payroll calculation — daily salary, payable days, deductions, OT and net — reads these rules. {meta.exists ? <>Current version <strong>v{meta.version}</strong>{meta.branchScoped ? ' (branch override)' : ' (company-wide)'}.</> : <>No saved version yet — showing defaults.</>}</p>
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 shrink-0">
          <input type="checkbox" disabled={!canEdit} checked={policy.enabled !== false} onChange={e => set('enabled', e.target.checked)} className="rounded text-brand-600 focus:ring-brand-500 w-4 h-4" />
          Policy Enabled
        </label>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* ── Left: the rules (2 cols) ── */}
        <div className="xl:col-span-2 space-y-5">
          {/* Attendance Rules */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <h5 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Attendance Rules</h5>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <PolicyField label="Late-in grace (minutes)" hint="Clock-ins within this window are not late.">
                <Input type="number" min={0} disabled={!canEdit} value={policy.graceMins} onChange={(e: any) => set('graceMins', Number(e.target.value))} />
              </PolicyField>
              <PolicyField label="Late marks allowed / month" hint="Free late marks before a deduction applies.">
                <Input type="number" min={0} disabled={!canEdit} value={policy.lateMarksAllowed} onChange={(e: any) => set('lateMarksAllowed', Number(e.target.value))} />
              </PolicyField>
              <PolicyField label="Late marks per deduction" hint="This many late marks = one deduction unit.">
                <Input type="number" min={1} disabled={!canEdit} value={policy.lateMarksPerDeduction} onChange={(e: any) => set('lateMarksPerDeduction', Number(e.target.value))} />
              </PolicyField>
              <PolicyField label="Late-mark deduction unit">
                <Select disabled={!canEdit} value={policy.lateDeductionUnit} onChange={(e: any) => set('lateDeductionUnit', e.target.value)} options={[{ value: 'half', label: 'Half day' }, { value: 'full', label: 'Full day' }]} />
              </PolicyField>
              <PolicyField label="Early-exit grace (minutes)">
                <Input type="number" min={0} disabled={!canEdit} value={policy.earlyExitGraceMins} onChange={(e: any) => set('earlyExitGraceMins', Number(e.target.value))} />
              </PolicyField>
              <PolicyField label="Min hours — full day">
                <Input type="number" min={0} step={0.5} disabled={!canEdit} value={policy.minHoursFullDay} onChange={(e: any) => set('minHoursFullDay', Number(e.target.value))} />
              </PolicyField>
              <PolicyField label="Min hours — half day">
                <Input type="number" min={0} step={0.5} disabled={!canEdit} value={policy.minHoursHalfDay} onChange={(e: any) => set('minHoursHalfDay', Number(e.target.value))} />
              </PolicyField>
            </div>
            <p className="text-[10px] text-slate-400 mt-3 flex items-start gap-1"><Info size={12} className="mt-0.5 shrink-0" /> Late-mark &amp; min-hours enforcement in live payroll is part of the attendance-detail rollout; the values are stored here and reflected in the live preview below.</p>
          </div>

          {/* Salary Deduction Rules */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <h5 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Salary Deduction Rules</h5>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <PolicyField label="Per-day salary / LOP basis" hint="Divisor used to value one day of salary.">
                <Select disabled={!canEdit} value={policy.lopBasis} onChange={(e: any) => set('lopBasis', e.target.value)} options={[{ value: 'working', label: 'Working days (Cal − WO − Holidays)' }, { value: 'calendar', label: 'Calendar days' }, { value: 'fixed30', label: 'Fixed 30 days' }]} />
              </PolicyField>
              <PolicyField label="Absent-day deduction (days)" hint="Days of salary deducted per absent day.">
                <Input type="number" min={0} step={0.5} disabled={!canEdit} value={policy.absentDeductionDays} onChange={(e: any) => set('absentDeductionDays', Number(e.target.value))} />
              </PolicyField>
              <PolicyField label="Half-day pay (%)" hint="Portion of a day PAID for a half-day.">
                <Input type="number" min={0} max={100} step={5} disabled={!canEdit} value={pct(policy.halfDayPayFraction)} onChange={(e: any) => set('halfDayPayFraction', Math.min(100, Math.max(0, Number(e.target.value))) / 100)} />
              </PolicyField>
              <PolicyField label="LWP deduction (%)" hint="Portion of an LWP day deducted (100 = full).">
                <Input type="number" min={0} max={100} step={5} disabled={!canEdit} value={policy.lwpDeductionPercent} onChange={(e: any) => set('lwpDeductionPercent', Math.min(100, Math.max(0, Number(e.target.value))))} />
              </PolicyField>
              <PolicyField label="Overtime multiplier (×)" hint="OT hours are paid at this multiple of the hourly rate.">
                <Input type="number" min={0} step={0.5} disabled={!canEdit} value={policy.overtimeMultiplier} onChange={(e: any) => set('overtimeMultiplier', Number(e.target.value))} />
              </PolicyField>
              <PolicyField label="Deduction rounding">
                <Select disabled={!canEdit} value={policy.rounding} onChange={(e: any) => set('rounding', e.target.value)} options={[{ value: 'nearest', label: 'Nearest ₹1' }, { value: 'down', label: 'Round down' }, { value: 'none', label: 'No rounding' }]} />
              </PolicyField>
              <PolicyField label="Weekly-off pay">
                <Select disabled={!canEdit} value={policy.weeklyOffPaid ? 'paid' : 'unpaid'} onChange={(e: any) => set('weeklyOffPaid', e.target.value === 'paid')} options={[{ value: 'paid', label: 'Paid' }, { value: 'unpaid', label: 'Unpaid' }]} />
              </PolicyField>
              <PolicyField label="Holiday pay">
                <Select disabled={!canEdit} value={policy.holidayPaid ? 'paid' : 'unpaid'} onChange={(e: any) => set('holidayPaid', e.target.value === 'paid')} options={[{ value: 'paid', label: 'Paid' }, { value: 'unpaid', label: 'Unpaid' }]} />
              </PolicyField>
              <PolicyField label="Sandwich policy" hint="Weekly-offs/holidays bridged by absence become unpaid.">
                <Select disabled={!canEdit} value={policy.sandwichPolicy ? 'on' : 'off'} onChange={(e: any) => set('sandwichPolicy', e.target.value === 'on')} options={[{ value: 'off', label: 'Off' }, { value: 'on', label: 'On' }]} />
              </PolicyField>
            </div>
          </div>

          {/* Save bar */}
          {canEdit ? (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <span className="text-[11px] text-slate-400">{dirty ? 'Unsaved changes — the preview reflects them; Save to apply to payroll.' : 'All changes saved.'}</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => load()} disabled={saving || recalcing}>Reset</Button>
                <Button variant="outline" size="sm" onClick={runRecalc} disabled={saving || recalcing} className="flex items-center gap-1"><Calculator size={14} /> {recalcing ? 'Recalculating…' : 'Recalculate Payroll'}</Button>
                <Button size="sm" onClick={onSave} disabled={saving || recalcing} className="flex items-center gap-1"><Save size={14} /> {saving ? 'Saving…' : 'Save Changes'}</Button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-400 text-right">Read-only — only Super Admin / Company Head can edit this policy.</p>
          )}
        </div>

        {/* ── Right: live preview + version history ── */}
        <div className="space-y-5">
          {/* Live Policy Impact */}
          <div className="bg-gradient-to-br from-brand-50 to-white border border-brand-100 rounded-xl p-4 shadow-sm">
            <h5 className="text-xs font-bold uppercase tracking-wider text-brand-700 mb-3 flex items-center gap-1.5"><Sparkles size={13} /> Live Policy Impact</h5>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {([
                ['Monthly Salary', 'monthlySalary', 500],
                ['Working Days', 'workingDays', 1],
                ['Present', 'present', 1],
                ['Absent', 'absent', 1],
                ['Half Days', 'halfDay', 1],
                ['Late Marks', 'lateMarks', 1],
                ['OT Hours', 'otHours', 1],
              ] as [string, keyof PreviewInputs, number][]).map(([label, key, step]) => (
                <label key={key} className="block">
                  <span className="text-[10px] font-semibold text-slate-500">{label}</span>
                  <input type="number" step={step} value={sample[key]} onChange={e => setSampleField(key, Number(e.target.value))}
                    className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white py-1 px-2 text-xs outline-none focus:border-brand-400" />
                </label>
              ))}
            </div>
            <div className="space-y-1.5 text-xs">
              {[
                ['Daily Salary', inr(result.dailySalary)],
                ['Payable Days', String(result.payableDays)],
                ['Absent Deduction', '− ' + inr(result.absentDeduction)],
                ['Late Penalty', '− ' + inr(result.latePenalty) + (result.lateDeductionDays ? ` (${result.lateDeductionDays}d)` : '')],
                ['Half-Day Deduction', '− ' + inr(result.halfDayDeduction)],
                ['OT Addition', '+ ' + inr(result.otAddition)],
                ['Gross Salary', inr(result.grossSalary)],
                ['Est. Statutory', '− ' + inr(result.estStatutory)],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between">
                  <span className="text-slate-500">{k}</span>
                  <span className="font-semibold text-slate-700 tabular-nums">{v}</span>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-brand-100 pt-2 mt-1">
                <span className="font-bold text-brand-700">Net Salary</span>
                <span className="font-bold text-brand-700 text-sm tabular-nums">{inr(result.netSalary)}</span>
              </div>
            </div>
            <p className="text-[10px] text-slate-400 mt-2 flex items-start gap-1"><Info size={11} className="mt-0.5 shrink-0" /> Updates instantly as you edit the policy — even before saving. Statutory figures use default rates for illustration.</p>
          </div>

          {/* Version history */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <h5 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5"><History size={13} /> Version History</h5>
            {versions.length === 0 ? (
              <p className="text-[11px] text-slate-400">No saved versions yet. Saving creates version 1.</p>
            ) : (
              <ul className="space-y-2 max-h-64 overflow-y-auto">
                {versions.map(v => (
                  <li key={v.id} className="flex items-start justify-between gap-2 text-xs border-b border-slate-100 pb-2 last:border-0">
                    <div>
                      <span className="font-bold text-slate-700">v{v.version}</span>
                      {v.version === meta.version && <span className="ml-1 text-[9px] font-bold uppercase text-emerald-600">current</span>}
                      <span className={`ml-1 text-[9px] font-bold uppercase ${v.enabled ? 'text-slate-400' : 'text-rose-500'}`}>{v.enabled ? '' : 'disabled'}</span>
                      <p className="text-[10px] text-slate-400">{v.reason || 'Configuration updated'}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[10px] text-slate-500">{v.createdBy || '—'}</p>
                      <p className="text-[9px] text-slate-400">{v.createdAt ? formatDate(v.createdAt, '') : ''}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
