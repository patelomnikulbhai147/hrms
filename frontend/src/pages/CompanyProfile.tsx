import React, { useState, useEffect, useRef } from 'react';
import {
  Building2, FileText, ShieldCheck, Palette, GitBranch, History,
  Plus, Edit, Trash2, Upload, X, Download, Save, AlertTriangle, CheckCircle2,
  Clock, Search, ExternalLink,
} from 'lucide-react';
import type { Role, Company } from '@/types';
import type { UserAccount } from '@/pages/Login';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { BrandingPreview } from '@/components/branding/BrandingPreview';
import { resolveBranding } from '@/services/brandingService';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Table, Thead, Tbody, Th, Td, Tr } from '@/components/ui/Table';
import { ExportMenu } from '@/components/ui/ExportMenu';
import { usePermissions } from '@/context/PermissionContext';
import { api } from '@/api/apiClient';
import { ui } from '@/components/ui/feedback';
import { formatDate, formatDateTime } from '@/utils/formatDate';
import { getApiErrorMessage } from '@/utils/apiError';
import { ComplianceManagement } from '@/components/companyProfile/ComplianceManagement';

// ── Field configuration ──────────────────────────────────────────────────────
type FieldType = 'text' | 'textarea' | 'date' | 'email' | 'select' | 'website' | 'social';
interface FieldDef { key: string; label: string; type?: FieldType; options?: string[]; readOnly?: boolean; }

// ── URL helpers (Website + Social Media Links) ───────────────────────────────
const URL_ERROR = 'Please enter a valid website or social media URL.';
// Prepend https:// when the scheme is missing (company.com → https://company.com).
const normalizeUrl = (raw: string): string => {
  const v = String(raw || '').trim();
  if (!v) return '';
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
};
const isValidUrl = (raw: string): boolean => {
  const v = normalizeUrl(raw);
  if (!v) return true; // empty is allowed
  try { const u = new URL(v); return !!u.hostname && u.hostname.includes('.'); } catch { return false; }
};
// A token counts as a URL (vs a plain label line) when it has a scheme or a dot
// and no spaces — so "LinkedIn" stays a label but "linkedin.com/x" is a link.
const isUrlish = (t: string): boolean => /^https?:\/\//i.test(t) || (/\./.test(t) && !/\s/.test(t));
const splitLinks = (raw: string): string[] => String(raw || '').split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
const normalizeSocial = (raw: string): string =>
  splitLinks(raw).map(t => (isUrlish(t) ? normalizeUrl(t) : t)).join('\n');

const COMPANY_TYPES = ['Private Limited', 'Public Limited', 'LLP', 'Partnership', 'Proprietorship', 'Trust', 'NGO', 'Government', 'Other'];

// ── Structured location data (searchable dropdowns) ──────────────────────────
// India-first (default). Country list covers the world; state list is exhaustive
// for India; city lists are the major cities per state with manual entry always
// allowed for anything not listed. Pure UI data — no backend involvement.
const COUNTRIES = [
  'India', 'United States', 'United Kingdom', 'United Arab Emirates', 'Australia', 'Canada', 'Singapore',
  'Germany', 'France', 'Netherlands', 'Ireland', 'Switzerland', 'Sweden', 'Spain', 'Italy', 'Belgium',
  'Saudi Arabia', 'Qatar', 'Kuwait', 'Bahrain', 'Oman', 'Japan', 'China', 'Hong Kong', 'South Korea',
  'Malaysia', 'Indonesia', 'Thailand', 'Vietnam', 'Philippines', 'Bangladesh', 'Sri Lanka', 'Nepal',
  'Pakistan', 'New Zealand', 'South Africa', 'Nigeria', 'Kenya', 'Egypt', 'Israel', 'Turkey', 'Russia',
  'Brazil', 'Mexico', 'Argentina', 'Chile', 'Portugal', 'Poland', 'Austria', 'Denmark', 'Norway',
  'Finland', 'Greece', 'Czech Republic', 'Hungary', 'Romania', 'Ukraine', 'Mauritius', 'Fiji', 'Other',
];
const INDIA_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  // Union Territories
  'Andaman & Nicobar Islands', 'Chandigarh', 'Dadra & Nagar Haveli and Daman & Diu', 'Delhi',
  'Jammu & Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];
const CITY_BY_STATE: Record<string, string[]> = {
  'Gujarat': ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot', 'Bhavnagar', 'Jamnagar', 'Gandhinagar', 'Junagadh', 'Anand', 'Nadiad', 'Mehsana', 'Bharuch'],
  'Maharashtra': ['Mumbai', 'Pune', 'Nagpur', 'Nashik', 'Thane', 'Aurangabad', 'Solapur', 'Kolhapur', 'Navi Mumbai', 'Amravati'],
  'Karnataka': ['Bengaluru', 'Mysuru', 'Hubli', 'Mangaluru', 'Belagavi', 'Kalaburagi', 'Davanagere', 'Ballari', 'Tumakuru'],
  'Tamil Nadu': ['Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Salem', 'Tirunelveli', 'Erode', 'Vellore', 'Tiruppur'],
  'Delhi': ['New Delhi', 'Delhi', 'Dwarka', 'Rohini', 'Saket', 'Karol Bagh', 'Pitampura'],
  'Telangana': ['Hyderabad', 'Warangal', 'Nizamabad', 'Karimnagar', 'Khammam', 'Secunderabad'],
  'Rajasthan': ['Jaipur', 'Jodhpur', 'Udaipur', 'Kota', 'Ajmer', 'Bikaner', 'Bhilwara', 'Alwar'],
  'Uttar Pradesh': ['Lucknow', 'Kanpur', 'Ghaziabad', 'Agra', 'Varanasi', 'Meerut', 'Noida', 'Prayagraj', 'Bareilly'],
  'West Bengal': ['Kolkata', 'Howrah', 'Durgapur', 'Asansol', 'Siliguri', 'Darjeeling'],
  'Haryana': ['Gurugram', 'Faridabad', 'Panipat', 'Ambala', 'Karnal', 'Hisar', 'Rohtak'],
  'Punjab': ['Ludhiana', 'Amritsar', 'Jalandhar', 'Patiala', 'Bathinda', 'Mohali'],
  'Kerala': ['Kochi', 'Thiruvananthapuram', 'Kozhikode', 'Thrissur', 'Kollam', 'Kannur'],
  'Madhya Pradesh': ['Indore', 'Bhopal', 'Jabalpur', 'Gwalior', 'Ujjain', 'Sagar'],
  'Andhra Pradesh': ['Visakhapatnam', 'Vijayawada', 'Guntur', 'Nellore', 'Kurnool', 'Tirupati'],
  'Bihar': ['Patna', 'Gaya', 'Bhagalpur', 'Muzaffarpur', 'Darbhanga'],
  'Odisha': ['Bhubaneswar', 'Cuttack', 'Rourkela', 'Berhampur', 'Sambalpur'],
  'Assam': ['Guwahati', 'Silchar', 'Dibrugarh', 'Jorhat', 'Nagaon'],
  'Jharkhand': ['Ranchi', 'Jamshedpur', 'Dhanbad', 'Bokaro'],
  'Chhattisgarh': ['Raipur', 'Bhilai', 'Bilaspur', 'Korba'],
  'Uttarakhand': ['Dehradun', 'Haridwar', 'Roorkee', 'Haldwani', 'Rishikesh'],
  'Goa': ['Panaji', 'Margao', 'Vasco da Gama', 'Mapusa'],
  'Himachal Pradesh': ['Shimla', 'Dharamshala', 'Solan', 'Mandi'],
  'Jammu & Kashmir': ['Srinagar', 'Jammu', 'Anantnag', 'Baramulla'],
  'Chandigarh': ['Chandigarh'],
  'Puducherry': ['Puducherry', 'Karaikal'],
};

// Country-aware PIN/ZIP validation. Returns an error string or '' when valid.
const validatePin = (country: string, pin: string): string => {
  const v = String(pin || '').trim();
  if (!v) return '';
  const c = String(country || '').toLowerCase();
  if (c === 'india' || c === '') return /^\d{6}$/.test(v) ? '' : 'India PIN must be 6 digits.';
  if (c === 'united states') return /^\d{5}(-\d{4})?$/.test(v) ? '' : 'US ZIP must be 5 digits (or ZIP+4).';
  if (c === 'united kingdom') return /^[A-Za-z]{1,2}\d[A-Za-z\d]?\s*\d[A-Za-z]{2}$/.test(v) ? '' : 'Enter a valid UK postcode.';
  return /^[A-Za-z0-9\s-]{3,10}$/.test(v) ? '' : 'Enter a valid postal code.';
};

const BASIC_FIELDS: FieldDef[] = [
  // Company Name drives the sidebar / workspace selector / header (the `name`
  // field). Editable here so a Company Head can rename the company and, with the
  // post-save sync, see it update everywhere instantly (no logout/refresh).
  { key: 'name', label: 'Company Name' },
  { key: 'legalName', label: 'Company Legal Name' },
  { key: 'tradeName', label: 'Trade Name' },
  { key: 'companyCode', label: 'Company Code' },
  { key: 'companyType', label: 'Company Type', type: 'select', options: COMPANY_TYPES },
  { key: 'industry', label: 'Industry' },
  { key: 'businessCategory', label: 'Business Category' },
  { key: 'dateOfIncorporation', label: 'Date of Incorporation', type: 'date' },
  { key: 'employeeCapacity', label: 'Employee Strength' },
  { key: 'employeeCount', label: 'Current Headcount', readOnly: true },
];
// Address is rendered by the dedicated <AddressSection/> (structured, searchable).
// These keys are the EXISTING company columns it reads/writes — no schema change.
// The three address lines are stored in `address` (newline-joined); city/state/
// country/pincode/googleMapLocation use their own existing columns.
const ADDRESS_FIELDS: FieldDef[] = [
  { key: 'address', label: 'Street Address' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'country', label: 'Country' },
  { key: 'pincode', label: 'PIN Code' },
  { key: 'googleMapLocation', label: 'Google Maps Link' },
];
const CONTACT_FIELDS: FieldDef[] = [
  { key: 'contactNumber', label: 'Mobile Number' },
  { key: 'landline', label: 'Landline' },
  { key: 'contactEmail', label: 'Official Email', type: 'email' },
  { key: 'supportEmail', label: 'Support Email', type: 'email' },
  { key: 'website', label: 'Website', type: 'website' },
  { key: 'socialLinks', label: 'Social Media Links', type: 'social' },
];
const REGISTRATION_FIELDS: FieldDef[] = [
  { key: 'cinNumber', label: 'CIN Number' },
  { key: 'gstNumber', label: 'GST Number' },
  { key: 'panNumber', label: 'PAN Number' },
  { key: 'tanNumber', label: 'TAN Number' },
  { key: 'msmeNumber', label: 'MSME / Udyam Registration' },
  { key: 'shopEstablishmentNumber', label: 'Shop & Establishment Registration' },
  { key: 'labourLicenseNumber', label: 'Labour License Number' },
  { key: 'factoryLicenseNumber', label: 'Factory License Number' },
  { key: 'ptaxRegistrationNumber', label: 'Professional Tax Registration' },
  { key: 'pfCode', label: 'PF Establishment Code' },
  { key: 'esiCode', label: 'ESI Employer Code' },
  { key: 'iecCode', label: 'IEC Code' },
  { key: 'isoCertNumber', label: 'ISO Certification Number' },
  { key: 'fssaiNumber', label: 'FSSAI License' },
  { key: 'otherRegistrations', label: 'Other Registration Numbers', type: 'textarea' },
];
const STATUTORY_CYCLE_FIELDS: FieldDef[] = [
  { key: 'salaryCycle', label: 'Salary Cycle' },
  { key: 'payrollStartDate', label: 'Payroll Start Date' },
  { key: 'financialYearStart', label: 'Financial Year Start' },
  { key: 'leaveYearStart', label: 'Leave Year Start' },
  { key: 'defaultTimeZone', label: 'Default Time Zone' },
];
// NOTE: The "Branding Text" fields (logo/emblem text, motto, report header/footer
// text, email signature, signature line, watermark text, primary color) were
// removed from the Company Profile UI — branding is now managed via uploaded
// assets only. The underlying Company columns and their save API are untouched, so
// existing values are preserved and document/report generation that reads them
// keeps working; they are simply no longer edited here.
const BRANDING_IMAGE_FIELDS: FieldDef[] = [
  { key: 'logoImage', label: 'Company Logo' },
  { key: 'stampImage', label: 'Company Seal / Stamp' },
  { key: 'digitalSignatureImage', label: 'Authorized Signature' },
  { key: 'letterheadImage', label: 'Letterhead' },
  { key: 'reportHeaderImage', label: 'Report Header' },
  { key: 'reportFooterImage', label: 'Report Footer' },
  { key: 'watermarkImage', label: 'Company Watermark' },
  { key: 'faviconImage', label: 'Favicon' },
];

// Every editable company scalar this page manages (sent to updateBranding on save).
// Banking fields are intentionally excluded — that tab was removed from Company
// Profile (banking is still editable in Settings; DB fields/APIs are untouched).
const ALL_EDIT_FIELDS = [
  ...BASIC_FIELDS, ...ADDRESS_FIELDS, ...CONTACT_FIELDS, ...REGISTRATION_FIELDS,
  ...STATUTORY_CYCLE_FIELDS, ...BRANDING_IMAGE_FIELDS,
].filter(f => !f.readOnly).map(f => f.key);

const DOC_CATEGORIES = ['Legal', 'Tax', 'Labour', 'Business', 'Financial', 'Insurance', 'HR', 'Other'];
const DOC_STATUSES = ['Verified', 'Pending', 'Rejected'];

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_IMG_BYTES = 2 * 1024 * 1024;
const formatBytes = (b: number) => b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(2)} MB`;

const readFileAsDataUrl = (file: File, maxBytes: number): Promise<{ dataUrl: string; mimeType: string; size: string; fileName: string }> =>
  new Promise((resolve, reject) => {
    if (file.size > maxBytes) { reject(new Error(`File too large (${formatBytes(file.size)}). Max ${formatBytes(maxBytes)}.`)); return; }
    const reader = new FileReader();
    reader.onload = () => resolve({ dataUrl: String(reader.result), mimeType: file.type || 'application/octet-stream', size: formatBytes(file.size), fileName: file.name });
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.readAsDataURL(file);
  });

// Expiry → badge color + label (mirrors backend bucketing).
const dayMs = 86400000;
function expiryInfo(expiryDate?: string): { label: string; variant: 'green' | 'amber' | 'red' | 'gray'; days: number | null } {
  if (!expiryDate) return { label: 'No expiry', variant: 'gray', days: null };
  const e = new Date(expiryDate);
  if (isNaN(e.getTime())) return { label: '—', variant: 'gray', days: null };
  const t = new Date();
  const d = Math.round((Date.UTC(e.getFullYear(), e.getMonth(), e.getDate()) - Date.UTC(t.getFullYear(), t.getMonth(), t.getDate())) / dayMs);
  if (d < 0) return { label: `Expired ${-d}d ago`, variant: 'red', days: d };
  if (d === 0) return { label: 'Expires today', variant: 'red', days: 0 };
  if (d <= 90) return { label: `${d}d left`, variant: 'amber', days: d };
  return { label: `${d}d left`, variant: 'green', days: d };
}

const TABS = [
  { id: 'information', label: 'Company Information', icon: <Building2 size={15} /> },
  { id: 'statutory', label: 'Company Documents', icon: <ShieldCheck size={15} /> },
  { id: 'branding', label: 'Branding & Assets', icon: <Palette size={15} /> },
  { id: 'branches', label: 'Branch Information', icon: <GitBranch size={15} /> },
  { id: 'audit', label: 'Audit Timeline', icon: <History size={15} /> },
] as const;
type TabId = typeof TABS[number]['id'];

interface CompanyProfileProps {
  role: Role;
  activeCompanyId: string;
  companies: Company[];
  authProfile: UserAccount | null;
  onUpdateCompanies?: (companies: any) => void;
  // Called after a successful profile save with the freshly-loaded company so the
  // global companies state can sync instantly (sidebar / selector / header name).
  // Governed by the company-profile permission (not the SaaS `companies` one).
  onCompanySynced?: (company: any) => void;
  onNavigate?: (page: any) => void;
}

export const CompanyProfile: React.FC<CompanyProfileProps> = ({ activeCompanyId, authProfile, onUpdateCompanies, onCompanySynced, onNavigate }) => {
  const { canEdit, canCreate } = usePermissions();
  const editable = canEdit('company-profile');
  // Branch Management lives under the Companies module — used only to optionally
  // surface a "Create First Branch" shortcut in the (read-only) Branch tab.
  const canCreateBranch = canCreate('companies');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<TabId>(() => {
    const saved = localStorage.getItem('hrms_company_profile_tab');
    if (saved && TABS.some(t => t.id === saved)) {
      localStorage.removeItem('hrms_company_profile_tab');
      return saved as TabId;
    }
    return 'information';
  });
  const [profile, setProfile] = useState<any>(null);
  const [form, setForm] = useState<Record<string, any>>({});

  // Safety net: if an unknown/removed tab (e.g. the retired "contacts" tab) ever
  // becomes active — via a stale link or persisted state — fall back to Company
  // Information instead of rendering nothing.
  useEffect(() => {
    if (!TABS.some(t => t.id === tab)) setTab('information');
  }, [tab]);

  const load = async () => {
    try {
      const data = await api.companyProfile.get();
      setProfile(data);
      const f: Record<string, any> = {};
      for (const k of ALL_EDIT_FIELDS) f[k] = (data?.company?.[k] ?? '');
      setForm(f);
      return data;
    } catch (e) {
      ui.toast.error(getApiErrorMessage(e) || 'Could not load the company profile.');
      return null;
    } finally {
      setLoading(false);
    }
  };

  // Open from the very top. The app's content lives in a single shared
  // <main class="overflow-y-auto"> scroll container that keeps the previous
  // page's scroll position on navigation — so opening this page from the (long)
  // Companies list left a large blank area above the company header. Reset the
  // scroll once the profile has loaded so it always starts at the top.
  useEffect(() => {
    if (loading) return;
    const scroller = document.querySelector('main');
    if (scroller) scroller.scrollTop = 0; else window.scrollTo(0, 0);
  }, [loading]);

  // Re-fetch whenever the ACTIVE workspace/company changes. Without the
  // activeCompanyId dependency the profile (and its branches) stayed pinned to
  // whichever company was active on mount — showing another company's branches
  // after a workspace switch. We also clear the previous company's data first so
  // no stale branch/company info can render during the refetch (strict multi-
  // tenant isolation). The request itself always carries the current
  // x-workspace-id header, so the backend resolves the right company.
  useEffect(() => {
    setLoading(true);
    setProfile(null);
    setForm({});
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompanyId]);

  const setField = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!editable || !profile?.company?.id) return;

    // Normalize + validate URLs (Website + Social Media Links) at save time so a
    // value typed without blurring is still corrected/checked.
    const payload = { ...form };
    if (payload.website !== undefined) payload.website = normalizeUrl(payload.website);
    if (payload.socialLinks !== undefined) payload.socialLinks = normalizeSocial(payload.socialLinks);
    const badSocial = splitLinks(payload.socialLinks || '').some(t => isUrlish(t) && !isValidUrl(t));
    if ((payload.website && !isValidUrl(payload.website)) || badSocial) {
      ui.toast.error(URL_ERROR);
      return;
    }
    if (payload.website !== form.website || payload.socialLinks !== form.socialLinks) {
      setForm(payload); // reflect the normalized values in the UI
    }

    setSaving(true);
    try {
      await api.companies.updateBranding(String(profile.company.id), payload);
      ui.toast.success('Company profile saved.');
      const fresh = await load();
      // Instant global sync: push the freshly-saved company into the app's
      // companies state so the sidebar, workspace selector, header and page
      // title show the new name immediately — no logout / refresh required.
      // Uses the company-profile-scoped callback (the old onUpdateCompanies path
      // was gated on the SaaS `companies` permission, which a Company Head lacks,
      // so the rename silently never propagated).
      if (fresh?.company) {
        if (onCompanySynced) onCompanySynced(fresh.company);
        else if (onUpdateCompanies) { try { const cos = await api.companies.getAll(); onUpdateCompanies(cos); } catch { /* non-fatal */ } }
      }
    } catch (e) {
      ui.toast.error(getApiErrorMessage(e) || 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full p-12 text-slate-400 text-sm">Loading company profile…</div>;
  }
  if (!profile?.company) {
    return <div className="flex items-center justify-center h-full p-12 text-slate-400 text-sm">No company in context.</div>;
  }

  const company = profile.company;
  const companyName = company.legalName || company.name || company.displayName || 'Company';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-[#FCF4EE] flex items-center justify-center overflow-hidden border border-[#F7E3D3]">
            {company.logoImage ? <img src={company.logoImage} alt="" className="w-full h-full object-cover" /> : <Building2 size={20} className="text-[#C77E52]" />}
          </div>
          <div>
            <h1 className="text-lg font-extrabold text-slate-800 tracking-tight">{companyName}</h1>
            <p className="text-xs text-slate-500 font-semibold">Company Profile — master repository {!editable && '· Read-only'}</p>
          </div>
        </div>
        {editable && (tab === 'information' || tab === 'branding') && (
          <Button onClick={handleSave} loading={saving} icon={<Save size={14} />}>Save Changes</Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-slate-200 pb-px">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-3.5 py-2.5 text-xs whitespace-nowrap -mb-px nav-tab ${tab === t.id ? 'nav-tab-active' : ''}`}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {tab === 'information' && (
        <div className="space-y-5">
          <FieldSection title="Basic Information" fields={BASIC_FIELDS} form={form} company={company} editable={editable} onChange={setField} />
          <OwnersSection profile={profile} editable={editable} reload={load} />
          <FieldSection title="Registration Information" fields={REGISTRATION_FIELDS} form={form} company={company} editable={editable} onChange={setField} />
          <AddressSection form={form} company={company} editable={editable} onChange={setField} />
          <FieldSection title="Contact Details" fields={CONTACT_FIELDS} form={form} company={company} editable={editable} onChange={setField} />
        </div>
      )}

      {tab === 'statutory' && (
        <div className="space-y-5">
          {/* Certificates uploaded during company registration land here as
              company-scoped Document rows — no re-upload needed. */}
          <CompanyDocuments profile={profile} editable={editable} reload={load} />
          <ComplianceManagement companyId={String(company.id)} company={company} editable={editable} generatedBy={authProfile?.name || authProfile?.email} />
        </div>
      )}

      {tab === 'branding' && (
        <div className="space-y-5">
          <Card className="!bg-white !border-slate-200 !text-slate-700 !shadow-sm">
            <h2 className="text-sm font-extrabold text-slate-800 mb-1">Branding & Assets</h2>
            <p className="text-xs text-slate-500 mb-4">The single source of truth for company branding. These assets flow automatically into every payslip, invoice, letter, report and export.</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {BRANDING_IMAGE_FIELDS.map(f => (
                <ImageField key={f.key} label={f.label} value={form[f.key]} editable={editable} onChange={(v) => setField(f.key, v)} />
              ))}
            </div>
          </Card>
          <Card className="!bg-white !border-slate-200 !text-slate-700 !shadow-sm">
            <h2 className="text-sm font-extrabold text-slate-800 mb-3">Live Branding Preview</h2>
            <BrandingPreview branding={resolveBranding(form)} />
          </Card>
        </div>
      )}

      {tab === 'branches' && (
        <CompanyBranches profile={profile} onNavigate={onNavigate} canCreateBranch={canCreateBranch} />
      )}

      {tab === 'audit' && (
        <CompanyAudit />
      )}
    </div>
  );
};

// ── Document-health banner ───────────────────────────────────────────────────
const DocumentHealthBanner: React.FC<{ health: any; onOpen: () => void }> = ({ health, onOpen }) => {
  const c = health.counts || {};
  const expired = c.expired || 0;
  const soon = (c.today || 0) + (c.d30 || 0) + (c.d60 || 0) + (c.d90 || 0);
  const missing = (health.missing || []).length;
  if (!expired && !soon && !missing) {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-xs font-bold text-emerald-700">
        <CheckCircle2 size={15} /> All company documents are valid and complete.
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-amber-50 border border-amber-200 px-4 py-2.5">
      <AlertTriangle size={16} className="text-amber-600" />
      <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
        {expired > 0 && <span className="text-rose-600">🔴 {expired} expired</span>}
        {soon > 0 && <span className="text-amber-700">🟡 {soon} expiring soon</span>}
        {missing > 0 && <span className="text-slate-600">📄 {missing} required missing</span>}
      </div>
      <button onClick={onOpen} className="ml-auto text-xs font-bold text-[#C77E52] hover:underline">Review documents →</button>
    </div>
  );
};

// ── Searchable dropdown (with optional free-text / manual entry) ─────────────
// Styled to match the shared <Input>; the popover is a standard white combobox.
const COMBO_INPUT_CLS = 'w-full rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur-md px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-brand-500/10 focus:border-brand-500 disabled:opacity-40 disabled:cursor-not-allowed';
const Combo: React.FC<{
  label: string; value: string; options: string[]; onChange: (v: string) => void;
  disabled?: boolean; required?: boolean; placeholder?: string; allowCustom?: boolean; note?: string; error?: string;
}> = ({ label, value, options, onChange, disabled, required, placeholder, allowCustom, note, error }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setQuery(''); } };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const q = (open ? query : '').toLowerCase();
  const filtered = options.filter(o => o.toLowerCase().includes(q)).slice(0, 60);
  const showAdd = !!(allowCustom && query.trim() && !options.some(o => o.toLowerCase() === query.trim().toLowerCase()));
  const commit = (v: string) => { onChange(v); setOpen(false); setQuery(''); };
  return (
    <div className="flex flex-col gap-1.5 w-full relative" ref={ref}>
      <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">{label}{required && <span className="text-rose-500"> *</span>}</label>
      <input
        className={`${COMBO_INPUT_CLS}${error ? ' border-rose-500/50' : ''}`}
        value={open ? query : value}
        disabled={disabled}
        placeholder={placeholder}
        onFocus={() => { if (!disabled) { setOpen(true); setQuery(''); } }}
        onChange={e => { setQuery(e.target.value); setOpen(true); if (allowCustom) onChange(e.target.value); }}
      />
      {open && !disabled && (filtered.length > 0 || showAdd) && (
        <ul className="absolute z-30 top-full mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
          {filtered.map(o => (
            <li key={o}>
              <button type="button" onMouseDown={e => { e.preventDefault(); commit(o); }}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-100 ${o === value ? 'font-bold text-[#C77E52]' : 'text-slate-700'}`}>{o}</button>
            </li>
          ))}
          {showAdd && (
            <li>
              <button type="button" onMouseDown={e => { e.preventDefault(); commit(query.trim()); }}
                className="w-full text-left px-3 py-1.5 text-xs font-semibold text-emerald-600 hover:bg-emerald-50">+ Use “{query.trim()}”</button>
            </li>
          )}
        </ul>
      )}
      {error ? <p className="text-[11px] text-rose-500 font-bold">{error}</p> : (note ? <p className="text-[10px] text-slate-400">{note}</p> : null)}
    </div>
  );
};

// ── Structured, professional Address section ─────────────────────────────────
// Reads/writes ONLY existing company columns (no schema change): the three
// address lines are stored newline-joined in `address` (the canonical
// company_address used by every document); city/state/country/pincode/
// googleMapLocation use their own columns. Legacy office-address columns are left
// untouched; if `address` is empty they seed the first line (backward compat).
const AddressSection: React.FC<{ form: Record<string, any>; company: any; editable: boolean; onChange: (k: string, v: any) => void; }> =
  ({ form, company, editable, onChange }) => {
    const seed = (): string[] => {
      const raw = String(form.address || '').trim();
      const src = raw || String(company?.registeredOfficeAddress || company?.corporateAddress || company?.headOfficeAddress || '').trim();
      const p = src.split(/\r?\n/);
      return [p[0] || '', p[1] || '', p.slice(2).join(', ') || ''];
    };
    const [lines, setLines] = useState<string[]>(seed);
    // Persist a migrated legacy address into `address` once, so it saves correctly.
    useEffect(() => {
      if (!String(form.address || '').trim()) {
        const joined = lines.filter(Boolean).join('\n');
        if (joined) onChange('address', joined);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const setLine = (i: number, v: string) => {
      const next = [...lines]; next[i] = v; setLines(next);
      onChange('address', next.filter(Boolean).join('\n'));
    };

    const country = form.country || '';
    const state = form.state || '';
    const city = form.city || '';
    const pin = form.pincode || '';
    const dis = !editable;

    const stateOptions = country === 'India' ? INDIA_STATES : [];
    const cityOptions = CITY_BY_STATE[state] || [];
    const pinError = validatePin(country, pin);

    const setCountry = (v: string) => { onChange('country', v); onChange('state', ''); onChange('city', ''); };
    const setState = (v: string) => { onChange('state', v); onChange('city', ''); };

    return (
      <Card className="!bg-white !border-slate-200 !text-slate-700 !shadow-sm">
        <h2 className="text-sm font-extrabold text-slate-800 mb-4">Address</h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-3"><Input label="Street Address / Building No." value={lines[0]} disabled={dis} placeholder="302, Shivalik Business Center" onChange={e => setLine(0, e.target.value)} /></div>
          <div className="lg:col-span-3"><Input label="Area / Locality / Landmark" value={lines[1]} disabled={dis} placeholder="Near Iscon Mall, SG Highway" onChange={e => setLine(1, e.target.value)} /></div>
          <div className="lg:col-span-3"><Input label="Additional Address Information" value={lines[2]} disabled={dis} placeholder="3rd Floor, Corporate Office" onChange={e => setLine(2, e.target.value)} /></div>

          <Combo label="Country" required value={country} options={COUNTRIES} disabled={dis} onChange={setCountry} allowCustom placeholder="Select country" />
          <Combo label="State / Province" value={state} options={stateOptions} disabled={dis} onChange={setState}
            allowCustom={country !== 'India'} placeholder={country === 'India' ? 'Select state' : 'Type state / province'}
            note={country && country !== 'India' ? 'Type your state / province.' : ''} />
          <Combo label="City" value={city} options={cityOptions} disabled={dis} onChange={v => onChange('city', v)}
            allowCustom placeholder="Select or type city" note="City not found? Type a new city." />

          <Input label="PIN / ZIP Code" value={pin} disabled={dis} placeholder="380015" error={pinError} onChange={e => onChange('pincode', e.target.value)} />
        </div>
      </Card>
    );
  };

// ── Owner(s) / Director(s) — manually-entered company management info ─────────
// This is NOT employee/user/login management: no search box, no autocomplete, no
// user lookup, no APIs beyond the owners CRUD. "+ Add Owner" opens a plain form.
const OWNER_DESIGNATIONS = ['Owner', 'Director', 'Managing Director', 'CEO', 'Partner', 'Proprietor'];
const blankOwner = { name: '', designation: 'Owner', mobile: '', email: '', ownershipPercentage: '', joiningDate: '', notes: '', isPrimary: false };

const OwnersSection: React.FC<{ profile: any; editable: boolean; reload: () => Promise<void>; }> = ({ profile, editable, reload }) => {
  const owners: any[] = profile?.owners || [];
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<any>(null);
  const [draft, setDraft] = useState<any>(blankOwner);
  const [otherDesig, setOtherDesig] = useState(false);
  const [busy, setBusy] = useState(false);

  const openNew = () => { setEditId(null); setDraft(blankOwner); setOtherDesig(false); setOpen(true); };
  const openEdit = (o: any) => {
    setEditId(o.id);
    setDraft({ ...blankOwner, ...o });
    setOtherDesig(!!o.designation && !OWNER_DESIGNATIONS.includes(o.designation));
    setOpen(true);
  };
  const save = async () => {
    if (!draft.name?.trim()) { ui.toast.error('Full Name is required.'); return; }
    try {
      setBusy(true);
      if (editId) await api.companyProfile.owners.update(editId, draft);
      else await api.companyProfile.owners.create(draft);
      setOpen(false); await reload(); ui.toast.success('Owner saved.');
    } catch (e) { ui.toast.error(getApiErrorMessage(e) || 'Could not save the owner.'); }
    finally { setBusy(false); }
  };
  const remove = async (o: any) => {
    const ok = await ui.confirm({ message: `Remove ${o.name} from owners / directors?`, variant: 'danger', confirmText: 'Remove' });
    if (!ok) return;
    try { await api.companyProfile.owners.remove(o.id); await reload(); ui.toast.success('Owner removed.'); }
    catch (e) { ui.toast.error(getApiErrorMessage(e) || 'Could not remove.'); }
  };

  return (
    <Card className="!bg-white !border-slate-200 !text-slate-700 !shadow-sm">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-extrabold text-slate-800">Owner(s) / Director(s)</h2>
          <p className="text-[11px] text-slate-400 mt-0.5">Company management information. The primary owner fills document placeholders (name, designation, email, mobile).</p>
        </div>
        {editable && <Button size="sm" icon={<Plus size={14} />} onClick={openNew}>Add Owner</Button>}
      </div>

      {owners.length === 0 ? (
        <p className="text-sm text-slate-400">No owners / directors added yet.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {owners.map(o => (
            <div key={o.id} className="rounded-xl border border-slate-200 bg-white shadow-sm p-3.5 flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-extrabold text-slate-800 truncate">{o.name}</p>
                  <p className="text-xs text-slate-500 font-semibold truncate">{o.designation || 'Owner'}</p>
                </div>
                {o.isPrimary && <span className="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">⭐ Primary</span>}
              </div>
              <div className="mt-2 space-y-0.5">
                {o.mobile && <p className="text-[11px] text-slate-500 truncate">📱 {o.mobile}</p>}
                {o.email && <p className="text-[11px] text-slate-500 truncate">📧 {o.email}</p>}
              </div>
              {editable && (
                <div className="flex items-center gap-2 mt-3 pt-2 border-t border-slate-100">
                  <button onClick={() => openEdit(o)} className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-brand-600"><Edit size={12} /> Edit</button>
                  <button onClick={() => remove(o)} className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-rose-600"><Trash2 size={12} /> Delete</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editId ? 'Edit Owner / Director' : 'Add Owner / Director'} size="lg"
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} loading={busy} icon={<Save size={14} />}>Save Owner</Button></>}>
        <div className="space-y-5">
          {/* Basic Information */}
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-2">Basic Information</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Full Name *" value={draft.name} placeholder="e.g. Om Patel" autoComplete="off" onChange={e => setDraft({ ...draft, name: e.target.value })} />
              <div className="flex flex-col gap-4">
                <Select label="Designation" value={otherDesig ? 'Other' : (draft.designation || '')}
                  onChange={e => {
                    const v = e.target.value;
                    if (v === 'Other') { setOtherDesig(true); setDraft({ ...draft, designation: '' }); }
                    else { setOtherDesig(false); setDraft({ ...draft, designation: v }); }
                  }}
                  options={[{ value: '', label: '— Select —' }, ...OWNER_DESIGNATIONS.map(r => ({ value: r, label: r })), { value: 'Other', label: 'Other (Custom)' }]} />
                {otherDesig && <Input label="Custom Designation" value={draft.designation} placeholder="e.g. Chairman" onChange={e => setDraft({ ...draft, designation: e.target.value })} />}
              </div>
            </div>
          </div>

          {/* Contact Information */}
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-2">Contact Information</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Mobile Number" value={draft.mobile} placeholder="Optional" autoComplete="off" onChange={e => setDraft({ ...draft, mobile: e.target.value })} />
              <Input label="Email Address" type="email" value={draft.email} placeholder="Optional" autoComplete="off" onChange={e => setDraft({ ...draft, email: e.target.value })} />
            </div>
          </div>

          {/* Company Information */}
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-2">Company Information</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Joining Date (Optional)" type="date" value={draft.joiningDate} onChange={e => setDraft({ ...draft, joiningDate: e.target.value })} />
            </div>
          </div>

          {/* Additional Information */}
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-2">Additional Information</p>
            <Textarea label="Notes" value={draft.notes} placeholder="Optional" onChange={e => setDraft({ ...draft, notes: e.target.value })} />
          </div>

          <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer select-none">
            <input type="checkbox" checked={!!draft.isPrimary} onChange={e => setDraft({ ...draft, isPrimary: e.target.checked })} className="h-4 w-4 accent-[#C77E52]" />
            Make this the Primary Owner <span className="font-normal text-slate-400">(used for document placeholders)</span>
          </label>
        </div>
      </Modal>
    </Card>
  );
};

// ── Reusable field section ───────────────────────────────────────────────────
const FieldSection: React.FC<{ title: string; fields: FieldDef[]; form: Record<string, any>; company: any; editable: boolean; onChange: (k: string, v: any) => void; }> =
  ({ title, fields, form, company, editable, onChange }) => (
    <Card className="!bg-white !border-slate-200 !text-slate-700 !shadow-sm">
      <h2 className="text-sm font-extrabold text-slate-800 mb-4">{title}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {fields.map(f => {
          const value = f.readOnly ? (company?.[f.key] ?? '') : (form[f.key] ?? '');
          const disabled = !editable || f.readOnly;
          if (f.type === 'textarea') {
            return <div key={f.key} className="md:col-span-2 lg:col-span-3"><Textarea label={f.label} value={value} disabled={disabled} onChange={e => onChange(f.key, e.target.value)} /></div>;
          }
          if (f.type === 'select') {
            return <Select key={f.key} label={f.label} value={value} disabled={disabled} onChange={e => onChange(f.key, e.target.value)}
              options={[{ value: '', label: '— Select —' }, ...(f.options || []).map(o => ({ value: o, label: o }))]} />;
          }
          if (f.type === 'website') {
            return <WebsiteField key={f.key} label={f.label} value={value} disabled={disabled} onChange={v => onChange(f.key, v)} />;
          }
          if (f.type === 'social') {
            return <SocialLinksField key={f.key} label={f.label} value={value} disabled={disabled} onChange={v => onChange(f.key, v)} />;
          }
          return <Input key={f.key} label={f.label} type={f.type === 'date' ? 'date' : f.type === 'email' ? 'email' : 'text'} value={value} disabled={disabled} onChange={e => onChange(f.key, e.target.value)} />;
        })}
      </div>
    </Card>
  );

// ── Website field — validates + auto-prepends https:// + clickable link ──────
const WebsiteField: React.FC<{ label: string; value: string; disabled?: boolean; onChange: (v: string) => void; }> =
  ({ label, value, disabled, onChange }) => {
    const err = value && !isValidUrl(value) ? URL_ERROR : '';
    const href = !err ? normalizeUrl(value) : '';
    return (
      <div className="flex flex-col gap-1">
        <Input label={label} value={value} disabled={disabled} placeholder="company.com" error={err}
          onChange={e => onChange(e.target.value)}
          onBlur={() => { const n = normalizeUrl(value); if (n && n !== value) onChange(n); }} />
        {href && (
          <a href={href} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-bold text-[#C77E52] hover:underline truncate">
            <ExternalLink size={11} className="shrink-0" /> {href}
          </a>
        )}
      </div>
    );
  };

// ── Social media links — one per line / comma-separated, each clickable ──────
const SocialLinksField: React.FC<{ label: string; value: string; disabled?: boolean; onChange: (v: string) => void; }> =
  ({ label, value, disabled, onChange }) => {
    const tokens = splitLinks(value);
    const err = tokens.some(t => isUrlish(t) && !isValidUrl(t)) ? URL_ERROR : '';
    const links = tokens.filter(t => isUrlish(t) && isValidUrl(t)).map(normalizeUrl);
    return (
      <div className="md:col-span-2 lg:col-span-3 flex flex-col gap-1.5">
        <Textarea label={label} value={value} disabled={disabled} error={err}
          placeholder={'https://linkedin.com/company/…\nhttps://facebook.com/…\nhttps://instagram.com/…'}
          onChange={e => onChange(e.target.value)}
          onBlur={() => { const n = normalizeSocial(value); if (n && n !== value) onChange(n); }} />
        {links.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {links.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 max-w-full truncate rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-[#C77E52] hover:bg-slate-50">
                <ExternalLink size={11} className="shrink-0" /> <span className="truncate">{url}</span>
              </a>
            ))}
          </div>
        )}
      </div>
    );
  };

// ── Image upload field ───────────────────────────────────────────────────────
const ImageField: React.FC<{ label: string; value?: string; editable: boolean; onChange: (v: string) => void; }> = ({ label, value, editable, onChange }) => {
  const ref = useRef<HTMLInputElement>(null);
  const pick = async (file?: File) => {
    if (!file) return;
    try { const r = await readFileAsDataUrl(file, MAX_IMG_BYTES); onChange(r.dataUrl); }
    catch (e: any) { ui.toast.error(e?.message || 'Upload failed.'); }
  };
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">{label}</label>
      <div className="relative h-24 rounded-xl border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center overflow-hidden">
        {value
          ? <img src={value} alt={label} className="w-full h-full object-contain" />
          : <span className="text-[10px] text-slate-400 font-semibold">No image</span>}
        {editable && (
          <div className="absolute bottom-1 right-1 flex gap-1">
            <button onClick={() => ref.current?.click()} className="p-1 rounded-md bg-white border border-slate-200 text-slate-600 hover:text-[#C77E52] shadow-sm" title="Upload"><Upload size={12} /></button>
            {value && <button onClick={() => onChange('')} className="p-1 rounded-md bg-white border border-slate-200 text-rose-500 shadow-sm" title="Remove"><X size={12} /></button>}
          </div>
        )}
        <input ref={ref} type="file" accept="image/*" className="hidden" onChange={e => pick(e.target.files?.[0])} />
      </div>
    </div>
  );
};

// ── Company Documents ────────────────────────────────────────────────────────
const blankDoc = { name: '', category: 'Legal', type: '', documentNumber: '', issuingAuthority: '', issueDate: '', expiryDate: '', renewalDate: '', status: 'Verified', remarks: '', fileData: '', mimeType: '', size: '' };

const CompanyDocuments: React.FC<{ profile: any; editable: boolean; reload: () => Promise<void> }> = ({ profile, editable, reload }) => {
  const docs: any[] = profile.documents || [];
  const missing: any[] = profile.documentHealth?.missing || [];
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<any>(null);
  const [draft, setDraft] = useState<any>(blankDoc);
  const [q, setQ] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = docs.filter(d => !q || `${d.name} ${d.category} ${d.documentNumber}`.toLowerCase().includes(q.toLowerCase()));

  const openNew = () => { setEditId(null); setDraft(blankDoc); setOpen(true); };
  const openEdit = (d: any) => { setEditId(d.id); setDraft({ ...blankDoc, ...d }); setOpen(true); };

  const pickFile = async (file?: File) => {
    if (!file) return;
    try { const r = await readFileAsDataUrl(file, MAX_FILE_BYTES); setDraft((p: any) => ({ ...p, fileData: r.dataUrl, mimeType: r.mimeType, size: r.size, name: p.name || r.fileName })); }
    catch (e: any) { ui.toast.error(e?.message || 'Upload failed.'); }
  };

  const save = async () => {
    if (!draft.name?.trim()) { ui.toast.error('Document name is required.'); return; }
    try {
      if (editId) await api.companyProfile.documents.update(editId, draft);
      else await api.companyProfile.documents.create(draft);
      ui.toast.success('Document saved.');
      setOpen(false); await reload();
    } catch (e) { ui.toast.error(getApiErrorMessage(e) || 'Could not save the document.'); }
  };

  const remove = async (d: any) => {
    const ok = await ui.confirm({ message: `Delete "${d.name}"? This cannot be undone.`, variant: 'danger', confirmText: 'Delete' });
    if (!ok) return;
    try { await api.companyProfile.documents.remove(d.id); ui.toast.success('Document deleted.'); await reload(); }
    catch (e) { ui.toast.error(getApiErrorMessage(e) || 'Could not delete.'); }
  };

  const download = (d: any) => {
    if (!d.fileData && !d.url) { ui.toast.info('No file attached.'); return; }
    const a = document.createElement('a'); a.href = d.fileData || d.url; a.download = d.name || 'document'; a.target = '_blank'; a.click();
  };

  return (
    <div className="space-y-4">
      {missing.length > 0 && (
        <Card className="!bg-white !border-slate-200 !text-slate-700 !shadow-sm">
          <h3 className="text-xs font-extrabold text-slate-800 mb-2">Required Documents Checklist</h3>
          <div className="flex flex-wrap gap-2">
            {missing.map((m: any) => <Badge key={m.key} variant="red">Missing: {m.label}</Badge>)}
          </div>
        </Card>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search documents…" className="pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-700 w-64 focus:outline-none focus:border-[#C77E52]" />
        </div>
        <div className="flex items-center gap-2">
          <ExportMenu
            fileName="Company_Documents"
            title="Company Documents"
            columns={[
              { header: 'Name', key: 'name', width: 28 }, { header: 'Category', key: 'category', width: 16 },
              { header: 'Number', key: 'documentNumber', width: 18 }, { header: 'Issue Date', key: 'issueDate', width: 14 },
              { header: 'Expiry Date', key: 'expiryDate', width: 14 }, { header: 'Status', key: 'status', width: 12 },
            ]}
            rows={() => filtered}
            size="sm"
          />
          {editable && <Button size="sm" icon={<Plus size={14} />} onClick={openNew}>Add Document</Button>}
        </div>
      </div>

      <Table>
        <Thead><Tr>
          <Th>Document</Th><Th>Category</Th><Th>Number</Th><Th>Issue</Th><Th>Expiry</Th><Th>Status</Th><Th>Actions</Th>
        </Tr></Thead>
        <Tbody>
          {filtered.length === 0 && <Tr><Td colSpan={7}><span className="text-slate-400">No company documents yet.</span></Td></Tr>}
          {filtered.map(d => {
            const exp = expiryInfo(d.expiryDate);
            return (
              <Tr key={d.id}>
                <Td className="!font-bold !text-slate-700">{d.name}</Td>
                <Td>{d.category || d.type || '—'}</Td>
                <Td>{d.documentNumber || '—'}</Td>
                <Td>{d.issueDate ? formatDate(d.issueDate) : '—'}</Td>
                <Td><Badge variant={exp.variant} dot>{exp.label}</Badge></Td>
                <Td>{d.status || '—'}</Td>
                <Td>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => download(d)} className="text-slate-400 hover:text-[#C77E52]" title="Download/Preview"><Download size={14} /></button>
                    {editable && <button onClick={() => openEdit(d)} className="text-slate-400 hover:text-brand-400" title="Edit"><Edit size={14} /></button>}
                    {editable && <button onClick={() => remove(d)} className="text-slate-400 hover:text-rose-400" title="Delete"><Trash2 size={14} /></button>}
                  </div>
                </Td>
              </Tr>
            );
          })}
        </Tbody>
      </Table>

      <Modal open={open} onClose={() => setOpen(false)} title={editId ? 'Edit Document' : 'Add Company Document'} size="lg"
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} icon={<Save size={14} />}>Save</Button></>}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="Document Name" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
          <Select label="Category" value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })} options={DOC_CATEGORIES.map(c => ({ value: c, label: c }))} />
          <Input label="Document Number" value={draft.documentNumber} onChange={e => setDraft({ ...draft, documentNumber: e.target.value })} />
          <Input label="Issuing Authority" value={draft.issuingAuthority} onChange={e => setDraft({ ...draft, issuingAuthority: e.target.value })} />
          <Input label="Issue Date" type="date" value={draft.issueDate || ''} onChange={e => setDraft({ ...draft, issueDate: e.target.value })} />
          <Input label="Expiry Date" type="date" value={draft.expiryDate || ''} onChange={e => setDraft({ ...draft, expiryDate: e.target.value })} />
          <Input label="Renewal Date" type="date" value={draft.renewalDate || ''} onChange={e => setDraft({ ...draft, renewalDate: e.target.value })} />
          <Select label="Status" value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value })} options={DOC_STATUSES.map(s => ({ value: s, label: s }))} />
          <div className="md:col-span-2"><Textarea label="Remarks" value={draft.remarks || ''} onChange={e => setDraft({ ...draft, remarks: e.target.value })} /></div>
          <div className="md:col-span-2">
            <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">File Attachment</label>
            <div className="mt-1.5 flex items-center gap-2">
              <Button variant="outline" size="sm" icon={<Upload size={14} />} onClick={() => fileRef.current?.click()}>{draft.fileData ? 'Replace File' : 'Upload File'}</Button>
              {draft.size && <span className="text-xs text-slate-500">{draft.size}</span>}
              {draft.fileData && <Badge variant="green" dot>Attached</Badge>}
              <input ref={fileRef} type="file" className="hidden" accept=".jpg,.jpeg,.png,.pdf,.doc,.docx" onChange={e => pickFile(e.target.files?.[0])} />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};

// NOTE: The "Contacts & Management" module (CompanyContacts + CONTACT_ROLES) was
// removed from the Company Profile UI per product decision. Its backend APIs
// (/company-profile/contacts) and the CompanyContact table are intentionally left
// intact so the module can be re-enabled in the future without a migration.

// ── Branch Information (read-only informational summary) ─────────────────────
// Rows are intentionally NOT clickable — this is a read-only summary of the
// CURRENT company's live branches (isolation enforced server-side). Any future
// actions must be explicit buttons, never a row click. Data (including employee
// counts) is scoped to this company by the backend; nothing is hardcoded.
const CompanyBranches: React.FC<{ profile: any; onNavigate?: (p: string) => void; canCreateBranch?: boolean }> = ({ profile, onNavigate, canCreateBranch }) => {
  const branches: any[] = profile.branches || [];

  if (branches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-16 px-4">
        <div className="w-12 h-12 rounded-full bg-[#FCF4EE] flex items-center justify-center mb-3"><GitBranch size={20} className="text-[#C77E52]" /></div>
        <p className="text-sm font-semibold text-slate-500">No branches have been created for this company yet.</p>
        {canCreateBranch && onNavigate && (
          <Button size="sm" className="mt-4" icon={<Plus size={14} />} onClick={() => onNavigate('companies')}>Create First Branch</Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <ExportMenu fileName="Branches" title="Branches"
          columns={[
            { header: 'Branch', key: 'branchName', width: 26 }, { header: 'Code', key: 'branchCode', width: 14 },
            { header: 'Location', key: 'location', width: 26 }, { header: 'Manager', key: 'adminName', width: 20 },
            { header: 'Employees', key: 'headcount', width: 12 }, { header: 'Status', key: 'status', width: 12 },
          ]}
          rows={() => branches} size="sm" />
      </div>
      <Table>
        <Thead><Tr><Th>Branch</Th><Th>Code</Th><Th>Location</Th><Th>Manager</Th><Th>Employees</Th><Th>Status</Th></Tr></Thead>
        <Tbody>
          {branches.map(b => (
            <Tr key={b.id}>
              <Td className="!text-slate-200">{b.branchName}</Td>
              <Td>{b.branchCode || '—'}</Td>
              <Td>{b.location || '—'}</Td>
              <Td>{b.adminName || '—'}</Td>
              <Td>{b.headcount ?? 0}</Td>
              <Td><Badge variant={String(b.status).toLowerCase() === 'active' ? 'green' : 'gray'}>{b.status || '—'}</Badge></Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </div>
  );
};

// ── Audit Timeline ───────────────────────────────────────────────────────────
const CompanyAudit: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.companyProfile.audit().then((d: any) => setLogs(Array.isArray(d) ? d : [])).catch(() => setLogs([])).finally(() => setLoading(false));
  }, []);
  if (loading) return <p className="text-sm text-slate-400 p-6">Loading timeline…</p>;
  const parse = (s: string) => { try { return JSON.parse(s || '{}'); } catch { return {}; } };
  return (
    <Table>
      <Thead><Tr><Th>When</Th><Th>Action</Th><Th>Module</Th><Th>By</Th><Th>Details</Th></Tr></Thead>
      <Tbody>
        {logs.length === 0 && <Tr><Td colSpan={5}><span className="text-slate-400">No changes recorded yet.</span></Td></Tr>}
        {logs.map(l => {
          const d = parse(l.details);
          return (
            <Tr key={l.id}>
              <Td><span className="flex items-center gap-1.5"><Clock size={12} className="text-slate-500" />{formatDateTime(l.createdAt)}</span></Td>
              <Td className="!text-slate-200">{l.action}</Td>
              <Td>{l.module}</Td>
              <Td>{l.actorName}{l.actorRole ? ` (${l.actorRole})` : ''}</Td>
              <Td>{d.fields ? `Fields: ${(d.fields || []).join(', ')}` : (d.op || '—')}</Td>
            </Tr>
          );
        })}
      </Tbody>
    </Table>
  );
};

export default CompanyProfile;
