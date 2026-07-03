// ─────────────────────────────────────────────────────────────────────────────
// Communication Center — enterprise communication module.
//
// Central hub for employee communications: templates, a drag-and-drop designer,
// birthday / festival / announcement management, schedules, delivery logs, and a
// full WhatsApp integration (Meta Cloud API) with template management, a delivery
// queue, scheduler, automation rules and live diagnostics. WhatsApp delivery is
// live; Email / SMS / Push are out of scope. Backed by /api/communication.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutDashboard, FileText, LayoutTemplate, Cake, PartyPopper, Megaphone, Clock,
  Truck, Settings as SettingsIcon, Plus, Edit, Trash2, Search, Eye,
  Send, CalendarClock, Lock, Upload, X, MessageSquare, FileStack, Sparkles, Mail, Smartphone,
  CalendarDays, Download, Copy, ChevronLeft, ChevronRight, List as ListIcon, LayoutGrid, Star,
  MessageCircle, ShieldCheck, AlertTriangle, FlaskConical, CheckCircle2, Award, Banknote,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { ui } from '@/components/ui/feedback';
import { DevelopmentBanner } from '@/components/ui/DevelopmentBanner';
import { api } from '@/api/apiClient';
import { usePermissions } from '@/context/PermissionContext';
import { getApiErrorMessage } from '@/utils/apiError';
import { formatDate, formatDateTime } from '@/utils/formatDate';
import { CommunicationEventModule, EVENT_CONFIGS } from './communication/eventModule';
import { WhatsAppHealthTab, WhatsAppExplorerTab, WhatsAppWidget } from './communication/whatsappOps';

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

// ── Navigation model ──────────────────────────────────────────────────────────
// Two levels: SEVEN primary modules across the top, each opening a grouped left
// side-nav of secondary items. Every leaf `id` maps 1:1 to a content panel in the
// render switch below, so the complete feature set is preserved — only the
// navigation is consolidated (was 23 flat tabs, prone to horizontal scrolling).
// New communication features slot into an existing module's `groups` with no
// change to the top-level bar, so the nav scales cleanly.
type TabId =
  | 'dashboard'
  | 'templates' | 'designer'
  | 'birthday' | 'anniversary' | 'festival' | 'holiday-greet'
  | 'announce-send' | 'announcements'
  | 'salary' | 'payslip' | 'leave' | 'attendance'
  | 'automation' | 'scheduled' | 'wa-scheduler'
  | 'logs' | 'wa-queue' | 'wa-explorer'
  | 'whatsapp' | 'wa-templates' | 'wa-health'
  | 'settings' | 'holidays';

type IconType = React.ComponentType<{ size?: number | string; className?: string }>;
interface NavLeaf { id: TabId; label: string; icon: IconType; }
interface NavGroup { label?: string; items: NavLeaf[]; }
interface NavModule { id: string; label: string; icon: IconType; groups: NavGroup[]; }

const MODULES: NavModule[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, groups: [
    { items: [{ id: 'dashboard', label: 'Overview', icon: LayoutDashboard }] },
  ] },
  { id: 'templates', label: 'Templates', icon: LayoutTemplate, groups: [
    { items: [
      { id: 'templates', label: 'Template Library', icon: FileText },
      { id: 'designer', label: 'Template Designer', icon: LayoutTemplate },
    ] },
  ] },
  { id: 'campaigns', label: 'Campaigns', icon: Megaphone, groups: [
    { label: 'Greetings', items: [
      { id: 'birthday', label: 'Birthday Wishes', icon: Cake },
      { id: 'anniversary', label: 'Work Anniversary', icon: Award },
      { id: 'festival', label: 'Festival Greetings', icon: PartyPopper },
      { id: 'holiday-greet', label: 'Holiday Greetings', icon: CalendarDays },
    ] },
    { label: 'Announcements', items: [
      { id: 'announce-send', label: 'Send Announcement', icon: Megaphone },
      { id: 'announcements', label: 'Manage Announcements', icon: FileStack },
    ] },
    { label: 'Payroll Alerts', items: [
      { id: 'salary', label: 'Salary Credited', icon: Banknote },
      { id: 'payslip', label: 'Payslip Available', icon: FileText },
    ] },
    { label: 'HR Operations', items: [
      { id: 'leave', label: 'Leave Updates', icon: CheckCircle2 },
      { id: 'attendance', label: 'Attendance Reminder', icon: Clock },
    ] },
  ] },
  { id: 'automation', label: 'Automation', icon: Sparkles, groups: [
    { items: [
      { id: 'automation', label: 'Automation Rules', icon: Sparkles },
      { id: 'scheduled', label: 'Scheduled Messages', icon: Clock },
      { id: 'wa-scheduler', label: 'WhatsApp Scheduler', icon: CalendarClock },
    ] },
  ] },
  { id: 'delivery', label: 'Delivery & Logs', icon: Truck, groups: [
    { items: [
      { id: 'logs', label: 'Delivery Logs', icon: Truck },
      { id: 'wa-queue', label: 'WhatsApp Queue', icon: ListIcon },
      { id: 'wa-explorer', label: 'Message Explorer', icon: Search },
    ] },
  ] },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, groups: [
    { items: [
      { id: 'whatsapp', label: 'WhatsApp Settings', icon: MessageCircle },
      { id: 'wa-templates', label: 'WhatsApp Templates', icon: LayoutTemplate },
      { id: 'wa-health', label: 'Health & Diagnostics', icon: ShieldCheck },
    ] },
  ] },
  { id: 'settings', label: 'Settings', icon: SettingsIcon, groups: [
    { items: [
      { id: 'settings', label: 'General Settings', icon: SettingsIcon },
      { id: 'holidays', label: 'Holiday Calendar', icon: CalendarDays },
    ] },
  ] },
];

// Flat leaf lookup + reverse map (leaf → owning module) so deep links / quick
// actions (setTab('templates')) light up the correct primary module too.
const LEAVES: NavLeaf[] = MODULES.flatMap(m => m.groups.flatMap(g => g.items));
const MODULE_OF: Record<string, NavModule> = MODULES.reduce((acc, m) => {
  m.groups.forEach(g => g.items.forEach(it => { acc[it.id] = m; }));
  return acc;
}, {} as Record<string, NavModule>);

const readFileAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = reject; r.readAsDataURL(file);
});

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

  // Which primary module owns the active leaf → drives the top bar + side-nav.
  const activeModule = MODULE_OF[tab] || MODULES[0];
  const showSideNav = LEAVES.filter(l => MODULE_OF[l.id]?.id === activeModule.id).length > 1;

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
        <p className="text-[11px] text-slate-400">Central hub for employee notifications, greetings & announcements · WhatsApp delivery, automation & live diagnostics</p>
      </div>

      {/* Development-status banner — permanent & non-dismissible by design.
          Remove this <DevelopmentBanner /> from the JSX when the module ships. */}
      <DevelopmentBanner
        status="development"
        message="The Communication Center is under active development. Some features may be incomplete or change during development. Existing stable functionality is safe to use."
      />

      {/* Primary module navigation (7 modules — no horizontal scrolling) */}
      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {MODULES.map(m => {
          const Icon = m.icon;
          const active = activeModule.id === m.id;
          return (
            <button key={m.id} onClick={() => setTab(m.groups[0].items[0].id)}
              className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 -mb-px transition-colors ${active ? 'border-[#4F7CFF] text-[#4F7CFF]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
              <Icon size={14} /> {m.label}
            </button>
          );
        })}
      </div>

      {/* Module body: grouped left side-nav (when the module has >1 leaf) + panel */}
      <div className={showSideNav ? 'flex flex-col gap-4 md:flex-row' : ''}>
        {showSideNav && (
          <aside className="shrink-0 md:w-56">
            <nav className="space-y-3 rounded-2xl border border-slate-200 bg-white p-2 md:sticky md:top-2">
              {activeModule.groups.map((g, gi) => (
                <div key={gi}>
                  {g.label && <p className="px-2 pb-1 pt-1 text-[10px] font-extrabold uppercase tracking-wide text-slate-400">{g.label}</p>}
                  <div className="space-y-0.5">
                    {g.items.map(it => {
                      const I = it.icon;
                      const on = tab === it.id;
                      return (
                        <button key={it.id} onClick={() => setTab(it.id)}
                          className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-bold transition-colors ${on ? 'bg-[#EDF4FF] text-[#4F7CFF]' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}>
                          <I size={15} /> <span className="truncate">{it.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>
          </aside>
        )}

        <div className="min-w-0 flex-1">
      {tab === 'dashboard' && <DashboardTab onGo={setTab} />}
      {tab === 'templates' && <TemplatesTab />}
      {tab === 'designer' && <DesignerTab />}
      {/* Event communication modules — single shared engine, config-driven */}
      {tab === 'birthday' && <EventTab cfg="birthday" />}
      {tab === 'anniversary' && <EventTab cfg="anniversary" />}
      {tab === 'festival' && <EventTab cfg="festival" />}
      {tab === 'holiday-greet' && <EventTab cfg="holiday" />}
      {tab === 'announce-send' && <EventTab cfg="announcement" />}
      {tab === 'salary' && <EventTab cfg="salary" />}
      {tab === 'payslip' && <EventTab cfg="payslip" />}
      {tab === 'leave' && <EventTab cfg="leave" />}
      {tab === 'attendance' && <EventTab cfg="attendance" />}
      {/* Content authoring (kept intact — feed the engine above) */}
      {tab === 'holidays' && <HolidayTab />}
      {tab === 'announcements' && <AnnouncementsTab />}
      {tab === 'scheduled' && <ScheduledTab />}
      {tab === 'logs' && <DeliveryLogsTab />}
      {tab === 'whatsapp' && <WhatsAppSettingsTab />}
      {tab === 'wa-health' && <WhatsAppHealthTab />}
      {tab === 'wa-explorer' && <WhatsAppExplorerTab />}
      {tab === 'wa-templates' && <WhatsAppTemplatesTab />}
      {tab === 'wa-queue' && <WhatsAppQueueTab />}
      {tab === 'wa-scheduler' && <WhatsAppSchedulerTab />}
      {tab === 'automation' && <AutomationRulesTab />}
      {tab === 'settings' && <SettingsTab />}
        </div>
      </div>
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

      {/* WhatsApp summary (Phase 1.5) */}
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-xs font-extrabold text-slate-700"><MessageCircle size={14} className="text-emerald-600" /> WhatsApp Summary
          <span className="ml-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-bold text-emerald-700 border border-emerald-200">Live · Meta Cloud API</span></p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <Card label="WhatsApp Templates" value={loading ? '—' : v('whatsappTemplates')} icon={<MessageCircle size={16} />} tone="bg-emerald-50 text-emerald-600" />
          <Card label="Pending Messages" value={loading ? '—' : v('whatsappPending')} icon={<Clock size={16} />} tone="bg-amber-50 text-amber-600" />
          <Card label="Simulated Messages" value={loading ? '—' : v('whatsappSimulated')} icon={<FlaskConical size={16} />} tone="bg-indigo-50 text-indigo-600" />
          <Card label="Failed Messages" value={loading ? '—' : v('whatsappFailed')} icon={<AlertTriangle size={16} />} tone="bg-rose-50 text-rose-600" />
          <Card label="Development Mode" value={loading ? '—' : (d?.whatsappDevelopmentMode ? 'ON' : 'OFF')} icon={<ShieldCheck size={16} />} tone={d?.whatsappDevelopmentMode ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'} />
          <Card label="Upcoming Birthday Messages" value={loading ? '—' : v('upcomingBirthdayMessages')} icon={<Cake size={16} />} tone="bg-pink-50 text-pink-600" />
          <Card label="Upcoming Festival Messages" value={loading ? '—' : v('upcomingFestivalMessages')} icon={<PartyPopper size={16} />} tone="bg-orange-50 text-orange-600" />
        </div>
        {/* Live WhatsApp dashboard widget (Phase 5) */}
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
          <WhatsAppWidget />
        </div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
        <p className="mb-2 text-xs font-extrabold text-slate-700">Quick actions</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" icon={<FileText size={14} />} onClick={() => onGo('templates')}>Manage Templates</Button>
          <Button size="sm" variant="outline" icon={<Megaphone size={14} />} onClick={() => onGo('announcements')}>New Announcement</Button>
          <Button size="sm" variant="outline" icon={<CalendarDays size={14} />} onClick={() => onGo('holidays')}>Holiday Calendar</Button>
          <Button size="sm" variant="outline" icon={<Clock size={14} />} onClick={() => onGo('scheduled')}>Schedule a Message</Button>
        </div>
        <p className="mt-3 text-[11px] text-slate-400">WhatsApp delivery is live via the Meta Cloud API. Configure delivery rules in <b>Automation Rules</b> and monitor results in <b>WhatsApp Queue</b> &amp; <b>Delivery Logs</b>.</p>
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
const blankTemplate = () => ({ title: '', category: 'Birthday Wishes', subject: '', body: '', status: 'Draft', backgroundImage: '', companyLogo: '', employeePhotoPlaceholder: true, festivalName: '', festivalDate: '', layout: starterDesign(), whatsappCompatible: false, whatsappRichText: false, whatsappCaption: '' });

const TemplatesTab: React.FC = () => {
  const branding = useContext(BrandingCtx);
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
              <p className="mt-2 text-[10px] text-slate-400">Shows sample data (e.g. “OM PATEL”). Real employee &amp; company details are merged automatically when each message is sent.</p>
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
                {/* Live placeholder preview — replaces {{tokens}} with sample data (design only) */}
                <div className="mt-2 rounded-xl border border-emerald-150 bg-emerald-50/40 p-2.5">
                  <p className="mb-1 flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wide text-emerald-700"><Eye size={11} /> Live Placeholder Preview <span className="font-semibold normal-case text-emerald-600/70">(sample data — e.g. OM PATEL · {branding.companyName})</span></p>
                  <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-slate-700">{fillSample(draft.body, branding) || <span className="italic text-slate-400">Your message preview will appear here…</span>}</p>
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

              {/* WhatsApp delivery options */}
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
                <p className="mb-2 flex items-center gap-1.5 text-[11px] font-extrabold text-emerald-700"><MessageCircle size={13} /> WhatsApp Options
                  <span className="ml-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold text-emerald-700">Live · Meta Cloud API</span></p>
                <div className="flex flex-wrap gap-4">
                  <label className="flex w-fit items-center gap-2 text-[11px] font-semibold text-slate-600">
                    <input type="checkbox" checked={!!draft.whatsappCompatible} onChange={e => setDraft({ ...draft, whatsappCompatible: e.target.checked })} />
                    WhatsApp Compatible
                  </label>
                  <label className="flex w-fit items-center gap-2 text-[11px] font-semibold text-slate-600">
                    <input type="checkbox" checked={!!draft.whatsappRichText} onChange={e => setDraft({ ...draft, whatsappRichText: e.target.checked })} />
                    Rich Text (*bold* / _italic_)
                  </label>
                </div>
                <div className="mt-3">
                  <label className="mb-1 block text-[11px] font-bold text-slate-500">Image Caption (shown beneath the image on WhatsApp)</label>
                  <textarea value={draft.whatsappCaption || ''} onChange={e => setDraft({ ...draft, whatsappCaption: e.target.value })} rows={2}
                    className="w-full rounded-xl border border-slate-200 p-2 text-xs text-slate-700 focus:border-emerald-500 focus:outline-none"
                    placeholder="e.g. Wishing you a wonderful day, {{employee_name}}! — supports placeholders" />
                  {draft.whatsappCaption && <p className="mt-1 text-[10px] text-emerald-700/80"><b>Preview:</b> {fillSample(draft.whatsappCaption, branding)}</p>}
                </div>
                <p className="mt-2 text-[10px] text-emerald-700/70">The background image above is used as the WhatsApp media. These settings drive delivery through the Meta Cloud API.</p>
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
          <p className="mt-2 text-center text-[10px] text-slate-400">Preview uses sample employee data (e.g. “OM PATEL”). Real employee details are merged automatically when each message is sent.</p>
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
      ui.toast.success('Layout saved as a draft template.');
      setName(''); setPlaced([]);
    } catch (e) { ui.toast.error(getApiErrorMessage(e)); }
  };
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="mb-2 text-xs font-extrabold text-slate-700">Elements</p>
        <p className="mb-3 text-[10px] text-slate-400">Click to place onto the canvas. Layout presets cover placement; saved layouts are reusable templates.</p>
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

// ── Event communication modules — ONE shared engine, config-driven ────────────
// Birthday, Work Anniversary, Festival, Holiday, Announcement, Salary, Payslip,
// Leave and Attendance all render through CommunicationEventModule. Only the
// EVENT_CONFIGS entry (title / icon / colour / data source / template category /
// automation trigger / preview) differs — every shared enterprise feature
// (summary cards, employee cards, preview drawer, manual send, view details,
// filters, export, automation info, audit trail, queue & delivery status, empty
// states, confirmation dialogs) is inherited from the engine. No duplication.
const EventTab: React.FC<{ cfg: keyof typeof EVENT_CONFIGS }> = ({ cfg }) => {
  const branding = useContext(BrandingCtx);
  return <CommunicationEventModule config={EVENT_CONFIGS[cfg]} branding={{ companyName: branding.companyName, logo: branding.logo }} />;
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
          <p className="mt-3 text-[10px] text-slate-400">This calendar drives automatic festival greetings &amp; announcements through your WhatsApp Automation Rules.</p>
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
    try { if (draft.id) await api.communication.announcements.update(draft.id, draft); else await api.communication.announcements.create(draft); ui.toast.success('Announcement saved.'); setModal(false); await load(); }
    catch (e) { ui.toast.error(getApiErrorMessage(e)); }
  };
  const remove = async (a: any) => { if (!(await ui.confirm({ message: `Delete "${a.title}"?`, variant: 'danger', confirmText: 'Delete' }))) return; try { await api.communication.announcements.remove(a.id); ui.toast.success('Deleted.'); await load(); } catch (e) { ui.toast.error(getApiErrorMessage(e)); } };
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><Button size="sm" icon={<Plus size={14} />} onClick={() => { setDraft(blankAnn()); setModal(true); }}>New Announcement</Button></div>
      {loading ? <div className="py-12 text-center text-sm text-slate-500">Loading…</div>
        : items.length === 0 ? <EmptyState icon={<Megaphone size={26} />} title="No announcements yet" subtitle="Create an announcement — it can be delivered to employees via your WhatsApp Automation Rules." />
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
    try { if (draft.id) await api.communication.schedules.update(draft.id, draft); else await api.communication.schedules.create(draft); ui.toast.success('Schedule saved.'); setModal(false); await load(); }
    catch (e) { ui.toast.error(getApiErrorMessage(e)); }
  };
  const remove = async (s: any) => { if (!(await ui.confirm({ message: `Delete schedule "${s.name}"?`, variant: 'danger', confirmText: 'Delete' }))) return; try { await api.communication.schedules.remove(s.id); ui.toast.success('Deleted.'); await load(); } catch (e) { ui.toast.error(getApiErrorMessage(e)); } };
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[11px] font-semibold text-amber-700">
        <span>Saved schedules are executed automatically and delivered through your WhatsApp Automation Rules.</span>
      </div>
      <div className="flex justify-end"><Button size="sm" icon={<Plus size={14} />} onClick={() => { setDraft(blankSchedule()); setModal(true); }}>New Schedule</Button></div>
      {loading ? <div className="py-12 text-center text-sm text-slate-500">Loading…</div>
        : items.length === 0 ? <EmptyState icon={<Clock size={26} />} title="No schedules yet" subtitle="Configure a schedule — date, time, recurrence, recipients & template — to deliver automatically." />
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
          <p className="mt-3 text-[10px] text-slate-400">WhatsApp delivery is live via the Meta Cloud API. Automatic execution is driven by your Automation Rules.</p>
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

// ── WhatsApp Settings (Phase 1 foundation — NO messages are ever sent) ────────
// Prepares HRMate for the Meta WhatsApp Business Cloud API. Company Head can edit;
// HR can view (and edit only if granted the Communication "edit" permission).
// Development Mode (default ON) redirects every message to a single developer
// test number so future testing is safe. Backed by /api/communication/whatsapp.
const QUEUE_STATUS_LEGEND = [
  { label: 'Pending', tone: 'bg-amber-50 text-amber-700 border-amber-200' },
  { label: 'Processing', tone: 'bg-blue-50 text-blue-700 border-blue-200' },
  { label: 'Sent', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { label: 'Failed', tone: 'bg-rose-50 text-rose-700 border-rose-200' },
];

const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }> = ({ checked, onChange, disabled }) => (
  <button type="button" disabled={disabled} onClick={() => !disabled && onChange(!checked)}
    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${checked ? 'bg-emerald-500' : 'bg-slate-300'} ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
  </button>
);

const WhatsAppSettingsTab: React.FC = () => {
  const { canEdit } = usePermissions();
  const editable = canEdit('communication');
  const [s, setS] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);   // connection test
  const [sending, setSending] = useState(false);   // send test message
  const [diag, setDiag] = useState<any>(null);
  const [connResult, setConnResult] = useState<any>(null);
  const [sendResult, setSendResult] = useState<any>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [reqHistory, setReqHistory] = useState<any[]>([]);
  // Write-only secret inputs — never pre-filled from the server (secrets are
  // redacted). Sent only when the user types a new value.
  const [tokenInput, setTokenInput] = useState('');
  const [verifyInput, setVerifyInput] = useState('');

  const loadDiag = async () => { try { setDiag(await api.communication.whatsapp.diagnostics()); } catch { /* diagnostics optional */ } };
  const loadHistory = async () => { try { setReqHistory(await api.communication.whatsapp.requestHistory()); } catch { /* history optional */ } };
  const reloadSettings = async () => { try { setS(await api.communication.whatsapp.settings.get()); } catch { /* keep current */ } };
  useEffect(() => {
    (async () => {
      try { setS(await api.communication.whatsapp.settings.get()); }
      catch (e) { ui.toast.error(getApiErrorMessage(e)); }
      finally { setLoading(false); }
      loadDiag();
      loadHistory();
    })();
  }, []);

  const patch = (p: any) => setS((cur: any) => ({ ...(cur || {}), ...p }));

  // Build the save payload — Meta creds included; secrets only if newly typed.
  const buildPayload = () => {
    const payload: any = {
      enabled: !!s?.enabled,
      developmentMode: !!s?.developmentMode,
      developerTestNumber: s?.developerTestNumber || '',
      metaBusinessId: s?.metaBusinessId || '',
      whatsappBusinessAccountId: s?.whatsappBusinessAccountId || '',
      phoneNumberId: s?.phoneNumberId || '',
      webhookUrl: s?.webhookUrl || '',
    };
    if (tokenInput.trim()) payload.permanentAccessToken = tokenInput.trim();
    if (verifyInput.trim()) payload.verifyToken = verifyInput.trim();
    return payload;
  };

  // On a 400 validation error the backend returns { fields: {field: msg} }.
  const handleSaveError = (e: any) => {
    if (e?.status === 400 && e?.data?.fields) { setFieldErrors(e.data.fields); ui.toast.error('Please correct the highlighted credential fields.'); return true; }
    ui.toast.error(getApiErrorMessage(e));
    return false;
  };

  const save = async () => {
    if (!editable) return;
    setSaving(true); setFieldErrors({});
    try {
      const saved = await api.communication.whatsapp.settings.update(buildPayload());
      setS(saved);
      setTokenInput(''); setVerifyInput('');
      ui.toast.success('WhatsApp settings saved.');
      loadDiag();
    } catch (e) { handleSaveError(e); }
    finally { setSaving(false); }
  };

  // Phase 2 — REAL connection test (validate creds + verify Meta connectivity).
  const runConnectionTest = async () => {
    if (!editable) return;
    setTesting(true); setConnResult(null); setFieldErrors({});
    try {
      await api.communication.whatsapp.settings.update(buildPayload()); // persist (validates) edits first
      setTokenInput(''); setVerifyInput('');
      const r = await api.communication.whatsapp.connectionTest();
      setConnResult(r);
      if (r?.ok) ui.toast.success(r.message || 'Connected to Meta.');
      else ui.toast.error(`${r?.status || 'Error'}: ${r?.message || 'Connection failed.'}`);
      await Promise.all([loadDiag(), reloadSettings(), loadHistory()]);
    } catch (e) { handleSaveError(e); }
    finally { setTesting(false); }
  };

  // Phase 2 — send the ONE real test message to the Developer Test Number.
  const runSendTest = async () => {
    if (!editable) return;
    setSending(true); setSendResult(null);
    try {
      const r = await api.communication.whatsapp.sendTest();
      setSendResult(r);
      if (r?.ok) ui.toast.success(r.message || 'Message sent!');
      else ui.toast.error(`${r?.status || 'Error'}: ${r?.message || 'Send failed.'}`);
      await Promise.all([loadDiag(), loadHistory()]);
    } catch (e) { ui.toast.error(getApiErrorMessage(e)); }
    finally { setSending(false); }
  };

  const fieldErr = (k: string) => fieldErrors[k]
    ? <p className="mt-0.5 text-[10px] font-semibold text-rose-500">{fieldErrors[k]}</p> : null;

  if (loading) return <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Loading WhatsApp settings…</div>;

  const status = s?.connectionStatus || 'Not Connected';
  const statusBadge = status === 'Connected'
    ? <Badge variant="green">Connected</Badge>
    : (status === 'not_connected' || status === 'Not Connected') ? <Badge variant="gray">Not Connected</Badge>
    : status === 'Network Error' ? <Badge variant="amber">{status}</Badge> : <Badge variant="red">{status}</Badge>;

  return (
    <div className="space-y-4">
      {/* Banner + environment indicator */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <p className="flex items-center gap-2 text-xs font-bold text-emerald-800"><MessageCircle size={16} /> WhatsApp Business — official Meta Cloud API.</p>
        {(() => {
          const env = diag?.environment;
          if (env === 'production') return <span className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-[10px] font-bold text-white">● Production Environment</span>;
          if (env === 'sandbox') return <span className="rounded-full bg-amber-500 px-2.5 py-0.5 text-[10px] font-bold text-white">● Sandbox / Test Environment</span>;
          return <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-slate-500 border border-slate-200">Not Configured</span>;
        })()}
      </div>

      {/* Token expiry warning (specific, never generic) */}
      {(diag?.tokenExpired || connResult?.tokenExpired || sendResult?.tokenExpired) && (
        <div className="flex items-start gap-2 rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-rose-600" />
          <div>
            <p className="text-xs font-extrabold text-rose-800">Access Token Expired or Invalid</p>
            <p className="text-[11px] font-semibold text-rose-700">Your Meta Access Token appears to be expired or invalid. Please generate a new Permanent Access Token.</p>
          </div>
        </div>
      )}

      {/* Development Mode warning banner — prevents assuming real employees are messaged */}
      {s?.developmentMode && (
        <div className="flex items-start gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" />
          <div>
            <p className="text-xs font-extrabold text-amber-800">Development Mode Enabled</p>
            <p className="text-[11px] font-semibold text-amber-700">All WhatsApp messages will be redirected to the configured Developer Test Number{s?.developerTestNumber ? ` (${s.developerTestNumber})` : ''} — real employees will NOT receive anything.</p>
          </div>
        </div>
      )}

      {!editable && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-[11px] font-semibold text-amber-700">
          You have view-only access to WhatsApp settings. Editing requires the Communication “edit” permission.
        </div>
      )}

      {/* Connection */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="mb-3 flex items-center gap-2 text-xs font-extrabold text-slate-700"><ShieldCheck size={14} className="text-emerald-600" /> Connection</p>
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-xl border border-slate-150 bg-slate-50/60 px-3 py-2.5">
            <div><p className="text-xs font-bold text-slate-700">WhatsApp Integration Status</p><p className="text-[10px] text-slate-400">Set automatically once Meta credentials are verified.</p></div>
            {statusBadge}
          </div>
          <div className="flex items-center justify-between rounded-xl border border-slate-150 bg-slate-50/60 px-3 py-2.5">
            <div><p className="text-xs font-bold text-slate-700">Enable WhatsApp Communication</p><p className="text-[10px] text-slate-400">Master switch for the WhatsApp channel.</p></div>
            <Toggle checked={!!s?.enabled} disabled={!editable} onChange={v => patch({ enabled: v })} />
          </div>
        </div>
      </div>

      {/* Development Mode */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="mb-3 flex items-center gap-2 text-xs font-extrabold text-slate-700"><FlaskConical size={14} className="text-indigo-600" /> Development Mode</p>
        <div className="flex items-center justify-between rounded-xl border border-indigo-100 bg-indigo-50/50 px-3 py-2.5">
          <div>
            <p className="text-xs font-bold text-slate-700">Development Mode {s?.developmentMode ? <span className="ml-1 text-[10px] font-bold text-emerald-600">ON</span> : <span className="ml-1 text-[10px] font-bold text-rose-600">OFF</span>}</p>
            <p className="text-[10px] text-slate-500">When ON, every WhatsApp message is redirected to the Developer Test Number instead of real employees — for safe testing.</p>
          </div>
          <Toggle checked={!!s?.developmentMode} disabled={!editable} onChange={v => patch({ developmentMode: v })} />
        </div>
        <div className="mt-3 max-w-sm">
          <Input label="Developer Test Number" disabled={!editable} value={s?.developerTestNumber || ''} onChange={e => patch({ developerTestNumber: e.target.value })} placeholder="+91XXXXXXXXXX" />
          <p className="mt-1 text-[10px] text-slate-400">Stored in the database. All test messages route here while Development Mode is ON.</p>
        </div>
      </div>

      {/* Meta Business Configuration (Phase 2 — editable, secrets write-only) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="flex items-center gap-2 text-xs font-extrabold text-slate-700"><ShieldCheck size={13} className="text-emerald-600" /> Meta Business Configuration</p>
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">Official Meta Cloud API</span>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div><Input label="Meta Business ID" disabled={!editable} value={s?.metaBusinessId || ''} onChange={e => patch({ metaBusinessId: e.target.value })} placeholder="e.g. 123456789012345" />{fieldErr('metaBusinessId')}</div>
          <div><Input label="WhatsApp Business Account ID" disabled={!editable} value={s?.whatsappBusinessAccountId || ''} onChange={e => patch({ whatsappBusinessAccountId: e.target.value })} placeholder="WABA ID" />{fieldErr('whatsappBusinessAccountId')}</div>
          <div><Input label="Phone Number ID" disabled={!editable} value={s?.phoneNumberId || ''} onChange={e => patch({ phoneNumberId: e.target.value })} placeholder="From Meta → WhatsApp → API Setup" />{fieldErr('phoneNumberId')}</div>
          <div><Input label="Webhook URL" disabled={!editable} value={s?.webhookUrl || ''} onChange={e => patch({ webhookUrl: e.target.value })} placeholder="https://your-domain/api/communication/whatsapp/webhook" />{fieldErr('webhookUrl')}</div>
          <div>
            <label className="mb-1 block text-[11px] font-bold text-slate-500">Permanent Access Token {s?.hasAccessToken && <span className="ml-1 text-[10px] font-semibold text-emerald-600">• stored (encrypted)</span>}</label>
            <input type="password" autoComplete="new-password" disabled={!editable} value={tokenInput} onChange={e => setTokenInput(e.target.value)}
              placeholder={s?.hasAccessToken ? '•••••••• leave blank to keep' : 'Paste permanent access token'} className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] focus:border-emerald-500 focus:outline-none disabled:bg-slate-50" />
            {fieldErr('permanentAccessToken')}
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-bold text-slate-500">Verify Token {s?.hasVerifyToken && <span className="ml-1 text-[10px] font-semibold text-emerald-600">• stored (encrypted)</span>}</label>
            <input type="password" autoComplete="new-password" disabled={!editable} value={verifyInput} onChange={e => setVerifyInput(e.target.value)}
              placeholder={s?.hasVerifyToken ? '•••••••• leave blank to keep' : 'Your webhook verify token'} className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] focus:border-emerald-500 focus:outline-none disabled:bg-slate-50" />
            {fieldErr('verifyToken')}
          </div>
        </div>
        <p className="mt-2 flex items-center gap-1 text-[10px] text-slate-400"><Lock size={11} /> Access Token &amp; Verify Token are encrypted at rest and never sent back to the browser.</p>
      </div>

      {/* Live Meta connection diagnostics */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="mb-3 flex items-center gap-2 text-xs font-extrabold text-slate-700"><ShieldCheck size={14} className="text-emerald-600" /> Meta Connection Diagnostics
          <span className="ml-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-bold text-emerald-700 border border-emerald-200">live</span></p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(diag?.connection || [
            { key: 'connected', label: 'Meta Connected', ok: false, value: 'Not Connected' },
            { key: 'phoneVerified', label: 'Phone Number Verified', ok: false, value: 'Not Verified' },
            { key: 'tokenValid', label: 'Access Token Valid', ok: false, value: 'Not Validated' },
            { key: 'webhook', label: 'Webhook Configured', ok: false, value: 'Not Configured' },
            { key: 'apiVersion', label: 'API Version', ok: true, value: '—' },
          ]).map((it: any) => (
            <div key={it.key} className="flex items-center justify-between rounded-xl border border-slate-150 bg-slate-50/60 px-3 py-2">
              <span className="text-[11px] font-bold text-slate-600">{it.label}</span>
              <span className={`flex items-center gap-1 text-[10px] font-bold ${it.ok ? 'text-emerald-600' : 'text-slate-400'}`}>
                {it.key !== 'apiVersion' && (it.ok ? <CheckCircle2 size={12} /> : <X size={12} />)}{it.value}
              </span>
            </div>
          ))}
        </div>
        {diag?.lastConnectedAt && <p className="mt-2 text-[10px] text-slate-400">Last successful connection: {formatDateTime(diag.lastConnectedAt)}.</p>}
      </div>

      {/* Production readiness checklist */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="flex items-center gap-2 text-xs font-extrabold text-slate-700"><CheckCircle2 size={14} className="text-emerald-600" /> Production Readiness Checklist</p>
          {diag?.productionReady
            ? <span className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-[10px] font-bold text-white">Production Ready</span>
            : <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-500 border border-slate-200">Not Ready</span>}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(diag?.checklist || [
            { key: 'connected', label: 'Meta Connected', ok: false }, { key: 'businessVerified', label: 'Business Verified', ok: false },
            { key: 'phoneVerified', label: 'Phone Verified', ok: false }, { key: 'webhookVerified', label: 'Webhook Verified', ok: false },
            { key: 'tokenValid', label: 'Access Token Valid', ok: false }, { key: 'testNumber', label: 'Developer Test Number Configured', ok: false },
          ]).map((c: any) => (
            <div key={c.key} className="flex items-center gap-2 rounded-xl border border-slate-150 bg-slate-50/60 px-3 py-2">
              {c.ok ? <CheckCircle2 size={14} className="text-emerald-600" /> : <X size={14} className="text-slate-300" />}
              <span className={`text-[11px] font-bold ${c.ok ? 'text-slate-700' : 'text-slate-400'}`}>{c.label}</span>
            </div>
          ))}
        </div>
        {!diag?.productionReady && <p className="mt-2 text-[10px] text-slate-400">Complete all items above (run the connection test with verified production credentials) to reach <b>Production Ready</b>.</p>}
      </div>

      {/* Credential health check */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="mb-3 flex items-center gap-2 text-xs font-extrabold text-slate-700"><ShieldCheck size={14} className="text-slate-500" /> Credential Health</p>
        <div className="grid grid-cols-2 gap-3 text-[11px] sm:grid-cols-3">
          <div><span className="text-slate-400">Last Tested</span><p className="font-bold">{diag?.health?.lastTestedAt ? formatDateTime(diag.health.lastTestedAt) : '—'}</p></div>
          <div><span className="text-slate-400">Last Success</span><p className="font-bold text-emerald-600">{diag?.health?.lastSuccessAt ? formatDateTime(diag.health.lastSuccessAt) : '—'}</p></div>
          <div><span className="text-slate-400">Last Failure</span><p className="font-bold text-rose-600">{diag?.health?.lastFailureAt ? formatDateTime(diag.health.lastFailureAt) : '—'}</p></div>
          <div><span className="text-slate-400">Last HTTP Status</span><p className="font-mono font-bold">{diag?.health?.lastHttpStatus ?? '—'}</p></div>
          <div><span className="text-slate-400">Last Meta Error Code</span><p className="font-mono font-bold">{diag?.health?.lastMetaErrorCode || '—'}</p></div>
          <div className="col-span-2 sm:col-span-1"><span className="text-slate-400">Last Error</span><p className="font-semibold text-slate-600">{diag?.health?.lastError || '—'}</p></div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={!editable || saving} onClick={save} icon={<CheckCircle2 size={14} />}>{saving ? 'Saving…' : 'Save Settings'}</Button>
        <Button size="sm" variant="outline" disabled={!editable || testing} onClick={runConnectionTest} icon={<ShieldCheck size={14} />}>{testing ? 'Testing…' : 'Test WhatsApp Configuration'}</Button>
        <Button size="sm" disabled={!editable || sending} onClick={runSendTest} icon={<Send size={14} />} className="bg-emerald-600 hover:bg-emerald-700 text-white">{sending ? 'Sending…' : 'Send Test Message'}</Button>
        <span className="text-[10px] text-slate-400">“Send Test Message” delivers ONE real message to your Developer Test Number via the Meta Cloud API.</span>
      </div>

      {/* Connection test result */}
      {connResult && (
        <div className={`rounded-2xl border p-4 ${connResult.ok ? 'border-emerald-200 bg-emerald-50/60' : 'border-rose-200 bg-rose-50/60'}`}>
          <p className={`flex items-center gap-2 text-xs font-extrabold ${connResult.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
            {connResult.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />} {connResult.status}: <span className="font-semibold">{connResult.message}</span>
          </p>
          {connResult.details && (connResult.details.httpStatus || connResult.details.errorCode) && (
            <p className="mt-1 text-[10px] text-slate-500">HTTP {connResult.details.httpStatus || '—'}{connResult.details.errorCode ? ` · Meta code ${connResult.details.errorCode}` : ''}{connResult.details.errorSubcode ? ` · subcode ${connResult.details.errorSubcode}` : ''}</p>
          )}
          {connResult.ok && connResult.details?.displayPhoneNumber && (
            <p className="mt-1 text-[11px] text-slate-700">Number: <b>{connResult.details.displayPhoneNumber}</b>{connResult.details.verifiedName ? ` · ${connResult.details.verifiedName}` : ''} · API {connResult.apiVersion}</p>
          )}
        </div>
      )}

      {/* Send test result */}
      {sendResult && (
        <div className={`rounded-2xl border p-4 ${sendResult.ok ? 'border-emerald-200 bg-emerald-50/60' : 'border-rose-200 bg-rose-50/60'}`}>
          <p className={`flex items-center gap-2 text-xs font-extrabold ${sendResult.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
            {sendResult.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />} {sendResult.status}: <span className="font-semibold">{sendResult.message}</span>
          </p>
          {sendResult.ok && sendResult.details && (
            <div className="mt-2 text-[11px] text-slate-700">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <div><span className="text-slate-400">Sent To</span><p className="font-mono font-bold">{sendResult.details.to}</p></div>
                <div><span className="text-slate-400">Provider</span><p className="font-bold">{sendResult.details.provider}</p></div>
                <div className="sm:col-span-1 col-span-2"><span className="text-slate-400">Meta Message ID</span><p className="font-mono font-bold break-all text-emerald-700">{sendResult.details.metaMessageId}</p></div>
              </div>
            </div>
          )}
          {!sendResult.ok && sendResult.details && (sendResult.details.httpStatus || sendResult.details.errorCode) && (
            <p className="mt-1 text-[10px] text-slate-500">HTTP {sendResult.details.httpStatus || '—'}{sendResult.details.errorCode ? ` · Meta code ${sendResult.details.errorCode}` : ''}{sendResult.details.errorSubcode ? ` · subcode ${sendResult.details.errorSubcode}` : ''}</p>
          )}
        </div>
      )}

      {/* API request history (operational metadata only — no credentials) */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
          <p className="flex items-center gap-2 text-xs font-extrabold text-slate-700"><ListIcon size={14} /> Meta API Request History</p>
          <Button size="sm" variant="outline" icon={<Download size={13} />} onClick={loadHistory}>Refresh</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500"><tr>{['Time', 'Operation', 'Method', 'HTTP', 'Result', 'Duration', 'Meta Message ID'].map(h => <th key={h} className="px-3 py-2 text-left font-bold whitespace-nowrap">{h}</th>)}</tr></thead>
            <tbody>
              {reqHistory.length === 0
                ? <tr><td colSpan={7} className="px-3 py-10 text-center text-slate-400">No API calls yet — run a connection test or send a test message.</td></tr>
                : reqHistory.map(r => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(r.createdAt)}</td>
                    <td className="px-3 py-2">{r.operation === 'send_test' ? 'Send Test' : r.operation === 'connection_test' ? 'Connection Test' : (r.operation || '—')}</td>
                    <td className="px-3 py-2 font-mono">{r.method || '—'}</td>
                    <td className="px-3 py-2 font-mono">{r.httpStatus ?? '—'}</td>
                    <td className="px-3 py-2"><Badge variant={r.ok ? 'green' : 'red'}>{r.ok ? 'OK' : (r.metaErrorCode ? `Err ${r.metaErrorCode}` : 'Failed')}</Badge></td>
                    <td className="px-3 py-2 text-slate-500">{r.durationMs != null ? `${r.durationMs}ms` : '—'}</td>
                    <td className="px-3 py-2 font-mono text-[10px] break-all text-slate-500">{r.metaMessageId || '—'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delivery queue legend + pointer to the monitor */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="mb-2 flex items-center gap-2 text-xs font-extrabold text-slate-700"><Truck size={14} /> Delivery Queue Statuses</p>
        <div className="flex flex-wrap gap-2">
          {QUEUE_STATUS_LEGEND.map(q => (
            <span key={q.label} className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${q.tone}`}>{q.label}</span>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-slate-400">In <b>Development Mode</b> messages are redirected to your Developer Test Number; with it OFF they are delivered live via the Meta Cloud API. Open the <b>WhatsApp Queue</b> tab for the full queue monitor &amp; delivery logs.</p>
      </div>
    </div>
  );
};

// ── Communication Automation Engine (Phase 4) ─────────────────────────────────
const blankRule = () => ({ name: '', eventType: 'birthday', triggerType: 'employee_birthday', recipientScope: 'today_birthday', templateMappingId: '', hrmateTemplateId: '', language: 'en', scheduleTime: '09:00', scheduleDay: '', scheduleMonth: '', specificDate: '', specificEmployeeId: '', status: 'active', dryRun: false });

const AutomationRulesTab: React.FC = () => {
  const { canEdit } = usePermissions();
  const editable = canEdit('communication');
  const [meta, setMeta] = useState<any>({ eventTypes: [], triggerTypes: [], recipientScopes: [] });
  const [rules, setRules] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [mappings, setMappings] = useState<any[]>([]);
  const [hrTemplates, setHrTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [draft, setDraft] = useState<any>(blankRule());
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string>('');
  const [result, setResult] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [m, r, ru, mp, hr] = await Promise.all([
        api.communication.automation.meta(),
        api.communication.automation.rules(),
        api.communication.automation.runs(),
        api.communication.whatsapp.mgmt.mappings().catch(() => []),
        api.communication.templates.list().catch(() => []),
      ]);
      setMeta(m || {}); setRules(r || []); setRuns(ru || []); setMappings(mp || []); setHrTemplates(hr || []);
    } catch (e) { ui.toast.error(getApiErrorMessage(e)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const scopeByEvent = useMemo(() => {
    const m: Record<string, string> = {}; (meta.eventTypes || []).forEach((e: any) => { m[e.key] = e.scope; }); return m;
  }, [meta]);

  const openEditor = (rule?: any) => {
    setDraft(rule ? {
      ...rule,
      templateMappingId: rule.templateMappingId ?? '', hrmateTemplateId: rule.hrmateTemplateId ?? '',
      scheduleDay: rule.scheduleDay ?? '', scheduleMonth: rule.scheduleMonth ?? '', specificEmployeeId: rule.specificEmployeeId ?? '',
      scheduleTime: rule.scheduleTime || '09:00', specificDate: rule.specificDate || '',
    } : blankRule());
    setModal(true);
  };
  const onEvent = (ev: string) => setDraft((d: any) => ({ ...d, eventType: ev, recipientScope: scopeByEvent[ev] || d.recipientScope }));

  const save = async () => {
    if (!editable) return;
    if (!draft.name.trim()) { ui.toast.error('Enter a rule name.'); return; }
    setSaving(true);
    try {
      if (draft.id) await api.communication.automation.updateRule(draft.id, draft);
      else await api.communication.automation.createRule(draft);
      ui.toast.success('Automation rule saved.'); setModal(false); load();
    } catch (e) { ui.toast.error(getApiErrorMessage(e)); }
    finally { setSaving(false); }
  };

  const run = async (rule: any, mode: string) => {
    setBusyId(`${rule.id}:${mode}`); setResult(null);
    try {
      const r = await api.communication.automation.execute(rule.id, mode);
      setResult({ ...r, rule });
      const s = r.summary || {};
      ui.toast.success(`${mode === 'run' ? 'Run' : mode === 'dry_run' ? 'Dry run' : 'Preview'}: ${s.eligibleRecipients}/${s.recipientsEvaluated} eligible${mode === 'run' ? `, ${s.queuedMessages} queued` : ''}.`);
      load();
    } catch (e) { ui.toast.error(getApiErrorMessage(e)); }
    finally { setBusyId(''); }
  };

  const removeRule = async (rule: any) => {
    if (!editable) return;
    if (!(await ui.confirm({ title: 'Delete rule?', message: `Delete automation rule "${rule.name}"?`, confirmText: 'Delete', variant: 'danger' }))) return;
    try { await api.communication.automation.removeRule(rule.id); ui.toast.success('Rule deleted.'); load(); }
    catch (e) { ui.toast.error(getApiErrorMessage(e)); }
  };

  const labelOf = (arr: any[], key: string, k = 'key', l = 'label') => (arr || []).find((x: any) => x[k] === key)?.[l] || key;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3">
        <p className="flex items-center gap-2 text-xs font-bold text-violet-800"><Sparkles size={16} /> Automation Rules — one generic engine for birthdays, anniversaries, festivals, announcements & more. Generates queue entries only (never sends directly).</p>
        <Button size="sm" disabled={!editable} onClick={() => openEditor()} icon={<Plus size={13} />} className="bg-violet-600 hover:bg-violet-700 text-white">New Rule</Button>
      </div>

      {/* Rules table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-2.5"><p className="flex items-center gap-2 text-xs font-extrabold text-slate-700"><Sparkles size={14} className="text-violet-600" /> Rules</p></div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500"><tr>{['Rule', 'Event', 'Trigger', 'Recipients', 'Template', 'Status', 'Last Run', 'Actions'].map(h => <th key={h} className="px-3 py-2 text-left font-bold whitespace-nowrap">{h}</th>)}</tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={8} className="px-3 py-10 text-center text-slate-500">Loading…</td></tr>
                : rules.length === 0 ? <tr><td colSpan={8} className="px-3 py-12 text-center text-slate-400">No automation rules yet. Click “New Rule” to create one.</td></tr>
                  : rules.map(r => (
                    <tr key={r.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-semibold">{r.name}{r.dryRun && <span className="ml-1 rounded bg-amber-50 px-1 text-[9px] font-bold text-amber-600">DRY</span>}</td>
                      <td className="px-3 py-2">{labelOf(meta.eventTypes, r.eventType)}</td>
                      <td className="px-3 py-2">{String(r.triggerType || '').replace(/_/g, ' ')}</td>
                      <td className="px-3 py-2 text-[10px]">{labelOf(meta.recipientScopes, r.recipientScope)}</td>
                      <td className="px-3 py-2 font-mono text-[10px]">{r.templateMappingId ? `map#${r.templateMappingId}` : r.hrmateTemplateId ? `tpl#${r.hrmateTemplateId}` : '—'} · {String(r.language || '').toUpperCase()}</td>
                      <td className="px-3 py-2"><Badge variant={r.status === 'active' ? 'green' : 'gray'}>{r.status}</Badge></td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-500">{r.lastRunAt ? formatDateTime(r.lastRunAt) : '—'}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          <button onClick={() => run(r, 'preview')} disabled={busyId.startsWith(`${r.id}:`)} className="rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Preview</button>
                          <button onClick={() => run(r, 'dry_run')} disabled={busyId.startsWith(`${r.id}:`)} className="rounded-lg border border-amber-200 px-2 py-1 text-[10px] font-bold text-amber-700 hover:bg-amber-50 disabled:opacity-50">Dry Run</button>
                          <button onClick={() => run(r, 'run')} disabled={!editable || busyId.startsWith(`${r.id}:`)} className="rounded-lg border border-emerald-200 px-2 py-1 text-[10px] font-bold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">{busyId === `${r.id}:run` ? '…' : 'Run'}</button>
                          <button onClick={() => openEditor(r)} disabled={!editable} className="rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"><Edit size={11} /></button>
                          <button onClick={() => removeRule(r)} disabled={!editable} className="rounded-lg border border-rose-200 px-2 py-1 text-[10px] font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-50"><Trash2 size={11} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Execution result */}
      {result && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="flex items-center gap-2 text-xs font-extrabold text-slate-700">
              {result.mode === 'run' ? <Send size={14} className="text-emerald-600" /> : result.mode === 'dry_run' ? <FlaskConical size={14} className="text-amber-600" /> : <Eye size={14} className="text-slate-500" />}
              {result.mode === 'run' ? 'Run' : result.mode === 'dry_run' ? 'Dry Run' : 'Preview'} — {result.rule?.name}
              {result.mode !== 'run' && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-500">nothing queued</span>}
            </p>
            <button onClick={() => setResult(null)} className="text-slate-400 hover:text-slate-700"><X size={14} /></button>
          </div>
          <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {[['Evaluated', result.summary?.recipientsEvaluated], ['Eligible', result.summary?.eligibleRecipients], ['Queued', result.summary?.queuedMessages], ['Skipped', result.summary?.skippedMessages], ['Errors', result.summary?.errorsCount], ['Duration', `${result.summary?.durationMs ?? 0}ms`]].map(([k, v]: any) => (
              <div key={k} className="rounded-xl border border-slate-150 bg-slate-50/60 px-2 py-1.5 text-center"><p className="text-sm font-extrabold text-slate-800">{v}</p><p className="text-[9px] font-semibold text-slate-400">{k}</p></div>
            ))}
          </div>
          {result.templateCheck && result.templateCheck.warnings?.length > 0 && (
            <div className="mb-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-semibold text-amber-700">{result.templateCheck.warnings.map((w: string, i: number) => <p key={i}>• {w}</p>)}</div>
          )}
          <div className="max-h-72 overflow-auto rounded-xl border border-slate-150">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500"><tr>{['Employee', 'Status', 'Would Send To', 'Message Preview'].map(h => <th key={h} className="px-3 py-1.5 text-left font-bold">{h}</th>)}</tr></thead>
              <tbody>
                {(result.recipients || []).length === 0 ? <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-400">No recipients resolved for this rule today.</td></tr>
                  : result.recipients.map((r: any, i: number) => (
                    <tr key={i} className="border-t border-slate-100 align-top">
                      <td className="px-3 py-1.5 font-semibold">{r.employee}</td>
                      <td className="px-3 py-1.5">{r.eligible ? <Badge variant="green">{r.queued ? 'Queued' : 'Eligible'}</Badge> : <Badge variant="gray">Skipped</Badge>}{!r.eligible && r.reason && <p className="mt-0.5 text-[9px] text-slate-500">{r.reason}</p>}</td>
                      <td className="px-3 py-1.5 font-mono text-[10px]">{r.redirectedTo || '—'}</td>
                      <td className="px-3 py-1.5 text-[10px] text-slate-600">{r.preview || '—'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Run history */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-2.5"><p className="flex items-center gap-2 text-xs font-extrabold text-slate-700"><Clock size={14} /> Execution History</p></div>
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500"><tr>{['Time', 'Rule', 'Mode', 'Evaluated', 'Eligible', 'Queued', 'Skipped', 'Errors', 'Duration'].map(h => <th key={h} className="px-3 py-2 text-left font-bold whitespace-nowrap">{h}</th>)}</tr></thead>
          <tbody>
            {runs.length === 0 ? <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-400">No executions yet.</td></tr>
              : runs.map(r => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(r.createdAt)}</td>
                  <td className="px-3 py-2">{r.ruleName || '—'}</td>
                  <td className="px-3 py-2"><Badge variant={r.mode === 'run' ? 'green' : r.mode === 'dry_run' ? 'amber' : 'gray'}>{String(r.mode).replace('_', ' ')}</Badge></td>
                  <td className="px-3 py-2">{r.recipientsEvaluated}</td>
                  <td className="px-3 py-2">{r.eligibleRecipients}</td>
                  <td className="px-3 py-2">{r.queuedMessages}</td>
                  <td className="px-3 py-2">{r.skippedMessages}</td>
                  <td className="px-3 py-2">{r.errorsCount}</td>
                  <td className="px-3 py-2 text-slate-500">{r.durationMs != null ? `${r.durationMs}ms` : '—'}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Rule editor */}
      {modal && (
        <Modal open={modal} onClose={() => setModal(false)} title={draft.id ? 'Edit Automation Rule' : 'New Automation Rule'} size="lg"
          footer={<><Button variant="outline" onClick={() => setModal(false)}>Cancel</Button><Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Rule'}</Button></>}>
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Input label="Rule Name *" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Daily Birthday Wishes" />
              <Select label="Event Type" value={draft.eventType} onChange={e => onEvent(e.target.value)} options={(meta.eventTypes || []).map((x: any) => ({ value: x.key, label: x.label }))} />
              <Select label="Trigger" value={draft.triggerType} onChange={e => setDraft({ ...draft, triggerType: e.target.value })} options={(meta.triggerTypes || []).map((t: string) => ({ value: t, label: t.replace(/_/g, ' ') }))} />
              <Select label="Recipients" value={draft.recipientScope} onChange={e => setDraft({ ...draft, recipientScope: e.target.value })} options={(meta.recipientScopes || []).map((x: any) => ({ value: x.key, label: x.label }))} />
            </div>

            {/* Schedule (depends on trigger) */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {['daily', 'weekly', 'monthly', 'yearly'].includes(draft.triggerType) && <Input label="Time" type="time" value={draft.scheduleTime} onChange={e => setDraft({ ...draft, scheduleTime: e.target.value })} />}
              {draft.triggerType === 'weekly' && <Select label="Day of Week" value={String(draft.scheduleDay)} onChange={e => setDraft({ ...draft, scheduleDay: e.target.value })} options={['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d, i) => ({ value: String(i), label: d }))} />}
              {draft.triggerType === 'monthly' && <Input label="Day of Month" type="number" value={draft.scheduleDay} onChange={e => setDraft({ ...draft, scheduleDay: e.target.value })} placeholder="1–31" />}
              {draft.triggerType === 'specific_date' && <Input label="Specific Date" type="date" value={draft.specificDate} onChange={e => setDraft({ ...draft, specificDate: e.target.value })} />}
              {draft.recipientScope === 'specific_employee' && <Input label="Specific Employee ID" type="number" value={draft.specificEmployeeId} onChange={e => setDraft({ ...draft, specificEmployeeId: e.target.value })} placeholder="Employee record id" />}
            </div>

            {/* Template */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <p className="mb-2 text-[11px] font-extrabold text-slate-700">Template</p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Select label="Meta Template Mapping (preferred)" value={String(draft.templateMappingId || '')} onChange={e => setDraft({ ...draft, templateMappingId: e.target.value, language: mappings.find(m => String(m.id) === e.target.value)?.language || draft.language })}
                  options={[{ value: '', label: 'None (use HRMate template)' }, ...mappings.map(m => ({ value: String(m.id), label: `${m.metaTemplateName} · ${String(m.language).toUpperCase()} · ${m.status}` }))]} />
                <Select label="HRMate Template (fallback)" value={String(draft.hrmateTemplateId || '')} onChange={e => setDraft({ ...draft, hrmateTemplateId: e.target.value })}
                  options={[{ value: '', label: 'None' }, ...hrTemplates.map((t: any) => ({ value: String(t.id), label: t.title }))]} />
                <Input label="Language" value={draft.language} onChange={e => setDraft({ ...draft, language: e.target.value })} placeholder="en / gu / hi" />
                <Select label="Status" value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value })} options={[{ value: 'active', label: 'Active' }, { value: 'paused', label: 'Paused' }]} />
              </div>
              <label className="mt-3 flex w-fit items-center gap-2 text-[11px] font-semibold text-slate-600">
                <input type="checkbox" checked={!!draft.dryRun} onChange={e => setDraft({ ...draft, dryRun: e.target.checked })} />
                Dry-run mode (rule runs full logic but never queues — for safe testing)
              </label>
            </div>
            <p className="text-[10px] text-slate-400">Automation only creates queue entries. The existing queue processor handles delivery. Use Preview / Dry Run to simulate without queuing.</p>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ── WhatsApp Template Management & Approval (Phase 3) ─────────────────────────
const WA_TEMPLATE_TOKENS = ['employee_name', 'company_name', 'designation', 'department', 'employee_photo', 'company_logo', 'joining_date', 'today_date'];
const WA_TOKEN_SAMPLE: Record<string, string> = {
  employee_name: 'Raj Sharma', company_name: 'Vishv Enterprise', designation: 'Software Developer',
  department: 'Engineering', employee_photo: '[photo]', company_logo: '[logo]', joining_date: '01 Jun 2022', today_date: 'today',
};
const metaStatusBadge = (st?: string) => {
  const s = (st || '').toUpperCase();
  if (s === 'APPROVED') return <Badge variant="green">Approved</Badge>;
  if (s === 'PENDING' || s === 'PENDING_REVIEW' || s === 'IN_APPEAL') return <Badge variant="amber">Pending Review</Badge>;
  if (s === 'REJECTED') return <Badge variant="red">Rejected</Badge>;
  if (s === 'DISABLED' || s === 'PAUSED') return <Badge variant="gray">{s === 'PAUSED' ? 'Paused' : 'Disabled'}</Badge>;
  return <Badge variant="gray">{st || 'Unknown'}</Badge>;
};
const parseMetaBody = (components: any): string => {
  let c = components;
  if (typeof c === 'string') { try { c = JSON.parse(c); } catch { c = []; } }
  if (!Array.isArray(c)) return '';
  const body = c.find((x: any) => (x.type || '').toUpperCase() === 'BODY');
  return body ? (body.text || '') : '';
};

const WhatsAppTemplatesTab: React.FC = () => {
  const branding = useContext(BrandingCtx);
  const { canEdit } = usePermissions();
  const editable = canEdit('communication');
  const [metaTemplates, setMetaTemplates] = useState<any[]>([]);
  const [mappings, setMappings] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [hrTemplates, setHrTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [modal, setModal] = useState(false);
  const [draft, setDraft] = useState<any>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [m, mp, ev, hr] = await Promise.all([
        api.communication.whatsapp.mgmt.meta(),
        api.communication.whatsapp.mgmt.mappings(),
        api.communication.whatsapp.mgmt.events(),
        api.communication.templates.list().catch(() => []),
      ]);
      setMetaTemplates(m || []); setMappings(mp || []); setEvents(ev || []); setHrTemplates(hr || []);
    } catch (e) { ui.toast.error(getApiErrorMessage(e)); }
    finally { setLoading(false); }
  };
  useEffect(() => { loadAll(); }, []);

  const sync = async () => {
    if (!editable) return;
    setSyncing(true);
    try {
      const r = await api.communication.whatsapp.mgmt.sync();
      if (r?.ok) ui.toast.success(`Synced ${r.total} template(s): ${r.created} new, ${r.updated} updated${r.statusChanges ? `, ${r.statusChanges} status change(s)` : ''}.`);
      else ui.toast.error(r?.message || 'Sync failed.');
      loadAll();
    } catch (e) { ui.toast.error(getApiErrorMessage(e)); }
    finally { setSyncing(false); }
  };

  const openEditor = (mapping?: any) => {
    setErrors([]);
    if (mapping) {
      let vm = {}; try { vm = JSON.parse(mapping.variableMap || '{}'); } catch { /* ignore */ }
      setDraft({ id: mapping.id, hrmateTemplateId: mapping.hrmateTemplateId || '', hrmateTemplateName: mapping.hrmateTemplateName || '', metaKey: `${mapping.metaTemplateName}||${mapping.language}`, metaTemplateName: mapping.metaTemplateName, language: mapping.language, variableMap: vm, headerMediaType: mapping.headerMediaType || 'none', headerMediaUrl: mapping.headerMediaUrl || '' });
    } else {
      setDraft({ hrmateTemplateId: '', hrmateTemplateName: '', metaKey: '', metaTemplateName: '', language: 'en', variableMap: {}, headerMediaType: 'none', headerMediaUrl: '' });
    }
    setModal(true);
  };

  const selectedMeta = useMemo(() => metaTemplates.find(t => `${t.name}||${t.language}` === draft?.metaKey), [metaTemplates, draft]);
  const selectedHr = useMemo(() => hrTemplates.find((t: any) => String(t.id) === String(draft?.hrmateTemplateId)), [hrTemplates, draft]);
  const varCount = selectedMeta?.bodyVariableCount || 0;
  const metaBody = useMemo(() => parseMetaBody(selectedMeta?.components), [selectedMeta]);

  const onPickMeta = (key: string) => {
    const t = metaTemplates.find(x => `${x.name}||${x.language}` === key);
    setDraft((d: any) => ({ ...d, metaKey: key, metaTemplateName: t?.name || '', language: t?.language || 'en', variableMap: {}, headerMediaType: (t?.headerFormat && t.headerFormat !== 'TEXT') ? t.headerFormat.toLowerCase() : 'none' }));
  };
  const setVar = (i: number, token: string) => setDraft((d: any) => ({ ...d, variableMap: { ...d.variableMap, [String(i)]: token } }));

  // Meta preview with mapped sample values + unmapped warnings.
  const metaPreview = useMemo(() => {
    if (!metaBody) return '';
    return metaBody.replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, n) => {
      const tok = draft?.variableMap?.[String(n)];
      return tok ? (WA_TOKEN_SAMPLE[tok] ?? `{{${n}}}`) : `⚠️{{${n}}}`;
    });
  }, [metaBody, draft]);
  const unmapped = useMemo(() => {
    const miss: number[] = [];
    for (let i = 1; i <= varCount; i++) if (!draft?.variableMap?.[String(i)]) miss.push(i);
    return miss;
  }, [varCount, draft]);

  const save = async () => {
    if (!editable) return;
    setSaving(true); setErrors([]);
    try {
      await api.communication.whatsapp.mgmt.saveMapping({
        id: draft.id, hrmateTemplateId: draft.hrmateTemplateId || null, hrmateTemplateName: selectedHr?.title || draft.hrmateTemplateName || '',
        metaTemplateName: draft.metaTemplateName, language: draft.language, variableMap: draft.variableMap,
        headerMediaType: draft.headerMediaType, headerMediaUrl: draft.headerMediaUrl,
      });
      ui.toast.success('Template mapping saved.');
      setModal(false); loadAll();
    } catch (e: any) {
      if (e?.status === 400 && e?.data?.fields) setErrors(e.data.fields);
      ui.toast.error(getApiErrorMessage(e));
    } finally { setSaving(false); }
  };

  const test = async (m: any) => {
    if (!editable) return;
    setTestingId(m.id);
    try {
      const r = await api.communication.whatsapp.mgmt.testMapping(m.id);
      if (r?.ok) ui.toast.success(`${r.message} (Meta ID ${r.details?.metaMessageId || '—'})`);
      else ui.toast.error(`${r?.status || 'Error'}: ${r?.message || 'Send failed.'}`);
      loadAll();
    } catch (e) { ui.toast.error(getApiErrorMessage(e)); }
    finally { setTestingId(null); }
  };

  const removeMapping = async (m: any) => {
    if (!editable) return;
    if (!(await ui.confirm({ title: 'Delete mapping?', message: `Remove the mapping for "${m.metaTemplateName}"?`, confirmText: 'Delete', variant: 'danger' }))) return;
    try { await api.communication.whatsapp.mgmt.removeMapping(m.id); ui.toast.success('Mapping deleted.'); loadAll(); }
    catch (e) { ui.toast.error(getApiErrorMessage(e)); }
  };

  const canSave = draft && draft.metaTemplateName && draft.hrmateTemplateId && unmapped.length === 0
    && !(selectedMeta?.headerFormat && selectedMeta.headerFormat !== 'TEXT' && draft.headerMediaType !== 'none' && !draft.headerMediaUrl);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <p className="flex items-center gap-2 text-xs font-bold text-emerald-800"><LayoutTemplate size={16} /> WhatsApp Templates — map HRMate templates to Meta-approved templates. Separate from Communication Templates.</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={!editable || syncing} onClick={sync} icon={<Download size={13} />}>{syncing ? 'Syncing…' : 'Sync Templates'}</Button>
          <Button size="sm" disabled={!editable} onClick={() => openEditor()} icon={<Plus size={13} />} className="bg-emerald-600 hover:bg-emerald-700 text-white">Map Template</Button>
        </div>
      </div>

      {/* Synced Meta templates */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-2.5"><p className="flex items-center gap-2 text-xs font-extrabold text-slate-700"><MessageCircle size={14} className="text-emerald-600" /> Meta Approved Templates</p></div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500"><tr>{['Template Name', 'Category', 'Language', 'Status', 'Variables', 'Header', 'Version', 'Last Synced'].map(h => <th key={h} className="px-3 py-2 text-left font-bold whitespace-nowrap">{h}</th>)}</tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={8} className="px-3 py-10 text-center text-slate-500">Loading…</td></tr>
                : metaTemplates.length === 0 ? <tr><td colSpan={8} className="px-3 py-12 text-center text-slate-400">No templates synced yet. Click “Sync Templates” to pull approved templates from your WhatsApp Business Account.</td></tr>
                  : metaTemplates.map(t => (
                    <tr key={t.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-semibold">{t.name}</td>
                      <td className="px-3 py-2">{t.category || '—'}</td>
                      <td className="px-3 py-2 uppercase">{t.language || '—'}</td>
                      <td className="px-3 py-2">{metaStatusBadge(t.status)}</td>
                      <td className="px-3 py-2 text-center">{t.bodyVariableCount}</td>
                      <td className="px-3 py-2">{t.headerFormat || '—'}</td>
                      <td className="px-3 py-2 font-mono text-[10px] text-slate-400">{t.version || '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-500">{t.lastSyncedAt ? formatDateTime(t.lastSyncedAt) : '—'}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mappings */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-2.5"><p className="flex items-center gap-2 text-xs font-extrabold text-slate-700"><LayoutTemplate size={14} /> Template Mappings (HRMate → Meta)</p></div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500"><tr>{['HRMate Template', 'Meta Template', 'Language', 'Status', 'Usable', 'Actions'].map(h => <th key={h} className="px-3 py-2 text-left font-bold whitespace-nowrap">{h}</th>)}</tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={6} className="px-3 py-10 text-center text-slate-500">Loading…</td></tr>
                : mappings.length === 0 ? <tr><td colSpan={6} className="px-3 py-12 text-center text-slate-400">No mappings yet. Click “Map Template” to link an HRMate template to a Meta template.</td></tr>
                  : mappings.map(m => (
                    <tr key={m.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-semibold">{m.hrmateTemplateName || `#${m.hrmateTemplateId}`}</td>
                      <td className="px-3 py-2 font-mono text-[11px]">{m.metaTemplateName}</td>
                      <td className="px-3 py-2 uppercase">{m.language}</td>
                      <td className="px-3 py-2">{metaStatusBadge(m.status)}</td>
                      <td className="px-3 py-2">{m.active ? <Badge variant="green">Ready</Badge> : <Badge variant="gray">Blocked</Badge>}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          <button onClick={() => openEditor(m)} disabled={!editable} className="rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"><Edit size={11} /></button>
                          <button onClick={() => test(m)} disabled={!editable || !m.active || testingId === m.id} title={m.active ? 'Send Template Test' : 'Only APPROVED templates can be tested'} className="rounded-lg border border-emerald-200 px-2 py-1 text-[10px] font-bold text-emerald-700 hover:bg-emerald-50 disabled:opacity-40">{testingId === m.id ? '…' : 'Send Test'}</button>
                          <button onClick={() => removeMapping(m)} disabled={!editable} className="rounded-lg border border-rose-200 px-2 py-1 text-[10px] font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-50"><Trash2 size={11} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* History */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-2.5"><p className="flex items-center gap-2 text-xs font-extrabold text-slate-700"><Clock size={14} /> Template History</p></div>
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500"><tr>{['Time', 'Template', 'Language', 'Event', 'Change'].map(h => <th key={h} className="px-3 py-2 text-left font-bold whitespace-nowrap">{h}</th>)}</tr></thead>
          <tbody>
            {events.length === 0 ? <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-400">No template activity yet.</td></tr>
              : events.map(ev => (
                <tr key={ev.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(ev.createdAt)}</td>
                  <td className="px-3 py-2">{ev.templateName || '—'}</td>
                  <td className="px-3 py-2 uppercase">{ev.language || '—'}</td>
                  <td className="px-3 py-2"><Badge variant="blue">{String(ev.event || '').replace(/_/g, ' ')}</Badge></td>
                  <td className="px-3 py-2 text-slate-500">{[ev.fromValue, ev.toValue].filter(Boolean).join(' → ') || ev.detail || '—'}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Mapping editor */}
      {modal && draft && (
        <Modal open={modal} onClose={() => setModal(false)} title={draft.id ? 'Edit Template Mapping' : 'Map HRMate → Meta Template'} size="lg"
          footer={<><Button variant="outline" onClick={() => setModal(false)}>Cancel</Button><Button onClick={save} disabled={!canSave || saving}>{saving ? 'Saving…' : 'Save Mapping'}</Button></>}>
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Select label="HRMate Template" value={draft.hrmateTemplateId} onChange={e => setDraft({ ...draft, hrmateTemplateId: e.target.value })}
                options={[{ value: '', label: 'Select HRMate template…' }, ...hrTemplates.map((t: any) => ({ value: String(t.id), label: `${t.title} (${t.category})` }))]} />
              <Select label="Meta Template (synced)" value={draft.metaKey} onChange={e => onPickMeta(e.target.value)}
                options={[{ value: '', label: 'Select Meta template…' }, ...metaTemplates.map(t => ({ value: `${t.name}||${t.language}`, label: `${t.name} · ${String(t.language || '').toUpperCase()} · ${t.status}` }))]} />
            </div>

            {selectedMeta && selectedMeta.status !== 'APPROVED' && (
              <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-700"><AlertTriangle size={13} /> This Meta template is “{selectedMeta.status}”. You can map it, but it can’t be sent until Meta approves it.</div>
            )}

            {/* Variable mapping */}
            {selectedMeta && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                <p className="mb-2 text-[11px] font-extrabold text-slate-700">Variable Mapping {varCount === 0 && <span className="font-semibold text-slate-400">— this template has no body variables</span>}</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {Array.from({ length: varCount }, (_, i) => i + 1).map(i => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-12 shrink-0 rounded-lg bg-slate-200 px-2 py-1 text-center font-mono text-[11px] font-bold text-slate-700">{`{{${i}}}`}</span>
                      <span className="text-slate-400">→</span>
                      <Select value={draft.variableMap[String(i)] || ''} onChange={e => setVar(i, e.target.value)}
                        options={[{ value: '', label: 'Select placeholder…' }, ...WA_TEMPLATE_TOKENS.map(t => ({ value: t, label: `{{${t}}}` }))]} className="flex-1" />
                    </div>
                  ))}
                </div>
                {unmapped.length > 0 && <p className="mt-2 flex items-center gap-1 text-[10px] font-semibold text-rose-500"><AlertTriangle size={11} /> Map all variables before saving — missing: {unmapped.map(i => `{{${i}}}`).join(', ')}</p>}
              </div>
            )}

            {/* Header media */}
            {selectedMeta && selectedMeta.headerFormat && selectedMeta.headerFormat !== 'TEXT' && (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3">
                <p className="mb-2 text-[11px] font-extrabold text-indigo-700">Header Media ({selectedMeta.headerFormat})</p>
                <Input label="Media URL" value={draft.headerMediaUrl} onChange={e => setDraft({ ...draft, headerMediaUrl: e.target.value, headerMediaType: selectedMeta.headerFormat.toLowerCase() })} placeholder="https://…/asset" />
                <p className="mt-1 text-[10px] text-indigo-700/70">Public URL of the {String(selectedMeta.headerFormat).toLowerCase()} to use in the template header.</p>
              </div>
            )}

            {/* Preview + diff */}
            {selectedMeta && (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">HRMate Preview</p>
                  <p className="whitespace-pre-wrap text-[11px] text-slate-700">{selectedHr ? fillSample(selectedHr.body, branding) : <span className="italic text-slate-400">Select an HRMate template…</span>}</p>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">Meta Template Preview</p>
                  <p className="whitespace-pre-wrap text-[11px] text-slate-700">{metaPreview || <span className="italic text-slate-400">No body text.</span>}</p>
                  {unmapped.length > 0 && <p className="mt-1 text-[10px] font-semibold text-rose-500">⚠️ {unmapped.length} variable(s) unmapped — shown as ⚠️{`{{n}}`}.</p>}
                </div>
              </div>
            )}

            {errors.length > 0 && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-2.5">
                {errors.map((er, i) => <p key={i} className="text-[10px] font-semibold text-rose-600">• {er}</p>)}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};

// ── WhatsApp Queue Monitor + enhanced Delivery Logs (Phase 1.5) ───────────────
const WA_QUEUE_FILTERS = ['All', 'Pending', 'Processing', 'Sent', 'Failed', 'Simulated'] as const;
const statusBadgeVariant = (st: string) => st === 'Sent' ? 'green' : st === 'Failed' ? 'red' : st === 'Processing' ? 'blue' : st === 'Simulated' ? 'purple' : 'gray';

const WhatsAppQueueTab: React.FC = () => {
  const [queue, setQueue] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [qFilter, setQFilter] = useState<string>('All');
  const [logFilter, setLogFilter] = useState<string>('All');
  const [search, setSearch] = useState('');
  const [logPreview, setLogPreview] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    try { const [q, l] = await Promise.all([api.communication.whatsapp.queue(), api.communication.whatsapp.logs()]); setQueue(q || []); setLogs(l || []); }
    catch (e) { ui.toast.error(getApiErrorMessage(e)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const filteredQueue = useMemo(() => qFilter === 'All' ? queue : queue.filter(r => (r.status || '') === qFilter || (qFilter === 'Simulated' && r.simulated)), [queue, qFilter]);
  const filteredLogs = useMemo(() => {
    let rows = logFilter === 'All' ? logs : logs.filter(r => (r.status || '') === logFilter || (logFilter === 'Simulated' && r.simulated));
    const s = search.trim().toLowerCase();
    if (s) rows = rows.filter(r => [r.employeeName, r.templateName, r.originalNumber, r.actualSentNumber, r.messagePreview].some(v => String(v || '').toLowerCase().includes(s)));
    return rows;
  }, [logs, logFilter, search]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3">
        <p className="flex items-center gap-2 text-xs font-extrabold text-slate-700"><ListIcon size={15} className="text-emerald-600" /> WhatsApp Queue Monitor &amp; Delivery Logs</p>
        <Button size="sm" variant="outline" icon={<Download size={13} />} onClick={load}>Refresh</Button>
      </div>

      {/* Queue Monitor */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
          <p className="flex items-center gap-2 text-xs font-extrabold text-slate-700"><Truck size={14} /> Delivery Queue <span className="text-[10px] font-semibold text-slate-400">(read-only — no manual editing)</span></p>
          <div className="flex flex-wrap gap-1">
            {WA_QUEUE_FILTERS.map(f => (
              <button key={f} onClick={() => setQFilter(f)} className={`rounded-lg px-2 py-1 text-[10px] font-bold ${qFilter === f ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{f}</button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500"><tr>{['Queue ID', 'Employee', 'Template', 'Status', 'Created', 'Scheduled', 'Retry'].map(h => <th key={h} className="px-3 py-2 text-left font-bold whitespace-nowrap">{h}</th>)}</tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={7} className="px-3 py-10 text-center text-slate-500">Loading…</td></tr>
                : filteredQueue.length === 0 ? <tr><td colSpan={7} className="px-3 py-12 text-center text-slate-400">No queued messages{qFilter !== 'All' ? ` with status “${qFilter}”` : ''}.</td></tr>
                  : filteredQueue.map(r => (
                    <tr key={r.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-mono">#{r.id}</td>
                      <td className="px-3 py-2">{r.employeeName || '—'}</td>
                      <td className="px-3 py-2">{r.templateName || '—'}</td>
                      <td className="px-3 py-2"><Badge variant={statusBadgeVariant(r.status)}>{r.status}{r.simulated ? ' (sim)' : ''}</Badge></td>
                      <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(r.createdAt)}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-400">Immediate</td>
                      <td className="px-3 py-2">{r.attempts ?? 0}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Enhanced Delivery Logs */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
          <p className="flex items-center gap-2 text-xs font-extrabold text-slate-700"><FileStack size={14} /> Delivery Logs</p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employee / template / number…" className="w-56 rounded-lg border border-slate-200 py-1.5 pl-7 pr-2 text-[11px] focus:border-emerald-500 focus:outline-none" />
            </div>
            <div className="flex flex-wrap gap-1">
              {WA_QUEUE_FILTERS.map(f => (
                <button key={f} onClick={() => setLogFilter(f)} className={`rounded-lg px-2 py-1 text-[10px] font-bold ${logFilter === f ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{f}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500"><tr>{['Date', 'Employee', 'Template', 'Original', 'Actual Sent', 'Dev Mode', 'Time', 'Queue', 'Status', 'Preview'].map(h => <th key={h} className="px-3 py-2 text-left font-bold whitespace-nowrap">{h}</th>)}</tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={10} className="px-3 py-10 text-center text-slate-500">Loading…</td></tr>
                : filteredLogs.length === 0 ? <tr><td colSpan={10} className="px-3 py-12 text-center text-slate-400">No delivery logs{(logFilter !== 'All' || search) ? ' match your filters' : ' yet — run “Test WhatsApp Configuration”'}.</td></tr>
                  : filteredLogs.map(l => (
                    <tr key={l.id} className="border-t border-slate-100 align-top">
                      <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(l.createdAt)}</td>
                      <td className="px-3 py-2">{l.employeeName || '—'}</td>
                      <td className="px-3 py-2">{l.templateName || '—'}</td>
                      <td className="px-3 py-2 font-mono text-[11px]">{l.originalNumber || '—'}</td>
                      <td className="px-3 py-2 font-mono text-[11px]">{l.actualSentNumber || '—'}</td>
                      <td className="px-3 py-2">{l.developmentMode ? <Badge variant="purple">Yes</Badge> : <Badge variant="gray">No</Badge>}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-500">{l.processingMs != null ? `${l.processingMs}ms` : '—'}</td>
                      <td className="px-3 py-2 font-mono text-slate-500">{l.queueId ? `#${l.queueId}` : '—'}</td>
                      <td className="px-3 py-2"><Badge variant={statusBadgeVariant(l.status)}>{l.status}</Badge>{l.errorMessage && <p className="mt-0.5 max-w-[160px] text-[9px] text-rose-500">{l.errorMessage}</p>}</td>
                      <td className="px-3 py-2">{l.messagePreview ? <button onClick={() => setLogPreview(l)} className="text-[10px] font-bold text-emerald-600 hover:underline">View</button> : '—'}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </div>

      {logPreview && (
        <Modal open={!!logPreview} onClose={() => setLogPreview(null)} title="Message Preview" size="md"
          footer={<Button variant="outline" onClick={() => setLogPreview(null)}>Close</Button>}>
          <div className="space-y-2 text-[11px]">
            <div className="grid grid-cols-2 gap-2">
              <div><span className="text-slate-400">Employee</span><p className="font-bold">{logPreview.employeeName || '—'}</p></div>
              <div><span className="text-slate-400">Template</span><p className="font-bold">{logPreview.templateName || '—'}</p></div>
              <div><span className="text-slate-400">Original Recipient</span><p className="font-mono font-bold">{logPreview.originalNumber || '—'}</p></div>
              <div><span className="text-slate-400">Actual Recipient</span><p className="font-mono font-bold text-indigo-600">{logPreview.actualSentNumber || '—'}</p></div>
            </div>
            <div>
              <span className="text-slate-400">Generated Message</span>
              <div className="mt-1 whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-800">{logPreview.messagePreview}</div>
            </div>
            <p className="text-[10px] text-slate-400">Queue #{logPreview.queueId || '—'} · {logPreview.processingMs != null ? `${logPreview.processingMs}ms` : '—'} · {logPreview.developmentMode ? 'Development Mode (redirected)' : 'Production'} · simulated.</p>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ── WhatsApp Scheduler Preview (Phase 1.5 — simulates upcoming jobs, no sending) ──
const WhatsAppSchedulerTab: React.FC = () => {
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { (async () => { try { setD(await api.communication.whatsapp.schedulerPreview()); } catch (e) { ui.toast.error(getApiErrorMessage(e)); } finally { setLoading(false); } })(); }, []);

  const Section: React.FC<{ title: string; icon: React.ReactNode; rows: any[]; cols: string[]; render: (r: any) => React.ReactNode; empty: string }> = ({ title, icon, rows, cols, render, empty }) => (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
        <p className="flex items-center gap-2 text-xs font-extrabold text-slate-700">{icon} {title}</p>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{rows.length} job{rows.length === 1 ? '' : 's'}</span>
      </div>
      <table className="w-full text-xs">
        <thead className="bg-slate-50 text-slate-500"><tr>{cols.map(h => <th key={h} className="px-3 py-2 text-left font-bold">{h}</th>)}</tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={cols.length} className="px-3 py-8 text-center text-slate-500">Loading…</td></tr>
            : rows.length === 0 ? <tr><td colSpan={cols.length} className="px-3 py-10 text-center text-slate-400">{empty}</td></tr>
              : rows.map((r, i) => <tr key={i} className="border-t border-slate-100">{render(r)}</tr>)}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3">
        <CalendarClock size={18} className="mt-0.5 shrink-0 text-indigo-600" />
        <div>
          <p className="text-xs font-extrabold text-indigo-800">Scheduler Preview (simulation only)</p>
          <p className="text-[11px] font-semibold text-indigo-700">Shows the WhatsApp jobs that <i>would</i> run — nothing is queued or sent. {d?.developmentMode && <>In Development Mode all recipients resolve to <b>{d?.testNumber || 'the test number'}</b>.</>}</p>
        </div>
      </div>

      <Section title="Today's Birthday Queue" icon={<Cake size={14} className="text-pink-600" />} rows={d?.todayBirthdays || []}
        cols={['Employee', 'Date', 'Original Number', 'Would Send To']} empty="No birthdays today."
        render={(r) => (<><td className="px-3 py-2">{r.employee}</td><td className="px-3 py-2">{formatDate(r.date)}</td><td className="px-3 py-2 font-mono text-[11px]">{r.originalNumber || '—'}</td><td className="px-3 py-2 font-mono text-[11px] text-indigo-600">{r.redirectedTo}</td></>)} />

      <Section title="Tomorrow's Birthday Queue" icon={<Cake size={14} className="text-pink-500" />} rows={d?.tomorrowBirthdays || []}
        cols={['Employee', 'Date', 'Original Number', 'Would Send To']} empty="No birthdays tomorrow."
        render={(r) => (<><td className="px-3 py-2">{r.employee}</td><td className="px-3 py-2">{formatDate(r.date)}</td><td className="px-3 py-2 font-mono text-[11px]">{r.originalNumber || '—'}</td><td className="px-3 py-2 font-mono text-[11px] text-indigo-600">{r.redirectedTo}</td></>)} />

      <Section title="Upcoming Festival Queue (next 30 days)" icon={<PartyPopper size={14} className="text-orange-600" />} rows={d?.upcomingFestivals || []}
        cols={['Festival', 'Date', 'Category', 'Templates Available']} empty="No festivals in the next 30 days."
        render={(r) => (<><td className="px-3 py-2 font-semibold">{r.festival}</td><td className="px-3 py-2">{formatDate(r.date)}</td><td className="px-3 py-2">{r.category}</td><td className="px-3 py-2">{r.templatesAvailable}</td></>)} />
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
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-[11px] font-semibold text-emerald-700 flex items-center justify-between">
        <span>WhatsApp delivery is live via the Meta Cloud API — configure it in the <b>WhatsApp Settings</b> tab. Email, SMS &amp; Push are not part of this module.</span>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {[
          { label: 'WhatsApp Provider', icon: <MessageSquare size={15} />, live: true, note: 'Meta Cloud API · configured in WhatsApp Settings' },
          { label: 'Email Provider', icon: <Mail size={15} />, live: false, note: 'Not part of this module' },
          { label: 'SMS Provider', icon: <Smartphone size={15} />, live: false, note: 'Not part of this module' },
          { label: 'Push Notifications', icon: <Send size={15} />, live: false, note: 'Not part of this module' },
        ].map(p => (
          <div key={p.label} className={`rounded-2xl border border-slate-200 bg-white p-4 ${p.live ? '' : 'opacity-80'}`}>
            <div className="mb-2 flex items-center justify-between">
              <p className="flex items-center gap-2 text-xs font-extrabold text-slate-600">{p.icon} {p.label}</p>
              {p.live ? <Badge variant="green">Active</Badge> : <Lock size={13} className="text-slate-400" />}
            </div>
            <p className={`text-[11px] ${p.live ? 'text-emerald-700' : 'text-slate-400'}`}>{p.note}</p>
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
