import React, { useState } from 'react';
import { UserPlus, Pencil, Trash2, ShieldAlert, FileText } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { NomineeForm, NomineeDoc } from '@/components/employee/NomineeForm';

interface Props { value: any[]; onChange: (list: any[]) => void; }

/**
 * Registration-wizard nominee step. Nominees are STAGED in local state only —
 * nothing is written to the database here. They are saved together with the
 * employee (transactional bulk insert) after registration succeeds.
 */
export const NomineeWizardStep: React.FC<Props> = ({ value, onChange }) => {
  const [editIdx, setEditIdx] = useState<number | null>(null); // null=closed, -1=add, >=0 edit

  const multi = value.length > 1; // percentage allocation only matters with 2+ nominees
  const total = value.reduce((s, n) => s + Number(n.percentage || 0), 0);
  const allocColor = Math.abs(total - 100) < 0.01 ? 'bg-emerald-500' : total > 100 ? 'bg-rose-500' : 'bg-amber-500';

  const save = (nominee: any, docs: NomineeDoc[]) => {
    if (editIdx === -1) {
      // 1→2 transition: reduce the lone (implicitly 100%) nominee so the total stays 100%.
      let list = value;
      if (value.length === 1 && Number(value[0].percentage) >= 100 && Number(nominee.percentage) < 100) {
        list = value.map((n, i) => i === 0 ? { ...n, percentage: 100 - Number(nominee.percentage) } : n);
      }
      onChange([...list, { ...nominee, documents: docs }]);
    } else if (editIdx != null && editIdx >= 0) {
      onChange(value.map((n, i) => i === editIdx ? { ...nominee, documents: [...(n.documents || []), ...docs] } : n));
    }
    setEditIdx(null);
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-[11px] text-blue-800">
        Add one or more nominees (optional). They are saved <strong>only after</strong> the employee is created — together, in a single transaction.{multi ? <> Total allocation should equal <strong>100%</strong>.</> : ''}
      </div>

      {/* Allocation indicator — only relevant with multiple nominees. */}
      {multi && (
        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-bold text-slate-700">Total Nomination Allocation</span>
            <span className={`text-xs font-bold ${Math.abs(total - 100) < 0.01 ? 'text-emerald-600' : 'text-amber-600'}`}>{total}% / 100%</span>
          </div>
          <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden"><div className={`h-full ${allocColor} transition-all`} style={{ width: `${Math.min(total, 100)}%` }} /></div>
          {total > 100 && <p className="text-[10px] text-rose-600 mt-1.5 font-semibold">⚠ Total exceeds 100%. Reduce some allocations.</p>}
          {total < 100 && <p className="text-[10px] text-amber-600 mt-1.5 font-semibold">⚠ Total is {total}% — should equal 100%.</p>}
        </div>
      )}

      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-slate-800">Nominees ({value.length})</h4>
        <Button size="sm" icon={<UserPlus size={13} />} onClick={() => setEditIdx(-1)}>Add Nominee</Button>
      </div>

      {value.length === 0 ? (
        <div className="py-6 text-center border border-dashed border-slate-200 rounded-xl">
          <p className="text-xs font-semibold text-slate-500">No nominees added.</p>
          <p className="text-[11px] text-slate-400 mt-1">You can also add nominees later from the employee profile.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {value.map((n, i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-800 truncate">{n.fullName}</p>
                  <p className="text-[11px] text-slate-500">{n.relationship}{n.gender ? ` · ${n.gender}` : ''}</p>
                </div>
                {multi && <span className="shrink-0 text-sm font-extrabold text-indigo-600">{Number(n.percentage)}%</span>}
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {n.isEmergencyContact && <span className="inline-flex items-center gap-1 text-[9px] font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-full px-1.5 py-0.5"><ShieldAlert size={10} /> Emergency</span>}
                {n.documents?.length > 0 && <span className="inline-flex items-center gap-1 text-[9px] font-bold text-slate-600 bg-slate-100 border border-slate-200 rounded-full px-1.5 py-0.5"><FileText size={10} /> {n.documents.length} doc(s)</span>}
              </div>
              <div className="flex gap-1.5 mt-2.5 pt-2 border-t border-slate-100">
                <button onClick={() => setEditIdx(i)} className="flex items-center gap-1 text-[10px] font-bold text-blue-700 hover:bg-blue-50 px-2 py-1 rounded"><Pencil size={11} /> Edit</button>
                <button onClick={() => onChange(value.filter((_, j) => j !== i))} className="flex items-center gap-1 text-[10px] font-bold text-rose-700 hover:bg-rose-50 px-2 py-1 rounded ml-auto"><Trash2 size={11} /> Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <NomineeForm
        open={editIdx != null}
        initial={editIdx != null && editIdx >= 0 ? value[editIdx] : null}
        nomineeCount={editIdx === -1 ? value.length : value.length - 1}
        onClose={() => setEditIdx(null)}
        onSubmit={save}
      />
    </div>
  );
};

export default NomineeWizardStep;
