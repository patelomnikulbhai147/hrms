import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Input';
import { api } from '@/api/apiClient';
import { getApiErrorMessage } from '@/utils/apiError';
import { ui } from '@/components/ui/feedback';

// Offboard one or many branches. Offboarding is a SOFT action: it never deletes
// a branch or its employees — attendance, payroll, leave, documents, tasks,
// reports and audit history are all retained. It only decides where the
// branch's employees go.

export type EmployeeAction = 'transfer' | 'archive' | 'inactive';

const EMPLOYEE_OPTIONS: { value: EmployeeAction; label: string; hint: string }[] = [
  { value: 'transfer', label: 'Transfer all employees to another branch', hint: 'Employees stay active and move to the branch you select.' },
  { value: 'archive', label: 'Archive all employees', hint: 'Employees move to the Previous tab and leave payroll, attendance and leave. Records are kept.' },
  { value: 'inactive', label: 'Keep employee records inactive', hint: 'Employees stay attached to this branch but are marked inactive.' },
];

interface BranchOffboardModalProps {
  open: boolean;
  onClose: () => void;
  /** Branches to offboard — one (row action) or many (bulk). */
  branches: any[];
  /** Live branches of the same company, used as transfer destinations. */
  allBranches: any[];
  onDone: () => void;
}

export const BranchOffboardModal: React.FC<BranchOffboardModalProps> = ({
  open, onClose, branches, allBranches, onDone,
}) => {
  const [employeeAction, setEmployeeAction] = useState<EmployeeAction>('transfer');
  const [destinationBranchId, setDestinationBranchId] = useState('');
  const [reason, setReason] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEmployeeAction('transfer');
    setDestinationBranchId('');
    setReason('');
    setEffectiveDate(new Date().toISOString().split('T')[0]);
  }, [open]);

  const targetIds = useMemo(() => new Set(branches.map(b => String(b.id))), [branches]);

  // A destination must be an ACTIVE branch that isn't itself being offboarded —
  // otherwise employees would be transferred straight into a dead branch.
  const destinations = useMemo(
    () => allBranches.filter(b =>
      !targetIds.has(String(b.id)) &&
      !b.isArchived &&
      String(b.status || '').toLowerCase() === 'active'),
    [allBranches, targetIds]
  );

  const isBulk = branches.length > 1;
  const employeesAffected = branches.reduce((sum, b) => sum + (b.headcount ?? 0), 0);
  const noDestinations = employeeAction === 'transfer' && destinations.length === 0;
  const canSubmit = !!reason.trim() && !!effectiveDate && !submitting &&
    (employeeAction !== 'transfer' || !!destinationBranchId);

  const handleConfirm = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    const payload = {
      employeeAction,
      destinationBranchId: employeeAction === 'transfer' ? destinationBranchId : null,
      reason: reason.trim(),
      effectiveDate,
    };
    // Sequential, not parallel: each offboard moves employees, and the backend
    // validates the destination is still active per call. Running them in
    // parallel would race that check.
    const failed: string[] = [];
    for (const b of branches) {
      try {
        await api.branches.offboard(b.id, payload);
      } catch (e) {
        console.error('Branch offboard error:', e);
        failed.push(`${b.branchName || b.name}: ${getApiErrorMessage(e, 'Could not offboard.')}`);
      }
    }
    setSubmitting(false);

    const succeeded = branches.length - failed.length;
    if (succeeded > 0) {
      ui.toast.success(succeeded === 1
        ? 'Branch offboarded successfully.'
        : `${succeeded} branches offboarded successfully.`);
    }
    if (failed.length > 0) {
      await ui.alert({
        title: 'Some branches were not offboarded',
        variant: 'warning',
        message: failed.join('\n'),
      });
    }
    // Refresh regardless — a partial run still changed data.
    onDone();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Offboard Branch"
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button variant="danger" onClick={handleConfirm} disabled={!canSubmit} loading={submitting}>
            {isBulk ? `Offboard ${branches.length} Branches` : 'Offboard Branch'}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-left">
        <div className="flex gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200">
          <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900">
            <p className="font-semibold">
              You are about to offboard {isBulk ? `${branches.length} branches` : 'this branch'}.
            </p>
            <p className="mt-0.5">Choose how employees should be handled.</p>
          </div>
        </div>

        <div className="rounded-xl border border-gray-100 bg-slate-50/60 p-3">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
            {isBulk ? 'Branches' : 'Branch'}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {branches.map(b => (
              <span key={b.id} className="text-[11px] font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg px-2 py-1">
                {b.branchName || b.name}
                <span className="text-gray-400 font-medium"> · {b.headcount ?? 0} emp</span>
              </span>
            ))}
          </div>
          <p className="text-[11px] text-gray-500 mt-2">
            {employeesAffected} employee{employeesAffected === 1 ? '' : 's'} affected. No records are deleted —
            attendance, payroll, leave, documents and history are retained.
          </p>
        </div>

        {/* Employee handling */}
        <div className="space-y-2">
          {EMPLOYEE_OPTIONS.map(opt => (
            <label
              key={opt.value}
              className={`flex gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${
                employeeAction === opt.value
                  ? 'border-[#C77E52] bg-brand-50/40'
                  : 'border-gray-200 hover:bg-slate-50'
              }`}
            >
              <input
                type="radio"
                name="branch-offboard-employee-action"
                className="mt-0.5 w-3.5 h-3.5 text-brand-700 focus:ring-brand-500"
                checked={employeeAction === opt.value}
                onChange={() => setEmployeeAction(opt.value)}
              />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-gray-800">{opt.label}</div>
                <div className="text-[11px] text-gray-500 mt-0.5">{opt.hint}</div>
              </div>
            </label>
          ))}
        </div>

        {employeeAction === 'transfer' && (
          noDestinations ? (
            <p className="text-[11px] font-semibold text-red-600 bg-red-50 border border-red-200 rounded-xl p-2.5">
              There is no other active branch to transfer employees to. Choose Archive or Keep inactive instead.
            </p>
          ) : (
            <Select
              label="Destination branch *"
              value={destinationBranchId}
              onChange={e => setDestinationBranchId(e.target.value)}
              options={[
                { value: '', label: 'Select destination branch' },
                ...destinations.map(b => ({
                  value: String(b.id),
                  label: `${b.branchName || b.name}${b.location ? ` — ${b.location}` : ''}`,
                })),
              ]}
            />
          )
        )}

        <div className="text-left">
          <label className="block text-xs font-semibold text-gray-700 mb-1">Reason *</label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={3}
            placeholder="Why is this branch being offboarded?"
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none resize-y"
          />
        </div>

        <div className="text-left">
          <label className="block text-xs font-semibold text-gray-700 mb-1">Effective Date *</label>
          <input
            type="date"
            value={effectiveDate}
            onChange={e => setEffectiveDate(e.target.value)}
            className="w-full h-[38px] rounded-xl border border-gray-200 px-3 text-xs focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
          />
        </div>
      </div>
    </Modal>
  );
};
