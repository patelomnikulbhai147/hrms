import React from 'react';

// ── Deterministic QR / barcode renderers ───────────────────────────────────
// No external QR/barcode dependency is required. These derive a stable visual
// pattern from the employee code so each card is unique and reproducible, and
// they render as plain <div>s so html2canvas captures them reliably (unlike
// inline SVG, which the canvas renderer handles inconsistently).

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const QrPattern: React.FC<{ value: string; size?: number; color?: string }> = ({ value, size = 64, color = '#0f172a' }) => {
  const cells = 21; // QR-like grid
  const seed = hashString(value || 'EMP');
  const px = size / cells;
  const isOn = (r: number, c: number) => {
    // Fixed finder squares in three corners for an authentic QR look.
    const inFinder = (R: number, C: number) =>
      (R < 7 && C < 7) || (R < 7 && C >= cells - 7) || (R >= cells - 7 && C < 7);
    if (inFinder(r, c)) {
      const lr = r < 7 ? r : r - (cells - 7);
      const lc = c < 7 ? (c < cells - 7 ? c : c - (cells - 7)) : c - (cells - 7);
      const onRing = lr === 0 || lr === 6 || lc === 0 || lc === 6;
      const onCore = lr >= 2 && lr <= 4 && lc >= 2 && lc <= 4;
      return onRing || onCore;
    }
    return ((seed >> ((r * cells + c) % 31)) ^ (r * 7 + c * 13)) % 3 === 0;
  };
  const dots: React.ReactNode[] = [];
  for (let r = 0; r < cells; r++) for (let c = 0; c < cells; c++) {
    if (isOn(r, c)) dots.push(
      <div key={`${r}-${c}`} style={{ position: 'absolute', top: r * px, left: c * px, width: Math.ceil(px), height: Math.ceil(px), background: color }} />
    );
  }
  return <div style={{ position: 'relative', width: size, height: size, background: '#fff' }}>{dots}</div>;
};

const Barcode: React.FC<{ value: string; width?: number; height?: number }> = ({ value, width = 200, height = 44 }) => {
  const seed = hashString(value || 'EMP');
  const bars: React.ReactNode[] = [];
  const count = 48;
  for (let i = 0; i < count; i++) {
    const on = ((seed >> (i % 31)) ^ (i * 17)) % 2 === 0;
    const w = (((seed >> (i % 13)) + i) % 3) + 1;
    bars.push(<div key={i} style={{ width: w, height, background: on ? '#0f172a' : 'transparent' }} />);
  }
  return (
    <div style={{ width }}>
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 1, height, justifyContent: 'center' }}>{bars}</div>
      <div style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: 2, textAlign: 'center', marginTop: 4, color: '#334155' }}>{value}</div>
    </div>
  );
};

// ── Shared helpers ──────────────────────────────────────────────────────────
const initials = (name?: string) =>
  (name || 'E').split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase();

const fmtINR = (n: any) => {
  const v = Number(n) || 0;
  return `₹${v.toLocaleString('en-IN')}`;
};

const brandOf = (company: any) => ({
  name: company?.name || 'Enterprise',
  color: company?.primaryColor || '#4F46E5',
  logo: company?.logoImage || company?.logo || '',
  tagline: company?.tagline || company?.headerText || '',
});

const Photo: React.FC<{ employee: any; size: number; color: string }> = ({ employee, size, color }) => {
  const src = employee?.photoUpload || (typeof employee?.avatar === 'string' && employee.avatar.startsWith('data:') ? employee.avatar : '');
  if (src) return <img src={src} alt="" crossOrigin="anonymous" style={{ width: size, height: size, objectFit: 'cover', borderRadius: 10, border: `2px solid ${color}` }} />;
  return (
    <div style={{ width: size, height: size, borderRadius: 10, border: `2px solid ${color}`, background: '#eef2ff', color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: size / 3 }}>
      {initials(employee?.name)}
    </div>
  );
};

const Logo: React.FC<{ b: ReturnType<typeof brandOf>; size?: number }> = ({ b, size = 26 }) => (
  b.logo
    ? <img src={b.logo} alt="" crossOrigin="anonymous" style={{ width: size, height: size, objectFit: 'contain', borderRadius: 6, background: '#fff' }} />
    : <div style={{ width: size, height: size, borderRadius: 6, background: 'rgba(255,255,255,0.2)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: size / 2.4 }}>{initials(b.name)}</div>
);

// ── Employee ID Card (front + back) ─────────────────────────────────────────
export const EmployeeIdCard: React.FC<{ employee: any; company: any }> = ({ employee, company }) => {
  const b = brandOf(company);
  const cardStyle: React.CSSProperties = {
    width: 230, height: 366, borderRadius: 16, overflow: 'hidden',
    background: '#fff', boxShadow: '0 8px 24px rgba(15,23,42,0.12)', fontFamily: 'Inter, system-ui, sans-serif',
    border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column',
  };
  const label: React.CSSProperties = { fontSize: 8, textTransform: 'uppercase', letterSpacing: 1, color: '#94a3b8', fontWeight: 700 };
  const value: React.CSSProperties = { fontSize: 11, color: '#1e293b', fontWeight: 600, marginBottom: 6 };

  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
      {/* FRONT */}
      <div style={cardStyle}>
        <div style={{ background: b.color, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Logo b={b} />
          <div style={{ minWidth: 0 }}>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: 12, lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.name}</div>
            <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 8 }}>{b.tagline || 'Employee Identity Card'}</div>
          </div>
        </div>
        <div style={{ padding: '16px 14px', display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
          <Photo employee={employee} size={96} color={b.color} />
          <div style={{ fontWeight: 800, fontSize: 15, color: '#0f172a', marginTop: 10, textAlign: 'center' }}>{employee?.name}</div>
          <div style={{ fontSize: 11, color: b.color, fontWeight: 700 }}>{employee?.designation}</div>
          <div style={{ marginTop: 4, fontSize: 10, color: '#64748b' }}>{employee?.department}</div>
          <div style={{ marginTop: 10, background: '#f1f5f9', borderRadius: 8, padding: '4px 10px', fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#0f172a' }}>
            {employee?.employeeId}
          </div>
          <div style={{ marginTop: 'auto', paddingTop: 12 }}><QrPattern value={String(employee?.employeeId || '')} size={62} color={b.color} /></div>
        </div>
      </div>

      {/* BACK */}
      <div style={cardStyle}>
        <div style={{ background: b.color, height: 28 }} />
        <div style={{ padding: '16px 16px', flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ ...label, color: b.color, marginBottom: 10 }}>Card Holder Details</div>
          <div style={label}>Emergency Contact</div>
          <div style={value}>{employee?.emergencyContact || '—'}</div>
          <div style={label}>Blood Group</div>
          <div style={value}>{employee?.bloodGroup || '—'}</div>
          <div style={label}>Address</div>
          <div style={{ ...value, lineHeight: 1.35 }}>{employee?.presentAddress || employee?.permanentAddress || employee?.location || '—'}</div>
          <div style={label}>Date of Joining</div>
          <div style={value}>{employee?.joinDate ? new Date(employee.joinDate).toLocaleDateString('en-IN') : '—'}</div>
          <div style={{ marginTop: 'auto', borderTop: '1px dashed #cbd5e1', paddingTop: 8, fontSize: 7.5, color: '#94a3b8', textAlign: 'center', lineHeight: 1.4 }}>
            If found, please return to {b.name}. This card remains property of the company.
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Employee Information Card ───────────────────────────────────────────────
export const EmployeeInfoCard: React.FC<{ employee: any; company: any }> = ({ employee, company }) => {
  const b = brandOf(company);
  const annualCtc = Number(employee?.salary) || 0;
  const Row = ({ k, v }: { k: string; v: any }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
      <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>{k}</span>
      <span style={{ fontSize: 10, color: '#0f172a', fontWeight: 700, textAlign: 'right' }}>{v ?? '—'}</span>
    </div>
  );
  const Stat = ({ k, v, color }: { k: string; v: string; color: string }) => (
    <div style={{ flex: 1, background: '#f8fafc', borderRadius: 8, padding: '8px 6px', textAlign: 'center' }}>
      <div style={{ fontSize: 14, fontWeight: 800, color }}>{v}</div>
      <div style={{ fontSize: 8, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>{k}</div>
    </div>
  );

  return (
    <div style={{ width: 480, borderRadius: 16, overflow: 'hidden', background: '#fff', boxShadow: '0 8px 24px rgba(15,23,42,0.12)', fontFamily: 'Inter, system-ui, sans-serif', border: '1px solid #e2e8f0' }}>
      <div style={{ background: b.color, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Logo b={b} size={34} />
        <div style={{ flex: 1 }}>
          <div style={{ color: '#fff', fontWeight: 800, fontSize: 15 }}>{b.name}</div>
          <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 9 }}>Employee Information Card</div>
        </div>
      </div>
      <div style={{ padding: 18 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 14 }}>
          <Photo employee={employee} size={72} color={b.color} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 18, color: '#0f172a' }}>{employee?.name}</div>
            <div style={{ fontSize: 12, color: b.color, fontWeight: 700 }}>{employee?.designation}</div>
            <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#64748b', marginTop: 2 }}>{employee?.employeeId}</div>
          </div>
          <span style={{ fontSize: 9, fontWeight: 800, padding: '4px 10px', borderRadius: 999, background: (employee?.status === 'Active' ? '#dcfce7' : '#fee2e2'), color: (employee?.status === 'Active' ? '#15803d' : '#b91c1c') }}>
            {employee?.status || '—'}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <Stat k="Annual CTC" v={fmtINR(annualCtc)} color={b.color} />
          <Stat k="Monthly" v={fmtINR(Math.round(annualCtc / 12))} color="#0f172a" />
          <Stat k="Category" v={employee?.category || '—'} color="#0f172a" />
        </div>

        <div style={{ display: 'flex', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <Row k="Department" v={employee?.department} />
            <Row k="Reporting Manager" v={employee?.manager} />
            <Row k="Employee Category" v={employee?.employmentType} />
            <Row k="Date of Joining" v={employee?.joinDate ? new Date(employee.joinDate).toLocaleDateString('en-IN') : '—'} />
          </div>
          <div style={{ flex: 1 }}>
            <Row k="Email" v={employee?.email} />
            <Row k="Contact" v={employee?.phone} />
            <Row k="Branch" v={employee?.branchLocation || employee?.location} />
            <Row k="Status" v={employee?.status} />
          </div>
        </div>

        <div style={{ marginTop: 16, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ fontSize: 8, color: '#94a3b8', lineHeight: 1.4, maxWidth: 200 }}>
            Attendance &amp; leave summaries are sourced from the active payroll cycle in the live release.
          </div>
          <Barcode value={String(employee?.employeeId || '')} width={200} height={40} />
        </div>
      </div>
    </div>
  );
};
