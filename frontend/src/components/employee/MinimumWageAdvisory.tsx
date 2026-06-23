import React, { useMemo, useState, useEffect } from 'react';
import { Input, Select } from '@/components/ui/Input';
import { ui } from '@/components/ui/feedback';
import { Scale, CheckCircle2, AlertTriangle, MapPin } from 'lucide-react';
import { SKILLS, type SkillKey, resolveStateForBranch, resolveMinimumWage, getSettings, logOverride, logStateOverride, listConfiguredStates, INDIAN_STATES, norm } from '@/utils/wageMaster';

interface Props {
  companyId: string;       // wage-master scope (top company)
  branch?: string;         // employee's branch (branchLocation)
  defaultSkill?: string;   // existing Employment Class value (Skilled/Unskilled…) if any
  performedBy: string;
  employeeName?: string;
}

const EMP_CATEGORIES = [
  { value: 'salary', label: 'Salary Employee' },
  { value: 'wage', label: 'Wage Employee' },
  { value: 'contract', label: 'Contract Labour' },
  { value: 'intern', label: 'Intern' },
  { value: 'consultant', label: 'Consultant' },
];
const WAGE_TYPES = [
  { value: 'daily', label: 'Daily Wage', unit: 'Day' },
  { value: 'hourly', label: 'Hourly Wage', unit: 'Hour' },
  { value: 'monthly', label: 'Monthly Wage', unit: 'Month' },
];
const inr = (n: number) => `₹${(Number(n) || 0).toLocaleString('en-IN')}`;
const guessSkill = (v?: string): SkillKey | '' => {
  const s = (v || '').toLowerCase();
  if (/highly/.test(s)) return 'highlySkilled';
  if (/semi/.test(s)) return 'semiSkilled';
  if (/unskill/.test(s)) return 'unskilled';
  if (/skill/.test(s)) return 'skilled';
  return '';
};

/**
 * Advisory-only minimum-wage panel for the Compensation Configuration step. It is
 * fully self-contained (local state, no change to the employee create payload) —
 * it reads the State Wage Master to recommend a compliant wage and warns when the
 * entered amount is below the statutory minimum. Below-minimum overrides are logged.
 */
export const MinimumWageAdvisory: React.FC<Props> = ({ companyId, branch, defaultSkill, performedBy, employeeName }) => {
  const [category, setCategory] = useState('salary');
  const [skill, setSkill] = useState<SkillKey | ''>(guessSkill(defaultSkill));
  const [wageType, setWageType] = useState('daily');
  const [wage, setWage] = useState<string>('');
  const [reason, setReason] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [manualState, setManualState] = useState('');

  useEffect(() => { setSkill(prev => prev || guessSkill(defaultSkill)); }, [defaultSkill]);
  // Reset a manual state pick if the branch/company context changes.
  useEffect(() => { setManualState(''); }, [branch, companyId]);

  const settings = useMemo(() => getSettings(companyId), [companyId]);
  // Priority 1: auto-detect state from branch mapping. Priority 2: manual pick.
  const autoState = useMemo(() => resolveStateForBranch(companyId, branch), [companyId, branch]);
  const state = manualState || autoState;
  // Priority 3: fetch the minimum wage as soon as a state (auto or manual) is known.
  const minWage = useMemo(() => (state && skill) ? resolveMinimumWage(companyId, state, skill) : null, [companyId, state, skill]);
  const unit = WAGE_TYPES.find(w => w.value === wageType)?.unit || 'Day';

  // Full state dropdown — states with a configured wage rule first (flagged), then
  // the remaining Indian states/UTs, so a state can always be chosen as fallback.
  const stateOptions = useMemo(() => {
    const configured = listConfiguredStates(companyId);
    const seen = new Set(configured.map(norm));
    const opts: { value: string; label: string }[] = [
      { value: '', label: '— Select State —' },
      ...configured.map(s => ({ value: s, label: `${s}  ·  wage rule available` })),
    ];
    for (const s of INDIAN_STATES) if (!seen.has(norm(s))) { opts.push({ value: s, label: s }); seen.add(norm(s)); }
    if (state && !seen.has(norm(state)) && !configured.some(c => norm(c) === norm(state))) opts.push({ value: state, label: state });
    return opts;
  }, [companyId, state]);
  const stateValue = stateOptions.find(o => o.value && norm(o.value) === norm(state))?.value || '';

  const onSelectState = (val: string) => {
    setManualState(val);
    setAcknowledged(false);
    if (val && norm(val) !== norm(autoState)) logStateOverride(companyId, { employeeName, branch, autoState, state: val, selectedBy: performedBy });
  };

  const entered = Number(wage) || 0;
  const below = minWage != null && entered > 0 && entered < minWage;
  const compliant = minWage != null && entered >= minWage;

  const recordOverride = () => {
    if (!reason.trim()) { ui.toast.error('Please enter a reason for the below-minimum wage.'); return; }
    logOverride(companyId, { employeeName: employeeName || '—', branch: branch || '—', state, skill: skill as SkillKey, governmentMinimum: minWage || 0, enteredWage: entered, wageType, reason: reason.trim(), overriddenBy: performedBy });
    setAcknowledged(true);
    ui.toast.success('Override recorded with reason (logged for compliance audit).');
  };

  const isWageWorker = category === 'wage' || category === 'contract';

  return (
    <div className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50/60 to-white p-3 mb-4">
      <p className="text-[11px] font-extrabold text-indigo-700 uppercase tracking-wider flex items-center gap-1.5 mb-2"><Scale size={13} /> Minimum Wage Compliance (Advisory)</p>

      {/* Employment Category */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-2">
        <div className="md:col-span-1"><Select label="Employment Category *" value={category} onChange={e => { setCategory(e.target.value); setAcknowledged(false); }} options={EMP_CATEGORIES} /></div>
        {isWageWorker && <Select label="Skill Category *" value={skill} onChange={e => { setSkill(e.target.value as SkillKey); setAcknowledged(false); }} options={[{ value: '', label: '— Select —' }, ...SKILLS.map(s => ({ value: s.key, label: s.label }))]} />}
        {isWageWorker && <Select label="Wage Type *" value={wageType} onChange={e => setWageType(e.target.value)} options={WAGE_TYPES.map(w => ({ value: w.value, label: w.label }))} />}
      </div>

      {!isWageWorker && (
        <p className="text-[10px] text-slate-500">Minimum-wage compliance applies to <strong>Wage Employee</strong> and <strong>Contract Labour</strong>. Configure salary/bonus/stipend for this category in the section below.</p>
      )}

      {isWageWorker && (
        <>
          {/* State: auto-mapped from branch when available, always overridable via
              the dropdown so registration is never blocked by a missing mapping. */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-2 items-end">
            <Select label="State *" value={stateValue} onChange={e => onSelectState(e.target.value)} options={stateOptions} />
            <div className="md:col-span-2 flex flex-wrap items-center gap-2 text-[11px] pb-1">
              <span className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded-full px-2 py-1 font-semibold text-slate-600"><MapPin size={11} className="text-indigo-500" /> Branch: {branch || '—'}</span>
              {autoState && (!manualState || norm(manualState) === norm(autoState))
                ? <span className="inline-flex items-center gap-1 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-1 font-semibold text-emerald-700"><CheckCircle2 size={11} /> Auto-mapped from branch</span>
                : manualState
                  ? <span className="inline-flex items-center gap-1 bg-amber-50 border border-amber-200 rounded-full px-2 py-1 font-semibold text-amber-700">Manual selection{autoState ? ` (auto: ${autoState})` : ''}</span>
                  : null}
              {minWage != null && <span className="inline-flex items-center gap-1 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-1 font-bold text-emerald-700">Recommended Minimum Wage: {inr(minWage)} / {unit}</span>}
            </div>
          </div>

          {!autoState && !manualState && <p className="text-[10px] text-slate-500 mb-2">No branch→state mapping found — <strong>select the applicable state above</strong> to fetch the minimum wage. You can map it permanently in <strong>Settings → Labour Compliance</strong>. Registration is never blocked.</p>}
          {state && skill && minWage == null && <p className="text-[10px] text-amber-600 mb-2">No wage rule configured for <strong>{state}</strong> / <strong>{SKILLS.find(s => s.key === skill)?.label}</strong>. Enter the wage manually below; add the rule in the State Wage Master to enable auto-fetch.</p>}

          {/* Editable wage amount */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 items-end">
            <Input label={`Wage Amount (₹ / ${unit}) *`} type="number" value={wage} onChange={e => { setWage(e.target.value); setAcknowledged(false); }} placeholder={minWage != null ? String(minWage) : ''} />
            {minWage != null && wage !== '' && (
              <div className="md:col-span-2 flex items-end pb-1">
                {compliant
                  ? <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5"><CheckCircle2 size={14} /> Compliant — at or above the {state} minimum.</span>
                  : <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5"><AlertTriangle size={14} /> Below minimum wage for {state} {SKILLS.find(s => s.key === skill)?.label} workers.</span>}
              </div>
            )}
          </div>

          {/* Below-minimum compliance warning + override */}
          {below && settings.enforceCompliance && (
            <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 p-2.5">
              <p className="text-[12px] font-bold text-rose-700 flex items-center gap-1.5"><AlertTriangle size={13} /> WARNING</p>
              <p className="text-[11px] text-rose-700 mt-0.5">Entered wage <strong>{inr(entered)}</strong> is below the minimum wage prescribed for <strong>{state} {SKILLS.find(s => s.key === skill)?.label}</strong> workers.</p>
              <p className="text-[11px] text-rose-700">Government Minimum Wage: <strong>{inr(minWage!)} / {unit}</strong></p>
              {settings.allowBelowMinimumOverride ? (
                acknowledged ? (
                  <p className="text-[11px] font-bold text-emerald-700 mt-1.5 flex items-center gap-1"><CheckCircle2 size={12} /> Override recorded with reason.</p>
                ) : (
                  <div className="mt-2 flex flex-col sm:flex-row gap-2 sm:items-end">
                    <div className="flex-1"><Input label="Override reason *" value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Trainee phase per signed agreement" /></div>
                    <button onClick={recordOverride} className="text-[11px] font-bold px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white">Save with Reason (Override)</button>
                  </div>
                )
              ) : (
                <p className="text-[11px] font-bold text-rose-700 mt-1.5">Overrides are disabled. Enter a compliant wage of at least {inr(minWage!)}.</p>
              )}
            </div>
          )}
          <p className="text-[10px] text-slate-400 mt-2">Advisory only — your existing Salary field below is unchanged. Wages are calculated from attendance (Present Days × Daily Wage) by the existing payroll engine. Overrides are logged for audit.</p>
        </>
      )}
    </div>
  );
};

export default MinimumWageAdvisory;
