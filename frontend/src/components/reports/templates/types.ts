// Shape returned by POST /compliance-reports/generate (see complianceReportController.generate).
export interface ReportMeta {
  name: string;
  /** Branch name — present only when the report scope is branch-specific (shown as a second header line). */
  branchName?: string | null;
  address: string;
  gstNumber?: string | null;
  panNumber?: string | null;
  cinNumber?: string | null;
  signatureText?: string | null;
  rates?: { pfRate: number; esicRate: number; profTaxRate: number };
}

export interface ReportData {
  reportKey: string;
  reportName: string;
  category: string;
  generatedAt: string;
  generatedBy?: string | null;
  meta: ReportMeta | null;
  columns: { key: string; label: string }[];
  rows: any[];
  summary?: any;
  warnings?: string[];
  /** Echo of the filters used (year/period) for header display. */
  filters?: { year?: number; period?: string };
}

export interface TemplateProps {
  data: ReportData;
}
