import React from 'react';
import { Gift } from 'lucide-react';
import { Input, Select } from '@/components/ui/Input';
import type { BonusType, BonusCalcMethod } from '@/types';

export interface BonusConfigData {
  bonusApplicable?: boolean;
  bonusType?: BonusType | string;
  bonusCalcMethod?: BonusCalcMethod | string;
  bonusValue?: number | string | null;
  bonusEffectiveDate?: string | null;
  bonusEndDate?: string | null;
  bonusNotes?: string | null;
}

interface Props {
  data: BonusConfigData;
  /** Monthly CTC / salary used for the live percentage preview. */
  salary?: number | string;
  onChange: (patch: Partial<BonusConfigData>) => void;
  errors?: Record<string, string>;
  disabled?: boolean;
}

const BONUS_TYPE_OPTIONS: { value: BonusType; label: string }[] = [
  { value: 'Monthly', label: 'Monthly Bonus' },
  { value: 'Quarterly', label: 'Quarterly Bonus' },
  { value: 'Half-Yearly', label: 'Half-Yearly Bonus' },
  { value: 'Yearly', label: 'Yearly Bonus' },
  { value: 'Performance', label: 'Performance Bonus' },
  { value: 'Festival', label: 'Festival Bonus' },
  { value: 'Custom', label: 'Custom Bonus' },
];

const CALC_METHOD_OPTIONS: { value: BonusCalcMethod; label: string }[] = [
  { value: 'Fixed Amount', label: 'Fixed Amount' },
  { value: 'Percentage of Salary', label: 'Percentage of Salary' },
];

const inr = (n: number) =>
  '₹' + (Math.round(n) || 0).toLocaleString('en-IN');

/**
 * Per-employee bonus configuration. A recurring rule that flows into payroll
 * (Monthly auto-applies every cycle; Yearly only in its payout month). Hidden
 * entirely when "Bonus Applicable" is No, per the HRMS bonus spec.
 */
export const BonusConfigSection: React.FC<Props> = ({ data, salary = 0, onChange, errors = {}, disabled }) => {
  const applicable = !!data.bonusApplicable;
  const method = data.bonusCalcMethod || 'Fixed Amount';
  const isPercent = method === 'Percentage of Salary';

  // Live monthly-equivalent preview. Salary here is the monthly CTC field.
  const monthly = Number(salary) || 0;
  const value = Number(data.bonusValue) || 0;
  const resolvedAmount = isPercent ? (monthly * value) / 100 : value;

  return (
    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/40 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gift size={15} className="text-amber-600" />
          <span className="text-sm font-bold text-slate-700">Bonus Configuration</span>
        </div>
        <div className="w-40">
          <Select
            label="Bonus Applicable"
            value={applicable ? 'yes' : 'no'}
            onChange={(e) => onChange({ bonusApplicable: e.target.value === 'yes' })}
            options={[{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }]}
            disabled={disabled}
          />
        </div>
      </div>

      {applicable && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Bonus Type *"
              value={data.bonusType || ''}
              onChange={(e) => onChange({ bonusType: e.target.value })}
              options={[{ value: '', label: 'Select type…' }, ...BONUS_TYPE_OPTIONS]}
              error={errors.bonusType}
              disabled={disabled}
            />
            <Select
              label="Calculation Method *"
              value={method}
              onChange={(e) => onChange({ bonusCalcMethod: e.target.value })}
              options={CALC_METHOD_OPTIONS}
              disabled={disabled}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label={isPercent ? 'Bonus Percentage (%) *' : 'Bonus Amount (₹) *'}
              type="number"
              value={data.bonusValue ?? ''}
              onChange={(e) => onChange({ bonusValue: e.target.value === '' ? null : Number(e.target.value) })}
              error={errors.bonusValue}
              disabled={disabled}
            />
            <Input
              label="Effective Date"
              type="date"
              value={(data.bonusEffectiveDate || '').slice(0, 10)}
              onChange={(e) => onChange({ bonusEffectiveDate: e.target.value || null })}
              disabled={disabled}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="End Date (Optional)"
              type="date"
              value={(data.bonusEndDate || '').slice(0, 10)}
              onChange={(e) => onChange({ bonusEndDate: e.target.value || null })}
              disabled={disabled}
            />
            <Input
              label="Notes (Optional)"
              value={data.bonusNotes || ''}
              onChange={(e) => onChange({ bonusNotes: e.target.value })}
              disabled={disabled}
            />
          </div>
          <div className="flex items-center justify-between rounded-md bg-white/70 border border-amber-200 px-3 py-1.5 text-xs">
            <span className="text-slate-500">
              {isPercent ? `${value || 0}% of monthly salary` : 'Fixed monthly-equivalent'}
            </span>
            <span className="font-bold text-amber-700">{inr(resolvedAmount)}</span>
          </div>
        </div>
      )}
    </div>
  );
};
