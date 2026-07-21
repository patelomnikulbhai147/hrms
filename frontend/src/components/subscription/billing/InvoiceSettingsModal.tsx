// Invoice Settings — Super Admin customization for the Subscription Billing
// invoice document: branding/logo, address & contact, statutory ids, bank +
// UPI, invoice prefix, payment terms, default notes/terms, footer and the
// authorized signature. Saved server-side (file store, no schema change) and
// applied instantly to every rendered/printed/emailed invoice.
import React, { useEffect, useState } from 'react';
import { Save, X, Building2, Landmark, FileText, PenLine, Upload, Trash2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { api } from '@/api/apiClient';
import { ui } from '@/components/ui/feedback';
import { getApiErrorMessage } from '@/utils/apiError';

interface Props { onClose: () => void; onSaved?: () => void; }

const inputCls = 'w-full h-10 px-3 rounded-xl border border-hairline bg-surface text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10';
const areaCls = 'w-full px-3 py-2 rounded-xl border border-hairline bg-surface text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 resize-y';

const Field: React.FC<{ label: string; children: React.ReactNode; full?: boolean }> = ({ label, children, full }) => (
  <div className={full ? 'md:col-span-2' : ''}>
    <label className="block text-[11px] font-bold text-ink-muted uppercase tracking-wider mb-1.5">{label}</label>
    {children}
  </div>
);

const Section: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
  <div className="mb-6">
    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-hairline">
      <span className="text-brand-600">{icon}</span>
      <h3 className="text-[13px] font-bold text-ink">{title}</h3>
    </div>
    <div className="grid md:grid-cols-2 gap-3">{children}</div>
  </div>
);

export const InvoiceSettingsModal: React.FC<Props> = ({ onClose, onSaved }) => {
  const [s, setS] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try { setS(await api.subscriptionInvoices.getSettings()); }
      catch (e) { ui.toast.error(getApiErrorMessage(e)); }
      finally { setLoading(false); }
    })();
  }, []);

  const set = (k: string, v: any) => setS((p: any) => ({ ...p, [k]: v }));

  // Read an image file as a base64 data-URI (logo / signature). Kept small so the
  // JSON settings file and the rendered invoice stay light.
  const readImage = (file: File | undefined, key: 'logo' | 'signatureImage') => {
    if (!file) return;
    if (file.size > 400 * 1024) { ui.toast.error('Please use an image under 400 KB.'); return; }
    const r = new FileReader();
    r.onload = () => set(key, String(r.result || ''));
    r.readAsDataURL(file);
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.subscriptionInvoices.updateSettings(s);
      ui.toast.success('Invoice settings saved — applied to all invoices.');
      onSaved?.();
      onClose();
    } catch (e) { ui.toast.error(getApiErrorMessage(e)); }
    finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title="Invoice Settings" size="lg">
      {loading || !s ? (
        <div className="py-16 text-center text-ink-muted text-sm">Loading settings…</div>
      ) : (
        <div className="max-h-[65vh] overflow-y-auto pr-1">
          <Section icon={<Building2 size={15} />} title="Company & Branding">
            <Field label="Display Name"><input className={inputCls} value={s.name || ''} onChange={e => set('name', e.target.value)} /></Field>
            <Field label="Legal Name (printed)"><input className={inputCls} value={s.legalName || ''} onChange={e => set('legalName', e.target.value)} /></Field>
            <Field label="Tagline"><input className={inputCls} value={s.tagline || ''} onChange={e => set('tagline', e.target.value)} /></Field>
            <Field label="Accent Colour">
              <div className="flex gap-2 items-center">
                <input type="color" className="h-10 w-14 rounded-lg border border-hairline bg-surface" value={s.accentColor || '#7c3aed'} onChange={e => set('accentColor', e.target.value)} />
                <input className={inputCls} value={s.accentColor || ''} onChange={e => set('accentColor', e.target.value)} />
              </div>
            </Field>
            <Field label="Logo" full>
              <div className="flex items-center gap-3">
                {s.logo ? <img src={s.logo} alt="logo" className="h-12 w-12 object-contain rounded-lg border border-hairline bg-white" /> : <div className="h-12 w-12 rounded-lg border border-dashed border-hairline grid place-items-center text-[10px] text-ink-muted">None</div>}
                <label className="inline-flex items-center gap-2 h-9 px-3 rounded-xl border border-hairline text-[13px] font-semibold cursor-pointer hover:bg-surface-muted">
                  <Upload size={14} /> Upload
                  <input type="file" accept="image/*" className="hidden" onChange={e => readImage(e.target.files?.[0], 'logo')} />
                </label>
                {s.logo && <button onClick={() => set('logo', '')} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-rose-200 text-rose-600 text-[13px] font-semibold hover:bg-rose-50"><Trash2 size={14} /> Remove</button>}
              </div>
            </Field>
          </Section>

          <Section icon={<Building2 size={15} />} title="Address & Contact">
            <Field label="Address Line 1" full><input className={inputCls} value={s.addressLine1 || ''} onChange={e => set('addressLine1', e.target.value)} /></Field>
            <Field label="Address Line 2" full><input className={inputCls} value={s.addressLine2 || ''} onChange={e => set('addressLine2', e.target.value)} /></Field>
            <Field label="City"><input className={inputCls} value={s.city || ''} onChange={e => set('city', e.target.value)} /></Field>
            <Field label="State"><input className={inputCls} value={s.state || ''} onChange={e => set('state', e.target.value)} /></Field>
            <Field label="Pincode"><input className={inputCls} value={s.pincode || ''} onChange={e => set('pincode', e.target.value)} /></Field>
            <Field label="Country"><input className={inputCls} value={s.country || ''} onChange={e => set('country', e.target.value)} /></Field>
            <Field label="Phone"><input className={inputCls} value={s.phone || ''} onChange={e => set('phone', e.target.value)} /></Field>
            <Field label="Email"><input className={inputCls} value={s.email || ''} onChange={e => set('email', e.target.value)} /></Field>
            <Field label="Website"><input className={inputCls} value={s.website || ''} onChange={e => set('website', e.target.value)} /></Field>
          </Section>

          <Section icon={<FileText size={15} />} title="Statutory & Numbering">
            <Field label="GSTIN"><input className={inputCls} value={s.gstin || ''} onChange={e => set('gstin', e.target.value.toUpperCase())} /></Field>
            <Field label="PAN"><input className={inputCls} value={s.pan || ''} onChange={e => set('pan', e.target.value.toUpperCase())} /></Field>
            <Field label="Invoice Prefix"><input className={inputCls} value={s.invoicePrefix || ''} onChange={e => set('invoicePrefix', e.target.value)} placeholder="ZEN-INV" /></Field>
            <Field label="Payment Terms"><input className={inputCls} value={s.paymentTerms || ''} onChange={e => set('paymentTerms', e.target.value)} /></Field>
            <div className="md:col-span-2 flex items-center gap-2">
              <input id="ro" type="checkbox" className="w-4 h-4 accent-brand-600" checked={!!s.roundOff} onChange={e => set('roundOff', e.target.checked)} />
              <label htmlFor="ro" className="text-[13px] text-ink-secondary">Show a <b>Round Off</b> line when the total carries a rounding difference</label>
            </div>
            <p className="md:col-span-2 text-[11px] text-ink-muted -mt-1">Next invoice number: <b>{(s.invoicePrefix || 'ZEN-INV')}-{new Date().getFullYear()}-0001</b></p>
          </Section>

          <Section icon={<Landmark size={15} />} title="Bank & Payment">
            <Field label="Account Name"><input className={inputCls} value={s.bankAccountName || ''} onChange={e => set('bankAccountName', e.target.value)} /></Field>
            <Field label="Bank Name"><input className={inputCls} value={s.bankName || ''} onChange={e => set('bankName', e.target.value)} /></Field>
            <Field label="Account Number"><input className={inputCls} value={s.bankAccountNumber || ''} onChange={e => set('bankAccountNumber', e.target.value)} /></Field>
            <Field label="IFSC Code"><input className={inputCls} value={s.bankIfsc || ''} onChange={e => set('bankIfsc', e.target.value.toUpperCase())} /></Field>
            <Field label="Branch"><input className={inputCls} value={s.bankBranch || ''} onChange={e => set('bankBranch', e.target.value)} /></Field>
            <Field label="UPI ID"><input className={inputCls} value={s.upiId || ''} onChange={e => set('upiId', e.target.value)} /></Field>
            <div className="md:col-span-2 flex items-center gap-2">
              <input id="qr" type="checkbox" className="w-4 h-4 accent-brand-600" checked={!!s.showQrPlaceholder} onChange={e => set('showQrPlaceholder', e.target.checked)} />
              <label htmlFor="qr" className="text-[13px] text-ink-secondary">Show the <b>Scan to Pay</b> QR block on the invoice</label>
            </div>
          </Section>

          <Section icon={<PenLine size={15} />} title="Notes, Terms & Signature">
            <Field label="Default Notes" full><textarea rows={2} className={areaCls} value={s.defaultNotes || ''} onChange={e => set('defaultNotes', e.target.value)} /></Field>
            <Field label="Default Terms & Conditions" full><textarea rows={3} className={areaCls} value={s.defaultTerms || ''} onChange={e => set('defaultTerms', e.target.value)} /></Field>
            <Field label="Footer Text" full><input className={inputCls} value={s.footerText || ''} onChange={e => set('footerText', e.target.value)} /></Field>
            <Field label="Signatory Name"><input className={inputCls} value={s.signatoryName || ''} onChange={e => set('signatoryName', e.target.value)} /></Field>
            <Field label="Signature Image">
              <div className="flex items-center gap-3">
                {s.signatureImage ? <img src={s.signatureImage} alt="signature" className="h-10 object-contain rounded border border-hairline bg-white px-1" /> : <span className="text-[11px] text-ink-muted">None</span>}
                <label className="inline-flex items-center gap-2 h-9 px-3 rounded-xl border border-hairline text-[13px] font-semibold cursor-pointer hover:bg-surface-muted">
                  <Upload size={14} /> Upload
                  <input type="file" accept="image/*" className="hidden" onChange={e => readImage(e.target.files?.[0], 'signatureImage')} />
                </label>
                {s.signatureImage && <button onClick={() => set('signatureImage', '')} className="text-rose-600 text-[13px] font-semibold">Remove</button>}
              </div>
            </Field>
          </Section>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-4 border-t border-hairline mt-2">
        <Button variant="outline" icon={<X size={15} />} onClick={onClose}>Cancel</Button>
        <Button icon={<Save size={15} />} onClick={save} loading={saving} disabled={loading}>Save Settings</Button>
      </div>
    </Modal>
  );
};

export default InvoiceSettingsModal;
