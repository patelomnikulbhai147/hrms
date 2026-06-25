import React, { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input, Select } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { api } from '@/api/apiClient';
import { ui } from '@/components/ui/feedback';
import { getApiErrorMessage } from '@/utils/apiError';
import {
  rawAadhaar, formatAadhaar, isValidAadhaar, AADHAAR_ERROR,
  rawPan, isValidPan, PAN_ERROR,
} from '@/utils/idFormat';
import {
  User, ShieldCheck, Landmark, MapPin, FileText, CheckCircle2, XCircle,
  Upload, Copy, Send, ChevronLeft, ChevronRight, Eye, Download, Save, Trash2,
  Phone, Users, GraduationCap,
} from 'lucide-react';

// ── Documents ─────────────────────────────────────────────────────────────────
const REQUIRED_DOCS = [
  { key: 'photo', label: 'Passport Size Photo' },
  { key: 'aadhaarDoc', label: 'Aadhaar Copy' },
  { key: 'panDoc', label: 'PAN Copy' },
  { key: 'bankProof', label: 'Bank Passbook / Cheque' },
];
const OPTIONAL_DOCS = [
  { key: 'resume', label: 'Resume' },
  { key: 'educationCert', label: 'Education Certificates' },
  { key: 'experienceLetter', label: 'Experience Certificates' },
  { key: 'other', label: 'Other Documents' },
];

const hasVal = (v: any) => v != null && String(v).trim() !== '';
const docPresent = (t: any, key: string) => {
  if (key === 'photo') return hasVal(t?.photoUpload);
  const e = t?.documents?.[key];
  if (!e) return false;
  if (typeof e === 'string') return e.trim() !== '';
  return !!(e.dataUrl || e.data || e.url || e.name);
};
const readFileAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = reject; r.readAsDataURL(file);
});
const joinParts = (...xs: any[]) => xs.map(x => String(x ?? '').trim()).filter(Boolean).join(', ');

const STEPS = [
  { id: 'personal', label: 'Personal', icon: User },
  { id: 'contact', label: 'Contact', icon: Phone },
  { id: 'identity', label: 'Identity', icon: ShieldCheck },
  { id: 'banking', label: 'Banking', icon: Landmark },
  { id: 'address', label: 'Address', icon: MapPin },
  { id: 'additional', label: 'Nominee & More', icon: Users },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'review', label: 'Review', icon: CheckCircle2 },
];

interface Props {
  open: boolean;
  temp: any | null;
  branchName?: string;
  companyName?: string;
  canSubmit?: boolean;
  onClose: () => void;
  onSaved: (updated: any) => void;
  onSubmitted: (updated: any) => void;
}

export const TempEmployeeOnboarding: React.FC<Props> = ({
  open, temp, branchName, companyName, canSubmit = true, onClose, onSaved, onSubmitted,
}) => {
  const [draft, setDraft] = useState<any>(temp || {});
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [ifscStatus, setIfscStatus] = useState<'idle' | 'verifying' | 'verified' | 'error'>('idle');
  const [ifscInfo, setIfscInfo] = useState<{ branch?: string; state?: string; city?: string; msg?: string }>({});

  // Seed the draft (flat keys) from the temp record's scalars + JSON sections.
  useEffect(() => {
    if (open && temp) {
      const sp = (temp.selfProfile && typeof temp.selfProfile === 'object') ? temp.selfProfile : {};
      const nom = temp.nominee || {}; const edu = temp.education || {}; const exp = temp.experience || {};
      const pa = sp.present || {}; const qa = sp.permanent || {};
      setDraft({
        ...temp,
        firstName: sp.firstName || '', middleName: sp.middleName || '', lastName: sp.lastName || '',
        maritalStatus: sp.maritalStatus || '', nationality: sp.nationality || 'Indian', bloodGroup: sp.bloodGroup || '',
        alternateMobile: sp.alternateMobile || '',
        emergencyContactName: sp.emergencyContactName || '', emergencyContactNumber: sp.emergencyContactNumber || '', relationship: sp.relationship || '',
        passport: sp.passport || '', drivingLicence: sp.drivingLicence || '', voterId: sp.voterId || '',
        accountHolderName: sp.accountHolderName || '', bankBranch: sp.bankBranch || '', accountType: sp.accountType || 'Savings',
        sameAsPresent: sp.sameAsPresent ?? false,
        p_line1: pa.line1 || '', p_line2: pa.line2 || '', p_area: pa.area || '', p_landmark: pa.landmark || '',
        p_city: pa.city || '', p_district: pa.district || '', p_state: pa.state || '', p_country: pa.country || 'India', p_pincode: pa.pincode || '',
        q_line1: qa.line1 || '', q_line2: qa.line2 || '', q_area: qa.area || '', q_landmark: qa.landmark || '',
        q_city: qa.city || '', q_district: qa.district || '', q_state: qa.state || '', q_country: qa.country || 'India', q_pincode: qa.pincode || '',
        nom_name: nom.name || '', nom_relationship: nom.relationship || '', nom_mobile: nom.mobile || '', nom_address: nom.address || '',
        edu_qualification: edu.highestQualification || '', edu_specialization: edu.specialization || '', edu_college: edu.college || '', edu_passingYear: edu.passingYear || '',
        exp_company: exp.previousCompany || '', exp_years: exp.experience || '', exp_designation: exp.previousDesignation || '',
      });
      setStep(0);
      setIfscStatus(temp.ifsc && temp.bankName ? 'verified' : 'idle');
      setIfscInfo({});
    }
  }, [open, temp?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch: any) => setDraft((d: any) => ({ ...d, ...patch }));
  const setDoc = (key: string, value: any) => setDraft((d: any) => ({ ...d, documents: { ...(d.documents || {}), [key]: value } }));

  const effectiveBranch = branchName || draft.branchLocation || '';

  // ── Live validation ─────────────────────────────────────────────────────────
  const aadhaarOk = isValidAadhaar(draft.aadhaar);
  const panOk = isValidPan(draft.pan);
  const mobileOk = /^\d{10}$/.test(String(draft.mobile || '').replace(/\D/g, ''));
  const composedName = useMemo(() => joinParts(draft.firstName, draft.middleName, draft.lastName).replace(/, /g, ' '), [draft.firstName, draft.middleName, draft.lastName]);

  // Required (starred) personal fields the EMPLOYEE must provide.
  const checklist = useMemo(() => {
    const items: { label: string; done: boolean }[] = [
      { label: 'First Name', done: hasVal(draft.firstName) },
      { label: 'Last Name', done: hasVal(draft.lastName) },
      { label: 'Gender', done: hasVal(draft.gender) },
      { label: 'Date of Birth', done: hasVal(draft.dob) },
      { label: 'Marital Status', done: hasVal(draft.maritalStatus) },
      { label: 'Nationality', done: hasVal(draft.nationality) },
      { label: 'Mobile', done: mobileOk },
      { label: 'Email', done: hasVal(draft.email) },
      { label: 'Emergency Name', done: hasVal(draft.emergencyContactName) },
      { label: 'Emergency Number', done: hasVal(draft.emergencyContactNumber) },
      { label: 'Relationship', done: hasVal(draft.relationship) },
      { label: 'Aadhaar', done: aadhaarOk },
      { label: 'PAN', done: panOk },
      { label: 'IFSC', done: hasVal(draft.ifsc) },
      { label: 'Account Number', done: hasVal(draft.accountNumber) },
      { label: 'Account Holder', done: hasVal(draft.accountHolderName) },
      { label: 'Address Line 1', done: hasVal(draft.p_line1) },
      { label: 'City', done: hasVal(draft.p_city) },
      { label: 'District', done: hasVal(draft.p_district) },
      { label: 'State', done: hasVal(draft.p_state) },
      { label: 'Country', done: hasVal(draft.p_country) },
      { label: 'PIN Code', done: hasVal(draft.p_pincode) },
      { label: 'Branch', done: hasVal(effectiveBranch) },
      ...REQUIRED_DOCS.map(d => ({ label: d.label, done: docPresent(draft, d.key) })),
    ];
    const done = items.filter(i => i.done).length;
    const pct = Math.round((done / items.length) * 100);
    return { items, done, total: items.length, pct, ok: done === items.length };
  }, [draft, effectiveBranch, aadhaarOk, panOk, mobileOk]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── IFSC auto-fetch ──────────────────────────────────────────────────────────
  const lookupIfsc = async (codeRaw: string) => {
    const code = codeRaw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11);
    set({ ifsc: code });
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(code)) { setIfscStatus('idle'); setIfscInfo({}); return; }
    setIfscStatus('verifying');
    try {
      const r: any = await api.ifsc.lookup(code);
      if (r && r.valid) {
        setIfscStatus('verified');
        setIfscInfo({ branch: r.bankBranch, state: r.bankState, city: r.bankCity });
        set({ ifsc: r.ifsc, bankName: r.bankName, bankBranch: r.bankBranch || draft.bankBranch });
      } else {
        setIfscStatus('error'); setIfscInfo({ msg: r?.error || 'Invalid IFSC — bank not found.' });
      }
    } catch (e: any) {
      setIfscStatus('error'); setIfscInfo({ msg: e?.message || 'Invalid IFSC — bank not found.' });
    }
  };

  // ── Persist ──────────────────────────────────────────────────────────────────
  const presentAddress = () => joinParts(draft.p_line1, draft.p_line2, draft.p_area, draft.p_landmark, draft.p_city, draft.p_district, draft.p_state, draft.p_country, draft.p_pincode);
  const permanentAddress = () => draft.sameAsPresent ? presentAddress() : joinParts(draft.q_line1, draft.q_line2, draft.q_area, draft.q_landmark, draft.q_city, draft.q_district, draft.q_state, draft.q_country, draft.q_pincode);
  const addrObj = (pfx: 'p_' | 'q_') => ({ line1: draft[pfx + 'line1'] || '', line2: draft[pfx + 'line2'] || '', area: draft[pfx + 'area'] || '', landmark: draft[pfx + 'landmark'] || '', city: draft[pfx + 'city'] || '', district: draft[pfx + 'district'] || '', state: draft[pfx + 'state'] || '', country: draft[pfx + 'country'] || '', pincode: draft[pfx + 'pincode'] || '' });

  const buildPatch = () => ({
    name: composedName || draft.name || '',
    mobile: draft.mobile, email: draft.email || null,
    gender: draft.gender || null, dob: draft.dob || null, fatherSpouseName: draft.fatherSpouseName || null,
    emergencyContact: joinParts(draft.emergencyContactName, draft.relationship && `(${draft.relationship})`, draft.emergencyContactNumber) || null,
    aadhaar: rawAadhaar(draft.aadhaar) || null, pan: rawPan(draft.pan) || null,
    bankName: draft.bankName || null, ifsc: draft.ifsc || null, accountNumber: draft.accountNumber || null,
    presentAddress: presentAddress() || null, permanentAddress: permanentAddress() || null,
    photoUpload: draft.photoUpload || null, documents: draft.documents || null,
    nominee: { name: draft.nom_name || '', relationship: draft.nom_relationship || '', mobile: draft.nom_mobile || '', address: draft.nom_address || '' },
    education: { highestQualification: draft.edu_qualification || '', specialization: draft.edu_specialization || '', college: draft.edu_college || '', passingYear: draft.edu_passingYear || '' },
    experience: { previousCompany: draft.exp_company || '', experience: draft.exp_years || '', previousDesignation: draft.exp_designation || '' },
    selfProfile: {
      firstName: draft.firstName || '', middleName: draft.middleName || '', lastName: draft.lastName || '',
      maritalStatus: draft.maritalStatus || '', nationality: draft.nationality || '', bloodGroup: draft.bloodGroup || '',
      alternateMobile: draft.alternateMobile || '',
      emergencyContactName: draft.emergencyContactName || '', emergencyContactNumber: draft.emergencyContactNumber || '', relationship: draft.relationship || '',
      passport: draft.passport || '', drivingLicence: draft.drivingLicence || '', voterId: draft.voterId || '',
      accountHolderName: draft.accountHolderName || '', bankBranch: draft.bankBranch || '', accountType: draft.accountType || '',
      sameAsPresent: !!draft.sameAsPresent, present: addrObj('p_'), permanent: draft.sameAsPresent ? addrObj('p_') : addrObj('q_'),
    },
  });

  const saveDraft = async (silent = false) => {
    if (!draft?.id) return null;
    setBusy(true);
    try {
      const updated: any = await api.temporaryEmployees.update(draft.id, buildPatch());
      if (!silent) ui.toast.success(`Saved — ${updated?.profileCompletion}% complete (${updated?.status}).`);
      onSaved(updated);
      return updated;
    } catch (e: any) { ui.toast.error(getApiErrorMessage(e, 'Could not save the profile.')); return null; }
    finally { setBusy(false); }
  };

  const submitForApproval = async () => {
    if (!checklist.ok) {
      const missing = checklist.items.filter(i => !i.done).map(i => i.label).join(', ');
      ui.toast.warning(`Still missing: ${missing}.`);
      return;
    }
    setBusy(true);
    try {
      await api.temporaryEmployees.update(draft.id, buildPatch());
      const res: any = await api.temporaryEmployees.submit(draft.id);
      ui.toast.success(`${composedName || draft.name} submitted for approval — now in the Pending Approvals queue.`);
      onSubmitted(res);
    } catch (e: any) {
      const data = e?.data || e?.response?.data;
      const miss = [...(data?.missingFields || []), ...(data?.missingDocs || [])].join(', ');
      ui.toast.error(miss ? `Cannot submit — missing: ${miss}.` : getApiErrorMessage(e, 'Could not submit for approval.'));
    } finally { setBusy(false); }
  };

  const onDocFile = async (key: string, file?: File | null) => {
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      if (key === 'photo') set({ photoUpload: dataUrl });
      else setDoc(key, { name: file.name, dataUrl });
    } catch { ui.toast.error('Could not read the selected file.'); }
  };

  if (!temp) return null;

  const isLast = step === STEPS.length - 1;
  const footer = (
    <>
      <span className="mr-auto text-[11px] font-semibold text-slate-400">Step {step + 1} of {STEPS.length} · {checklist.pct}% complete</span>
      {step > 0 && <Button variant="outline" size="sm" icon={<ChevronLeft size={14} />} onClick={() => setStep(s => Math.max(0, s - 1))}>Back</Button>}
      <Button variant="outline" size="sm" icon={<Save size={14} />} loading={busy} onClick={() => saveDraft(false)}>Save Draft</Button>
      {!isLast
        ? <Button size="sm" icon={<ChevronRight size={14} />} onClick={() => setStep(s => Math.min(STEPS.length - 1, s + 1))}>Next</Button>
        : <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" icon={<Send size={14} />} loading={busy} disabled={!canSubmit || !checklist.ok} onClick={submitForApproval} title={checklist.ok ? 'Submit for approval' : 'Complete all required items first'}>Submit for Approval</Button>}
    </>
  );

  const AddressFields: React.FC<{ pfx: 'p_' | 'q_'; disabled?: boolean }> = ({ pfx, disabled }) => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <Input label={pfx === 'p_' ? 'Address Line 1 *' : 'Address Line 1'} value={draft[pfx + 'line1'] || ''} disabled={disabled} onChange={e => set({ [pfx + 'line1']: e.target.value })} />
      <Input label="Address Line 2" value={draft[pfx + 'line2'] || ''} disabled={disabled} onChange={e => set({ [pfx + 'line2']: e.target.value })} />
      <Input label="Area / Locality" value={draft[pfx + 'area'] || ''} disabled={disabled} onChange={e => set({ [pfx + 'area']: e.target.value })} />
      <Input label="Landmark" value={draft[pfx + 'landmark'] || ''} disabled={disabled} onChange={e => set({ [pfx + 'landmark']: e.target.value })} />
      <Input label={pfx === 'p_' ? 'City *' : 'City'} value={draft[pfx + 'city'] || ''} disabled={disabled} onChange={e => set({ [pfx + 'city']: e.target.value })} />
      <Input label={pfx === 'p_' ? 'District *' : 'District'} value={draft[pfx + 'district'] || ''} disabled={disabled} onChange={e => set({ [pfx + 'district']: e.target.value })} />
      <Input label={pfx === 'p_' ? 'State *' : 'State'} value={draft[pfx + 'state'] || ''} disabled={disabled} onChange={e => set({ [pfx + 'state']: e.target.value })} />
      <Input label={pfx === 'p_' ? 'Country *' : 'Country'} value={draft[pfx + 'country'] || ''} disabled={disabled} onChange={e => set({ [pfx + 'country']: e.target.value })} />
      <Input label={pfx === 'p_' ? 'PIN Code *' : 'PIN Code'} className="font-mono" value={draft[pfx + 'pincode'] || ''} disabled={disabled} onChange={e => set({ [pfx + 'pincode']: e.target.value.replace(/\D/g, '').slice(0, 6) })} />
    </div>
  );

  return (
    <Modal
      open={open} onClose={onClose} variant="page"
      title={`Employee Onboarding — ${composedName || temp.name}`}
      subtitle={`${temp.tempEmployeeId} · Complete your personal profile & documents, then submit for approval`}
      breadcrumbs={[{ label: 'Employees', onClick: onClose }, { label: 'Temporary Employees', onClick: onClose }, { label: 'Complete Profile' }]}
      context={<span>{companyName || '—'}{effectiveBranch ? <span className="text-slate-400"> · {effectiveBranch}</span> : null}</span>}
      footer={footer}
      pageMaxWidth={1180}
    >
      {/* Completion tracker */}
      <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-bold text-slate-700">Profile Completion</span>
          <span className={`text-lg font-extrabold ${checklist.ok ? 'text-emerald-600' : 'text-indigo-600'}`}>{checklist.pct}%</span>
        </div>
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
          <div className={`h-full rounded-full transition-all ${checklist.ok ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${checklist.pct}%` }} />
        </div>
        <div className="mt-1 flex justify-between text-[9px] font-semibold text-slate-300">
          {[0, 25, 50, 75, 100].map(m => <span key={m} className={checklist.pct >= m ? 'text-slate-500' : ''}>{m}%</span>)}
        </div>
      </div>

      {/* Stepper */}
      <div className="mb-5 flex items-center gap-1 overflow-x-auto pb-1">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const active = i === step;
          return (
            <React.Fragment key={s.id}>
              <button onClick={() => setStep(i)} className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-bold whitespace-nowrap transition ${active ? 'bg-indigo-600 text-white shadow' : 'bg-white border border-slate-200 text-slate-500 hover:text-indigo-600'}`}>
                <Icon size={13} /> <span className="hidden sm:inline">{i + 1}. {s.label}</span><span className="sm:hidden">{i + 1}</span>
              </button>
              {i < STEPS.length - 1 && <ChevronRight size={12} className="text-slate-300 shrink-0" />}
            </React.Fragment>
          );
        })}
      </div>

      {/* ── Step 1: Personal ── */}
      {step === 0 && (
        <Section title="Personal Information" icon={User}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Input label="First Name *" value={draft.firstName || ''} onChange={e => set({ firstName: e.target.value })} />
            <Input label="Middle Name" value={draft.middleName || ''} onChange={e => set({ middleName: e.target.value })} />
            <Input label="Last Name *" value={draft.lastName || ''} onChange={e => set({ lastName: e.target.value })} />
            <Select label="Gender *" value={draft.gender || ''} onChange={e => set({ gender: e.target.value })} options={[{ value: '', label: '—' }, { value: 'Male', label: 'Male' }, { value: 'Female', label: 'Female' }, { value: 'Other', label: 'Other' }]} />
            <Input label="Date of Birth *" type="date" value={draft.dob || ''} onChange={e => set({ dob: e.target.value })} />
            <Select label="Marital Status *" value={draft.maritalStatus || ''} onChange={e => set({ maritalStatus: e.target.value })} options={[{ value: '', label: '—' }, ...['Single', 'Married', 'Divorced', 'Widowed'].map(s => ({ value: s, label: s }))]} />
            <Input label="Nationality *" value={draft.nationality || ''} onChange={e => set({ nationality: e.target.value })} placeholder="e.g. Indian" />
            <Select label="Blood Group" value={draft.bloodGroup || ''} onChange={e => set({ bloodGroup: e.target.value })} options={[{ value: '', label: '—' }, ...['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map(s => ({ value: s, label: s }))]} />
            <Input label="Father / Spouse Name" value={draft.fatherSpouseName || ''} onChange={e => set({ fatherSpouseName: e.target.value })} />
          </div>
          <p className="mt-3 text-[10px] text-slate-400">Department, designation, salary and other employment details are assigned by HR after your profile is approved.</p>
        </Section>
      )}

      {/* ── Step 2: Contact ── */}
      {step === 1 && (
        <Section title="Contact Information" icon={Phone}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Input label="Mobile Number *" value={draft.mobile || ''} onChange={e => set({ mobile: e.target.value.replace(/\D/g, '').slice(0, 10) })} placeholder="10-digit mobile" error={draft.mobile && !mobileOk ? 'Enter a valid 10-digit mobile number.' : undefined} />
            <Input label="Alternate Mobile" value={draft.alternateMobile || ''} onChange={e => set({ alternateMobile: e.target.value.replace(/\D/g, '').slice(0, 10) })} placeholder="Optional" />
            <Input label="Personal Email *" type="email" value={draft.email || ''} onChange={e => set({ email: e.target.value })} placeholder="name@email.com" />
            <Input label="Emergency Contact Name *" value={draft.emergencyContactName || ''} onChange={e => set({ emergencyContactName: e.target.value })} />
            <Input label="Emergency Contact Number *" value={draft.emergencyContactNumber || ''} onChange={e => set({ emergencyContactNumber: e.target.value.replace(/\D/g, '').slice(0, 10) })} />
            <Input label="Relationship *" value={draft.relationship || ''} onChange={e => set({ relationship: e.target.value })} placeholder="e.g. Father / Spouse" />
          </div>
        </Section>
      )}

      {/* ── Step 3: Identity ── */}
      {step === 2 && (
        <Section title="Identity Details" icon={ShieldCheck}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <Input label="Aadhaar Number *" className="font-mono tracking-wider" value={formatAadhaar(draft.aadhaar)} placeholder="1234 5678 9012"
                onChange={e => set({ aadhaar: rawAadhaar(e.target.value) })}
                error={hasVal(draft.aadhaar) && !aadhaarOk ? AADHAAR_ERROR : undefined} />
              <p className="mt-1 text-[10px] text-slate-400 flex items-center gap-1">{aadhaarOk ? <CheckCircle2 size={11} className="text-emerald-500" /> : null}12 digits · numbers only</p>
            </div>
            <div>
              <Input label="PAN Number *" className="font-mono uppercase tracking-wider" value={rawPan(draft.pan)} placeholder="ABCDE1234F"
                onChange={e => set({ pan: rawPan(e.target.value) })}
                error={hasVal(draft.pan) && !panOk ? PAN_ERROR : undefined} />
              <p className="mt-1 text-[10px] text-slate-400 flex items-center gap-1">{panOk ? <CheckCircle2 size={11} className="text-emerald-500" /> : null}10 characters · auto-uppercase</p>
            </div>
            <Input label="Passport Number" className="font-mono uppercase" value={draft.passport || ''} onChange={e => set({ passport: e.target.value.toUpperCase() })} placeholder="Optional" />
            <Input label="Driving Licence Number" className="font-mono uppercase" value={draft.drivingLicence || ''} onChange={e => set({ drivingLicence: e.target.value.toUpperCase() })} placeholder="Optional" />
            <Input label="Voter ID" className="font-mono uppercase" value={draft.voterId || ''} onChange={e => set({ voterId: e.target.value.toUpperCase() })} placeholder="Optional" />
          </div>
        </Section>
      )}

      {/* ── Step 4: Banking ── */}
      {step === 3 && (
        <Section title="Banking Details" icon={Landmark}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Input label="IFSC Code *" className="font-mono uppercase" value={draft.ifsc || ''} placeholder="HDFC0001234" onChange={e => lookupIfsc(e.target.value)} />
            <Input label="Bank Name (auto)" value={draft.bankName || ''} onChange={e => set({ bankName: e.target.value })} />
            <Input label="Branch Name (auto)" value={draft.bankBranch || ''} onChange={e => set({ bankBranch: e.target.value })} />
            <Input label="Account Number *" className="font-mono" value={draft.accountNumber || ''} placeholder="Numbers only" onChange={e => set({ accountNumber: e.target.value.replace(/\D/g, '') })} />
            <Input label="Account Holder Name *" value={draft.accountHolderName || ''} onChange={e => set({ accountHolderName: e.target.value })} />
            <Select label="Account Type" value={draft.accountType || ''} onChange={e => set({ accountType: e.target.value })} options={[{ value: '', label: '—' }, { value: 'Savings', label: 'Savings' }, { value: 'Current', label: 'Current' }]} />
          </div>
          {ifscStatus !== 'idle' && (
            <p className={`mt-2 text-[11px] font-semibold ${ifscStatus === 'verifying' ? 'text-slate-400' : ifscStatus === 'verified' ? 'text-emerald-600' : 'text-rose-600'}`}>
              {ifscStatus === 'verifying' && 'Verifying IFSC…'}
              {ifscStatus === 'verified' && '✓ IFSC verified'}
              {ifscStatus === 'error' && `✗ ${ifscInfo.msg}`}
            </p>
          )}
          {ifscStatus === 'verified' && draft.bankName && (
            <div className="mt-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-[11px]">
              <p className="font-extrabold text-emerald-700 uppercase tracking-wide mb-1">Bank verified</p>
              <span className="text-slate-700">{draft.bankName}{ifscInfo.branch ? ` · ${ifscInfo.branch}` : ''}{ifscInfo.city ? ` · ${ifscInfo.city}` : ''}{ifscInfo.state ? ` · ${ifscInfo.state}` : ''}</span>
            </div>
          )}
        </Section>
      )}

      {/* ── Step 5: Address ── */}
      {step === 4 && (
        <div className="space-y-5">
          <Section title="Present Address" icon={MapPin}>
            <AddressFields pfx="p_" />
          </Section>
          <Section title="Permanent Address" icon={MapPin}>
            <label className="mb-3 flex items-center gap-2 text-[11px] font-semibold text-indigo-600 cursor-pointer w-fit">
              <input type="checkbox" checked={!!draft.sameAsPresent} onChange={e => set({ sameAsPresent: e.target.checked })} />
              <Copy size={12} /> Same as Present Address
            </label>
            {draft.sameAsPresent
              ? <p className="text-[11px] text-slate-400">Permanent address will mirror the present address above.</p>
              : <AddressFields pfx="q_" />}
          </Section>
        </div>
      )}

      {/* ── Step 6: Nominee, Education & Previous Employment ── */}
      {step === 5 && (
        <div className="space-y-5">
          <Section title="Nominee Information" icon={Users}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Input label="Nominee Name" value={draft.nom_name || ''} onChange={e => set({ nom_name: e.target.value })} />
              <Input label="Relationship" value={draft.nom_relationship || ''} onChange={e => set({ nom_relationship: e.target.value })} />
              <Input label="Mobile Number" value={draft.nom_mobile || ''} onChange={e => set({ nom_mobile: e.target.value.replace(/\D/g, '').slice(0, 10) })} />
              <Input label="Address" value={draft.nom_address || ''} onChange={e => set({ nom_address: e.target.value })} />
            </div>
          </Section>
          <Section title="Education" icon={GraduationCap}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Input label="Highest Qualification" value={draft.edu_qualification || ''} onChange={e => set({ edu_qualification: e.target.value })} />
              <Input label="Specialization" value={draft.edu_specialization || ''} onChange={e => set({ edu_specialization: e.target.value })} />
              <Input label="College / University" value={draft.edu_college || ''} onChange={e => set({ edu_college: e.target.value })} />
              <Input label="Passing Year" className="font-mono" value={draft.edu_passingYear || ''} onChange={e => set({ edu_passingYear: e.target.value.replace(/\D/g, '').slice(0, 4) })} />
            </div>
          </Section>
          <Section title="Previous Employment (Optional)" icon={User}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <Input label="Previous Company" value={draft.exp_company || ''} onChange={e => set({ exp_company: e.target.value })} />
              <Input label="Experience (years)" value={draft.exp_years || ''} onChange={e => set({ exp_years: e.target.value })} />
              <Input label="Previous Designation" value={draft.exp_designation || ''} onChange={e => set({ exp_designation: e.target.value })} />
            </div>
          </Section>
        </div>
      )}

      {/* ── Step 7: Documents ── */}
      {step === 6 && (
        <Section title="Documents" icon={FileText}>
          <p className="text-[11px] font-bold text-slate-500 mb-2">Required</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {REQUIRED_DOCS.map(d => <DocSlot key={d.key} doc={d} required draft={draft} onFile={onDocFile} onClear={() => d.key === 'photo' ? set({ photoUpload: null }) : setDoc(d.key, null)} />)}
          </div>
          <p className="text-[11px] font-bold text-slate-500 mt-5 mb-2">Optional</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {OPTIONAL_DOCS.map(d => <DocSlot key={d.key} doc={d} draft={draft} onFile={onDocFile} onClear={() => setDoc(d.key, null)} />)}
          </div>
        </Section>
      )}

      {/* ── Step 8: Review ── */}
      {step === 7 && (
        <Section title="Review & Submit" icon={CheckCircle2}>
          <div className={`mb-4 rounded-xl border px-4 py-3 ${checklist.ok ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
            <p className={`text-xs font-bold flex items-center gap-1.5 ${checklist.ok ? 'text-emerald-700' : 'text-amber-700'}`}>
              {checklist.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
              {checklist.ok ? 'All required information provided — ready to submit for approval.' : `${checklist.total - checklist.done} item(s) still required before approval.`}
            </p>
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-3 gap-y-1">
              {checklist.items.map(it => (
                <span key={it.label} className={`text-[10px] flex items-center gap-1 ${it.done ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {it.done ? <CheckCircle2 size={11} /> : <XCircle size={11} />}{it.label}
                </span>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2">
            {([
              ['Full Name', composedName], ['Gender', draft.gender], ['Date of Birth', draft.dob],
              ['Marital Status', draft.maritalStatus], ['Nationality', draft.nationality], ['Blood Group', draft.bloodGroup],
              ['Mobile', draft.mobile], ['Alt Mobile', draft.alternateMobile], ['Email', draft.email],
              ['Emergency', joinParts(draft.emergencyContactName, draft.relationship && `(${draft.relationship})`, draft.emergencyContactNumber)],
              ['Aadhaar', draft.aadhaar ? formatAadhaar(draft.aadhaar) : ''], ['PAN', rawPan(draft.pan)],
              ['Passport', draft.passport], ['Driving Licence', draft.drivingLicence], ['Voter ID', draft.voterId],
              ['Bank', draft.bankName], ['IFSC', draft.ifsc], ['Account No.', draft.accountNumber],
              ['Account Holder', draft.accountHolderName], ['Account Type', draft.accountType], ['Branch', effectiveBranch],
            ] as [string, string][]).map(([k, v]) => (
              <div key={k} className="flex flex-col border-b border-slate-100 py-1">
                <span className="text-[9px] uppercase tracking-wide text-slate-400">{k}</span>
                <span className="text-[12px] font-semibold text-slate-700">{v || '—'}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
            <div className="flex flex-col"><span className="text-[9px] uppercase tracking-wide text-slate-400">Present Address</span><span className="text-[12px] font-semibold text-slate-700">{presentAddress() || '—'}</span></div>
            <div className="flex flex-col"><span className="text-[9px] uppercase tracking-wide text-slate-400">Permanent Address</span><span className="text-[12px] font-semibold text-slate-700">{permanentAddress() || '—'}</span></div>
          </div>
          <div className="mt-3">
            <span className="text-[9px] uppercase tracking-wide text-slate-400">Documents</span>
            <div className="mt-1 flex flex-wrap gap-2">
              {[...REQUIRED_DOCS, ...OPTIONAL_DOCS].map(d => {
                const present = docPresent(draft, d.key);
                return <span key={d.key} className={`text-[10px] font-semibold rounded-full px-2 py-0.5 border flex items-center gap-1 ${present ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-400'}`}>{present ? <CheckCircle2 size={10} /> : <XCircle size={10} />}{d.label}</span>;
              })}
            </div>
          </div>
        </Section>
      )}
    </Modal>
  );
};

// ── Small presentational helpers ──────────────────────────────────────────────
const Section: React.FC<{ title: string; icon: React.ElementType; children: React.ReactNode }> = ({ title, icon: Icon, children }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-4 md:p-5 shadow-sm">
    <h3 className="mb-4 flex items-center gap-2 text-sm font-extrabold text-slate-800"><Icon size={16} className="text-indigo-600" />{title}</h3>
    {children}
  </div>
);

const DocSlot: React.FC<{ doc: { key: string; label: string }; required?: boolean; draft: any; onFile: (k: string, f?: File | null) => void; onClear: () => void }> = ({ doc, required, draft, onFile, onClear }) => {
  const present = docPresent(draft, doc.key);
  const src = doc.key === 'photo' ? draft.photoUpload : draft.documents?.[doc.key]?.dataUrl;
  const fname = doc.key === 'photo' ? 'Photo' : (draft.documents?.[doc.key]?.name || (present ? 'Uploaded' : ''));
  return (
    <div className={`rounded-xl border p-3 transition ${present ? 'border-emerald-200 bg-emerald-50/60' : 'border-dashed border-slate-300 bg-white'}`}>
      <div className="flex items-center justify-between">
        <span className={`text-[11px] font-bold flex items-center gap-1 ${present ? 'text-emerald-700' : 'text-slate-600'}`}>
          {present ? <CheckCircle2 size={13} /> : <Upload size={13} />}{doc.label}{required && <span className="text-rose-400">*</span>}
        </span>
        {present && (
          <span className="flex items-center gap-1.5">
            {src && <a href={src} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-indigo-600" title="View"><Eye size={13} /></a>}
            {src && <a href={src} download={fname} className="text-slate-400 hover:text-indigo-600" title="Download"><Download size={13} /></a>}
            <button onClick={onClear} className="text-slate-400 hover:text-rose-600" title="Remove"><Trash2 size={13} /></button>
          </span>
        )}
      </div>
      {fname && <p className="mt-0.5 text-[9px] text-slate-400 truncate">{fname}</p>}
      <label className="mt-2 block cursor-pointer text-center rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 py-1.5 text-[10px] font-semibold text-indigo-600 transition">
        {present ? 'Replace file' : 'Choose file'}
        <input type="file" data-doc={doc.key} accept={doc.key === 'photo' ? 'image/*' : 'image/*,application/pdf'} className="hidden" onChange={e => onFile(doc.key, e.target.files?.[0])} />
      </label>
    </div>
  );
};

export default TempEmployeeOnboarding;
