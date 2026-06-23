import React from 'react';
import { type TemplateProps } from './types';
import { inr } from '../reportExport';

// ── SALARY SLIP (PAY SLIP) ───────────────────────────────────────────────────
// Faithful reproduction of the uploaded bordered pay-slip grid, one slip per
// employee (2 per row, like the source). Earnings (Basic/Allowances/Bonus) and
// the net are REAL stored payroll values; the PF / ESIC / Prof. Tax split is
// reconstructed from the company's statutory rates (meta.rates) applied to basic,
// with the remainder shown as "Other" so the lines always reconcile to the real
// stored `deductions` total (no payroll logic is changed — display only).
const bd = '1px solid #222';
const td: React.CSSProperties = { border: bd, padding: '2px 5px', fontSize: 10.5, lineHeight: 1.3 };
const lbl: React.CSSProperties = { ...td, fontWeight: 600 };
const numC: React.CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

const Slip: React.FC<{ r: any; m: any }> = ({ r, m }) => {
  const rates = m?.rates || { pfRate: 12, esicRate: 3.25, profTaxRate: 200 };
  const basic = Number(r.basic) || 0;
  const totalDeduction = Number(r.deductions) || 0;
  // Reconstruct statutory components from real rates; "Other" balances to the
  // stored total so the slip always foots exactly to the real net pay.
  const pf = Math.min(totalDeduction, Math.round((basic * rates.pfRate) / 100));
  const esic = Math.min(Math.max(0, totalDeduction - pf), Math.round((basic * rates.esicRate) / 100));
  const pt = Math.min(Math.max(0, totalDeduction - pf - esic), Number(rates.profTaxRate) || 0);
  const other = Math.max(0, totalDeduction - pf - esic - pt);
  const totalEarnings = (Number(r.basic) || 0) + (Number(r.allowances) || 0) + (Number(r.bonus) || 0);

  return (
    <div style={{ border: bd, width: '100%', fontFamily: 'Arial, Helvetica, sans-serif', color: '#111' }}>
      <div style={{ textAlign: 'center', fontWeight: 800, fontSize: 12, paddingTop: 3, textDecoration: 'underline' }}>{m?.name || 'Company'}</div>
      {m?.branchName && <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 10 }}>{m.branchName}</div>}
      {m?.address && <div style={{ textAlign: 'center', fontSize: 8.5, padding: '0 6px 3px' }}>{m.address}</div>}
      <table style={{ width: '100%', borderCollapse: 'collapse', borderTop: bd }}>
        <tbody>
          <tr>
            <td style={{ ...lbl, width: '22%' }}>PAY SLIP</td>
            <td style={{ ...td, fontWeight: 700 }} colSpan={3}>{r.period || `${r.month || ''} ${r.year || ''}`}</td>
          </tr>
          <tr>
            <td style={lbl}>Employee Name</td>
            <td style={{ ...td, textAlign: 'center', fontWeight: 700 }} colSpan={2}>{r.name}</td>
            <td style={td}><b>Sr.</b> {r.sr}</td>
          </tr>
          <tr>
            <td style={lbl}>UAN No.</td><td style={td}>{r.uan || '—'}</td>
            <td style={lbl}>PF No.</td><td style={td}>{r.pfNumber || '—'}</td>
          </tr>
          <tr>
            <td style={lbl}>ESIC No.</td><td style={td}>{r.esiNumber || '—'}</td>
            <td style={lbl}>EMP ID</td><td style={td}>{r.code || '—'}</td>
          </tr>
          <tr>
            <td style={lbl}>Designation</td><td style={td}>{r.designation || '—'}</td>
            <td style={lbl}>Work Place</td><td style={td}>{r.workPlace || '—'}</td>
          </tr>
        </tbody>
      </table>

      {/* Earnings / Deductions grid */}
      <table style={{ width: '100%', borderCollapse: 'collapse', borderTop: bd }}>
        <thead>
          <tr style={{ background: '#f1f5f9' }}>
            <th style={{ ...lbl, textAlign: 'center' }}>Day</th>
            <th style={{ ...lbl, textAlign: 'center' }}>Allowance</th>
            <th style={{ ...lbl, textAlign: 'center' }}>Amount</th>
            <th style={{ ...lbl, textAlign: 'center' }}>Deduction</th>
            <th style={{ ...lbl, textAlign: 'center' }}>Net Pay</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={td}>Present Day &nbsp;<b>{r.presentDays ?? 0}</b></td>
            <td style={td}>Basic</td><td style={numC}>{inr(r.basic)}</td>
            <td style={td}>PF</td>
            <td style={{ ...numC, fontWeight: 800, verticalAlign: 'middle' }} rowSpan={6}>{inr(r.net)}</td>
          </tr>
          <tr>
            <td style={td}>CL Taken &nbsp;<b>{r.clDays ?? 0}</b></td>
            <td style={td}>Allowances</td><td style={numC}>{inr(r.allowances)}</td>
            <td style={td}>{inr(pf)}</td>
          </tr>
          <tr>
            <td style={td}>SL Taken &nbsp;<b>{r.slDays ?? 0}</b></td>
            <td style={td}>Bonus</td><td style={numC}>{inr(r.bonus)}</td>
            <td style={td}>ESIC &nbsp; {inr(esic)}</td>
          </tr>
          <tr>
            <td style={td}>PL Taken &nbsp;<b>{r.plDays ?? 0}</b></td>
            <td style={td}>O. Allowance</td><td style={numC}>—</td>
            <td style={td}>Prof. Tax &nbsp; {inr(pt)}</td>
          </tr>
          <tr>
            <td style={td}>LWP &nbsp;<b>{r.lwpDays ?? 0}</b></td>
            <td style={td}>OT Hrs</td><td style={numC}>{r.otHours ?? 0}</td>
            <td style={td}>Other &nbsp; {inr(other)}</td>
          </tr>
          <tr>
            <td style={{ ...lbl }}>Total Day &nbsp;<b>{r.payableDays ?? 0}</b></td>
            <td style={lbl}>Total Earnings</td><td style={{ ...numC, fontWeight: 700 }}>{inr(totalEarnings)}</td>
            <td style={lbl}>Total Ded. &nbsp; <b>{inr(totalDeduction)}</b></td>
          </tr>
        </tbody>
      </table>
      <div style={{ fontSize: 8.5, padding: '2px 5px', borderTop: bd, textAlign: 'center' }}>
        Payment Transferred to Employee A/C No. {r.accountNumber || '—'} via "NEFT".
      </div>
    </div>
  );
};

export const SalarySlipTemplate: React.FC<TemplateProps> = ({ data }) => {
  const m = data.meta;
  const rows = data.rows || [];
  return (
    <div style={{ width: 1040, margin: '0 auto', background: '#fff', padding: 14 }}>
      {rows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 24, fontFamily: 'Arial', fontSize: 12 }}>No payslips for the selected period.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {rows.map((r, i) => <Slip key={i} r={r} m={m} />)}
        </div>
      )}
    </div>
  );
};

export default SalarySlipTemplate;
