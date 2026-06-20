import React, { useEffect, useRef, useState } from 'react';
import { Upload, X, FileText } from 'lucide-react';
import { Button } from './ui/Button';
import { Input, Select } from './ui/Input';
import { Modal } from './ui/Modal';

export const RELATIONSHIPS = ['Father', 'Mother', 'Husband', 'Wife', 'Son', 'Daughter', 'Brother', 'Sister', 'Grandfather', 'Grandmother', 'Guardian', 'Friend', 'Other'];

// Document types HR can attach to a nominee.
export const DOC_TYPES = ['Aadhaar Card', 'PAN Card', 'Relationship Proof', 'Other Documents'];
const ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';
const MAX_MB = 5;

// Simplified nominee — only the fields HR actually needs for quick data entry.
export const emptyNominee = () => ({
  fullName: '', relationship: 'Father', mobile: '', dob: '',
  aadhaar: '', email: '', addressLine1: '', percentage: '',
  isEmergencyContact: false, status: 'Active',
});

// `showPercentage` is true only when the employee will have multiple nominees —
// a single nominee always gets 100% and never needs to enter a percentage.
export const validateNomineeForm = (form: any, showPercentage = false): Record<string, string> => {
  const e: Record<string, string> = {};
  if (!form.fullName?.trim()) e.fullName = 'Required.';
  if (!form.relationship) e.relationship = 'Required.';
  if (!form.mobile || !/^\d{10}$/.test(String(form.mobile).replace(/\D/g, '').slice(-10))) e.mobile = 'Enter a 10-digit mobile.';
  if (!form.dob) e.dob = 'Required.';
  if (showPercentage) {
    const pct = Number(form.percentage);
    if (form.percentage === '' || isNaN(pct) || pct <= 0 || pct > 100) e.percentage = 'Enter 1–100.';
  }
  // Optional, validated only if filled.
  if (form.aadhaar && !/^\d{12}$/.test(String(form.aadhaar).replace(/\s/g, ''))) e.aadhaar = 'Aadhaar must be 12 digits.';
  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Invalid email.';
  return e;
};

export type NomineeDoc = { docType: string; fileName: string; mimeType: string; fileData: string };

const fileToBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result));
  r.onerror = reject;
  r.readAsDataURL(file);
});

interface Props {
  open: boolean;
  initial?: any | null;
  /** Number of OTHER active nominees the employee already has (excluding this one). */
  nomineeCount?: number;
  saving?: boolean;
  onClose: () => void;
  onSubmit: (nominee: any, pendingDocs: NomineeDoc[]) => void;
}

export const NomineeForm: React.FC<Props> = ({ open, initial, nomineeCount = 0, saving, onClose, onSubmit }) => {
  const [form, setForm] = useState<any>(emptyNominee());
  const [docs, setDocs] = useState<NomineeDoc[]>([]);
  const [docType, setDocType] = useState(DOC_TYPES[0]);
  const [docError, setDocError] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  // Percentage is only relevant when there is more than one nominee.
  const showPercentage = nomineeCount >= 1;

  useEffect(() => {
    if (!open) return;
    setForm(initial
      ? { ...emptyNominee(), ...initial, percentage: String(initial.percentage ?? ''), isEmergencyContact: !!initial.isEmergencyContact }
      : emptyNominee());
    setDocs([]);
    setDocType(DOC_TYPES[0]);
    setDocError('');
    setErrors({});
  }, [open, initial]);

  const pickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!['pdf', 'jpg', 'jpeg', 'png'].includes(ext)) { setDocError('Only PDF, JPG, JPEG or PNG files are allowed.'); return; }
    if (file.size > MAX_MB * 1024 * 1024) { setDocError(`File must be under ${MAX_MB} MB.`); return; }
    setDocError('');
    try {
      const fileData = await fileToBase64(file);
      setDocs(d => [...d, { docType, fileName: file.name, mimeType: file.type || 'application/octet-stream', fileData }]);
    } catch { setDocError('Could not read that file.'); }
  };

  const submit = () => {
    const e = validateNomineeForm(form, showPercentage);
    setErrors(e);
    if (Object.keys(e).length) return;
    // Single nominee → always 100%. Multiple → use the entered allocation.
    const percentage = showPercentage ? Number(form.percentage) : 100;
    onSubmit({ ...form, percentage }, docs);
  };

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Edit Nominee' : 'Add Nominee'} size="lg"
      footer={<div className="flex justify-end gap-2"><Button variant="outline" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" loading={saving} onClick={submit}>{initial ? 'Save Changes' : 'Add Nominee'}</Button></div>}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Input label="Nominee Name *" value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} error={errors.fullName} />
          <Select label="Relationship *" value={form.relationship} onChange={e => setForm({ ...form, relationship: e.target.value })} options={RELATIONSHIPS.map(r => ({ value: r, label: r }))} error={errors.relationship} />
        </div>
        <div className={`grid ${showPercentage ? 'grid-cols-3' : 'grid-cols-2'} gap-3`}>
          <Input label="Mobile Number *" value={form.mobile} onChange={e => setForm({ ...form, mobile: e.target.value })} error={errors.mobile} />
          <Input label="Date of Birth *" type="date" value={(form.dob || '').slice(0, 10)} onChange={e => setForm({ ...form, dob: e.target.value })} error={errors.dob} />
          {showPercentage && <Input label="Nomination % *" type="number" value={form.percentage} onChange={e => setForm({ ...form, percentage: e.target.value })} error={errors.percentage} />}
        </div>
        {showPercentage && nomineeCount === 1 && !initial && (
          <p className="text-[10px] text-blue-600 -mt-1.5 font-semibold">Adding a second nominee — the existing nominee's share is adjusted automatically so the total stays 100%.</p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Input label="Aadhaar Number (optional)" value={form.aadhaar} onChange={e => setForm({ ...form, aadhaar: e.target.value })} error={errors.aadhaar} />
          <Input label="Email (optional)" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} error={errors.email} />
        </div>
        <Input label="Address (optional)" value={form.addressLine1} onChange={e => setForm({ ...form, addressLine1: e.target.value })} />

        <div className="flex flex-wrap gap-5 pt-0.5">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.isEmergencyContact} onChange={e => setForm({ ...form, isEmergencyContact: e.target.checked })} className="rounded border-slate-300 text-blue-600" />
            <span className="text-xs font-semibold text-slate-700">Emergency Contact</span>
          </label>
        </div>

        {/* Documents */}
        <div className="border-t border-slate-100 pt-2.5">
          <div className="flex items-end gap-2">
            <div className="flex-1"><Select value={docType} onChange={e => setDocType(e.target.value)} options={DOC_TYPES.map(t => ({ value: t, label: t }))} /></div>
            <input ref={fileRef} type="file" accept={ACCEPT} onChange={pickFile} className="hidden" />
            <Button variant="outline" size="sm" icon={<Upload size={13} />} onClick={() => fileRef.current?.click()}>Attach</Button>
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Accepted: PDF, JPG, JPEG, PNG · up to {MAX_MB} MB each.</p>
          {docError && <p className="text-[10px] text-rose-600 mt-1 font-semibold">{docError}</p>}
          {docs.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {docs.map((d, i) => (
                <div key={i} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
                  <FileText size={13} className="text-slate-400 shrink-0" />
                  <span className="text-[11px] font-semibold text-slate-600 shrink-0">{d.docType}</span>
                  <span className="text-[11px] text-slate-500 truncate flex-1">{d.fileName}</span>
                  <button onClick={() => setDocs(docs.filter((_, j) => j !== i))} className="text-slate-400 hover:text-rose-600 shrink-0"><X size={13} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default NomineeForm;
