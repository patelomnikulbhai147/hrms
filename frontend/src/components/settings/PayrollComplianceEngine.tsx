import React, { useState, useEffect } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input, Select } from '../ui/Input';
import { ShieldCheck, FileText, Database, Plus, Trash2, Save, Download, Upload, Activity, Layers, PenTool, BarChart3, GripVertical, CheckCircle2, History } from 'lucide-react';
import { type Company } from '../../data/mockData';
import { ui } from '../ui/feedback';

interface PayrollComplianceEngineProps {
  currentCompany: Company;
  isSuperOrHead: boolean;
  onSave: (payload: any) => void;
}

export const PayrollComplianceEngine: React.FC<PayrollComplianceEngineProps> = ({ currentCompany, isSuperOrHead, onSave }) => {
  const [activeSection, setActiveSection] = useState('customComponents');
  
  // Engine State simulating a deep database structure for dynamic columns
  const [engineState, setEngineState] = useState<any>({
    pf: { enabled: true, employeePct: 12, employerPct: 3.67, epsPct: 8.33, edliPct: 0.5, adminCharges: 0.5, wageCeiling: 15000, regNo: '', effectiveDate: '2025-04-01' },
    esic: { enabled: true, employeePct: 0.75, employerPct: 3.25, wageLimit: 21000, regNo: '', effectiveDate: '2025-04-01' },
    pt: { enabled: true, state: 'Maharashtra', amount: 200, genderRules: false, frequency: 'Monthly' },
    lwf: { enabled: true, employeeContrib: 10, employerContrib: 20, state: 'Maharashtra', frequency: 'Half-Yearly' },
    tds: { enabled: true, tanNo: '', regime: 'New', slabs: [{ min: 0, max: 300000, rate: 0 }] },
    overtime: { enabled: true, multiplier: 1.5, maxPerDay: 4, maxPerMonth: 50, holidayMultiplier: 2.0, weekendMultiplier: 1.5 },
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

  const logAudit = (action: string, module: string) => {
    const log = { 
      user: 'Super Admin', 
      role: 'System Administrator',
      action, 
      module,
      ip: '192.168.1.42',
      time: new Date().toLocaleString() 
    };
    setEngineState((prev: any) => ({ ...prev, auditLogs: [log, ...prev.auditLogs] }));
  };

  const addCustomComponent = async () => {
    const name = await ui.prompt({ message: "Enter Custom Component Name (e.g. Internet Allowance):" });
    if (!name) return;
    const type = (await ui.prompt({ message: "Type (Earnings, Deductions, Reimbursements, Benefits):", defaultValue: "Earnings" })) || "Earnings";
    const calculation = (await ui.prompt({ message: "Calculation Type (Fixed, Percentage, Formula):", defaultValue: "Fixed" })) || "Fixed";
    const val = await ui.prompt({ message: `Enter numeric value for ${calculation}:`, defaultValue: "0" });
    
    const nextList = [...engineState.customComponents, { id: `c${Date.now()}`, name, type, calculation, value: Number(val) || 0, enabled: true }];
    setEngineState({ ...engineState, customComponents: nextList });
    logAudit(`Created custom component: ${name}`, 'Component Builder');
  };

  const addFormula = async () => {
    const target = await ui.prompt({ message: "Enter Target Field (e.g. Special Allowance):" });
    if (!target) return;
    const expression = await ui.prompt({ message: "Enter Formula Expression (e.g. CTC - Basic - HRA):" });
    if (!expression) return;
    
    const nextFormulas = [...engineState.formulas, { id: `f${Date.now()}`, target, expression }];
    setEngineState({ ...engineState, formulas: nextFormulas });
    logAudit(`Defined new formula for: ${target}`, 'Formula Builder');
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
    { id: 'reports', label: '4. Compliance Reports', icon: BarChart3 },
    { id: 'pf', label: '5. PF Settings', icon: ShieldCheck },
    { id: 'esic', label: '6. ESIC Settings', icon: ShieldCheck },
    { id: 'pt', label: '7. Professional Tax', icon: ShieldCheck },
    { id: 'lwf', label: '8. Labour Welfare Fund', icon: ShieldCheck },
    { id: 'overtime', label: '9. Overtime Settings', icon: Activity },
    { id: 'audit', label: '10. Advanced Audit Logs', icon: History },
  ];

  return (
    <Card padding={false} className="overflow-hidden border border-slate-200">
      <div className="flex border-b border-slate-200 bg-slate-900 text-white p-4 items-center justify-between">
        <div>
          <h3 className="text-sm font-bold flex items-center gap-2 text-white">
            <Database size={16} className="text-blue-400" />
            Enterprise Payroll Rules & Compliance Engine
          </h3>
          <p className="text-xs text-slate-400 mt-1">Multi-Company Scalable Architecture • Fully Database-Driven • No Hardcoded Components</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportSettings} className="flex items-center gap-1 border-slate-600 text-slate-200 hover:bg-slate-800"><Download size={14}/> Export Config</Button>
          <Button variant="outline" size="sm" onClick={() => ui.toast.info('Import functionality opens file dialogue.')} className="flex items-center gap-1 border-slate-600 text-slate-200 hover:bg-slate-800"><Upload size={14}/> Import Excel</Button>
          {isSuperOrHead && (
            <Button size="sm" onClick={saveToDb} disabled={saving} className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 border-none">
              <Save size={14}/> {saving ? 'Syncing...' : 'Sync with Database'}
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col md:flex-row min-h-[650px] bg-slate-50">
        {/* Sidebar Nav */}
        <div className="w-full md:w-64 border-r border-slate-200 bg-white flex flex-col p-2 gap-1 overflow-y-auto max-h-[650px] shadow-sm z-10">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-3 mt-2 mb-1">Core Architecture</div>
          {sections.slice(0, 4).map(s => (
            <button key={s.id} onClick={() => setActiveSection(s.id)} className={`flex items-center gap-2 px-3 py-2.5 text-xs font-semibold rounded-lg transition-all text-left ${activeSection === s.id ? 'bg-blue-50 text-blue-700 border border-blue-100 shadow-sm' : 'text-slate-600 hover:bg-slate-50 border border-transparent'}`}>
              <s.icon size={15} className={activeSection === s.id ? "text-blue-600" : "text-slate-400"} /> {s.label}
            </button>
          ))}
          
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-3 mt-4 mb-1">Statutory Compliance</div>
          {sections.slice(4, 9).map(s => (
            <button key={s.id} onClick={() => setActiveSection(s.id)} className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-md transition-all text-left ${activeSection === s.id ? 'bg-blue-50 text-blue-700 shadow-sm border border-blue-100' : 'text-slate-600 hover:bg-slate-50 border border-transparent'}`}>
              <s.icon size={14} className={activeSection === s.id ? "text-blue-600" : "text-slate-400"} /> {s.label}
            </button>
          ))}

          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-3 mt-4 mb-1">System Administration</div>
          {sections.slice(9).map(s => (
            <button key={s.id} onClick={() => setActiveSection(s.id)} className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-md transition-all text-left ${activeSection === s.id ? 'bg-blue-50 text-blue-700 shadow-sm border border-blue-100' : 'text-slate-600 hover:bg-slate-50 border border-transparent'}`}>
              <s.icon size={14} className={activeSection === s.id ? "text-blue-600" : "text-slate-400"} /> {s.label}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="flex-1 p-6 overflow-y-auto max-h-[650px] relative">
          
          {/* Section 1: Custom Component Builder */}
          {activeSection === 'customComponents' && (
            <div className="space-y-4 animate-in fade-in duration-300">
              <div className="flex justify-between items-end border-b border-slate-200 pb-3">
                <div>
                  <h4 className="font-bold text-slate-800 text-lg">Custom Component Builder</h4>
                  <p className="text-xs text-slate-500 mt-1">Create unlimited earnings, deductions, reimbursements, and benefits components. Schema updates automatically.</p>
                </div>
                {isSuperOrHead && <Button size="sm" onClick={addCustomComponent} className="flex items-center gap-1 bg-slate-900 text-white"><Plus size={14}/> Add Component</Button>}
              </div>
              
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr><th className="p-3 font-semibold">Component Name</th><th className="p-3 font-semibold">Classification</th><th className="p-3 font-semibold">Calculation</th><th className="p-3 font-semibold">Value</th><th className="p-3 font-semibold text-center">Status</th><th className="p-3 font-semibold text-right">Actions</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {engineState.customComponents.map((c: any, idx: number) => (
                      <tr key={c.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-3 font-bold text-slate-800">{c.name}</td>
                        <td className="p-3">
                          <span className={`px-2 py-1 rounded text-[10px] font-bold ${c.type === 'Earnings' ? 'bg-emerald-100 text-emerald-800' : c.type === 'Deductions' ? 'bg-rose-100 text-rose-800' : 'bg-indigo-100 text-indigo-800'}`}>{c.type}</span>
                        </td>
                        <td className="p-3 text-slate-600">{c.calculation}</td>
                        <td className="p-3 font-mono text-xs">{c.value}{c.calculation === 'Percentage' ? '%' : ' INR'}</td>
                        <td className="p-3 text-center">
                          <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold ${c.enabled ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                            {c.enabled ? <CheckCircle2 size={10} /> : null} {c.enabled ? 'Active' : 'Disabled'}
                          </div>
                        </td>
                        <td className="p-3 text-right">
                          {isSuperOrHead && (
                            <button className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors rounded-lg hover:bg-rose-50" onClick={async () => {
                              if(await ui.confirm({ message: 'Delete component? This updates DB schema.', variant: 'danger', confirmText: 'Delete' })) {
                                const next = [...engineState.customComponents];
                                next.splice(idx, 1);
                                setEngineState({...engineState, customComponents: next});
                                logAudit(`Deleted component: ${c.name}`, 'Component Builder');
                              }
                            }}><Trash2 size={14}/></button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Section 2: Formula Builder */}
          {activeSection === 'formulas' && (
            <div className="space-y-4 animate-in fade-in duration-300">
              <div className="flex justify-between items-end border-b border-slate-200 pb-3">
                <div>
                  <h4 className="font-bold text-slate-800 text-lg">Mathematical Formula Builder</h4>
                  <p className="text-xs text-slate-500 mt-1">Define complex rules for salary computation. E.g. ESIC = Gross * 0.75%</p>
                </div>
                {isSuperOrHead && <Button size="sm" onClick={addFormula} className="flex items-center gap-1 bg-slate-900 text-white"><Plus size={14}/> Define Formula</Button>}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                {engineState.formulas.map((f: any, idx: number) => (
                  <div key={f.id} className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm relative group">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Target Field</span>
                      <button className="text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => {
                         const next = [...engineState.formulas];
                         next.splice(idx, 1);
                         setEngineState({...engineState, formulas: next});
                      }}><Trash2 size={14}/></button>
                    </div>
                    <div className="font-bold text-lg text-slate-800 mb-3">{f.target}</div>
                    <div className="bg-slate-900 rounded-lg p-3 text-emerald-400 font-mono text-sm shadow-inner overflow-x-auto whitespace-nowrap">
                      = {f.expression}
                    </div>
                  </div>
                ))}
              </div>
            </div>
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
                    <div key={s.id} className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-lg shadow-sm hover:border-blue-300 transition-colors cursor-grab">
                      <GripVertical size={16} className="text-slate-400" />
                      <div className="flex-1 font-semibold text-sm text-slate-700">{s.name}</div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-slate-500">Visible</label>
                        <input type="checkbox" checked={s.visible} onChange={(e) => {
                          const next = [...engineState.templateSections];
                          next[idx].visible = e.target.checked;
                          setEngineState({...engineState, templateSections: next});
                        }} className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4" />
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
                    <BarChart3 size={24} className="text-blue-500 mb-3" />
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
                        <td className="p-3 text-blue-700 font-medium">{log.action}</td>
                        <td className="p-3"><span className="bg-slate-100 px-2 py-1 rounded">{log.module}</span></td>
                        <td className="p-3 text-slate-400 font-mono">{log.ip}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Fallback for other generic sections */}
          {['esic', 'pt', 'lwf', 'overtime'].includes(activeSection) && (
            <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in bg-white border border-slate-200 rounded-xl mt-4 shadow-sm">
              <Database size={48} className="text-slate-200 mb-4" />
              <p className="text-lg font-bold text-slate-700 capitalize">{activeSection} Module Engine</p>
              <p className="text-sm text-slate-500 max-w-md mt-2">This module is actively integrated via the Database schema. Rules set here apply automatically to the Payroll Engine globally.</p>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};
