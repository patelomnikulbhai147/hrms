// ─────────────────────────────────────────────────────────────────────────────
// Communication Center — Phase 1 foundation (storage only, NO sending).
//
// Central hub for employee communications: templates, a (UI-only) drag-and-drop
// designer, birthday / festival / announcement management, a scheduler that only
// STORES schedules, an (empty) delivery log, and a settings page whose providers
// are disabled ("Coming in Phase 2"). Nothing is actually delivered — WhatsApp /
// SMS / Email / Push are intentionally deferred. Backed by /api/communication.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutDashboard, FileText, LayoutTemplate, Cake, PartyPopper, Megaphone, Clock,
  Truck, Settings as SettingsIcon, Plus, Edit, Trash2, Search, Eye,
  Send, CalendarClock, Lock, Upload, X, MessageSquare, FileStack, Sparkles, Mail, Smartphone,
  CalendarDays, Download, Copy, ChevronLeft, ChevronRight, List as ListIcon, LayoutGrid, Star,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { ui } from '@/components/ui/feedback';
import { api } from '@/api/apiClient';
import { getApiErrorMessage } from '@/utils/apiError';
import { formatDate, formatDateTime } from '@/utils/formatDate';

// ── Static libraries (mirrors the backend; available offline for the UI) ──────
const CATEGORIES = [
  'Birthday Wishes', 'Work Anniversary', 'Festival Greetings', 'Company Announcements',
  'Welcome Messages', 'Farewell Messages', 'Promotion Congratulations',
  'Employee of the Month', 'Salary Credited', 'Payslip Available', 'Custom Templates',
];
const HOLIDAY_CATEGORIES = ['Public Holiday', 'Optional Holiday', 'National', 'Religious', 'Regional', 'Company'];
const PLACEHOLDERS = [
  '{{employee_name}}', '{{employee_id}}', '{{employee_photo}}', '{{designation}}',
  '{{department}}', '{{company_name}}', '{{company_logo}}', '{{company_address}}',
  '{{birthday}}', '{{joining_date}}', '{{years_of_service}}', '{{today_date}}',
];
// Drag-and-drop designer elements (Phase 1 stores layout only; no rendering yet).
const DESIGNER_ELEMENTS = [
  'Company Logo', 'Employee Photo', 'QR Code', 'Signature', 'Background Image',
  'Header', 'Footer', 'Dynamic Text', 'Company Name', 'Greeting Message',
];

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'templates', label: 'Templates', icon: FileText },
  { id: 'designer', label: 'Template Designer', icon: LayoutTemplate },
  { id: 'birthday', label: 'Birthday Wishes', icon: Cake },
  { id: 'festival', label: 'Festival Greetings', icon: PartyPopper },
  { id: 'holidays', label: 'Holiday Calendar', icon: CalendarDays },
  { id: 'announcements', label: 'Company Announcements', icon: Megaphone },
  { id: 'scheduled', label: 'Scheduled Messages', icon: Clock },
  { id: 'logs', label: 'Delivery Logs', icon: Truck },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
] as const;
type TabId = typeof TABS[number]['id'];

const readFileAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = reject; r.readAsDataURL(file);
});

const Phase2Badge = () => <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-600 border border-amber-200">Available in Phase 2</span>;

// ── Professional greeting-card rendering ──────────────────────────────────────
// Templates carry a portable DESIGN spec (gradient + accent + artwork + one of 5
// structural layouts + display font) stored inside the template `layout` JSON, so
// every card renders as a real, decorated greeting — never a plain colored box —
// and a duplicated copy keeps its look with NO schema change. Future-proof for
// Email / WhatsApp / In-App / Push rendering in Phase 2.
interface Theme { background: string; accent: string; text: string; emoji?: string; art?: string; layoutKind?: string; font?: string; bg1?: string; bg2?: string; }
const parseLayout = (raw: any): any => {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return null; }
};

// Company branding pulled live from Company Profile (single source of truth).
interface Branding { companyName: string; logo?: string; footer?: string; signature?: string; }
const BrandingCtx = React.createContext<Branding>({ companyName: 'Vishv Enterprise' });

// Sample demo data so the gallery/preview shows realistic output instead of raw
// {{tokens}} (e.g. "OM PATEL" rather than "{{employee_name}}").
const sampleValues = (b: Branding): Record<string, string> => ({
  employee_name: 'OM PATEL', employee_id: 'EMP-1024', designation: 'Software Developer',
  department: 'Engineering', company_name: b.companyName || 'Vishv Enterprise',
  birthday: '12 August', joining_date: '01 Jun 2022', years_of_service: '3',
  today_date: formatDate(new Date() as any),
});
const fillSample = (text: string, b: Branding): string =>
  String(text || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => {
    if (k === 'employee_photo' || k === 'company_logo') return '';
    const v = sampleValues(b)[k];
    return v !== undefined ? v : m;
  }).replace(/\s{2,}/g, ' ').trim();

// Merge a template's design from its top-level fields + parsed layout JSON.
const designOf = (item: any, b: Branding) => {
  const layout = parseLayout(item?.layout) || {};
  const theme: Theme = (item?.theme && item.theme.background) ? item.theme : (layout.theme || {});
  const bg = theme.background || (theme.bg1 ? `linear-gradient(135deg,${theme.bg1},${theme.bg2 || theme.bg1})` : 'linear-gradient(135deg,#eef2ff,#e2e8f0)');
  return {
    bg, accent: theme.accent || '#4f46e5', text: theme.text || '#1e293b',
    font: theme.font || "'Trebuchet MS',sans-serif",
    emoji: theme.emoji || layout.emoji || item?.emoji || '🎉',
    art: theme.art || layout.art || item?.art || 'celebration',
    layoutKind: theme.layoutKind || layout.layoutKind || item?.layoutKind || 'classic',
    greeting: fillSample(item?.greetingTitle || layout.greetingTitle || item?.subject || item?.title || 'Greetings', b),
    subtitle: fillSample(item?.subtitle ?? layout.subtitle ?? '', b),
    body: fillSample(item?.body || layout.body || '', b),
    signoff: fillSample(item?.signoff || layout.signoff || '{{company_name}}', b),
    showPhoto: (item?.showEmployeePhoto ?? item?.employeePhotoPlaceholder ?? layout.showPhoto) !== false && (item?.showEmployeePhoto ?? item?.employeePhotoPlaceholder ?? true),
    bgImage: item?.backgroundImage || '',
    logo: item?.companyLogo || b.logo || '',
  };
};
const greetingOf = (t: any): string => t?.greetingTitle || parseLayout(t?.layout)?.greetingTitle || t?.subject || '';

// Decoration sets — festival/occasion artwork rendered as positioned motifs.
const ART: Record<string, { items: string[]; flair?: 'confetti' | 'snow' | 'tricolor' | 'sparkle' | 'colors'; glow?: string }> = {
  birthday: { items: ['🎈', '🎂', '🎉', '🎊', '🎁', '🎈', '🧁'], flair: 'confetti' },
  anniversary: { items: ['🏆', '⭐', '🎗️', '✨', '🥂'], flair: 'sparkle' },
  welcome: { items: ['👋', '🎉', '✨', '🎊', '🌟'], flair: 'confetti' },
  farewell: { items: ['💐', '🌸', '💗', '🌷', '✨'], flair: 'sparkle' },
  promotion: { items: ['🚀', '⭐', '📈', '✨', '🎯'], flair: 'sparkle' },
  award: { items: ['🏆', '🥇', '⭐', '🎖️', '✨'], flair: 'sparkle' },
  finance: { items: ['💰', '🪙', '💸', '✨', '📊'] },
  document: { items: ['🧾', '✅', '📄', '✨'] },
  notice: { items: ['📢', '📌', '📋', '✨'] },
  celebration: { items: ['🎊', '🎉', '✨', '🥳', '🎈'], flair: 'confetti' },
  diwali: { items: ['🪔', '✨', '🎆', '🪔', '🌟', '🪔'], flair: 'sparkle', glow: '#f59e0b' },
  holi: { items: ['🎨', '💦', '🌈', '🟣', '🟡', '🔵', '🟢'], flair: 'colors' },
  eid: { items: ['🌙', '🕌', '🏮', '✨', '⭐'], flair: 'sparkle' },
  christmas: { items: ['🎄', '❄️', '🎅', '🎁', '⛄', '🔔'], flair: 'snow' },
  newyear: { items: ['🎆', '🥂', '🎉', '✨', '🍾', '🎊'], flair: 'confetti' },
  tricolor: { items: ['🇮🇳', '🎗️', '🕊️', '✨'], flair: 'tricolor' },
  navratri: { items: ['🪕', '💃', '🌸', '✨', '🔱'], flair: 'sparkle' },
  rakhi: { items: ['🪢', '🌸', '💐', '✨', '💝'] },
  janmashtami: { items: ['🦚', '🪈', '🧈', '✨', '🌸'] },
  ganesh: { items: ['🐘', '🌺', '🪔', '✨', '🌼'] },
  kite: { items: ['🪁', '☀️', '🪁', '✨', '🌬️'] },
  shivratri: { items: ['🔱', '🕉️', '🐍', '✨', '🌙'] },
  womensday: { items: ['💜', '🌸', '🌷', '✨', '💐'], flair: 'sparkle' },
  labour: { items: ['🛠️', '⚙️', '👷', '✨', '🏗️'] },
  flowers: { items: ['🌷', '🌸', '💐', '🌼', '🌺'], flair: 'sparkle' },
  formal: { items: ['👔', '🎩', '⭐', '✨'] },
};
const SCATTER = [[5, 7], [9, 80], [27, 4], [34, 88], [58, 5], [66, 85], [85, 16], [88, 70], [48, 92]];

const CardArt: React.FC<{ art: string; accent: string }> = ({ art, accent }) => {
  const spec = ART[art] || ART.celebration;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {spec.flair === 'tricolor' && (
        <>
          <div className="absolute left-0 top-0 w-full" style={{ height: '4cqw', background: '#FF9933' }} />
          <div className="absolute bottom-0 left-0 w-full" style={{ height: '4cqw', background: '#138808' }} />
        </>
      )}
      {spec.flair === 'confetti' && SCATTER.slice(0, 7).map((p, i) => (
        <span key={`c${i}`} className="absolute rounded-sm" style={{ top: `${(p[0] + 3) % 95}%`, left: `${(p[1] + 5) % 95}%`, width: '2.4cqw', height: '2.4cqw', background: [accent, '#f472b6', '#34d399', '#60a5fa', '#fbbf24'][i % 5], transform: `rotate(${i * 40}deg)`, opacity: 0.85 }} />
      ))}
      {spec.flair === 'snow' && Array.from({ length: 10 }).map((_, i) => (
        <span key={`s${i}`} className="absolute rounded-full bg-white" style={{ top: `${(i * 9 + 4) % 92}%`, left: `${(i * 17 + 6) % 92}%`, width: '1.8cqw', height: '1.8cqw', opacity: 0.8 }} />
      ))}
      {spec.flair === 'colors' && SCATTER.slice(0, 6).map((p, i) => (
        <span key={`k${i}`} className="absolute rounded-full" style={{ top: `${p[0]}%`, left: `${p[1]}%`, width: '6cqw', height: '6cqw', background: ['#a855f7', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444'][i % 6], filter: 'blur(1px)', opacity: 0.5 }} />
      ))}
      {spec.items.map((em, i) => {
        const p = SCATTER[i % SCATTER.length];
        return <span key={i} className="absolute" style={{ top: `${p[0]}%`, left: `${p[1]}%`, fontSize: '7cqw', transform: `rotate(${(i % 2 ? 1 : -1) * (8 + i * 4)}deg)`, opacity: 0.92, filter: spec.glow ? `drop-shadow(0 0 4px ${spec.glow})` : 'none' }}>{em}</span>;
      })}
    </div>
  );
};

// Sample photo frame — initials on an accent disc, looks like a framed portrait.
const PhotoFrame: React.FC<{ accent: string; size: number; name: string }> = ({ accent, size, name }) => {
  const initials = (name || 'OM PATEL').split(' ').slice(0, 2).map(w => w[0]).join('');
  return (
    <div className="flex items-center justify-center rounded-full" style={{ width: `${size}cqw`, height: `${size}cqw`, background: 'linear-gradient(135deg,#cbd5e1,#94a3b8)', border: `${size * 0.07}cqw solid #ffffff`, boxShadow: `0 0 0 ${size * 0.05}cqw ${accent}` }}>
      <span className="font-extrabold text-white" style={{ fontSize: `${size * 0.34}cqw` }}>{initials}</span>
    </div>
  );
};

const LogoChip: React.FC<{ logo?: string; brand: string; light?: boolean }> = ({ logo, brand, light }) => (
  logo ? <img src={logo} alt="logo" style={{ height: '7cqw', maxWidth: '40%', objectFit: 'contain' }} />
    : <span className="inline-flex items-center rounded font-bold" style={{ fontSize: '3.2cqw', padding: '1cqw 2cqw', background: light ? 'rgba(255,255,255,0.22)' : 'rgba(15,23,42,0.08)', color: light ? '#fff' : '#334155' }}>{brand}</span>
);

// One renderer, five genuinely different structural layouts.
const GreetingCard: React.FC<{ item: any; rounded?: boolean }> = ({ item, rounded = true }) => {
  const b = useContext(BrandingCtx);
  const d = designOf(item, b);
  const dark = '#1f2937';
  const baseBg: React.CSSProperties = d.bgImage ? { backgroundImage: `url(${d.bgImage})`, backgroundSize: 'cover', backgroundPosition: 'center' } : { background: d.bg };
  const Wrap: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div style={{ containerType: 'inline-size', aspectRatio: '4 / 5', fontFamily: d.font } as React.CSSProperties}
      className={`relative w-full overflow-hidden ${rounded ? 'rounded-xl' : ''}`}>{children}</div>
  );
  const Title = ({ color, size = 8 }: { color: string; size?: number }) => <p className="font-extrabold leading-tight drop-shadow-sm" style={{ color, fontSize: `${size}cqw` }}>{d.emoji} {d.greeting}</p>;
  const Name = ({ color }: { color: string }) => <p className="font-extrabold leading-none" style={{ color, fontSize: '7cqw' }}>{sampleValues(b).employee_name}</p>;
  const Sub = ({ color }: { color: string }) => d.subtitle ? <p className="font-semibold" style={{ color, fontSize: '3.6cqw', opacity: 0.85 }}>{d.subtitle}</p> : null;
  const Body = ({ color }: { color: string }) => <p className="leading-snug" style={{ color, fontSize: '3.7cqw', opacity: 0.92 }}>{d.body}</p>;
  const Sign = ({ color }: { color: string }) => <p className="font-semibold italic" style={{ color, fontSize: '3.4cqw', opacity: 0.9 }}>{d.signoff}</p>;

  // 1) BANNER — colored header band + light body, photo overlapping the seam.
  if (d.layoutKind === 'banner') {
    return <Wrap>
      <div className="absolute left-0 top-0 w-full" style={{ height: '46%', ...baseBg }}>
        <CardArt art={d.art} accent={d.accent} />
        <div className="absolute inset-0 flex flex-col items-center justify-center px-[6cqw] text-center">
          <div className="absolute left-[4cqw] top-[4cqw]"><LogoChip logo={d.logo} brand={b.companyName} light /></div>
          <Title color={d.text} size={8.5} />
        </div>
      </div>
      <div className="absolute bottom-0 left-0 flex w-full flex-col items-center px-[7cqw] pb-[6cqw] text-center" style={{ height: '58%', justifyContent: 'flex-end', gap: '1.6cqw' }}>
        {d.showPhoto && <div className="absolute left-1/2 -translate-x-1/2" style={{ top: '-9cqw' }}><PhotoFrame accent={d.accent} size={26} name={sampleValues(b).employee_name} /></div>}
        <div style={{ height: d.showPhoto ? '15cqw' : '0' }} />
        <Name color={dark} /><Sub color={dark} /><Body color={dark} /><Sign color={d.accent} />
      </div>
    </Wrap>;
  }
  // 2) FRAME — ornate bordered panel, corner motifs, centered content.
  if (d.layoutKind === 'frame') {
    return <Wrap>
      <div className="absolute inset-0" style={baseBg}><CardArt art={d.art} accent={d.accent} /></div>
      <div className="absolute flex flex-col items-center justify-center text-center" style={{ inset: '6cqw', border: `0.8cqw double ${d.accent}`, borderRadius: '3cqw', padding: '5cqw', gap: '2cqw', background: 'rgba(0,0,0,0.12)' }}>
        <LogoChip logo={d.logo} brand={b.companyName} light />
        <Title color={d.text} size={8} />
        {d.showPhoto && <PhotoFrame accent={d.accent} size={26} name={sampleValues(b).employee_name} />}
        <Name color={d.text} /><Sub color={d.text} /><Body color={d.text} /><Sign color={d.accent} />
      </div>
    </Wrap>;
  }
  // 3) SIDEBAR — colored left panel with art, light content column on the right.
  if (d.layoutKind === 'sidebar') {
    return <Wrap>
      <div className="absolute inset-0 flex">
        <div className="relative flex flex-col items-center justify-center" style={{ width: '42%', ...baseBg }}>
          <CardArt art={d.art} accent={d.accent} />
          <div className="relative z-10 text-center" style={{ fontSize: '20cqw' }}>{d.emoji}</div>
          <div className="absolute bottom-[4cqw]"><LogoChip logo={d.logo} brand={b.companyName} light /></div>
        </div>
        <div className="flex flex-1 flex-col justify-center bg-white px-[5cqw] text-left" style={{ gap: '1.8cqw' }}>
          <Title color={d.accent} size={7.5} />
          {d.showPhoto && <PhotoFrame accent={d.accent} size={22} name={sampleValues(b).employee_name} />}
          <Name color={dark} /><Sub color={dark} /><Body color={dark} /><Sign color={d.accent} />
        </div>
      </div>
    </Wrap>;
  }
  // 4) SPLIT — diagonal two-tone, photo straddling the split.
  if (d.layoutKind === 'split') {
    return <Wrap>
      <div className="absolute inset-0 bg-white" />
      <div className="absolute left-0 top-0 w-full" style={{ height: '60%', ...baseBg, clipPath: 'polygon(0 0,100% 0,100% 78%,0 100%)' }}>
        <CardArt art={d.art} accent={d.accent} />
        <div className="absolute inset-0 flex flex-col items-center px-[6cqw] pt-[7cqw] text-center">
          <div className="absolute left-[4cqw] top-[4cqw]"><LogoChip logo={d.logo} brand={b.companyName} light /></div>
          <Title color={d.text} size={8.5} />
        </div>
      </div>
      <div className="absolute bottom-0 left-0 flex w-full flex-col items-center px-[7cqw] pb-[6cqw] text-center" style={{ height: '52%', justifyContent: 'flex-end', gap: '1.6cqw' }}>
        {d.showPhoto && <div className="absolute left-1/2 -translate-x-1/2" style={{ top: '-8cqw' }}><PhotoFrame accent={d.accent} size={24} name={sampleValues(b).employee_name} /></div>}
        <div style={{ height: d.showPhoto ? '13cqw' : '0' }} />
        <Name color={dark} /><Sub color={dark} /><Body color={dark} /><Sign color={d.accent} />
      </div>
    </Wrap>;
  }
  // 5) CLASSIC — elegant centered stack on a light background, divider + signoff.
  return <Wrap>
    <div className="absolute inset-0" style={baseBg}><CardArt art={d.art} accent={d.accent} /></div>
    <div className="absolute inset-0 flex flex-col items-center justify-center px-[7cqw] text-center" style={{ gap: '2cqw' }}>
      <LogoChip logo={d.logo} brand={b.companyName} />
      <div style={{ fontSize: '13cqw', lineHeight: 1 }}>{d.emoji}</div>
      <Title color={d.accent} size={7.5} />
      {d.showPhoto && <PhotoFrame accent={d.accent} size={24} name={sampleValues(b).employee_name} />}
      <Name color={d.text} /><Sub color={d.text} />
      <div style={{ width: '24cqw', height: '0.5cqw', background: d.accent, opacity: 0.6 }} />
      <Body color={d.text} /><Sign color={d.accent} />
    </div>
  </Wrap>;
};

// Grid/gallery thumbnail — a full greeting card; cqw + 4:5 aspect make it scale.
const TemplateThumb: React.FC<{ item: any; height?: number }> = ({ item }) => <GreetingCard item={item} />;

interface Props { role?: string; }

export const CommunicationCenter: React.FC<Props> = () => {
  const [tab, setTab] = useState<TabId>('dashboard');
  const [branding, setBranding] = useState<Branding>({ companyName: 'Vishv Enterprise' });

  // Pull company branding from Company Profile (single source of truth) so every
  // card automatically shows the real company name / logo / footer / signature.
  useEffect(() => {
    (async () => {
      try {
        const p = await api.companyProfile.get();
        const c = (p && (p.company || p)) || {};
        setBranding({
          companyName: c.displayName || c.tradeName || c.name || c.legalName || 'Vishv Enterprise',
          logo: c.logoImage || c.logo || '',
          footer: c.footerText || '',
          signature: c.signatureText || c.digitalSignatureImage || c.authorizedSignatory || '',
        });
      } catch { /* branding optional — sample defaults used */ }
    })();
  }, []);

  return (
    <BrandingCtx.Provider value={branding}>
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="rounded-2xl border border-[#DBEAFE] bg-white px-4 py-3 shadow-sm">
        <h2 className="flex items-center gap-2 text-sm font-extrabold text-slate-800"><MessageSquare size={16} className="text-[#4F7CFF]" /> Communication Center</h2>
        <p className="text-[11px] text-slate-400">Central hub for employee notifications, greetings & announcements · Phase 1 (foundation)</p>
      </div>

      {/* Sub navigation */}
      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 -mb-px transition-colors ${tab === t.id ? 'border-[#4F7CFF] text-[#4F7CFF]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'dashboard' && <DashboardTab onGo={setTab} />}
      {tab === 'templates' && <TemplatesTab />}
      {tab === 'designer' && <DesignerTab />}
      {tab === 'birthday' && <BirthdayTab />}
      {tab === 'festival' && <FestivalTab />}
      {tab === 'holidays' && <HolidayTab />}
      {tab === 'announcements' && <AnnouncementsTab />}
      {tab === 'scheduled' && <ScheduledTab />}
      {tab === 'logs' && <DeliveryLogsTab />}
      {tab === 'settings' && <SettingsTab />}
    </div>
    </BrandingCtx.Provider>
  );
};

// ── Dashboard ─────────────────────────────────────────────────────────────────
const Card: React.FC<{ label: string; value: React.ReactNode; icon: React.ReactNode; tone?: string }> = ({ label, value, icon, tone }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-4">
    <div className={`mb-2 flex h-8 w-8 items-center justify-center rounded-lg ${tone || 'bg-[#EDF4FF] text-[#4F7CFF]'}`}>{icon}</div>
    <p className="text-2xl font-extrabold text-slate-800">{value}</p>
    <p className="text-[11px] font-semibold text-slate-400">{label}</p>
  </div>
);

const DashboardTab: React.FC<{ onGo: (t: TabId) => void }> = ({ onGo }) => {
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { (async () => { try { setD(await api.communication.dashboard()); } catch (e) { ui.toast.error(getApiErrorMessage(e)); } finally { setLoading(false); } })(); }, []);
  const v = (k: string) => (d ? d[k] ?? 0 : 0);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Card label="Total Templates" value={loading ? '—' : v('totalTemplates')} icon={<FileText size={16} />} />
        <Card label="Scheduled Messages" value={loading ? '—' : v('scheduledMessages')} icon={<Clock size={16} />} />
        <Card label="Sent Today" value={loading ? '—' : v('sentToday')} icon={<Send size={16} />} tone="bg-emerald-50 text-emerald-600" />
        <Card label="Upcoming Birthdays" value={loading ? '—' : v('upcomingBirthdays')} icon={<Cake size={16} />} tone="bg-pink-50 text-pink-600" />
        <Card label="Upcoming Work Anniversaries" value={loading ? '—' : v('upcomingAnniversaries')} icon={<Sparkles size={16} />} tone="bg-indigo-50 text-indigo-600" />
        <Card label="Festival Templates" value={loading ? '—' : v('festivalTemplates')} icon={<PartyPopper size={16} />} tone="bg-orange-50 text-orange-600" />
        <Card label="Announcements" value={loading ? '—' : v('announcements')} icon={<Megaphone size={16} />} tone="bg-violet-50 text-violet-600" />
        <Card label="Upcoming Holidays" value={loading ? '—' : v('upcomingHolidays')} icon={<CalendarDays size={16} />} tone="bg-teal-50 text-teal-600" />
        <Card label="Draft Messages" value={loading ? '—' : v('draftMessages')} icon={<FileStack size={16} />} tone="bg-slate-100 text-slate-500" />
      </div>
      <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
        <p className="mb-2 text-xs font-extrabold text-slate-700">Quick actions</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" icon={<FileText size={14} />} onClick={() => onGo('templates')}>Manage Templates</Button>
          <Button size="sm" variant="outline" icon={<Megaphone size={14} />} onClick={() => onGo('announcements')}>New Announcement</Button>
          <Button size="sm" variant="outline" icon={<CalendarDays size={14} />} onClick={() => onGo('holidays')}>Holiday Calendar</Button>
          <Button size="sm" variant="outline" icon={<Clock size={14} />} onClick={() => onGo('scheduled')}>Schedule a Message</Button>
        </div>
        <p className="mt-3 text-[11px] text-slate-400">Sending (WhatsApp / SMS / Email / Push) arrives in Phase 2. Phase 1 lets you build and store everything in advance.</p>
      </div>
    </div>
  );
};

// ── Templates ─────────────────────────────────────────────────────────────────
const FONT_OPTIONS = [
  { value: "'Trebuchet MS',sans-serif", label: 'Trebuchet (Sans)' },
  { value: "'Georgia',serif", label: 'Georgia (Serif)' },
  { value: "'Playfair Display','Georgia',serif", label: 'Playfair (Display)' },
  { value: "'Garamond','Georgia',serif", label: 'Garamond (Elegant)' },
  { value: "'Verdana',sans-serif", label: 'Verdana (Bold)' },
  { value: "'Courier New',monospace", label: 'Courier (Mono)' },
];
const LAYOUT_OPTIONS = [
  { value: 'classic', label: 'Classic (centered)' },
  { value: 'banner', label: 'Banner (top header)' },
  { value: 'sidebar', label: 'Sidebar (split)' },
  { value: 'frame', label: 'Framed (ornate border)' },
  { value: 'split', label: 'Diagonal split' },
];
const ART_OPTIONS = ['celebration', 'birthday', 'anniversary', 'welcome', 'farewell', 'promotion', 'award', 'finance', 'document', 'notice', 'diwali', 'holi', 'eid', 'christmas', 'newyear', 'tricolor', 'navratri', 'rakhi', 'janmashtami', 'ganesh', 'kite', 'shivratri', 'womensday', 'labour', 'flowers', 'formal'];
const starterDesign = () => ({
  theme: { bg1: '#4f46e5', bg2: '#9333ea', background: 'linear-gradient(135deg,#4f46e5 0%,#9333ea 100%)', accent: '#fde047', text: '#ffffff', font: "'Trebuchet MS',sans-serif", emoji: '🎉', art: 'celebration', layoutKind: 'classic' },
  greetingTitle: '', subtitle: '', signoff: 'Best wishes, {{company_name}}',
});
const blankTemplate = () => ({ title: '', category: 'Birthday Wishes', subject: '', body: '', status: 'Draft', backgroundImage: '', companyLogo: '', employeePhotoPlaceholder: true, festivalName: '', festivalDate: '', layout: starterDesign() });

const TemplatesTab: React.FC = () => {
  const [items, setItems] = useState<any[]>([]);
  const [samples, setSamples] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'mine' | 'samples'>('samples');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const [modal, setModal] = useState(false);
  const [draft, setDraft] = useState<any>(blankTemplate());
  const [preview, setPreview] = useState<any>(null);
  const [duplicating, setDuplicating] = useState<string>('');
  const bgRef = useRef<HTMLInputElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);

  const load = async () => { setLoading(true); try { setItems(await api.communication.templates.list()); } catch (e) { ui.toast.error(getApiErrorMessage(e)); } finally { setLoading(false); } };
  useEffect(() => {
    load();
    (async () => { try { setSamples(await api.communication.sampleTemplates()); } catch { /* gallery optional */ } })();
  }, []);
  // Land on "My Templates" automatically once the user has created their own.
  useEffect(() => { if (!loading && items.length > 0) setView('mine'); }, [loading, items.length]);

  const matches = (i: any) => (cat === 'All' || i.category === cat) && (!q || `${i.title || ''} ${i.festivalName || ''}`.toLowerCase().includes(q.toLowerCase()));
  const filtered = useMemo(() => items.filter(matches), [items, cat, q]);
  const filteredSamples = useMemo(() => samples.filter(matches), [samples, cat, q]);

  const openNew = () => { setDraft(blankTemplate()); setModal(true); };
  const openEdit = (t: any) => { const layout = parseLayout(t.layout); setDraft({ ...t, layout: (layout && layout.theme) ? layout : starterDesign() }); setModal(true); };
  const upload = async (key: string, file?: File) => { if (!file) return; try { setDraft((d: any) => ({ ...d, [key]: '' })); const url = await readFileAsDataUrl(file); setDraft((d: any) => ({ ...d, [key]: url })); } catch { ui.toast.error('Could not read the file.'); } };
  // Design editor helpers — mutate the working layout/theme object.
  const setTheme = (patch: any) => setDraft((d: any) => {
    const layout = { ...(typeof d.layout === 'object' && d.layout ? d.layout : starterDesign()) };
    layout.theme = { ...(layout.theme || {}), ...patch };
    if (patch.bg1 !== undefined || patch.bg2 !== undefined) layout.theme.background = `linear-gradient(135deg,${layout.theme.bg1 || '#4f46e5'} 0%,${layout.theme.bg2 || '#9333ea'} 100%)`;
    return { ...d, layout };
  });
  const setLayoutField = (patch: any) => setDraft((d: any) => ({ ...d, layout: { ...(typeof d.layout === 'object' && d.layout ? d.layout : starterDesign()), ...patch } }));
  const dTheme = (typeof draft.layout === 'object' && draft.layout?.theme) ? draft.layout.theme : starterDesign().theme;
  const dLayout = (typeof draft.layout === 'object' && draft.layout) ? draft.layout : starterDesign();
  const save = async () => {
    if (!draft.title?.trim()) { ui.toast.error('Template title is required.'); return; }
    try {
      if (draft.id) await api.communication.templates.update(draft.id, draft);
      else await api.communication.templates.create(draft);
      ui.toast.success('Template saved.'); setModal(false); await load();
    } catch (e) { ui.toast.error(getApiErrorMessage(e) || 'Could not save the template.'); }
  };
  const remove = async (t: any) => {
    if (!(await ui.confirm({ message: `Delete template "${t.title}"?`, variant: 'danger', confirmText: 'Delete' }))) return;
    try { await api.communication.templates.remove(t.id); ui.toast.success('Deleted.'); await load(); } catch (e) { ui.toast.error(getApiErrorMessage(e)); }
  };
  // Duplicate a sample into an editable, company-owned template. The visual theme
  // is preserved inside `layout` so the new template keeps its Canva-style look.
  const duplicate = async (s: any) => {
    setDuplicating(s.key);
    try {
      await api.communication.templates.create({
        title: `${s.title} (Copy)`,
        category: s.category,
        subject: s.greetingTitle || '',
        body: s.body || '',
        status: 'Draft',
        festivalName: s.festivalName || '',
        employeePhotoPlaceholder: !!s.showEmployeePhoto,
        placeholders: s.placeholders || [],
        layout: { theme: s.theme, emoji: s.emoji, art: s.art, layoutKind: s.layoutKind, greetingTitle: s.greetingTitle, subtitle: s.subtitle, signoff: s.signoff, fromSample: s.key },
      });
      ui.toast.success('Sample duplicated — find it under "My Templates" to edit.');
      await load(); setView('mine');
    } catch (e) { ui.toast.error(getApiErrorMessage(e)); } finally { setDuplicating(''); }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-0.5">
            <button onClick={() => setView('mine')} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${view === 'mine' ? 'bg-white text-[#4F7CFF] shadow-sm' : 'text-slate-500'}`}>My Templates ({items.length})</button>
            <button onClick={() => setView('samples')} className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold ${view === 'samples' ? 'bg-white text-[#4F7CFF] shadow-sm' : 'text-slate-500'}`}><Star size={12} /> Sample Library ({samples.length})</button>
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search templates…" className="w-52 rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-700 focus:border-[#4F7CFF] focus:outline-none" />
          </div>
          <select value={cat} onChange={e => setCat(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 focus:border-[#4F7CFF] focus:outline-none">
            <option value="All">All Categories</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {view === 'mine' && <Button size="sm" icon={<Plus size={14} />} onClick={openNew}>New Template</Button>}
      </div>

      {view === 'samples' && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-[11px] font-semibold text-indigo-700">
          Professionally designed sample templates — preview, then <b>Duplicate</b> any one to make an editable copy. {filteredSamples.length} samples shown.
        </div>
      )}

      {view === 'mine' ? (
        loading ? <div className="py-16 text-center text-sm text-slate-500">Loading…</div>
          : filtered.length === 0 ? <EmptyState icon={<FileText size={28} />} title="No templates yet" subtitle="Create one with “New Template”, or duplicate a ready-made design from the Sample Library." />
            : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filtered.map(t => (
                  <div key={t.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                    <TemplateThumb item={t} height={104} />
                    <div className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="line-clamp-1 text-[13px] font-bold text-slate-800">{t.title}</p>
                        <Badge variant={t.status === 'Active' ? 'green' : t.status === 'Archived' ? 'gray' : 'amber'}>{t.status}</Badge>
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-400">{t.category}</p>
                      <div className="mt-2 flex items-center gap-1.5">
                        <button onClick={() => setPreview(t)} className="text-slate-400 hover:text-[#4F7CFF]" title="Preview"><Eye size={15} /></button>
                        <button onClick={() => openEdit(t)} className="text-slate-400 hover:text-indigo-500" title="Edit"><Edit size={15} /></button>
                        <button onClick={() => remove(t)} className="text-slate-400 hover:text-rose-500" title="Delete"><Trash2 size={15} /></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
      ) : (
        filteredSamples.length === 0 ? <EmptyState icon={<LayoutGrid size={28} />} title="No samples match" subtitle="Try a different category or search." />
          : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {filteredSamples.map(s => (
                <div key={s.key} className="group overflow-hidden rounded-xl border border-slate-200 bg-white transition-shadow hover:shadow-md">
                  <div className="relative">
                    <TemplateThumb item={s} height={120} />
                    <button onClick={() => setPreview(s)} className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-opacity group-hover:bg-black/30 group-hover:opacity-100" title="Preview">
                      <span className="flex items-center gap-1 rounded-lg bg-white/90 px-2 py-1 text-[11px] font-bold text-slate-700"><Eye size={13} /> Preview</span>
                    </button>
                  </div>
                  <div className="p-2.5">
                    <p className="line-clamp-1 text-[12px] font-bold text-slate-800">{s.title}</p>
                    <p className="mt-0.5 line-clamp-1 text-[10px] text-slate-400">{s.category}</p>
                    <Button size="sm" variant="outline" className="mt-2 w-full" icon={<Copy size={12} />} disabled={duplicating === s.key} onClick={() => duplicate(s)}>
                      {duplicating === s.key ? 'Duplicating…' : 'Duplicate'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )
      )}

      {/* Editor */}
      {modal && (
        <Modal open={modal} onClose={() => setModal(false)} title={`${draft.id ? 'Edit' : 'New'} Template`} size="xl"
          footer={<><Button variant="outline" onClick={() => setModal(false)}>Cancel</Button><Button onClick={save} icon={<Plus size={14} />}>Save Template</Button></>}>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[280px,1fr]">
            {/* Live preview (sample data) */}
            <div className="lg:sticky lg:top-0 lg:self-start">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Live Preview</p>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><GreetingCard item={draft} /></div>
              <p className="mt-2 text-[10px] text-slate-400">Shows sample data (e.g. “OM PATEL”). Real employee &amp; company details merge in Phase 2.</p>
            </div>

            {/* Form */}
            <div className="max-h-[64vh] space-y-3 overflow-y-auto pr-1">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Input label="Title *" value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} />
                <Select label="Category" value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })} options={CATEGORIES.map(c => ({ value: c, label: c }))} />
                <Select label="Status" value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value })} options={['Draft', 'Active', 'Archived'].map(s => ({ value: s, label: s }))} />
                {draft.category === 'Festival Greetings'
                  ? <Input label="Festival Name" value={draft.festivalName} onChange={e => setDraft({ ...draft, festivalName: e.target.value })} />
                  : <Input label="Subject (optional)" value={draft.subject} onChange={e => setDraft({ ...draft, subject: e.target.value })} />}
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Input label="Greeting Headline" value={dLayout.greetingTitle || ''} onChange={e => setLayoutField({ greetingTitle: e.target.value })} placeholder="Happy Birthday!" />
                <Input label="Subtitle" value={dLayout.subtitle || ''} onChange={e => setLayoutField({ subtitle: e.target.value })} placeholder="{{designation}}" />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-bold text-slate-500">Message Body</label>
                <textarea value={draft.body} onChange={e => setDraft({ ...draft, body: e.target.value })} rows={3}
                  className="w-full rounded-xl border border-slate-200 p-2 text-xs text-slate-700 focus:border-[#4F7CFF] focus:outline-none"
                  placeholder="Write your message. Insert placeholders from the library below." />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {PLACEHOLDERS.map(p => (
                    <button key={p} type="button" onClick={() => setDraft((d: any) => ({ ...d, body: `${d.body || ''}${p}` }))}
                      className="rounded-lg border border-indigo-150 bg-white px-2 py-1 text-[10px] font-bold text-indigo-700 hover:bg-indigo-600 hover:text-white">{p}</button>
                  ))}
                </div>
              </div>
              <Input label="Sign-off" value={dLayout.signoff || ''} onChange={e => setLayoutField({ signoff: e.target.value })} placeholder="Best wishes, {{company_name}}" />

              {/* Design panel */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                <p className="mb-2 flex items-center gap-1.5 text-[11px] font-extrabold text-slate-700"><LayoutTemplate size={13} /> Design</p>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <Select label="Layout" value={dTheme.layoutKind} onChange={e => setTheme({ layoutKind: e.target.value })} options={LAYOUT_OPTIONS} />
                  <Select label="Artwork" value={dTheme.art} onChange={e => setTheme({ art: e.target.value })} options={ART_OPTIONS.map(a => ({ value: a, label: a.charAt(0).toUpperCase() + a.slice(1) }))} />
                  <Select label="Font" value={dTheme.font} onChange={e => setTheme({ font: e.target.value })} options={FONT_OPTIONS} />
                  <Input label="Motif Emoji" value={dTheme.emoji || ''} onChange={e => setTheme({ emoji: e.target.value })} placeholder="🎉" />
                  <div>
                    <label className="mb-1 block text-[11px] font-bold text-slate-500">Background Colors</label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={dTheme.bg1 || '#4f46e5'} onChange={e => setTheme({ bg1: e.target.value })} className="h-8 w-10 cursor-pointer rounded border border-slate-200" title="Color 1" />
                      <input type="color" value={dTheme.bg2 || '#9333ea'} onChange={e => setTheme({ bg2: e.target.value })} className="h-8 w-10 cursor-pointer rounded border border-slate-200" title="Color 2" />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-bold text-slate-500">Accent / Text</label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={dTheme.accent || '#fde047'} onChange={e => setTheme({ accent: e.target.value })} className="h-8 w-10 cursor-pointer rounded border border-slate-200" title="Accent" />
                      <input type="color" value={dTheme.text || '#ffffff'} onChange={e => setTheme({ text: e.target.value })} className="h-8 w-10 cursor-pointer rounded border border-slate-200" title="Title text" />
                    </div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <p className="mb-1 text-[11px] font-bold text-slate-500">Custom Background Image (optional)</p>
                    <input ref={bgRef} type="file" accept="image/*" className="hidden" onChange={e => upload('backgroundImage', e.target.files?.[0])} />
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" icon={<Upload size={13} />} onClick={() => bgRef.current?.click()}>{draft.backgroundImage ? 'Replace' : 'Upload'}</Button>
                      {draft.backgroundImage && <button onClick={() => setDraft({ ...draft, backgroundImage: '' })} className="text-slate-400 hover:text-rose-500"><X size={14} /></button>}
                    </div>
                  </div>
                  <div>
                    <p className="mb-1 text-[11px] font-bold text-slate-500">Company Logo (override)</p>
                    <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={e => upload('companyLogo', e.target.files?.[0])} />
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" icon={<Upload size={13} />} onClick={() => logoRef.current?.click()}>{draft.companyLogo ? 'Replace' : 'Upload'}</Button>
                      {draft.companyLogo && <button onClick={() => setDraft({ ...draft, companyLogo: '' })} className="text-slate-400 hover:text-rose-500"><X size={14} /></button>}
                    </div>
                  </div>
                </div>
                <label className="mt-3 flex w-fit items-center gap-2 text-[11px] font-semibold text-slate-600">
                  <input type="checkbox" checked={!!draft.employeePhotoPlaceholder} onChange={e => setDraft({ ...draft, employeePhotoPlaceholder: e.target.checked })} />
                  Include employee photo frame
                </label>
                <p className="mt-2 text-[10px] text-slate-400">Drag-and-drop positioning of elements arrives in a future enhancement; layout presets cover placement for now.</p>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Preview */}
      {preview && (
        <Modal open={!!preview} onClose={() => setPreview(null)} title={`Preview — ${preview.title}`} size="md"
          footer={<>
            {preview.key && <Button icon={<Copy size={14} />} disabled={duplicating === preview.key} onClick={() => duplicate(preview)}>Duplicate</Button>}
            <Button variant="outline" onClick={() => setPreview(null)}>Close</Button>
          </>}>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="mx-auto" style={{ maxWidth: 300 }}><GreetingCard item={preview} /></div>
            <div className="mt-3 flex flex-wrap justify-center gap-1">
              <Badge variant="gray">{preview.category}</Badge>
              {preview.festivalName && <Badge variant="amber">{preview.festivalName}</Badge>}
              {preview.styleName && <Badge variant="blue">{preview.styleName} style</Badge>}
            </div>
          </div>
          <p className="mt-2 text-center text-[10px] text-slate-400">Preview uses sample employee data (e.g. “OM PATEL”). Real employee details are merged when sending in Phase 2.</p>
        </Modal>
      )}
    </div>
  );
};

// ── Template Designer (UI only — saves layout JSON, no rendering) ─────────────
const DesignerTab: React.FC = () => {
  const [placed, setPlaced] = useState<string[]>([]);
  const [name, setName] = useState('');
  const add = (el: string) => setPlaced(p => [...p, el]);
  const save = async () => {
    if (!name.trim()) { ui.toast.error('Give the layout a name.'); return; }
    try {
      await api.communication.templates.create({ title: name, category: 'Custom Templates', status: 'Draft', layout: { elements: placed } });
      ui.toast.success('Layout saved as a draft template. Visual rendering arrives in Phase 2.');
      setName(''); setPlaced([]);
    } catch (e) { ui.toast.error(getApiErrorMessage(e)); }
  };
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="mb-2 text-xs font-extrabold text-slate-700">Elements</p>
        <p className="mb-3 text-[10px] text-slate-400">Click to place onto the canvas (drag positioning &amp; live rendering come in Phase 2).</p>
        <div className="flex flex-wrap gap-1.5">
          {DESIGNER_ELEMENTS.map(el => (
            <button key={el} onClick={() => add(el)} className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:border-[#4F7CFF] hover:text-[#4F7CFF]">+ {el}</button>
          ))}
        </div>
      </div>
      <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <Input label="" value={name} onChange={e => setName(e.target.value)} placeholder="Layout name…" />
          <Button size="sm" icon={<LayoutTemplate size={14} />} onClick={save}>Save Layout</Button>
        </div>
        <div className="min-h-[280px] rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-4">
          {placed.length === 0 ? (
            <div className="flex h-[240px] flex-col items-center justify-center text-slate-400">
              <LayoutTemplate size={30} /><p className="mt-2 text-xs font-semibold">Empty canvas — add elements from the left.</p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {placed.map((el, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-700">
                  {el}<button onClick={() => setPlaced(p => p.filter((_, j) => j !== i))} className="text-slate-400 hover:text-rose-500"><X size={12} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Birthday Wishes (Phase 2 for sending) ─────────────────────────────────────
const BirthdayTab: React.FC = () => (
  <div className="space-y-3">
    <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[11px] font-semibold text-amber-700">
      <span>Auto birthday detection &amp; sending</span><Phase2Badge />
    </div>
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {['Today\'s Birthdays', 'Upcoming Birthdays', 'Sent History'].map(s => (
        <div key={s} className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="mb-3 flex items-center gap-2 text-xs font-extrabold text-slate-700"><Cake size={14} className="text-pink-500" /> {s}</p>
          <EmptyState small icon={<Cake size={22} />} title="Available in Phase 2" subtitle="Birthday detection activates with sending." />
        </div>
      ))}
    </div>
    <div className="flex gap-2">
      <Button size="sm" disabled icon={<Send size={14} />}>Send</Button>
      <Button size="sm" variant="outline" disabled icon={<CalendarClock size={14} />}>Schedule</Button>
    </div>
  </div>
);

// ── Festival Greetings (create templates only) ────────────────────────────────
const FestivalTab: React.FC = () => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const load = async () => { setLoading(true); try { setItems(await api.communication.templates.list('Festival Greetings')); } catch (e) { ui.toast.error(getApiErrorMessage(e)); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-[11px] font-semibold text-indigo-700">
        <span>Create festival greeting templates here. Sending &amp; auto-scheduling arrive in Phase 2.</span><Phase2Badge />
      </div>
      {loading ? <div className="py-12 text-center text-sm text-slate-500">Loading…</div>
        : items.length === 0 ? <EmptyState icon={<PartyPopper size={26} />} title="No festival templates" subtitle="Add festival greeting templates from the Templates tab (category: Festival Greetings)." />
          : (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500"><tr>{['Festival', 'Date', 'Template', 'Status', 'Preview'].map(h => <th key={h} className="px-3 py-2 text-left font-bold">{h}</th>)}</tr></thead>
                <tbody>
                  {items.map(t => (
                    <tr key={t.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-semibold text-slate-700">{t.festivalName || '—'}</td>
                      <td className="px-3 py-2">{formatDate(t.festivalDate)}</td>
                      <td className="px-3 py-2">{t.title}</td>
                      <td className="px-3 py-2"><Badge variant={t.status === 'Active' ? 'green' : 'amber'}>{t.status}</Badge></td>
                      <td className="px-3 py-2 text-slate-400">{t.body ? `${String(t.body).slice(0, 40)}…` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
    </div>
  );
};

// ── Holiday Calendar ──────────────────────────────────────────────────────────
const blankHoliday = () => ({ name: '', category: 'Public Holiday', date: '', applicableBranches: '', applicableDepartments: '', description: '', isPublicHoliday: true, isOptionalHoliday: false, isRecurring: true, status: 'Active' });
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ymd = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const arrToCsv = (raw: any): string => { if (!raw) return ''; let a = raw; if (typeof raw === 'string') { try { a = JSON.parse(raw); } catch { return raw; } } return Array.isArray(a) ? a.join(', ') : String(a); };
const csvToArr = (s: string): string[] => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
const holidayTone = (h: any) => h.isOptionalHoliday ? 'amber' : h.isPublicHoliday ? 'red' : 'blue';
const nextOccurrence = (h: any): Date | null => {
  const d = new Date(h.date); if (isNaN(d.getTime())) return null;
  const now = new Date(); const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!h.isRecurring) return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  let occ = new Date(today.getFullYear(), d.getMonth(), d.getDate());
  if (occ < today) occ = new Date(today.getFullYear() + 1, d.getMonth(), d.getDate());
  return occ;
};
const daysUntil = (h: any): number | null => {
  const o = nextOccurrence(h); if (!o) return null;
  const now = new Date(); const t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((o.getTime() - t.getTime()) / 86400000);
};
const downloadFile = (name: string, content: string, mime: string) => {
  const blob = new Blob([content], { type: mime }); const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
};

const HolidayTab: React.FC = () => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'calendar' | 'month' | 'list'>('calendar');
  const [cursor, setCursor] = useState(() => { const n = new Date(); return { y: n.getFullYear(), m: n.getMonth() }; });
  const [modal, setModal] = useState(false);
  const [draft, setDraft] = useState<any>(blankHoliday());
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => { setLoading(true); try { setItems(await api.communication.holidays.list()); } catch (e) { ui.toast.error(getApiErrorMessage(e)); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);

  const openNew = () => { setDraft(blankHoliday()); setModal(true); };
  const openEdit = (h: any) => { setDraft({ ...h, applicableBranches: arrToCsv(h.applicableBranches), applicableDepartments: arrToCsv(h.applicableDepartments) }); setModal(true); };
  const save = async () => {
    if (!draft.name?.trim()) { ui.toast.error('Holiday name is required.'); return; }
    if (!draft.date) { ui.toast.error('Holiday date is required.'); return; }
    const payload = { ...draft, applicableBranches: csvToArr(draft.applicableBranches), applicableDepartments: csvToArr(draft.applicableDepartments) };
    try { if (draft.id) await api.communication.holidays.update(draft.id, payload); else await api.communication.holidays.create(payload); ui.toast.success('Holiday saved.'); setModal(false); await load(); }
    catch (e) { ui.toast.error(getApiErrorMessage(e)); }
  };
  const remove = async (h: any) => { if (!(await ui.confirm({ message: `Delete holiday "${h.name}"?`, variant: 'danger', confirmText: 'Delete' }))) return; try { await api.communication.holidays.remove(h.id); ui.toast.success('Deleted.'); await load(); } catch (e) { ui.toast.error(getApiErrorMessage(e)); } };

  const importIndian = async () => {
    setImporting(true);
    try {
      const list = await api.communication.sampleHolidays(cursor.y);
      const res = await api.communication.holidays.import(list);
      ui.toast.success(`Imported ${res.created} holiday(s)${res.skipped ? `, ${res.skipped} already present` : ''}.`);
      await load();
    } catch (e) { ui.toast.error(getApiErrorMessage(e)); } finally { setImporting(false); }
  };
  const importFromFile = async (file?: File) => {
    if (!file) return;
    try {
      const text = await file.text();
      let rows: any[] = [];
      if (file.name.toLowerCase().endsWith('.json')) { const parsed = JSON.parse(text); rows = Array.isArray(parsed) ? parsed : (parsed.holidays || []); }
      else { // CSV: name,date,category,description
        const lines = text.split(/\r?\n/).filter(Boolean); const header = lines.shift()?.split(',').map(h => h.trim().toLowerCase()) || [];
        rows = lines.map(l => { const cols = l.split(','); const o: any = {}; header.forEach((h, i) => o[h] = (cols[i] || '').trim()); return { name: o.name, date: o.date, category: o.category || 'Public Holiday', description: o.description }; });
      }
      if (!rows.length) { ui.toast.error('No rows found in the file.'); return; }
      const res = await api.communication.holidays.import(rows);
      ui.toast.success(`Imported ${res.created} holiday(s)${res.skipped ? `, ${res.skipped} skipped` : ''}.`);
      await load();
    } catch (e) { ui.toast.error(getApiErrorMessage(e) || 'Could not read the file.'); }
    finally { if (fileRef.current) fileRef.current.value = ''; }
  };
  const exportJson = () => downloadFile(`holidays-${cursor.y}.json`, JSON.stringify(items, null, 2), 'application/json');
  const exportCsv = () => {
    const head = 'name,date,category,isPublicHoliday,isOptionalHoliday,isRecurring,status,description';
    const rows = items.map(h => [h.name, h.date, h.category, h.isPublicHoliday, h.isOptionalHoliday, h.isRecurring, h.status, (h.description || '').replace(/[\n,]/g, ' ')].join(','));
    downloadFile(`holidays-${cursor.y}.csv`, [head, ...rows].join('\n'), 'text/csv');
  };

  const upcoming = useMemo(() => items.filter(h => h.status !== 'Inactive').map(h => ({ ...h, _in: daysUntil(h) })).filter(h => h._in != null && h._in >= 0).sort((a, b) => a._in - b._in).slice(0, 5), [items]);
  const monthHolidays = useMemo(() => items.filter(h => { const d = new Date(h.date); return h.isRecurring ? d.getMonth() === cursor.m : (d.getFullYear() === cursor.y && d.getMonth() === cursor.m); }).sort((a, b) => new Date(a.date).getDate() - new Date(b.date).getDate()), [items, cursor]);
  const shiftMonth = (delta: number) => setCursor(c => { let m = c.m + delta, y = c.y; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } return { y, m }; });

  // Calendar grid cells
  const firstDow = new Date(cursor.y, cursor.m, 1).getDay();
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const todayStr = (() => { const n = new Date(); return ymd(n.getFullYear(), n.getMonth(), n.getDate()); })();
  const holidaysOn = (day: number) => { const mmdd = `${String(cursor.m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`; const full = ymd(cursor.y, cursor.m, day); return items.filter(h => h.isRecurring ? String(h.date).slice(5) === mmdd : h.date === full); };

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-0.5">
          {([['calendar', 'Calendar', CalendarDays], ['month', 'Monthly', LayoutGrid], ['list', 'List', ListIcon]] as const).map(([id, label, Icon]) => (
            <button key={id} onClick={() => setView(id)} className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold ${view === id ? 'bg-white text-[#4F7CFF] shadow-sm' : 'text-slate-500'}`}><Icon size={12} /> {label}</button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <input ref={fileRef} type="file" accept=".json,.csv" className="hidden" onChange={e => importFromFile(e.target.files?.[0])} />
          <Button size="sm" variant="outline" icon={<Sparkles size={13} />} disabled={importing} onClick={importIndian}>{importing ? 'Importing…' : `Import Indian Holidays ${cursor.y}`}</Button>
          <Button size="sm" variant="outline" icon={<Upload size={13} />} onClick={() => fileRef.current?.click()}>Import File</Button>
          <Button size="sm" variant="outline" icon={<Download size={13} />} onClick={exportCsv}>Export CSV</Button>
          <Button size="sm" variant="outline" icon={<Download size={13} />} onClick={exportJson}>Export JSON</Button>
          <Button size="sm" icon={<Plus size={14} />} onClick={openNew}>Add Holiday</Button>
        </div>
      </div>

      {/* Upcoming widget */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="mb-2 flex items-center gap-2 text-xs font-extrabold text-slate-700"><CalendarClock size={14} className="text-teal-500" /> Upcoming Holidays</p>
        {upcoming.length === 0 ? <p className="text-[11px] text-slate-400">No upcoming holidays. Add holidays or import the Indian holiday list.</p>
          : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {upcoming.map(h => (
                <div key={h.id} className="rounded-xl border border-slate-150 bg-slate-50/70 p-3">
                  <div className="flex items-center justify-between gap-1"><p className="line-clamp-1 text-[12px] font-bold text-slate-800">{h.name}</p><Badge variant={holidayTone(h) as any}>{h._in === 0 ? 'Today' : `${h._in}d`}</Badge></div>
                  <p className="mt-0.5 text-[10px] text-slate-400">{formatDate(nextOccurrence(h) as any)}</p>
                  <p className="mt-0.5 text-[10px] font-semibold text-teal-600">{h._in === 0 ? 'Today!' : `${h._in} day${h._in === 1 ? '' : 's'} remaining`}</p>
                </div>
              ))}
            </div>
          )}
      </div>

      {/* Month navigator (calendar + monthly views) */}
      {view !== 'list' && (
        <div className="flex items-center justify-center gap-3">
          <button onClick={() => shiftMonth(-1)} className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50"><ChevronLeft size={16} /></button>
          <p className="w-44 text-center text-sm font-extrabold text-slate-800">{MONTHS[cursor.m]} {cursor.y}</p>
          <button onClick={() => shiftMonth(1)} className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50"><ChevronRight size={16} /></button>
        </div>
      )}

      {loading ? <div className="py-12 text-center text-sm text-slate-500">Loading…</div> : (
        <>
          {view === 'calendar' && (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center">
                {WEEKDAYS.map(d => <div key={d} className="py-2 text-[10px] font-bold text-slate-500">{d}</div>)}
              </div>
              <div className="grid grid-cols-7">
                {Array.from({ length: firstDow }).map((_, i) => <div key={`b${i}`} className="min-h-[78px] border-b border-r border-slate-100 bg-slate-50/40" />)}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1; const list = holidaysOn(day); const isToday = ymd(cursor.y, cursor.m, day) === todayStr;
                  return (
                    <div key={day} className={`min-h-[78px] border-b border-r border-slate-100 p-1.5 ${isToday ? 'bg-blue-50/60' : ''}`}>
                      <div className={`mb-1 text-[11px] font-bold ${isToday ? 'text-[#4F7CFF]' : 'text-slate-500'}`}>{day}</div>
                      <div className="space-y-0.5">
                        {list.slice(0, 3).map(h => (
                          <button key={h.id} onClick={() => openEdit(h)} title={h.name}
                            className={`block w-full truncate rounded px-1 py-0.5 text-left text-[9px] font-semibold ${h.isOptionalHoliday ? 'bg-amber-100 text-amber-700' : h.isPublicHoliday ? 'bg-rose-100 text-rose-700' : 'bg-blue-100 text-blue-700'}`}>{h.name}</button>
                        ))}
                        {list.length > 3 && <p className="text-[8px] text-slate-400">+{list.length - 3} more</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {view === 'month' && (
            monthHolidays.length === 0 ? <EmptyState icon={<CalendarDays size={26} />} title={`No holidays in ${MONTHS[cursor.m]}`} subtitle="Add a holiday or jump to another month." />
              : (
                <div className="space-y-2">
                  {monthHolidays.map(h => (
                    <div key={h.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 flex-col items-center justify-center rounded-lg bg-slate-50 text-slate-700">
                          <span className="text-[9px] font-bold uppercase">{MONTHS[new Date(h.date).getMonth()].slice(0, 3)}</span>
                          <span className="text-base font-extrabold leading-none">{new Date(h.date).getDate()}</span>
                        </div>
                        <div>
                          <p className="text-[13px] font-bold text-slate-800">{h.name}</p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1">
                            <Badge variant={holidayTone(h) as any}>{h.isOptionalHoliday ? 'Optional' : h.isPublicHoliday ? 'Public' : h.category}</Badge>
                            {h.isRecurring && <Badge variant="gray">Yearly</Badge>}
                            {h.status === 'Inactive' && <Badge variant="gray">Inactive</Badge>}
                          </div>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button onClick={() => openEdit(h)} className="text-slate-400 hover:text-indigo-500"><Edit size={15} /></button>
                        <button onClick={() => remove(h)} className="text-slate-400 hover:text-rose-500"><Trash2 size={15} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )
          )}

          {view === 'list' && (
            items.length === 0 ? <EmptyState icon={<ListIcon size={26} />} title="No holidays yet" subtitle="Add holidays manually or import the Indian holiday list to get started." />
              : (
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-slate-500"><tr>{['Holiday', 'Date', 'Category', 'Type', 'Recurring', 'Status', ''].map(h => <th key={h} className="px-3 py-2 text-left font-bold">{h}</th>)}</tr></thead>
                    <tbody>
                      {items.map(h => (
                        <tr key={h.id} className="border-t border-slate-100">
                          <td className="px-3 py-2 font-semibold text-slate-700">{h.name}</td>
                          <td className="px-3 py-2">{formatDate(h.date)}</td>
                          <td className="px-3 py-2">{h.category}</td>
                          <td className="px-3 py-2"><Badge variant={holidayTone(h) as any}>{h.isOptionalHoliday ? 'Optional' : h.isPublicHoliday ? 'Public' : 'Other'}</Badge></td>
                          <td className="px-3 py-2">{h.isRecurring ? 'Yes' : 'No'}</td>
                          <td className="px-3 py-2"><Badge variant={h.status === 'Active' ? 'green' : 'gray'}>{h.status}</Badge></td>
                          <td className="px-3 py-2"><div className="flex gap-1.5"><button onClick={() => openEdit(h)} className="text-slate-400 hover:text-indigo-500"><Edit size={14} /></button><button onClick={() => remove(h)} className="text-slate-400 hover:text-rose-500"><Trash2 size={14} /></button></div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
          )}
        </>
      )}

      {/* Add / Edit holiday */}
      {modal && (
        <Modal open={modal} onClose={() => setModal(false)} title={`${draft.id ? 'Edit' : 'Add'} Holiday`} size="md"
          footer={<><Button variant="outline" onClick={() => setModal(false)}>Cancel</Button><Button onClick={save}>Save Holiday</Button></>}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Input label="Holiday Name *" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
            <Input label="Holiday Date *" type="date" value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value })} />
            <Select label="Holiday Category" value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })} options={HOLIDAY_CATEGORIES.map(c => ({ value: c, label: c }))} />
            <Select label="Status" value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value })} options={['Active', 'Inactive'].map(s => ({ value: s, label: s }))} />
            <Input label="Applicable Branches" value={draft.applicableBranches} onChange={e => setDraft({ ...draft, applicableBranches: e.target.value })} placeholder="All / comma-separated" />
            <Input label="Applicable Departments" value={draft.applicableDepartments} onChange={e => setDraft({ ...draft, applicableDepartments: e.target.value })} placeholder="All / comma-separated" />
          </div>
          <div className="mt-3">
            <label className="mb-1 block text-[11px] font-bold text-slate-500">Description</label>
            <textarea rows={2} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} className="w-full rounded-xl border border-slate-200 p-2 text-xs focus:border-[#4F7CFF] focus:outline-none" />
          </div>
          <div className="mt-3 flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-600"><input type="checkbox" checked={!!draft.isPublicHoliday} onChange={e => setDraft({ ...draft, isPublicHoliday: e.target.checked })} /> Public Holiday</label>
            <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-600"><input type="checkbox" checked={!!draft.isOptionalHoliday} onChange={e => setDraft({ ...draft, isOptionalHoliday: e.target.checked })} /> Optional Holiday</label>
            <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-600"><input type="checkbox" checked={!!draft.isRecurring} onChange={e => setDraft({ ...draft, isRecurring: e.target.checked })} /> Recurring Every Year</label>
          </div>
          <p className="mt-3 text-[10px] text-slate-400">This calendar will drive automatic festival greetings &amp; announcements in Phase 2.</p>
        </Modal>
      )}
    </div>
  );
};

// ── Company Announcements ─────────────────────────────────────────────────────
const blankAnn = () => ({ title: '', message: '', attachment: '', attachmentName: '', priority: 'Normal', expiryDate: '', status: 'Draft' });
const AnnouncementsTab: React.FC = () => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [draft, setDraft] = useState<any>(blankAnn());
  const fileRef = useRef<HTMLInputElement>(null);
  const load = async () => { setLoading(true); try { setItems(await api.communication.announcements.list()); } catch (e) { ui.toast.error(getApiErrorMessage(e)); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);
  const attach = async (file?: File) => { if (!file) return; try { const url = await readFileAsDataUrl(file); setDraft((d: any) => ({ ...d, attachment: url, attachmentName: file.name })); } catch { ui.toast.error('Could not read the file.'); } };
  const save = async () => {
    if (!draft.title?.trim()) { ui.toast.error('Title is required.'); return; }
    try { if (draft.id) await api.communication.announcements.update(draft.id, draft); else await api.communication.announcements.create(draft); ui.toast.success('Announcement saved (not delivered — Phase 2).'); setModal(false); await load(); }
    catch (e) { ui.toast.error(getApiErrorMessage(e)); }
  };
  const remove = async (a: any) => { if (!(await ui.confirm({ message: `Delete "${a.title}"?`, variant: 'danger', confirmText: 'Delete' }))) return; try { await api.communication.announcements.remove(a.id); ui.toast.success('Deleted.'); await load(); } catch (e) { ui.toast.error(getApiErrorMessage(e)); } };
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><Button size="sm" icon={<Plus size={14} />} onClick={() => { setDraft(blankAnn()); setModal(true); }}>New Announcement</Button></div>
      {loading ? <div className="py-12 text-center text-sm text-slate-500">Loading…</div>
        : items.length === 0 ? <EmptyState icon={<Megaphone size={26} />} title="No announcements yet" subtitle="Create an announcement — it will be stored now and deliverable in Phase 2." />
          : (
            <div className="space-y-2">
              {items.map(a => (
                <div key={a.id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-[13px] font-bold text-slate-800">{a.title}</p>
                      <Badge variant={a.priority === 'Urgent' ? 'red' : a.priority === 'High' ? 'amber' : 'gray'}>{a.priority}</Badge>
                      <Badge variant={a.status === 'Published' ? 'green' : 'gray'}>{a.status}</Badge>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500">{a.message}</p>
                    <p className="mt-1 text-[10px] text-slate-400">{a.expiryDate ? `Expires ${formatDate(a.expiryDate)}` : 'No expiry'}{a.attachmentName ? ` · 📎 ${a.attachmentName}` : ''}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button onClick={() => { setDraft({ ...a }); setModal(true); }} className="text-slate-400 hover:text-indigo-500"><Edit size={15} /></button>
                    <button onClick={() => remove(a)} className="text-slate-400 hover:text-rose-500"><Trash2 size={15} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
      {modal && (
        <Modal open={modal} onClose={() => setModal(false)} title={`${draft.id ? 'Edit' : 'New'} Announcement`} size="md"
          footer={<><Button variant="outline" onClick={() => setModal(false)}>Cancel</Button><Button onClick={save}>Save</Button></>}>
          <div className="space-y-3">
            <Input label="Title *" value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} />
            <div>
              <label className="mb-1 block text-[11px] font-bold text-slate-500">Message</label>
              <textarea rows={4} value={draft.message} onChange={e => setDraft({ ...draft, message: e.target.value })} className="w-full rounded-xl border border-slate-200 p-2 text-xs focus:border-[#4F7CFF] focus:outline-none" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Select label="Priority" value={draft.priority} onChange={e => setDraft({ ...draft, priority: e.target.value })} options={['Low', 'Normal', 'High', 'Urgent'].map(p => ({ value: p, label: p }))} />
              <Input label="Expiry Date" type="date" value={draft.expiryDate} onChange={e => setDraft({ ...draft, expiryDate: e.target.value })} />
            </div>
            <Select label="Status" value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value })} options={['Draft', 'Published', 'Expired'].map(s => ({ value: s, label: s }))} />
            <div>
              <p className="mb-1 text-[11px] font-bold text-slate-500">Attachment</p>
              <input ref={fileRef} type="file" className="hidden" onChange={e => attach(e.target.files?.[0])} />
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" icon={<Upload size={13} />} onClick={() => fileRef.current?.click()}>{draft.attachmentName ? 'Replace' : 'Upload'}</Button>
                {draft.attachmentName && <span className="text-[11px] text-slate-500">{draft.attachmentName}</span>}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ── Scheduled Messages (store only — never executed) ──────────────────────────
const blankSchedule = () => ({ name: '', templateId: '', channel: 'none', scheduleDate: '', scheduleTime: '', recurrence: 'none', recipients: '', status: 'Scheduled' });
const ScheduledTab: React.FC = () => {
  const [items, setItems] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [draft, setDraft] = useState<any>(blankSchedule());
  const load = async () => { setLoading(true); try { const [s, t] = await Promise.all([api.communication.schedules.list(), api.communication.templates.list()]); setItems(s); setTemplates(t); } catch (e) { ui.toast.error(getApiErrorMessage(e)); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);
  const save = async () => {
    if (!draft.name?.trim()) { ui.toast.error('Schedule name is required.'); return; }
    try { if (draft.id) await api.communication.schedules.update(draft.id, draft); else await api.communication.schedules.create(draft); ui.toast.success('Schedule stored (not executed — Phase 2).'); setModal(false); await load(); }
    catch (e) { ui.toast.error(getApiErrorMessage(e)); }
  };
  const remove = async (s: any) => { if (!(await ui.confirm({ message: `Delete schedule "${s.name}"?`, variant: 'danger', confirmText: 'Delete' }))) return; try { await api.communication.schedules.remove(s.id); ui.toast.success('Deleted.'); await load(); } catch (e) { ui.toast.error(getApiErrorMessage(e)); } };
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[11px] font-semibold text-amber-700">
        <span>Schedules are stored only — automatic execution &amp; delivery arrive in Phase 2.</span><Phase2Badge />
      </div>
      <div className="flex justify-end"><Button size="sm" icon={<Plus size={14} />} onClick={() => { setDraft(blankSchedule()); setModal(true); }}>New Schedule</Button></div>
      {loading ? <div className="py-12 text-center text-sm text-slate-500">Loading…</div>
        : items.length === 0 ? <EmptyState icon={<Clock size={26} />} title="No schedules yet" subtitle="Configure a schedule — date, time, recurrence, recipients & template — to store for Phase 2." />
          : (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500"><tr>{['Name', 'Date', 'Time', 'Recurrence', 'Template', 'Status', ''].map(h => <th key={h} className="px-3 py-2 text-left font-bold">{h}</th>)}</tr></thead>
                <tbody>
                  {items.map(s => (
                    <tr key={s.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-semibold text-slate-700">{s.name}</td>
                      <td className="px-3 py-2">{formatDate(s.scheduleDate)}</td>
                      <td className="px-3 py-2">{s.scheduleTime || '—'}</td>
                      <td className="px-3 py-2 capitalize">{s.recurrence}</td>
                      <td className="px-3 py-2">{templates.find(t => t.id === s.templateId)?.title || '—'}</td>
                      <td className="px-3 py-2"><Badge variant="gray">{s.status}</Badge></td>
                      <td className="px-3 py-2"><div className="flex gap-1.5"><button onClick={() => { setDraft({ ...s, templateId: s.templateId || '' }); setModal(true); }} className="text-slate-400 hover:text-indigo-500"><Edit size={14} /></button><button onClick={() => remove(s)} className="text-slate-400 hover:text-rose-500"><Trash2 size={14} /></button></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      {modal && (
        <Modal open={modal} onClose={() => setModal(false)} title={`${draft.id ? 'Edit' : 'New'} Schedule`} size="md"
          footer={<><Button variant="outline" onClick={() => setModal(false)}>Cancel</Button><Button onClick={save}>Save</Button></>}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Input label="Schedule Name *" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
            <Select label="Template" value={String(draft.templateId)} onChange={e => setDraft({ ...draft, templateId: e.target.value })} options={[{ value: '', label: '— none —' }, ...templates.map(t => ({ value: String(t.id), label: t.title }))]} />
            <Input label="Date" type="date" value={draft.scheduleDate} onChange={e => setDraft({ ...draft, scheduleDate: e.target.value })} />
            <Input label="Time" type="time" value={draft.scheduleTime} onChange={e => setDraft({ ...draft, scheduleTime: e.target.value })} />
            <Select label="Recurrence" value={draft.recurrence} onChange={e => setDraft({ ...draft, recurrence: e.target.value })} options={['none', 'daily', 'weekly', 'monthly', 'yearly'].map(r => ({ value: r, label: r }))} />
            <Input label="Recipients (notes)" value={draft.recipients} onChange={e => setDraft({ ...draft, recipients: e.target.value })} placeholder="e.g. All employees / Sales dept" />
          </div>
          <p className="mt-3 text-[10px] text-slate-400">Channel (WhatsApp / SMS / Email / Push) selection &amp; automatic delivery arrive in Phase 2.</p>
        </Modal>
      )}
    </div>
  );
};

// ── Delivery Logs (empty in Phase 1) ──────────────────────────────────────────
const DeliveryLogsTab: React.FC = () => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { (async () => { try { setItems(await api.communication.deliveryLogs()); } catch (e) { ui.toast.error(getApiErrorMessage(e)); } finally { setLoading(false); } })(); }, []);
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-xs">
        <thead className="bg-slate-50 text-slate-500"><tr>{['Date', 'Template', 'Channel', 'Recipient Count', 'Status'].map(h => <th key={h} className="px-3 py-2 text-left font-bold">{h}</th>)}</tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={5} className="px-3 py-10 text-center text-slate-500">Loading…</td></tr>
            : items.length === 0 ? <tr><td colSpan={5} className="px-3 py-12 text-center text-slate-400">No deliveries yet.</td></tr>
              : items.map(l => (
                <tr key={l.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">{formatDateTime(l.createdAt)}</td>
                  <td className="px-3 py-2">{l.templateId || '—'}</td>
                  <td className="px-3 py-2">{l.channel || '—'}</td>
                  <td className="px-3 py-2">{l.recipientCount}</td>
                  <td className="px-3 py-2"><Badge variant="gray">{l.status}</Badge></td>
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
};

// ── Settings (providers disabled — Phase 2) ───────────────────────────────────
const SettingsTab: React.FC = () => {
  const [s, setS] = useState<any>(null);
  useEffect(() => { (async () => { try { setS(await api.communication.settings.get()); } catch (e) { ui.toast.error(getApiErrorMessage(e)); } })(); }, []);
  const saveBasic = async () => { try { await api.communication.settings.update({ timezone: s?.timezone, workingHoursStart: s?.workingHoursStart, workingHoursEnd: s?.workingHoursEnd }); ui.toast.success('Settings saved.'); } catch (e) { ui.toast.error(getApiErrorMessage(e)); } };
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[11px] font-semibold text-amber-700 flex items-center justify-between">
        <span>Delivery provider configuration is locked in Phase 1.</span><Phase2Badge />
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {[
          { label: 'Email Provider', icon: <Mail size={15} /> },
          { label: 'SMS Provider', icon: <Smartphone size={15} /> },
          { label: 'WhatsApp Provider', icon: <MessageSquare size={15} /> },
          { label: 'Push Notifications', icon: <Send size={15} /> },
        ].map(p => (
          <div key={p.label} className="rounded-2xl border border-slate-200 bg-white p-4 opacity-80">
            <div className="mb-2 flex items-center justify-between">
              <p className="flex items-center gap-2 text-xs font-extrabold text-slate-600">{p.icon} {p.label}</p>
              <Lock size={13} className="text-slate-400" />
            </div>
            <input disabled placeholder="Coming in Phase 2" className="w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] text-slate-400" />
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="mb-3 text-xs font-extrabold text-slate-700">General (editable now)</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Input label="Timezone" value={s?.timezone || ''} onChange={e => setS({ ...s, timezone: e.target.value })} placeholder="Asia/Kolkata" />
          <Input label="Working Hours Start" type="time" value={s?.workingHoursStart || ''} onChange={e => setS({ ...s, workingHoursStart: e.target.value })} />
          <Input label="Working Hours End" type="time" value={s?.workingHoursEnd || ''} onChange={e => setS({ ...s, workingHoursEnd: e.target.value })} />
        </div>
        <div className="mt-3"><Button size="sm" onClick={saveBasic}>Save Settings</Button></div>
      </div>
    </div>
  );
};

// ── Shared empty state ────────────────────────────────────────────────────────
const EmptyState: React.FC<{ icon: React.ReactNode; title: string; subtitle?: string; small?: boolean }> = ({ icon, title, subtitle, small }) => (
  <div className={`flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white text-center ${small ? 'py-8' : 'py-16'}`}>
    <div className="mb-2 text-slate-300">{icon}</div>
    <p className="text-sm font-bold text-slate-600">{title}</p>
    {subtitle && <p className="mt-1 max-w-sm text-[11px] text-slate-400">{subtitle}</p>}
  </div>
);

export default CommunicationCenter;
