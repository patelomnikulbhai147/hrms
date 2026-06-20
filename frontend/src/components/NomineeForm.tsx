import React, { useEffect, useState } from 'react';
import { X, Upload, FileText } from 'lucide-react';
import { Button } from './ui/Button';
import { Input, Select } from './ui/Input';
import { Modal } from './ui/Modal';

export const RELATIONSHIPS = ['Father', 'Mother', 'Husband', 'Wife', 'Son', 'Daughter', 'Brother', 'Sister', 'Grandfather', 'Grandmother', 'Guardian', 'Friend', 'Other'];
export const DOC_TYPES = ['Aadhaar Card', 'PAN Card', 'Passport', 'Photograph', 'Birth Certificate', 'Relationship Proof', 'Other'];

export const emptyNominee = () => ({
  fullName: '', relationship: 'Father', dob: '', gender: 'Male', mobile: '', email: '', nationality: 'India', maritalStatus: '',
  aadhaar: '', pan: '', passport: '', drivingLicense: '',
  country: 'India', state: '', city: '', addressLine1: '', addressLine2: '', postalCode: '',
  percentage: '', isEmergencyContact: false, isDependent: false, isLegalHeir: false, status: 'Active',
});

export const validateNomineeForm = (form: any): Record<string, string> => {
  const e: Record<string, string> = {};
  if (!form.fullName?.trim()) e.fullName = 'Nominee name is required.';
  if (!form.relationship) e.relationship = 'Relationship is required.';
  const pct = Number(form.percentage);
  if (form.percentage === '' || isNaN(pct) || pct < 0 || pct > 100) e.percentage = 'Enter 0–100.';
  if (form.aadhaar && !/^\d{12}$/.test(String(form.aadhaar).replace(/\s/g, ''))) e.aadhaar = 'Aadhaar must be 12 digits.';
  if (form.pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(String(form.pan).toUpperCase())) e.pan = 'Format: ABCDE1234F.';
  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Invalid email.';
  if (form.mobile && !/^\d{10}$/.test(String(form.mobile).replace(/\D/g, '').slice(-10))) e.mobile = 'Mobile must be 10 digits.';
  return e;
};

const fileToBase64 = (file: File) => new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = reject; r.readAsDataURL(file); });

export interface NomineeDoc { docType: string; fileName: string; mimeType: string; fileData: string; }

interface Props {
  open: boolean;
  initial?: any | null;          // existing nominee (edit) or null (add)
  existingDocsCount?: number;    // docs already on file (edit, shown as info)
  saving?: boolean;
  onClose: () => void;
  onSubmit: (nominee: any, pendingDocs: NomineeDoc[]) => void;
}

export const NomineeForm: React.FC<Props> = ({ open, initial, existingDocsCount, saving, onClose, onSubmit }) => {
  const [form, setForm] = useState<any>(emptyNominee());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pendingDocs, setPendingDocs] = useState<NomineeDoc[]>([]);

  useEffect(() => {
    if (!open) return;
    setForm(initial ? { ...emptyNominee(), ...initial, percentage: String(initial.percentage ?? ''), isEmergencyContact: !!initial.isEmergencyContact, isDependent: !!initial.isDependent, isLegalHeir: !!initial.isLegalHeir } : emptyNominee());
    setErrors({}); setPendingDocs([]);
  }, [open, initial]);

  const submit = () => {
    const e = validateNomineeForm(form);
    setErrors(e);
    if (Object.keys(e).length) return;
    onSubmit({ ...form, percentage: Number(form.percentage) }, pendingDocs);
  };

  const onPickFiles = async (files: FileList | null, docType: string) => {
    if (!files) return;
    for (const f of Array.from(files)) {
      if (f.size > 5 * 1024 * 1024) { setErrors(p => ({ ...p, doc: `${f.name} exceeds 5 MB.` })); continue; }
      const fileData = await fileToBase64(f);
      setPendingDocs(p => [...p, { docType, fileName: f.name, mimeType: f.type, fileData }]);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Edit Nominee' : 'Add Nominee'} size="xl"
      footer={<div className="flex justify-end gap-2"><Button variant="outline" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" loading={saving} onClick={submit}>{initial ? 'Save Changes' : 'Add Nominee'}</Button></div>}>
      <div className="space-y-4">
        <Section title="Basic Details">
          <Input label="Full Name *" value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} error={errors.fullName} />
          <Select label="Relationship *" value={form.relationship} onChange={e => setForm({ ...form, relationship: e.target.value })} options={RELATIONSHIPS.map(r => ({ value: r, label: r }))} error={errors.relationship} />
          <Input label="Nomination % *" type="number" value={form.percentage} onChange={e => setForm({ ...form, percentage: e.target.value })} error={errors.percentage} />
          <Input label="Date of Birth" type="date" value={(form.dob || '').slice(0, 10)} onChange={e => setForm({ ...form, dob: e.target.value })} />
          <Select label="Gender" value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value })} options={[{ value: 'Male', label: 'Male' }, { value: 'Female', label: 'Female' }, { value: 'Other', label: 'Other' }]} />
          <Select label="Marital Status" value={form.maritalStatus} onChange={e => setForm({ ...form, maritalStatus: e.target.value })} options={[{ value: '', label: '—' }, { value: 'MARRIED', label: 'Married' }, { value: 'UNMARRIED', label: 'Unmarried' }]} />
          <Input label="Mobile Number" value={form.mobile} onChange={e => setForm({ ...form, mobile: e.target.value })} error={errors.mobile} />
          <Input label="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} error={errors.email} />
          <Input label="Nationality" value={form.nationality} onChange={e => setForm({ ...form, nationality: e.target.value })} />
        </Section>

        <Section title="Identity Information">
          <Input label="Aadhaar Number" value={form.aadhaar} onChange={e => setForm({ ...form, aadhaar: e.target.value })} error={errors.aadhaar} />
          <Input label="PAN Number" value={form.pan} onChange={e => setForm({ ...form, pan: e.target.value.toUpperCase() })} error={errors.pan} />
          <Input label="Passport Number" value={form.passport} onChange={e => setForm({ ...form, passport: e.target.value })} />
          <Input label="Driving License" value={form.drivingLicense} onChange={e => setForm({ ...form, drivingLicense: e.target.value })} />
        </Section>

        <Section title="Address">
          <Input label="Country" value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} />
          <Input label="State" value={form.state} onChange={e => setForm({ ...form, state: e.target.value })} />
          <Input label="City" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} />
          <Input label="Postal Code" value={form.postalCode} onChange={e => setForm({ ...form, postalCode: e.target.value })} />
          <Input label="Address Line 1" value={form.addressLine1} onChange={e => setForm({ ...form, addressLine1: e.target.value })} />
          <Input label="Address Line 2" value={form.addressLine2} onChange={e => setForm({ ...form, addressLine2: e.target.value })} />
        </Section>

        <div>
          <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-2">Legal & Contact</p>
          <div className="flex flex-wrap gap-4">
            <Toggle label="Emergency Contact" checked={form.isEmergencyContact} onChange={v => setForm({ ...form, isEmergencyContact: v })} />
            <Toggle label="Dependent" checked={form.isDependent} onChange={v => setForm({ ...form, isDependent: v })} />
            <Toggle label="Legal Heir" checked={form.isLegalHeir} onChange={v => setForm({ ...form, isLegalHeir: v })} />
          </div>
        </div>

        <div>
          <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-2">Documents</p>
          <div className="flex flex-wrap gap-2 items-center">
            {DOC_TYPES.map(dt => (
              <label key={dt} className="text-[10px] font-semibold text-slate-600 border border-slate-200 rounded-lg px-2 py-1.5 cursor-pointer hover:bg-slate-50 flex items-center gap-1">
                <Upload size={11} /> {dt}
                <input type="file" className="hidden" onChange={e => onPickFiles(e.target.files, dt)} />
              </label>
            ))}
          </div>
          {pendingDocs.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {pendingDocs.map((d, i) => (
                <span key={i} className="inline-flex items-center gap-1 text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full px-2 py-0.5">
                  <FileText size={10} /> {d.docType}: {d.fileName}
                  <button onClick={() => setPendingDocs(p => p.filter((_, j) => j !== i))}><X size={10} /></button>
                </span>
              ))}
            </div>
          )}
          {!!existingDocsCount && <p className="text-[10px] text-slate-400 mt-1.5">{existingDocsCount} document(s) already on file.</p>}
          {errors.doc && <p className="text-[10px] text-rose-500 mt-1">{errors.doc}</p>}
        </div>
      </div>
    </Modal>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div>
    <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-2">{title}</p>
    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">{children}</div>
  </div>
);

const Toggle: React.FC<{ label: string; checked: boolean; onChange: (v: boolean) => void }> = ({ label, checked, onChange }) => (
  <label className="flex items-center gap-2 cursor-pointer">
    <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="rounded border-slate-300 text-blue-600" />
    <span className="text-xs font-semibold text-slate-700">{label}</span>
  </label>
);

export default NomineeForm;
