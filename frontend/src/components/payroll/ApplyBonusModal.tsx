import React, { useMemo, useState } from 'react';
import { Gift } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Input';
import { ui } from '@/components/ui/feedback';
import { api } from '@/api/apiClient';

interface ApplyBonusModalProps {
  open: boolean;
  onClose: () => void;
  employees: any[];        // scoped company employees (id, name, department, employeeId)
  companyId: string;
  month: string;
  year: number;
  onApplied: () => void;   // refresh payroll after applying
}

const BONUS_TYPES = ['Festival', 'Performance', 'Custom'];
const METHODS = ['Fixed Amount', 'Percentage of Salary'];

export const ApplyBonusModal: React.FC<ApplyBonusModalProps> = ({ open, onClose, employees, companyId, month, year, onApplied }) => {
  const [scope, setScope] = useState<'company' | 'department' | 'selected'>('company');
  const [department, setDepartment] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bonusType, setBonusType] = useState('Festival');
  const [calcMethod, setCalcMethod] = useState('Fixed Amount');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);

  const departments = useMemo(() => Array.from(new Set(employees.map(e => e.department).filter(Boolean))).sort(), [employees]);
  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter(e => !q || (e.name || '').toLowerCase().includes(q) || String(e.employeeId || '').toLowerCase().includes(q));
  }, [employees, search]);

  const isPercent = calcMethod.toLowerCase().includes('percent');

  const reset = () => { setScope('company'); setDepartment(''); setSelectedIds(new Set()); setBonusType('Festival'); setCalcMethod('Fixed Amount'); setValue(''); setReason(''); setSearch(''); };

  const targetCount = scope === 'company' ? employees.length
    : scope === 'department' ? employees.filter(e => e.department === department).length
    : selectedIds.size;

  const handleApply = async () => {
    const num = Number(value);
    if (!num || num <= 0) { ui.toast.warning('Enter a bonus amount or percentage greater than zero.'); return; }
    if (scope === 'department' && !department) { ui.toast.warning('Choose a department.'); return; }
    if (scope === 'selected' && selectedIds.size === 0) { ui.toast.warning('Select at least one employee.'); return; }
    const ok = await ui.confirm({
      title: 'Apply Bonus',
      message: `Apply a ${bonusType} bonus of ${isPercent ? `${num}% of salary` : `₹${num.toLocaleString('en-IN')}`} to ${targetCount} employee(s) for ${month} ${year}? This updates their net salary.`,
      confirmText: 'Apply Bonus',
      variant: 'primary',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await api.payroll.applyBonus({
        companyId, month, year, scope,
        employeeIds: scope === 'selected' ? Array.from(selectedIds) : undefined,
        department: scope === 'department' ? department : undefined,
        bonusType, calcMethod,
        amount: isPercent ? undefined : num,
        percent: isPercent ? num : undefined,
        reason: reason || undefined,
      });
      ui.toast.success(res?.message || 'Bonus applied.');
      onApplied();
      reset();
      onClose();
    } catch (e: any) {
      ui.toast.error(`Failed to apply bonus: ${e?.message || 'Unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: number) => setSelectedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Apply Bonus to Payroll"
      size="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-xs text-slate-500">{targetCount} employee(s) will be affected · {month} {year}</span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button icon={<Gift size={14} />} onClick={handleApply} disabled={busy}>{busy ? 'Applying…' : 'Apply Bonus'}</Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Apply To</label>
            <Select value={scope} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setScope(e.target.value as any)} options={[
              { value: 'company', label: 'Entire Company' },
              { value: 'department', label: 'A Department' },
              { value: 'selected', label: 'Selected Employees' },
            ]} />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Bonus Type</label>
            <Select value={bonusType} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setBonusType(e.target.value)} options={BONUS_TYPES.map(t => ({ value: t, label: t }))} />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Calculation Method</label>
            <Select value={calcMethod} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setCalcMethod(e.target.value)} options={METHODS.map(m => ({ value: m, label: m }))} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">{isPercent ? 'Percentage of Salary (%)' : 'Bonus Amount (₹)'}</label>
            <input type="number" min="0" value={value} onChange={e => setValue(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 outline-none"
              placeholder={isPercent ? 'e.g. 10' : 'e.g. 5000'} />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Reason / Note <span className="text-slate-400">(e.g. Diwali, performance)</span></label>
            <input type="text" value={reason} onChange={e => setReason(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 outline-none"
              placeholder="Optional" />
          </div>
        </div>

        {scope === 'department' && (
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Department</label>
            <Select value={department} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setDepartment(e.target.value)}
              options={[{ value: '', label: 'Select department…' }, ...departments.map(d => ({ value: d, label: d }))]} />
          </div>
        )}

        {scope === 'selected' && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[11px] font-semibold text-slate-500">Employees ({selectedIds.size} selected)</label>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
                className="rounded-lg border border-slate-200 px-2 py-1 text-xs outline-none focus:border-indigo-400" />
            </div>
            <div className="max-h-52 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
              {filteredEmployees.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-slate-400">No employees</div>
              ) : filteredEmployees.map(e => (
                <label key={e.id} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 cursor-pointer">
                  <input type="checkbox" checked={selectedIds.has(Number(e.id))} onChange={() => toggle(Number(e.id))} />
                  <span className="font-medium text-slate-800">{e.name}</span>
                  <span className="text-[11px] text-slate-400">{e.employeeId} · {e.department}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <p className="text-[11px] text-slate-400">
          Festival/Performance/Custom bonuses are one-time and recorded in the employee's bonus history. Recurring
          (Monthly/Yearly) bonuses are configured on the employee record and auto-applied during payroll generation.
        </p>
      </div>
    </Modal>
  );
};
