import { type React } from 'react';
import { Form16Template } from './templates/Form16Template';
import { SalaryRegisterTemplate } from './templates/SalaryRegisterTemplate';
import { SalarySlipTemplate } from './templates/SalarySlipTemplate';
import { type Orientation } from './reportExport';
import { type TemplateProps } from './templates/types';

export interface TemplateDef {
  /** Backend report key (POST /compliance-reports/generate). */
  reportKey: string;
  /** Catalog display name(s) this template backs — matched in ReportCenter. */
  catalogNames: string[];
  component: React.FC<TemplateProps>;
  orientation: Orientation;
  description: string;
  /** Filename stem for PDF/Excel exports. */
  fileStem: string;
}

// ── LIVE TEMPLATES ───────────────────────────────────────────────────────────
// ONLY reports whose exact source layout was provided are listed here. Every
// other catalog report stays visible but disabled ("Coming Soon") until its
// template document is supplied (MISSING DOCUMENT RULE).
export const TEMPLATES: TemplateDef[] = [
  {
    reportKey: 'form16',
    catalogNames: ['IT Return Form 16', 'Form 16', 'Form16'],
    component: Form16Template,
    orientation: 'portrait',
    description: 'Annual TDS certificate (Part A + Part B) per employee — government Form No. 16 format.',
    fileStem: 'Form16',
  },
  {
    reportKey: 'salary_register',
    catalogNames: ['Salary Register'],
    component: SalaryRegisterTemplate,
    orientation: 'landscape',
    description: 'Month-wise earnings, deductions and net pay for all employees with grand totals.',
    fileStem: 'Salary_Register',
  },
  {
    reportKey: 'salary_slip',
    catalogNames: ['Salary Slip'],
    component: SalarySlipTemplate,
    orientation: 'portrait',
    description: 'Printable per-employee pay slip in the bordered statutory grid format.',
    fileStem: 'Salary_Slip',
  },
];

const byName = new Map<string, TemplateDef>();
TEMPLATES.forEach(t => t.catalogNames.forEach(n => byName.set(n.toLowerCase(), t)));

/** Find a live template by the catalog report name (case-insensitive). */
export const templateForName = (name: string): TemplateDef | undefined => byName.get(name.trim().toLowerCase());
export const templateForKey = (key: string): TemplateDef | undefined => TEMPLATES.find(t => t.reportKey === key);
