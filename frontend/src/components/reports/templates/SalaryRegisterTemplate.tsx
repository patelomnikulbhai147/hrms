import React from 'react';
import { type TemplateProps } from './types';
import { inr } from '../reportExport';

// ── SALARY REGISTER ──────────────────────────────────────────────────────────
// Landscape statutory register: company header → titled period → bordered table
// (Earnings | Deductions grouped) → grand-total row → authorised-signatory footer.
// Driven entirely by the live `salary_register` generator (sr/code/name/dept/
// period/basic/allowances/bonus/deductions/tax/net).
const cell: React.CSSProperties = { border: '1px solid #333', padding: '4px 6px', fontSize: 11 };
const th: React.CSSProperties = { ...cell, background: '#eef2ff', fontWeight: 700, textAlign: 'center' };
const num: React.CSSProperties = { ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

export const SalaryRegisterTemplate: React.FC<TemplateProps> = ({ data }) => {
  const m = data.meta;
  const rows = data.rows || [];
  const period = data.filters?.period || (rows[0]?.month ? `${rows[0].month} ${rows[0].year || ''}`.trim() : (rows[0]?.period || '—'));
  const sum = (k: string) => rows.reduce((t, r) => t + (Number(r[k]) || 0), 0);

  return (
    <div style={{ width: 1040, margin: '0 auto', background: '#fff', color: '#111', fontFamily: 'Arial, Helvetica, sans-serif', padding: 18 }}>
      {/* Company header */}
      <div style={{ textAlign: 'center', borderBottom: '2px solid #333', paddingBottom: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: 0.3 }}>{m?.name || 'Company'}</div>
        {m?.branchName && <div style={{ fontSize: 13, fontWeight: 700, color: '#222', marginTop: 1 }}>{m.branchName}</div>}
        {m?.address && <div style={{ fontSize: 11, color: '#333', marginTop: 2 }}>{m.address}</div>}
        <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>
          {m?.panNumber && <span>PAN: {m.panNumber}&nbsp;&nbsp;</span>}
          {m?.gstNumber && <span>GSTIN: {m.gstNumber}</span>}
        </div>
      </div>

      <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 13, margin: '6px 0 10px', textTransform: 'uppercase' }}>
        Salary Register &nbsp;—&nbsp; {period}
      </div>

      <table data-recalc-scope="salary_register" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...th, width: 34 }}>Sr</th>
            <th style={{ ...th, width: 80 }}>Emp ID</th>
            <th style={{ ...th, textAlign: 'left' }}>Employee Name</th>
            <th style={{ ...th, width: 120 }}>Department</th>
            <th style={{ ...th, width: 90 }}>Period</th>
            <th style={th}>Basic</th>
            <th style={th}>Allowances</th>
            <th style={th}>Bonus</th>
            <th style={th}>Deductions</th>
            <th style={th}>Tax</th>
            <th style={th}>Net Pay</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td style={{ ...cell, textAlign: 'center' }}>{r.sr ?? i + 1}</td>
              <td style={{ ...cell, fontFamily: 'monospace' }}>{r.code || '—'}</td>
              <td style={cell}>{r.name}</td>
              <td style={cell}>{r.department || '—'}</td>
              <td style={{ ...cell, textAlign: 'center' }}>{r.month ? `${r.month} ${r.year || ''}`.trim() : (r.period || period)}</td>
              <td style={num} data-cell="basic">{inr(r.basic)}</td>
              <td style={num} data-cell="allowances">{inr(r.allowances)}</td>
              <td style={num} data-cell="bonus">{inr(r.bonus)}</td>
              <td style={num} data-cell="deductions">{inr(r.deductions)}</td>
              <td style={num} data-cell="tax">{inr(r.tax)}</td>
              <td style={{ ...num, fontWeight: 700 }} data-cell="net">{inr(r.net)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td style={{ ...cell, textAlign: 'center', padding: 16 }} colSpan={11}>No salary records for the selected period.</td></tr>
          )}
          {rows.length > 0 && (
            <tr>
              <td style={{ ...th, textAlign: 'right' }} colSpan={5}>GRAND TOTAL ({rows.length} employees)</td>
              <td style={{ ...num, ...th }} data-total="basic">{inr(sum('basic'))}</td>
              <td style={{ ...num, ...th }} data-total="allowances">{inr(sum('allowances'))}</td>
              <td style={{ ...num, ...th }} data-total="bonus">{inr(sum('bonus'))}</td>
              <td style={{ ...num, ...th }} data-total="deductions">{inr(sum('deductions'))}</td>
              <td style={{ ...num, ...th }} data-total="tax">{inr(sum('tax'))}</td>
              <td style={{ ...num, ...th }} data-total="net">{inr(sum('net'))}</td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 28, fontSize: 11 }}>
        <div style={{ color: '#555' }}>Generated on {new Date(data.generatedAt).toLocaleString('en-IN')}{data.generatedBy ? ` · by ${data.generatedBy}` : ''}</div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ height: 40 }} />
          <div style={{ borderTop: '1px solid #333', paddingTop: 4, minWidth: 200 }}>For {m?.name || 'Company'}<br /><span style={{ fontSize: 10, color: '#555' }}>Authorised Signatory</span></div>
        </div>
      </div>
    </div>
  );
};

export default SalaryRegisterTemplate;
