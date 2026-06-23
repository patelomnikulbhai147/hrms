import React from 'react';
import { type TemplateProps } from './types';
import { inr } from '../reportExport';

// ── FORM NO. 16 (Part A + Part B) ────────────────────────────────────────────
// One government-format certificate per employee, reproducing the uploaded
// VISHV ENTERPRISE sample: title block, employer/employee grid, PAN/TAN/CIT/AY/
// Period grid, quarterly TDS summary, Part-B salary & tax computation, and the
// verification + authorised-signatory footer. Real numbers (gross, deductions,
// taxable, TDS, names, PAN, employer details) populate the available fields;
// statutory sub-line-items that the HRMS does not store show "---", exactly as
// they appear in the source document.
const b = '1px solid #000';
const c: React.CSSProperties = { border: b, padding: '3px 6px', fontSize: 10.5, verticalAlign: 'top' };
const right: React.CSSProperties = { ...c, textAlign: 'right', whiteSpace: 'nowrap' };
const head: React.CSSProperties = { ...c, fontWeight: 700, textAlign: 'center', background: '#f3f4f6' };

const Certificate: React.FC<{ r: any; m: any; year?: number; isLast: boolean }> = ({ r, m, year, isLast }) => {
  const Y = year || new Date().getFullYear();
  const ay = `${Y}-${String((Y + 1) % 100).padStart(2, '0')}`;
  const from = `01/04/${Y}`; const to = `31/03/${Y + 1}`;

  return (
    <div style={{ width: 880, margin: '0 auto', background: '#fff', color: '#000', fontFamily: 'Arial, Helvetica, sans-serif', pageBreakAfter: isLast ? 'auto' : 'always', marginBottom: isLast ? 0 : 26 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', border: b }}>
        <tbody>
          {/* Title */}
          <tr>
            <td style={{ ...c, width: '70%', textAlign: 'center', fontWeight: 700 }}>
              Certificate under section 203 of the Income-tax Act, 1961 for<br />Tax deducted at source on Salary
            </td>
            <td style={{ ...c, textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>FORM NO. 16</div>
              <div style={{ fontSize: 9 }}>[See rule 31(1)(a)]</div>
            </td>
          </tr>
          {/* Employer / Employee */}
          <tr>
            <td style={c}>
              <div style={{ fontWeight: 700, textDecoration: 'underline' }}>Name &amp; Address of the Employer</div>
              <div style={{ fontWeight: 700, marginTop: 2 }}>{m?.name || '—'}</div>
              {m?.branchName && <div style={{ fontWeight: 700 }}>{m.branchName}</div>}
              <div>{m?.address || ''}</div>
            </td>
            <td style={c}>
              <div style={{ fontWeight: 700, textDecoration: 'underline' }}>Name &amp; Designation of the Employee</div>
              <div style={{ fontWeight: 700, marginTop: 2 }}>{r.name}</div>
              <div>{[r.designation, r.department].filter(Boolean).join(', ') || '—'}</div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* PAN / TAN / CIT / AY / Period grid */}
      <table style={{ width: '100%', borderCollapse: 'collapse', border: b, borderTop: 'none' }}>
        <tbody>
          <tr>
            <td style={head}>PAN of Deductor</td><td style={head}>TAN of Deductor</td><td style={head}>PAN of Employee</td>
          </tr>
          <tr>
            <td style={{ ...c, textAlign: 'center' }}>{m?.panNumber || '---'}</td>
            <td style={{ ...c, textAlign: 'center' }}>---</td>
            <td style={{ ...c, textAlign: 'center' }}>{r.pan || '---'}</td>
          </tr>
          <tr>
            <td style={head}>CIT (TDS)</td><td style={head}>Assessment Year</td><td style={head}>Period</td>
          </tr>
          <tr>
            <td style={{ ...c, textAlign: 'center' }}>—</td>
            <td style={{ ...c, textAlign: 'center' }}>{ay}</td>
            <td style={{ ...c, textAlign: 'center' }}>From {from} &nbsp; To {to}</td>
          </tr>
        </tbody>
      </table>

      {/* Quarterly TDS summary */}
      <table style={{ width: '100%', borderCollapse: 'collapse', border: b, borderTop: 'none' }}>
        <tbody>
          <tr><td style={head} colSpan={3}>Summary of tax deducted at source in respect of deductee</td></tr>
          <tr>
            <td style={head}>Quarter</td>
            <td style={head}>Amount of tax deducted</td>
            <td style={head}>Amount of tax deposited / remitted</td>
          </tr>
          {['Quarter 1', 'Quarter 2', 'Quarter 3', 'Quarter 4'].map(q => (
            <tr key={q}><td style={c}>{q}</td><td style={{ ...c, textAlign: 'center' }}>---</td><td style={{ ...c, textAlign: 'center' }}>---</td></tr>
          ))}
          <tr style={{ fontWeight: 700 }}>
            <td style={c}>Total</td>
            <td style={right}>{inr(r.tds)}</td>
            <td style={right}>{inr(r.tds)}</td>
          </tr>
        </tbody>
      </table>

      {/* PART-B */}
      <table style={{ width: '100%', borderCollapse: 'collapse', border: b, borderTop: 'none' }}>
        <tbody>
          <tr><td style={{ ...head }} colSpan={2}>PART-B — DETAILS OF SALARY PAID AND TAX DEDUCTED</td></tr>
          {[
            ['1. Gross Salary — Salary as per provisions u/s 17(1)', inr(r.grossSalary)],
            ['   (b) Value of perquisites u/s 17(2)', '---'],
            ['   (c) Profits in lieu of salary u/s 17(3)', '---'],
            ['   (d) TOTAL', inr(r.grossSalary)],
            ['2. Less: Allowance exempt u/s 10', '---'],
            ['3. Balance (1 - 2)', inr(r.grossSalary)],
            ['4. Deductions u/s 16 (Entertainment / Tax on Employment)', '---'],
            ['6. Income chargeable under the head “Salaries”', inr(r.grossSalary)],
            ['8. Gross Total Income', inr(r.grossSalary)],
            ['10. Aggregate deductible amount under Chapter VI-A', inr(r.deductions)],
            ['11. TOTAL INCOME (8 - 10)', inr(r.taxable)],
            ['14. Tax Payable', inr(r.tds)],
            ['17. Tax deducted at source (TDS)', inr(r.tds)],
          ].map(([label, val], i) => (
            <tr key={i} style={(label as string).startsWith('   ') ? {} : { fontWeight: 600 }}>
              <td style={c}>{label}</td>
              <td style={{ ...right, width: 150 }}>{val === '---' ? '---' : `Rs. ${val}`}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Verification */}
      <table style={{ width: '100%', borderCollapse: 'collapse', border: b, borderTop: 'none' }}>
        <tbody>
          <tr><td style={{ ...head }}>V E R I F I C A T I O N</td></tr>
          <tr><td style={{ ...c, fontSize: 9.5 }}>
            I, on behalf of <b>{m?.name || 'the employer'}</b>, certify that a sum of Rs. {inr(r.tds)}/- has been deducted and deposited
            to the credit of the Central Government. I further certify that the information given above is true, complete and
            correct and is based on the books of account, documents, TDS statements and other available records.
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 22 }}>
              <span>Place / Date: ____________________</span>
              <span style={{ textAlign: 'right' }}>For {m?.name || 'Company'}<br />{m?.signatureText || '(Authorised Signatory)'}</span>
            </div>
          </td></tr>
        </tbody>
      </table>
    </div>
  );
};

export const Form16Template: React.FC<TemplateProps> = ({ data }) => {
  const rows = data.rows || [];
  return (
    <div style={{ background: '#fff', padding: 14 }}>
      {rows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 24, fontFamily: 'Arial', fontSize: 12 }}>No Form 16 data for the selected year.</div>
      ) : (
        rows.map((r, i) => <Certificate key={i} r={r} m={data.meta} year={data.filters?.year} isLast={i === rows.length - 1} />)
      )}
    </div>
  );
};

export default Form16Template;
