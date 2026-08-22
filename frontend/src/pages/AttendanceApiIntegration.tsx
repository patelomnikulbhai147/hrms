import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { api } from '@/api/apiClient';
import { ui } from '@/components/ui/feedback';
import { getApiErrorMessage } from '@/utils/apiError';
import type { Role } from '@/data/mockData';
import {
  RefreshCw, LayoutGrid, Users, Database, Search, Clock, FileText, AlertTriangle,
  XCircle, Monitor,
} from 'lucide-react';

interface Props { role: Role; activeCompanyId?: string; companies?: any[]; authProfile?: any; }

const todayIso = () => new Date().toISOString().split('T')[0];
// yyyy-MM-dd → "20 Aug" (short chart label)
const shortLabel = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); if (!m) return iso;
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m[2] - 1];
  return `${+m[3]} ${mon}`;
};
const isoToDmy = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : iso; };

// Count 0→value on mount (ease-out quart), matching the reference.
const AnimatedNumber: React.FC<{ value: number; duration?: number }> = ({ value, duration = 800 }) => {
  const [n, setN] = useState(0);
  const ref = useRef<number>(0);
  useEffect(() => {
    const start = performance.now(); const from = ref.current; const to = Number(value) || 0;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration); const e = 1 - Math.pow(1 - p, 4);
      const cur = Math.round(from + (to - from) * e); setN(cur); ref.current = cur;
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{n}</>;
};

const BAR_TT = [
  { key: 'present', name: 'Present', color: '#059669' },
  { key: 'late', name: 'Late', color: '#D97706' },
  { key: 'absent', name: 'Absent', color: '#DC2626' },
  { key: 'on_leave', name: 'On Leave', color: '#4F46E5' },
];
const CustomTooltip: React.FC<any> = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload || {};
  const total = BAR_TT.reduce((a, i) => a + (Number(d[i.key]) || 0), 0);
  return (
    <div style={{ backgroundColor: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)', padding: 16, border: '1px solid rgba(226,232,240,0.8)', borderRadius: 16, boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.05)', minWidth: 180 }}>
      <div style={{ fontWeight: 700, color: '#0F172A', borderBottom: '1px solid #E2E8F0', paddingBottom: 8, fontSize: '0.9rem' }}>{label}</div>
      {BAR_TT.map((i) => (
        <div key={i.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#475569', fontWeight: 500, fontSize: '0.85rem' }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: i.color, boxShadow: `0 0 4px ${i.color}` }} />{i.name}
          </span>
          <span style={{ color: '#0F172A', fontWeight: 700, fontSize: '0.85rem' }}>{Number(d[i.key]) || 0}</span>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #E2E8F0', paddingTop: 10, marginTop: 10 }}>
        <span style={{ color: '#475569', fontWeight: 600 }}>Total</span>
        <span style={{ fontWeight: 800, fontSize: '1rem', color: '#0F172A' }}>{total}</span>
      </div>
    </div>
  );
};

const StandardPagination: React.FC<{ currentPage: number; totalPages: number; totalRecords: number; itemsPerPage: number; setCurrentPage: (p: number) => void }> = ({ currentPage, totalPages, totalRecords, itemsPerPage, setCurrentPage }) => {
  if (totalRecords === 0) return null;
  const from = (currentPage - 1) * itemsPerPage + 1;
  const to = Math.min(currentPage * itemsPerPage, totalRecords);
  const btn = (disabled: boolean) => ({ padding: '0.375rem 1rem', backgroundColor: '#fff', color: '#374151', border: '1px solid #e5e7eb', borderRadius: 9999, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, fontSize: '0.8rem' as const });
  return (
    <div style={{ borderTop: '1px solid #e5e7eb', padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', borderBottomLeftRadius: 8, borderBottomRightRadius: 8, flexWrap: 'wrap', gap: 8 }}>
      <div style={{ color: '#6b7280', fontSize: '0.875rem' }}>Showing <b>{from}</b> to <b>{to}</b> of <b>{totalRecords}</b> records</div>
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button style={btn(currentPage <= 1)} disabled={currentPage <= 1} onClick={() => setCurrentPage(currentPage - 1)}>&lt;&lt; Previous</button>
          <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>Page {currentPage} of {totalPages}</span>
          <button style={btn(currentPage >= totalPages)} disabled={currentPage >= totalPages} onClick={() => setCurrentPage(currentPage + 1)}>Next &gt;&gt;</button>
        </div>
      )}
    </div>
  );
};

const card: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 8, backgroundColor: '#fff', boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)' };
const thStyle: React.CSSProperties = { padding: '0.5rem 0.5rem', fontWeight: 600, color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left' };

const statusBadge = (status: string) => {
  const s = String(status || '').toLowerCase();
  let bg = '#dbeafe', color = '#1e40af';
  if (s.startsWith('present') || s.startsWith('half')) { bg = '#d1fae5'; color = '#065f46'; }
  else if (s.startsWith('absent')) { bg = '#fee2e2'; color = '#991b1b'; }
  else if (s.startsWith('late')) { bg = '#ffedd5'; color = '#9a3412'; }
  else if (s.startsWith('weekly')) { bg = '#f1f5f9'; color = '#475569'; }
  return <span style={{ padding: '0.15rem 0.5rem', borderRadius: 9999, fontSize: '0.65rem', fontWeight: 600, backgroundColor: bg, color, display: 'inline-block' }}>● {status}</span>;
};

// ─────────────────────────────────────────────────────────────────────────────
export const AttendanceApiIntegration: React.FC<Props> = ({ role }) => {
  const canManage = role === 'Super Admin' || role === 'Company Head';
  const [activeSection, setActiveSection] = useState<'overview' | 'attendance' | 'integration'>('overview');
  const [syncing, setSyncing] = useState(false);
  const [data, setData] = useState<any>(null); // reference-shaped dashboard object
  const [range, setRange] = useState('30');
  const [attFilters, setAttFilters] = useState({ date_from: todayIso(), date_to: todayIso(), search: '', status: 'All' });
  const [subTabInit, setSubTabInit] = useState<'attendance' | 'punches' | 'devices'>('attendance');

  // Compose the reference-shaped dashboard object from ZeniaHR endpoints.
  const fetchDashboard = useCallback(async () => {
    try {
      const days = range === '7' ? 7 : range === 'this_month' ? new Date().getDate() : 30;
      const [dash, dev, ana] = await Promise.all([
        api.etimeoffice.dashboard().catch(() => null),
        api.etimeoffice.deviceStatus().catch(() => null),
        api.etimeoffice.analytics(days).catch(() => null),
      ]);
      const s = dash?.stats || {};
      const devices = (dev?.devices || []).map((d: any) => ({
        id: d.machineNo, name: `Device ${d.machineNo ?? '--'}`, location: d.location, serial_no: d.serialNo,
        status: d.online ? 'Online' : 'Offline', last_connected: d.lastConnected,
      }));
      const monthly_trend = (ana?.series || []).map((x: any) => ({ date: shortLabel(x.date), present: x.present, late: x.late, absent: x.absent, on_leave: x.leave }));
      setData({
        connection_status: s.connectionStatus,
        present: s.presentToday || 0, late: s.lateToday || 0, absent: s.absentToday || 0, on_leave: s.onLeaveToday || 0,
        total_employees: s.todaysAttendanceRecords || 0,
        devices, monthly_trend,
        device_status_error: dev && dev.ok === false ? (dev.message || 'Unable to load device status.') : null,
      });
    } catch (e) { ui.toast.error(getApiErrorMessage(e, 'Could not load the attendance dashboard.')); }
  }, [range]);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);
  // Auto-refresh every 30s (matches the reference).
  useEffect(() => { const id = setInterval(fetchDashboard, 30000); return () => clearInterval(id); }, [fetchDashboard]);

  const isConnected = data?.connection_status === 'connected';

  // Re-entrancy guard: the button's `disabled` state updates asynchronously, so a
  // rapid double-click could fire syncNow twice before React re-renders. This ref
  // blocks a second call synchronously, so one action = exactly one sync request
  // (and, with toast de-duplication, one notification).
  const syncInFlight = useRef(false);
  const handleSyncNow = async () => {
    if (!canManage || !isConnected) return;
    if (syncInFlight.current) return;
    syncInFlight.current = true;
    setSyncing(true);
    try {
      const res = await api.etimeoffice.syncNow({});
      if (res?.ok) ui.toast.success('Sync complete.'); else ui.toast.error(res?.error || 'Sync failed.');
      await fetchDashboard();
    } catch (e) { ui.toast.error(getApiErrorMessage(e, 'Failed to synchronize attendance data.')); }
    finally { setSyncing(false); syncInFlight.current = false; }
  };

  const onCardClick = (status: string) => {
    setAttFilters({ date_from: todayIso(), date_to: todayIso(), search: '', status });
    setSubTabInit('attendance');
    setActiveSection('attendance');
  };

  const refreshBtn = { display: 'flex', alignItems: 'center', gap: '0.5rem', height: 40, padding: '0 1rem', backgroundColor: '#fff', color: '#4b5563', border: '1px solid #d1d5db', borderRadius: 8, cursor: syncing ? 'not-allowed' : 'pointer', fontSize: '0.875rem', fontWeight: 500, boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)' } as React.CSSProperties;
  const primaryBtn = { display: 'flex', alignItems: 'center', gap: '0.5rem', height: 40, padding: '0 1.25rem', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, cursor: (syncing || !isConnected) ? 'not-allowed' : 'pointer', fontSize: '0.875rem', fontWeight: 500, boxShadow: '0 1px 3px 0 rgba(0,0,0,0.1)' } as React.CSSProperties;

  const navCard = (id: typeof activeSection, Icon: any, title: string, sub: string) => {
    const on = activeSection === id;
    return (
      <button onClick={() => setActiveSection(id)} style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', backgroundColor: on ? '#eff6ff' : '#fff', border: `1px solid ${on ? '#bfdbfe' : '#e5e7eb'}`, borderRadius: 12, cursor: 'pointer', transition: 'all 0.2s', boxShadow: on ? '0 4px 6px -1px rgba(59,130,246,0.1)' : '0 1px 2px 0 rgba(0,0,0,0.05)' }}>
        <div style={{ backgroundColor: on ? '#3b82f6' : '#f3f4f6', color: on ? '#fff' : '#6b7280', padding: '0.5rem', borderRadius: 8, display: 'flex' }}><Icon size={20} /></div>
        <div>
          <div style={{ fontWeight: 600, color: on ? '#1d4ed8' : '#374151', fontSize: '0.9rem' }}>{title}</div>
          <div style={{ fontSize: '0.75rem', color: on ? '#60a5fa' : '#9ca3af', marginTop: '0.125rem' }}>{sub}</div>
        </div>
      </button>
    );
  };

  return (
    <div style={{ padding: 24, width: '100%', maxWidth: 1440, margin: '0 auto', boxSizing: 'border-box', overflowX: 'hidden' }}>
      {/* Hidden gradient defs referenced by the charts */}
      <svg style={{ height: 0, width: 0, position: 'absolute' }} aria-hidden>
        <defs>
          <linearGradient id="gradPresent" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#059669" /><stop offset="100%" stopColor="#0D9488" /></linearGradient>
          <linearGradient id="gradLate" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#F59E0B" /><stop offset="100%" stopColor="#D97706" /></linearGradient>
          <linearGradient id="gradAbsent" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#E11D48" /><stop offset="100%" stopColor="#DC2626" /></linearGradient>
          <linearGradient id="gradLeave" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7C3AED" /><stop offset="100%" stopColor="#4F46E5" /></linearGradient>
          <linearGradient id="gradBarPresent" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0D9488" /><stop offset="100%" stopColor="#047857" /></linearGradient>
          <linearGradient id="gradBarLate" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#F59E0B" /><stop offset="100%" stopColor="#B45309" /></linearGradient>
          <linearGradient id="gradBarAbsent" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#E11D48" /><stop offset="100%" stopColor="#B91C1C" /></linearGradient>
          <linearGradient id="gradBarLeave" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7C3AED" /><stop offset="100%" stopColor="#4338CA" /></linearGradient>
        </defs>
      </svg>
      <style>{`@keyframes etspin{100%{transform:rotate(360deg)}} .etspin{animation:etspin 1s linear infinite}`}</style>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: '1.5rem', marginBottom: '1.5rem', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
          <div style={{ backgroundColor: '#eff6ff', color: '#3b82f6', padding: '0.75rem', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><RefreshCw size={28} /></div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <h1 style={{ color: '#111827', fontSize: '1.5rem', margin: 0, fontWeight: 700 }}>Attendance Integration</h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', backgroundColor: isConnected ? '#dcfce7' : '#fee2e2', color: isConnected ? '#166534' : '#991b1b', padding: '0.25rem 0.75rem', borderRadius: 9999, fontSize: '0.75rem', fontWeight: 600, border: `1px solid ${isConnected ? '#bbf7d0' : '#fecaca'}` }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: isConnected ? '#16a34a' : '#dc2626' }} />{isConnected ? 'Connected' : 'Disconnected'}
              </div>
            </div>
            <p style={{ color: '#6b7280', fontSize: '0.875rem', marginTop: '0.375rem', margin: '0.375rem 0 0' }}>eTimeOffice → HRMS · Real-time attendance synchronization</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button onClick={fetchDashboard} disabled={syncing} style={refreshBtn}><RefreshCw size={16} className={syncing ? 'etspin' : ''} />{syncing ? 'Refreshing...' : 'Refresh'}</button>
          {canManage && <button onClick={handleSyncNow} disabled={syncing || !isConnected} style={primaryBtn}><RefreshCw size={16} className={syncing ? 'etspin' : ''} />{syncing ? 'Syncing...' : 'Sync Attendance Now'}</button>}
        </div>
      </div>

      {/* Nav cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', paddingBottom: '1rem', paddingTop: '1rem', borderBottom: '1px solid #e5e7eb', marginBottom: '1.5rem' }}>
        {navCard('overview', LayoutGrid, 'Overview', 'Dashboard')}
        {navCard('attendance', Users, 'Attendance', 'Employee records')}
        {navCard('integration', Database, 'Integration', 'API & Devices')}
      </div>

      {activeSection === 'overview' && <OverviewSection data={data} onCardClick={onCardClick} range={range} setRange={setRange} />}
      {activeSection === 'attendance' && <AttendanceSection filters={attFilters} setFilters={setAttFilters} initialTab={subTabInit} />}
      {activeSection === 'integration' && <IntegrationSection canManage={canManage} fetchDashboard={fetchDashboard} />}
    </div>
  );
};

// ── Overview ─────────────────────────────────────────────────────────────────
const OverviewSection: React.FC<any> = ({ data, onCardClick, range, setRange }) => {
  if (!data) return <div style={{ padding: '4rem', textAlign: 'center', color: '#94a3b8' }}>Loading overview…</div>;
  const present = data.present || 0, late = data.late || 0, absent = data.absent || 0, onLeave = data.on_leave || 0;
  const total = data.total_employees || 0;
  const devices = data.devices || [];
  const online = devices.filter((d: any) => d.status === 'Online');
  const offline = devices.filter((d: any) => d.status !== 'Online');
  let pieData = [
    { name: 'Present', value: present, color: 'url(#gradPresent)', shadow: '#047857', legend: '#059669' },
    { name: 'Late', value: late, color: 'url(#gradLate)', shadow: '#B45309', legend: '#D97706' },
    { name: 'Absent', value: absent, color: 'url(#gradAbsent)', shadow: '#BE123C', legend: '#DC2626' },
    { name: 'Leave', value: onLeave, color: 'url(#gradLeave)', shadow: '#5B21B6', legend: '#4F46E5' },
  ].filter((d) => d.value > 0);
  if (!pieData.length) pieData = [{ name: 'Empty', value: 1, color: '#F1F5F9', shadow: '#E2E8F0', legend: '#CBD5E1' }];

  const kpis = [
    { label: 'Present', arg: 'Present', dot: '#059669', lc: '#047857', num: '#022C22', val: present, foot: '#059669', cls: { background: 'linear-gradient(135deg,#F0FDF4,#DCFCE7)', borderColor: 'rgba(16,185,129,0.15)' } },
    { label: 'Absent', arg: 'Absent', dot: '#DC2626', lc: '#BE123C', num: '#4C0519', val: absent, foot: '#DC2626', cls: { background: 'linear-gradient(135deg,#FFF1F2,#FFE4E6)', borderColor: 'rgba(220,38,38,0.15)' } },
    { label: 'Late', arg: 'Late', dot: '#D97706', lc: '#B45309', num: '#451A03', val: late, foot: '#D97706', cls: { background: 'linear-gradient(135deg,#FFFBEB,#FEF3C7)', borderColor: 'rgba(217,119,6,0.15)' } },
    { label: 'On Leave', arg: 'Leave', dot: '#4F46E5', lc: '#4338CA', num: '#1E1B4B', val: onLeave, foot: '#4F46E5', cls: { background: 'linear-gradient(135deg,#EEF2FF,#E0E7FF)', borderColor: 'rgba(79,70,229,0.15)' } },
    { label: 'Total', arg: 'All', dot: '#64748B', lc: '#475569', num: '#0F172A', val: total, foot: '#475569', cls: { background: 'linear-gradient(135deg,#F8FAFC,#F1F5F9)', borderColor: 'rgba(100,116,139,0.15)' } },
  ];
  const chartCard: React.CSSProperties = { background: 'linear-gradient(180deg,#FFFFFF,#F8FAFC)', border: '1px solid rgba(226,232,240,0.8)', borderRadius: 20, boxShadow: '0 10px 30px -5px rgba(0,0,0,0.04)' };
  const todayStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div style={{ padding: '0.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0F172A', letterSpacing: '-0.02em', margin: 0 }}>Today's Attendance Overview</h2>
        <span style={{ fontSize: '0.875rem', color: '#64748B', backgroundColor: '#F1F5F9', padding: '0.375rem 0.875rem', borderRadius: 9999, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {todayStr}<span style={{ width: 4, height: 4, borderRadius: '50%', backgroundColor: '#CBD5E1' }} />
          <span style={{ color: '#059669', display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#059669', boxShadow: '0 0 6px #059669' }} />Live</span>
        </span>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
        {kpis.map((k) => (
          <div key={k.label} onClick={() => onCardClick(k.arg)} style={{ cursor: 'pointer', borderRadius: 18, padding: '1.5rem', display: 'flex', flexDirection: 'column', border: '1px solid transparent', ...k.cls }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: k.dot, boxShadow: `0 0 8px ${k.dot}66` }} />
              <span style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: k.lc }}>{k.label}</span>
            </div>
            <div style={{ fontSize: '2.5rem', fontWeight: 800, lineHeight: 1, marginBottom: '0.75rem', color: k.num }}><AnimatedNumber value={k.val} /></div>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem', color: k.foot }}>View details <span style={{ fontSize: '1rem' }}>›</span></div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', marginBottom: '1.5rem' }}>
        {/* Donut */}
        <div style={{ ...chartCard, flex: '1 1 340px', padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0F172A', letterSpacing: '-0.02em', margin: 0 }}>Attendance Distribution</h3>
          <p style={{ fontSize: '0.85rem', color: '#64748B', marginTop: 4, fontWeight: 500 }}>Live snapshot</p>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ position: 'relative', width: 220, height: 220, marginBottom: '1.5rem' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="54%" innerRadius={64} outerRadius={94} paddingAngle={4} dataKey="value" stroke="none" isAnimationActive animationDuration={900}>
                    {pieData.map((e, i) => <Cell key={`b${i}`} fill={e.shadow} />)}
                  </Pie>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={64} outerRadius={94} paddingAngle={4} dataKey="value" stroke="none" isAnimationActive animationDuration={900}>
                    {pieData.map((e, i) => <Cell key={`t${i}`} fill={e.color} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div style={{ position: 'absolute', inset: 0, bottom: '4%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <span style={{ fontSize: '2.75rem', fontWeight: 800, color: '#0F172A', lineHeight: 1, letterSpacing: '-0.03em' }}><AnimatedNumber value={total} /></span>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginTop: 6, letterSpacing: '0.12em' }}>Total</span>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', maxWidth: 300, width: '100%', fontSize: '0.9rem' }}>
              {[['Present', '#059669', present], ['Late', '#D97706', late], ['Absent', '#DC2626', absent], ['Leave', '#4F46E5', onLeave]].map(([n, c, v]: any) => (
                <div key={n} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.6rem 0.75rem', backgroundColor: 'rgba(241,245,249,0.5)', borderRadius: 12 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#475569', fontWeight: 600 }}><span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: c, boxShadow: `0 2px 4px ${c}66` }} />{n}</span>
                  <strong style={{ color: '#0F172A' }}>{v}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Analytics bar */}
        <div style={{ ...chartCard, flex: '2 1 500px', padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0F172A', margin: 0 }}>Attendance Analytics</h3>
              <p style={{ fontSize: '0.85rem', color: '#64748B', marginTop: 4 }}>Track attendance patterns over time</p>
            </div>
            <select value={range} onChange={(e) => setRange(e.target.value)} style={{ padding: '0.5rem 1rem', borderRadius: 12, border: '1px solid #E2E8F0', backgroundColor: '#fff', color: '#0F172A', fontWeight: 600, cursor: 'pointer' }}>
              <option value="7">Last 7 Days</option>
              <option value="30">Last 30 Days</option>
              <option value="this_month">This Month</option>
            </select>
          </div>
          {(!data.monthly_trend || data.monthly_trend.length === 0) ? (
            <div style={{ padding: '5rem 0', textAlign: 'center', color: '#64748B' }}><Clock size={40} style={{ opacity: 0.2 }} /><p style={{ fontWeight: 500 }}>Not enough attendance data to show trends.</p></div>
          ) : (
            <div style={{ height: 360, marginTop: 12 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.monthly_trend} margin={{ top: 10, right: 10, left: -20, bottom: 5 }} maxBarSize={36}>
                  <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B', fontWeight: 500 }} dy={12} minTickGap={15} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B', fontWeight: 500 }} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(241,245,249,0.6)' }} />
                  <Bar dataKey="present" stackId="a" fill="url(#gradBarPresent)" animationDuration={1000} />
                  <Bar dataKey="late" stackId="a" fill="url(#gradBarLate)" animationDuration={1000} />
                  <Bar dataKey="absent" stackId="a" fill="url(#gradBarAbsent)" animationDuration={1000} />
                  <Bar dataKey="on_leave" stackId="a" fill="url(#gradBarLeave)" animationDuration={1000} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Devices */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px,1fr))', gap: '1.5rem' }}>
        <DeviceTable title="Connected Devices" pill={`${online.length} Online`} pillBg="#d1fae5" pillColor="#059669" rows={online} error={data.device_status_error} />
        <DeviceTable title="Disconnected Devices" pill={`${offline.length} Offline`} pillBg="#fee2e2" pillColor="#b91c1c" rows={offline} error={data.device_status_error} />
      </div>
    </div>
  );
};

const DeviceTable: React.FC<any> = ({ title, pill, pillBg, pillColor, rows, error }) => (
  <div style={card}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: '1px solid #e5e7eb' }}>
      <h3 style={{ color: '#111827', margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>{title}</h3>
      <span style={{ color: pillColor, backgroundColor: pillBg, padding: '0.25rem 0.6rem', borderRadius: 9999, fontWeight: 500, fontSize: '0.875rem' }}>{pill}</span>
    </div>
    {rows.length === 0 ? (
      <div style={{ padding: '2rem', textAlign: 'center', fontSize: '0.875rem', color: error ? '#b91c1c' : '#6b7280' }}>{error ? 'Unable to load device status.' : 'No devices returned by eTimeOffice.'}</div>
    ) : (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead><tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
            {['Device', 'Location', 'Serial No.', 'Status', 'Last Connected'].map((h) => <th key={h} style={{ ...thStyle, padding: '0.75rem 0.5rem', fontSize: '0.7rem' }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {rows.map((d: any) => (
              <tr key={d.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '0.6rem 0.5rem', color: '#111827', fontSize: '0.75rem', fontWeight: 500 }}>{d.name || '--'}</td>
                <td style={{ padding: '0.6rem 0.5rem', color: '#4b5563', fontSize: '0.75rem' }}>{d.location || '--'}</td>
                <td style={{ padding: '0.6rem 0.5rem', color: '#4b5563', fontSize: '0.75rem', fontFamily: 'monospace' }}>{d.serial_no || '--'}</td>
                <td style={{ padding: '0.6rem 0.5rem' }}>
                  <span style={{ padding: '0.15rem 0.4rem', borderRadius: 9999, fontSize: '0.65rem', fontWeight: 500, backgroundColor: d.status === 'Online' ? '#d1fae5' : '#fee2e2', color: d.status === 'Online' ? '#065f46' : '#991b1b' }}>● {d.status}</span>
                </td>
                <td style={{ padding: '0.6rem 0.5rem', color: '#6b7280', fontSize: '0.7rem' }}>{d.last_connected || '--'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </div>
);

// ── Attendance ───────────────────────────────────────────────────────────────
const AttendanceSection: React.FC<any> = ({ filters, setFilters, initialTab }) => {
  const [subTab, setSubTab] = useState<'attendance' | 'punches' | 'devices'>(initialTab || 'attendance');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attRows, setAttRows] = useState<any[]>([]);
  const [attTotal, setAttTotal] = useState(0);
  const [attPages, setAttPages] = useState(1);
  const [page, setPage] = useState(1);
  const [punches, setPunches] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<any>(null);
  const [selectedPunch, setSelectedPunch] = useState<any>(null);
  const [debounced, setDebounced] = useState(filters.search);
  const pageSize = 10;

  useEffect(() => { const t = setTimeout(() => setDebounced(filters.search), 300); return () => clearTimeout(t); }, [filters.search]);
  useEffect(() => { setPage(1); }, [filters.status, filters.date_from, filters.date_to, debounced, subTab, selectedDevice]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      if (subTab === 'attendance') {
        const res = await api.etimeoffice.attendanceList({ search: debounced, status: filters.status, fromDate: filters.date_from, toDate: filters.date_to, page, pageSize });
        setAttRows(res?.rows || []); setAttTotal(res?.total || 0); setAttPages(res?.pages || 1);
      } else if (subTab === 'punches') {
        const res = await api.etimeoffice.rawPunches({ fromDate: filters.date_from, toDate: filters.date_to });
        setPunches(res?.punches || []);
      } else if (subTab === 'devices') {
        if (selectedDevice) {
          const res = await api.etimeoffice.rawPunches({ fromDate: filters.date_from, toDate: filters.date_to, machineId: selectedDevice.machineNo });
          setPunches(res?.punches || []);
        } else {
          const res = await api.etimeoffice.deviceStatus();
          setDevices(res?.devices || []);
        }
      }
    } catch (e) { setError(getApiErrorMessage(e, 'Failed to fetch data.')); }
    finally { setLoading(false); }
  }, [subTab, filters.status, filters.date_from, filters.date_to, debounced, page, selectedDevice]);
  useEffect(() => { load(); }, [load]);

  const setField = (k: string, v: string) => setFilters((f: any) => ({ ...f, [k]: v }));
  const reset = () => setFilters({ date_from: todayIso(), date_to: todayIso(), search: '', status: 'All' });

  // client-side search for punches / device details
  const punchFiltered = punches.filter((p) => { const q = filters.search.toLowerCase(); return !q || (p.name || '').toLowerCase().includes(q) || (p.empCode || '').toLowerCase().includes(q) || (p.machineId || '').toLowerCase().includes(q); });
  const punchPage = punchFiltered.slice((page - 1) * pageSize, page * pageSize);

  const subBtn = (id: typeof subTab, label: string) => (
    <button onClick={() => { setSubTab(id); if (id === 'devices') setSelectedDevice(null); }} style={{ padding: '0.75rem 1.5rem', background: 'none', border: 'none', borderBottom: `2px solid ${subTab === id ? '#3b82f6' : 'transparent'}`, color: subTab === id ? '#3b82f6' : '#6b7280', fontWeight: subTab === id ? 600 : 400, cursor: 'pointer' }}>{label}</button>
  );
  const devicesTabDisableDates = subTab === 'devices' && !selectedDevice;
  const inputStyle: React.CSSProperties = { padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: 4, width: '100%', fontSize: '0.85rem' };
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', marginBottom: '0.25rem' };

  return (
    <div>
      {/* Filter bar */}
      <div style={{ ...card, marginBottom: '1.5rem', padding: '1.25rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr)) auto', alignItems: 'end', gap: '1rem' }}>
          <div>
            <label style={labelStyle}>Search</label>
            <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #d1d5db', borderRadius: 4, padding: '0.375rem 0.75rem', backgroundColor: '#fff' }}>
              <Search size={16} color="#9ca3af" />
              <input value={filters.search} onChange={(e) => setField('search', e.target.value)} placeholder="Search employee/code/..." style={{ border: 'none', outline: 'none', marginLeft: 8, width: '100%', fontSize: '0.85rem' }} />
            </div>
          </div>
          <div><label style={labelStyle}>Status</label>
            <select value={filters.status} onChange={(e) => setField('status', e.target.value)} disabled={subTab === 'devices'} style={{ ...inputStyle, backgroundColor: subTab === 'devices' ? '#f3f4f6' : '#fff' }}>
              {['All', 'Present', 'Absent', 'Late', 'Weekly Off', 'Half Day'].map((s) => <option key={s} value={s}>{s === 'Leave' ? 'On Leave' : s}</option>)}
              <option value="Leave">On Leave</option>
            </select>
          </div>
          <div><label style={labelStyle}>Date From</label><input type="date" value={filters.date_from} disabled={devicesTabDisableDates} onChange={(e) => setField('date_from', e.target.value)} style={inputStyle} /></div>
          <div><label style={labelStyle}>Date To</label><input type="date" value={filters.date_to} disabled={devicesTabDisableDates} onChange={(e) => setField('date_to', e.target.value)} style={inputStyle} /></div>
          <button onClick={reset} style={{ padding: '0.5rem 1rem', backgroundColor: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer', height: 38 }}>Reset</button>
        </div>
      </div>

      {/* Sub-tabs */}
      <div style={card}>
        <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb' }}>{subBtn('attendance', 'Attendance')}{subBtn('punches', 'Raw Punches')}{subBtn('devices', 'Devices')}</div>

        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}><RefreshCw size={32} className="etspin" /><p>Loading data...</p></div>
        ) : error ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}><AlertTriangle size={32} color="#ef4444" /><p>{error}</p></div>
        ) : subTab === 'attendance' ? (
          attRows.length === 0 ? (
            <div style={{ padding: '4rem', textAlign: 'center', color: '#6b7280' }}><FileText size={48} style={{ opacity: 0.5 }} /><h3 style={{ color: '#111827' }}>No attendance records found.</h3><p>Try changing the date or employee filter.</p></div>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr style={{ backgroundColor: '#f9fafb' }}>{['EMPLOYEE', 'EMP CODE', 'DATE', 'FIRST IN', 'LAST OUT', 'WORK HRS', 'LATE', 'EARLY OUT', 'STATUS', 'LOCATION'].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
                  <tbody>
                    {attRows.map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #e5e7eb' }}>
                        <td style={{ padding: '0.6rem 0.5rem', color: '#111827', fontSize: '0.8rem', fontWeight: 500 }}>{r.employee}</td>
                        <td style={{ padding: '0.6rem 0.5rem', color: '#6b7280', fontSize: '0.8rem' }}>{r.empCode}</td>
                        <td style={{ padding: '0.6rem 0.5rem', color: '#374151', fontSize: '0.8rem' }}>{r.date}</td>
                        <td style={{ padding: '0.6rem 0.5rem', color: '#374151', fontSize: '0.8rem' }}>{r.firstIn}</td>
                        <td style={{ padding: '0.6rem 0.5rem', color: '#374151', fontSize: '0.8rem' }}>{r.lastOut}</td>
                        <td style={{ padding: '0.6rem 0.5rem', color: '#374151', fontSize: '0.8rem' }}>{r.workHrs}</td>
                        <td style={{ padding: '0.6rem 0.5rem', fontSize: '0.8rem', color: r.late !== '—' ? '#d97706' : '#9ca3af', fontWeight: r.late !== '—' ? 500 : 400 }}>{r.late}</td>
                        <td style={{ padding: '0.6rem 0.5rem', fontSize: '0.8rem', color: r.earlyOut !== '—' ? '#d97706' : '#9ca3af', fontWeight: r.earlyOut !== '—' ? 500 : 400 }}>{r.earlyOut}</td>
                        <td style={{ padding: '0.6rem 0.5rem' }}>{statusBadge(r.status)}</td>
                        <td style={{ padding: '0.6rem 0.5rem', color: '#6b7280', fontSize: '0.8rem' }}>{r.location}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <StandardPagination currentPage={page} totalPages={attPages} totalRecords={attTotal} itemsPerPage={pageSize} setCurrentPage={setPage} />
            </>
          )
        ) : subTab === 'punches' ? (
          <PunchTable rows={punchPage} total={punchFiltered.length} page={page} pageSize={pageSize} setPage={setPage} onView={setSelectedPunch} />
        ) : (
          selectedDevice ? (
            <DeviceDetails device={selectedDevice} back={() => setSelectedDevice(null)} rows={punchPage} total={punchFiltered.length} page={page} pageSize={pageSize} setPage={setPage} onView={setSelectedPunch} />
          ) : (
            <div style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ fontSize: '1rem', color: '#111827', margin: 0 }}>Devices</h3>
                <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>{devices.length} Devices</span>
              </div>
              {devices.length === 0 ? <div style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}>No devices found.</div> : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))', gap: '0.75rem' }}>
                  {devices.map((d) => (
                    <div key={d.machineNo} onClick={() => { setSelectedDevice(d); setPage(1); }} style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, padding: '0.75rem 1rem', cursor: 'pointer', boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: d.online ? '#22c55e' : '#ef4444' }} /><span style={{ fontWeight: 600, color: '#111827', fontSize: '0.875rem' }}>Device {d.machineNo}</span></div>
                      <div style={{ color: '#4b5563', fontSize: '0.8rem' }}>{d.location || '--'}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#6b7280', fontSize: '0.7rem', fontFamily: 'monospace' }}>{d.serialNo || '--'}</span><span style={{ color: d.online ? '#15803d' : '#b91c1c', fontSize: '0.7rem', fontWeight: 500 }}>{d.online ? 'Online' : 'Offline'}</span></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        )}
      </div>

      {selectedPunch && <PunchModal punch={selectedPunch} onClose={() => setSelectedPunch(null)} />}
    </div>
  );
};

const punchThs = ['EMPLOYEE', 'EMP CODE', 'PUNCH DATE', 'PUNCH TIME', 'DEVICE / LOCATION', 'COMPANY / DEPT', 'SYNC STATUS', 'ACTIONS'];
const syncBadge = (s: string) => { const synced = s === 'Synced'; return <span style={{ backgroundColor: synced ? '#d1fae5' : '#fef3c7', color: synced ? '#065f46' : '#b45309', padding: '0.25rem 0.5rem', borderRadius: 9999, fontSize: '0.7rem', fontWeight: 600 }}>{s}</span>; };

const PunchRows: React.FC<any> = ({ rows, onView }) => (
  <tbody>
    {rows.map((p: any, i: number) => (
      <tr key={i} style={{ borderBottom: '1px solid #e5e7eb' }}>
        <td style={{ padding: '0.6rem 0.5rem', color: '#111827', fontSize: '0.8rem', fontWeight: 500 }}>{p.name || '—'}</td>
        <td style={{ padding: '0.6rem 0.5rem', color: '#6b7280', fontSize: '0.8rem' }}>{p.empCode || '—'}</td>
        <td style={{ padding: '0.6rem 0.5rem', color: '#374151', fontSize: '0.8rem' }}>{p.punchDate || '—'}</td>
        <td style={{ padding: '0.6rem 0.5rem', color: '#111827', fontSize: '0.8rem' }}>{p.punchTime || '—'}</td>
        <td style={{ padding: '0.6rem 0.5rem', fontSize: '0.8rem' }}><div style={{ color: '#374151' }}>Device {p.machineId || '—'}</div><div style={{ color: '#9ca3af', fontSize: '0.75rem' }}>{p.deviceLocation || '--'}</div></td>
        <td style={{ padding: '0.6rem 0.5rem', fontSize: '0.8rem' }}><div style={{ color: '#374151' }}>--</div><div style={{ color: '#9ca3af', fontSize: '0.75rem' }}>{p.department || '--'}</div></td>
        <td style={{ padding: '0.6rem 0.5rem' }}>{syncBadge(p.syncStatus)}</td>
        <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right' }}><button onClick={() => onView(p)} style={{ color: '#3b82f6', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem' }}>View details</button></td>
      </tr>
    ))}
  </tbody>
);

const PunchTable: React.FC<any> = ({ rows, total, page, pageSize, setPage, onView }) => (
  total === 0 ? (
    <div style={{ padding: '4rem', textAlign: 'center', color: '#6b7280' }}><Clock size={48} style={{ opacity: 0.5 }} /><h3 style={{ color: '#111827' }}>No punch data found.</h3><p>Try changing the date or search filter.</p></div>
  ) : (
    <>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ backgroundColor: '#f9fafb' }}>{punchThs.map((h) => <th key={h} style={{ ...thStyle, textAlign: h === 'ACTIONS' ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
          <PunchRows rows={rows} onView={onView} />
        </table>
      </div>
      <StandardPagination currentPage={page} totalPages={Math.max(1, Math.ceil(total / pageSize))} totalRecords={total} itemsPerPage={pageSize} setCurrentPage={setPage} />
    </>
  )
);

const DeviceDetails: React.FC<any> = ({ device, back, rows, total, page, pageSize, setPage, onView }) => (
  <div>
    <div style={{ padding: '1rem 1.25rem 0.5rem' }}>
      <button onClick={back} style={{ color: '#3b82f6', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer' }}>← All Devices</button>
      <h3 style={{ fontSize: '1.125rem', color: '#111827', margin: '0.5rem 0 0' }}>Device {device.machineNo} · {device.location || '--'}</h3>
      <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
        Serial: {device.serialNo || '--'} · <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: device.online ? '#22c55e' : '#ef4444' }} /><span style={{ color: device.online ? '#15803d' : '#b91c1c', fontWeight: 500 }}>{device.online ? 'Online' : 'Offline'}</span>
      </div>
      <h4 style={{ fontSize: '1rem', color: '#374151', fontWeight: 500, margin: '0.75rem 0 0' }}>Punches from this device <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>{total} punches</span></h4>
    </div>
    {total === 0 ? <div style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}>No punch data found for this device and date.</div> : (
      <>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ backgroundColor: '#f9fafb' }}>{punchThs.map((h) => <th key={h} style={{ ...thStyle, textAlign: h === 'ACTIONS' ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
            <PunchRows rows={rows} onView={onView} />
          </table>
        </div>
        <StandardPagination currentPage={page} totalPages={Math.max(1, Math.ceil(total / pageSize))} totalRecords={total} itemsPerPage={pageSize} setCurrentPage={setPage} />
      </>
    )}
  </div>
);

const PunchModal: React.FC<any> = ({ punch, onClose }) => (
  <div onClick={onClose} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
    <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: '#fff', borderRadius: 8, maxWidth: 500, width: '100%', padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e5e7eb', paddingBottom: 12, marginBottom: 12 }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>Raw Punch Details</h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}><XCircle size={24} /></button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        {[['Employee Name', punch.name], ['Employee Code', punch.empCode], ['Punch Date', punch.punchDate], ['Punch Time', punch.punchTime], ['Device', `Device ${punch.machineId || '--'}`], ['Location', punch.deviceLocation || '--']].map(([l, v]: any) => (
          <div key={l}><div style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{l}</div><div style={{ fontWeight: 500 }}>{v || '—'}</div></div>
        ))}
        <div><div style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase' }}>Status</div><div>{syncBadge(punch.syncStatus)}</div></div>
      </div>
      <div style={{ backgroundColor: '#f9fafb', padding: '1rem', borderRadius: 4, border: '1px solid #e5e7eb', marginTop: 16 }}>
        <div style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', marginBottom: 6 }}>Raw API Payload (Safe Fields)</div>
        <pre style={{ margin: 0, fontSize: '0.75rem', color: '#374151', whiteSpace: 'pre-wrap' }}>{JSON.stringify({ Empcode: punch.empCode, Name: punch.name, PunchDate: punch.punchDate, mcid: punch.machineId, M_Flag: punch.direction }, null, 2)}</pre>
      </div>
    </div>
  </div>
);

// ── Integration ──────────────────────────────────────────────────────────────
const IntegrationSection: React.FC<any> = ({ canManage, fetchDashboard }) => {
  const [config, setConfig] = useState<any>({ apiBaseUrl: 'https://api.etimeoffice.com/api/', corporateId: '', apiUsername: '', apiPassword: '', deviceSerialNumber: '', empCode: 'ALL', enabled: true, syncIntervalMinutes: 30 });
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [pwSet, setPwSet] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const fetchConfig = useCallback(async () => {
    try { const c = await api.etimeoffice.getConnection(); setConfig((prev: any) => ({ ...prev, apiBaseUrl: c.apiBaseUrl || prev.apiBaseUrl, corporateId: c.corporateId || '', apiUsername: c.apiUsername || '', apiPassword: c.apiPasswordSet ? '••••••••' : '', deviceSerialNumber: c.deviceSerialNumber || '', empCode: c.empCode || 'ALL', enabled: c.enabled !== false, syncIntervalMinutes: Number(c.syncIntervalMinutes) || 30 })); setPwSet(!!c.apiPasswordSet); setLastSyncAt(c.lastSyncAt || null); } catch (_) { /* ignore */ }
  }, []);
  const fetchLogs = useCallback(async () => { setLogsLoading(true); try { const l = await api.etimeoffice.syncLogs(); setLogs(Array.isArray(l) ? l : []); } catch (_) { setLogs([]); } finally { setLogsLoading(false); } }, []);
  useEffect(() => { fetchConfig(); fetchLogs(); }, [fetchConfig, fetchLogs]);

  const handleTest = async () => {
    setTesting(true);
    try { const res = await api.etimeoffice.testConnection({}); setTestResult({ success: !!res?.ok, message: res?.message || res?.error || (res?.ok ? 'Connected.' : 'Connection failed.') }); await fetchDashboard(); }
    catch (e) { setTestResult({ success: false, message: getApiErrorMessage(e, 'Connection failed.') }); }
    finally { setTesting(false); }
  };
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault(); if (!canManage) return; setSaving(true);
    try { const payload: any = { ...config }; if (!payload.apiPassword || payload.apiPassword === '••••••••') delete payload.apiPassword; await api.etimeoffice.saveConnection(payload); ui.toast.success('Configuration saved successfully.'); await fetchConfig(); await fetchDashboard(); }
    catch (err) { ui.toast.error(getApiErrorMessage(err, 'Failed to save configuration.')); }
    finally { setSaving(false); }
  };
  const set = (k: string, v: string) => setConfig((c: any) => ({ ...c, [k]: v }));
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: '0.875rem', color: '#374151', marginBottom: '0.25rem', fontWeight: 500 };
  const inputStyle: React.CSSProperties = { padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: 4, width: '100%', fontSize: '0.9rem', boxSizing: 'border-box' };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem' }}>
      {/* Config */}
      <div style={card}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e5e7eb' }}><h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600, color: '#111827' }}>Connection Configuration</h3></div>
        <form onSubmit={handleSave} style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div><label style={labelStyle}>Vendor</label><input value="eTimeOffice" disabled style={{ ...inputStyle, backgroundColor: '#f3f4f6', color: '#6b7280' }} /></div>
          <div><label style={labelStyle}>API Base URL</label><input value={config.apiBaseUrl} disabled={!canManage} onChange={(e) => set('apiBaseUrl', e.target.value)} style={inputStyle} /></div>
          <div><label style={labelStyle}>Corporate ID</label><input value={config.corporateId} disabled={!canManage} onChange={(e) => set('corporateId', e.target.value)} style={inputStyle} /></div>
          <div><label style={labelStyle}>API Username</label><input value={config.apiUsername} disabled={!canManage} onChange={(e) => set('apiUsername', e.target.value)} style={inputStyle} /></div>
          <div><label style={labelStyle}>API Password{pwSet ? ' (saved — leave to keep)' : ''}</label><input type="password" value={config.apiPassword} disabled={!canManage} onChange={(e) => set('apiPassword', e.target.value)} style={inputStyle} /></div>
          <div><label style={labelStyle}>Device ID</label><input value={config.deviceSerialNumber} disabled={!canManage} onChange={(e) => set('deviceSerialNumber', e.target.value)} style={inputStyle} /></div>

          {/* Automatic Sync — when ON, the scheduler pulls the machine's punches on its
              own every N minutes and updates each matched employee's attendance. No
              manual "Sync Now" needed. */}
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: '0.875rem', background: '#f9fafb' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#111827', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <RefreshCw size={15} color={config.enabled ? '#059669' : '#9ca3af'} /> Automatic Sync
                </div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 2 }}>Punches import on their own — no manual sync needed.</div>
              </div>
              <button type="button" role="switch" aria-checked={!!config.enabled} disabled={!canManage}
                onClick={() => set('enabled', !config.enabled as any)}
                style={{ position: 'relative', width: 44, height: 24, borderRadius: 999, border: 'none', cursor: canManage ? 'pointer' : 'default', background: config.enabled ? '#059669' : '#d1d5db', transition: 'background .15s', flexShrink: 0 }}>
                <span style={{ position: 'absolute', top: 2, left: config.enabled ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left .15s', boxShadow: '0 1px 2px rgba(0,0,0,0.2)' }} />
              </button>
            </div>
            {config.enabled && (
              <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <label style={{ ...labelStyle, marginBottom: 0, whiteSpace: 'nowrap' }}>Sync every</label>
                <select value={config.syncIntervalMinutes} disabled={!canManage} onChange={(e) => set('syncIntervalMinutes', Number(e.target.value) as any)} style={{ ...inputStyle, width: 'auto', flex: 1 }}>
                  {[5, 10, 15, 30, 60].map((m) => <option key={m} value={m}>{m} minutes</option>)}
                </select>
              </div>
            )}
            <div style={{ fontSize: '0.75rem', color: config.enabled ? '#047857' : '#9ca3af', marginTop: '0.6rem', display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: config.enabled ? '#10b981' : '#9ca3af', display: 'inline-block' }} />
              {config.enabled ? `On — auto-syncing every ${config.syncIntervalMinutes} min` : 'Off — attendance only updates when you click Sync Now'}
              {lastSyncAt ? ` · last synced ${new Date(lastSyncAt).toLocaleString('en-GB')}` : ''}
            </div>
          </div>

          {testResult && <div style={{ padding: '0.75rem', borderRadius: 4, fontSize: '0.875rem', marginTop: 4, backgroundColor: testResult.success ? '#d1fae5' : '#fee2e2', color: testResult.success ? '#065f46' : '#991b1b', border: `1px solid ${testResult.success ? '#34d399' : '#f87171'}` }}>{testResult.message}</div>}
          {canManage && (
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', borderTop: '1px solid #e5e7eb', paddingTop: '1rem' }}>
              <button type="button" onClick={handleTest} disabled={testing} style={{ padding: '0.5rem 1rem', backgroundColor: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer' }}>{testing ? 'Testing...' : 'Test Connection'}</button>
              <button type="submit" disabled={saving} style={{ flex: 1, padding: '0.5rem 1rem', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 500 }}>{saving ? 'Saving...' : 'Save Configuration'}</button>
            </div>
          )}
        </form>
      </div>

      {/* Sync history */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: '1px solid #e5e7eb' }}>
          <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600, color: '#111827' }}>Recent Sync History</h3>
          <button onClick={fetchLogs} style={{ color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500 }}>Refresh</button>
        </div>
        {logsLoading ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}><RefreshCw size={24} className="etspin" color="#6b7280" /></div>
        ) : logs.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}><FileText size={32} style={{ opacity: 0.5 }} /><p>No synchronization history available.</p></div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ backgroundColor: '#f9fafb' }}>{['DATE & TIME', 'STATUS', 'FETCHED', 'IMPORTED', 'ERRORS'].map((h) => <th key={h} style={{ ...thStyle, fontSize: '0.8rem', padding: '0.5rem 0.75rem' }}>{h}</th>)}</tr></thead>
              <tbody>
                {logs.slice(0, 10).map((l: any) => {
                  const ok = l.status === 'SUCCESS';
                  const dt = l.startedAt ? new Date(l.startedAt) : null;
                  return (
                    <tr key={l.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '0.5rem 0.75rem' }}><div style={{ fontWeight: 500, color: '#111827', fontSize: '0.85rem' }}>{dt ? dt.toLocaleDateString('en-GB') : '—'}</div><div style={{ color: '#6b7280', fontSize: '0.75rem' }}>{dt ? dt.toLocaleTimeString('en-GB') : ''}</div></td>
                      <td style={{ padding: '0.5rem 0.75rem' }}><span style={{ backgroundColor: ok ? '#d1fae5' : (l.status === 'PARTIAL' ? '#fef3c7' : '#fee2e2'), color: ok ? '#065f46' : (l.status === 'PARTIAL' ? '#b45309' : '#991b1b'), padding: '0.25rem 0.5rem', borderRadius: 9999, fontSize: '0.75rem', fontWeight: 600 }}>{ok ? 'Success' : (l.status === 'PARTIAL' ? 'Partial' : 'Failed')}</span></td>
                      <td style={{ padding: '0.5rem 0.75rem', color: '#374151', fontSize: '0.85rem' }}>{l.fetched || 0}</td>
                      <td style={{ padding: '0.5rem 0.75rem', color: '#10b981', fontWeight: 500, fontSize: '0.85rem' }}>{(l.imported || 0) + (l.updated || 0)}</td>
                      <td style={{ padding: '0.5rem 0.75rem', color: '#6b7280', fontSize: '0.75rem', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.errorMessage || ''}>{l.errorMessage || (l.failed ? `${l.failed} failed` : '—')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AttendanceApiIntegration;
