// Shape returned by POST /compliance-reports/generate (see complianceReportController.generate).
// Sourced entirely from the Company Master (single source of truth) by companyMeta().
export interface ReportMeta {
  name: string;
  /** Branch name — present only when the report scope is branch-specific (shown as a second header line). */
  branchName?: string | null;
  // Identity
  legalName?: string | null;
  displayName?: string | null;
  tradeName?: string | null;
  shortName?: string | null;
  companyCode?: string | null;
  tagline?: string | null;
  motto?: string | null;
  description?: string | null;
  // Contact
  address: string;
  registeredAddress?: string | null;
  corporateAddress?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  pincode?: string | null;
  phone?: string | null;
  landline?: string | null;
  email?: string | null;
  website?: string | null;
  // Statutory / registration
  gstNumber?: string | null;
  panNumber?: string | null;
  cinNumber?: string | null;
  tanNumber?: string | null;
  registrationNumber?: string | null;
  pfCode?: string | null;
  esiCode?: string | null;
  ptaxRegistrationNumber?: string | null;
  msmeNumber?: string | null;
  shopEstablishmentNumber?: string | null;
  labourLicenseNumber?: string | null;
  factoryLicenseNumber?: string | null;
  iecCode?: string | null;
  isoCertNumber?: string | null;
  fssaiNumber?: string | null;
  // Management
  founderName?: string | null;
  coFounderName?: string | null;
  ceoName?: string | null;
  managingDirector?: string | null;
  directors?: string | null;
  hrHeadName?: string | null;
  financeHeadName?: string | null;
  authorizedSignatory?: string | null;
  signatoryDesignation?: string | null;
  signatureText?: string | null;
  // Banking
  bankName?: string | null;
  bankBranch?: string | null;
  bankAccountNumber?: string | null;
  ifscCode?: string | null;
  swiftCode?: string | null;
  accountHolderName?: string | null;
  upiId?: string | null;
  // Payroll & statutory cycle
  salaryCycle?: string | null;
  payrollStartDate?: string | null;
  financialYearStart?: string | null;
  leaveYearStart?: string | null;
  defaultCurrency?: string | null;
  defaultTimeZone?: string | null;
  // Branding / assets
  logoImage?: string | null;
  primaryColor?: string | null;
  stampImage?: string | null;
  digitalSignatureImage?: string | null;
  letterheadImage?: string | null;
  headerText?: string | null;
  footerText?: string | null;
  emailSignature?: string | null;
  watermarkText?: string | null;
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
  lang?: string;
}
