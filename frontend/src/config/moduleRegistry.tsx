import React from 'react';
import {
  LayoutDashboard, Users as UsersIcon, CalendarDays, DollarSign,
  FileText, BarChart3, Settings, Building2, CreditCard, ShieldCheck, CalendarCheck,
  ClipboardList, Briefcase, History, IdCard, FileSignature, MessageSquare, PlugZap, ReceiptText, HandCoins, Landmark, RefreshCcw, Wand2, Wallet, HardDrive,
  Laptop, UserCheck, PieChart, GitMerge, Blocks, Target, BookOpen, Book, Sparkles, Globe, Shield
} from 'lucide-react';
import type { Role } from '@/data/mockData';
import type { AppModules } from '@/pages/Login';

// ─────────────────────────────────────────────────────────────────────────────
// SINGLE SOURCE OF TRUTH for every module/page in the application.
//
// This registry drives BOTH:
//   1. The sidebar navigation (components/layout/Sidebar.tsx), and
//   2. The permission matrices (Company Head → Settings ▸ User Roles &
//      Permissions, and Super Admin → User Management ▸ Permissions).
//
// Because both consume this one list, a module can never exist in the app but be
// missing from the permission matrix — and any NEW module added here appears in
// the sidebar AND both matrices automatically, with no further code changes.
// ─────────────────────────────────────────────────────────────────────────────

export type PageId =
  | 'select-workspace' | 'dashboard' | 'companies' | 'employee-cards' | 'employees' | 'leaves' | 'payroll' | 'bonus' | 'attendance'
  | 'attendance-integration' | 'attendance-sync' | 'documents' | 'reports' | 'settings' | 'billing' | 'verification-credits' | 'users' | 'tasks' | 'tenders' | 'contracts' | 'audit'
  | 'company-profile' | 'communication' | 'invoice-management' | 'finance-compliance' | 'loan-management' | 'compliance-management'
  | 'notifications' | 'custom-report-builder' | 'company-edit' | 'subscription-manage'
  | 'subscription-invoice'
  | 'plans' | 'custom-domain' | 'employee-slot-history' | 'verification-wallet' | 'payroll-wallet'  | 'template-management'
  | 'document-vault'
  | 'vendor-management'
  | 'asset-management'
  | 'visitor-management'
  | 'facility-booking'
  | 'ess-dashboard'
  | 'performance-management'
  | 'lms'
  | 'knowledge-base'
  | 'internal-communication'
  | 'ai-assistant'
  | 'recruitment-crm'
  | 'workflow-engine'
  | 'integration-hub'
  | 'saas-admin-dashboard'
  | 'security-center';

export interface ModuleRegistryEntry {
  /** Unique page/nav id (also the React key). */
  id: PageId;
  /** Human-readable label shown in the sidebar and matrix. */
  label: string;
  /** Sidebar icon. */
  icon: React.ReactNode;
  /** Roles that can see this module in the sidebar. */
  roles: Role[];
  /**
   * Permission key that GOVERNS this module (used for RBAC checks + matrix
   * storage). Sub-features intentionally point at their parent module's key so
   * they stay gated exactly as the app already enforces them everywhere
   * (Sidebar + App.tsx route guards): e.g. Employee Cards rides on `employees`,
   * Attendance Devices rides on `attendance`.
   */
  permission: AppModules;
  /** Whether this module appears as a row in the permission matrices. */
  inMatrix: boolean;
  /**
   * When true, the module is a platform (Super Admin) concern and appears ONLY
   * in the Super Admin permission matrix — never in the Company Head matrix.
   */
  platformOnly?: boolean;
  /**
   * When true, the module is NOT rendered as its own sidebar item. Used for
   * modules that have been folded into a parent sidebar item but must remain a
   * permission-matrix row so their access is still governed independently
   * (e.g. Loans & Compliance now live under the "Finance & Compliance" item).
   */
  hideInSidebar?: boolean;
  /**
   * Optional set of permission keys — the module is visible in the sidebar if the
   * user can VIEW ANY of them (OR-logic). Used by parent items that aggregate
   * several sub-modules (Finance & Compliance aggregates `loans` + `compliance`).
   * Falls back to the single `permission` key when omitted.
   */
  anyPermission?: AppModules[];
  /**
   * When true, the module is still under active development. The sidebar shows a
   * small "🚧 Beta" status badge beside the label, and the module renders the
   * in-page <DevelopmentBanner /> "Work in Progress" notice. Keep this flag in
   * sync with that banner: set it while a module is in progress, and REMOVE it
   * (and the banner) the moment the module is production-ready — the badge then
   * disappears automatically everywhere it is derived from this registry.
   */
  beta?: boolean;
}

// The canonical, ordered list. Order here === sidebar order === matrix order.
export const MODULE_REGISTRY: ModuleRegistryEntry[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={15} />, roles: ['Super Admin', 'Company Head', 'HR', 'Finance'], permission: 'dashboard', inMatrix: true },
  { id: 'companies', label: 'Companies', icon: <Building2 size={15} />, roles: ['Super Admin'], permission: 'companies', inMatrix: true, platformOnly: true },
  { id: 'billing', label: 'Subscription Management', icon: <CreditCard size={15} />, roles: ['Super Admin'], permission: 'billing', inMatrix: true, platformOnly: true },
  { id: 'verification-credits', label: 'Bank Verification Credits', icon: <ShieldCheck size={15} />, roles: ['Super Admin'], permission: 'billing', inMatrix: false, platformOnly: true },
  { id: 'employees', label: 'Employees', icon: <UsersIcon size={15} />, roles: ['Company Head', 'HR', 'Finance'], permission: 'employees', inMatrix: true },
  // Employee Cards is a sub-feature of Employees — it is governed by the
  // `employees` permission everywhere in the app, so it shares that key here.
  { id: 'employee-cards', label: 'Employee Cards', icon: <IdCard size={15} />, roles: ['Company Head', 'HR'], permission: 'employees', inMatrix: true, beta: true },
  { id: 'attendance', label: 'Attendance', icon: <CalendarCheck size={15} />, roles: ['Company Head', 'HR', 'Finance', 'Employee'], permission: 'attendance', inMatrix: true },
  // Attendance Devices is a sub-feature of Attendance — governed by the
  // `attendance` permission, so it shares that key here.
  // Attendance API Integration (E-TimeOffice pull sync) — the single source of
  // truth for attendance device/vendor integration. Rides on the `attendance`
  // permission (no separate matrix row — inMatrix:false — so it doesn't duplicate
  // the Attendance permission row); hidden from the Super-Admin root menu.
  { id: 'attendance-integration', label: 'Attendance API Integration', icon: <PlugZap size={15} />, roles: ['Super Admin', 'Company Head', 'HR'], permission: 'attendance', inMatrix: false, beta: true },
  { id: 'leaves', label: 'Leave Management', icon: <CalendarDays size={15} />, roles: ['Company Head', 'HR'], permission: 'leaves', inMatrix: true },
  { id: 'payroll', label: 'Payroll', icon: <DollarSign size={15} />, roles: ['Company Head', 'HR', 'Finance', 'Employee'], permission: 'payroll', inMatrix: true },
  // Attendance Synchronization — NOT an independent module: it is one step of the
  // Payroll process. It is reachable ONLY from Payroll → Payroll Workflow → "Sync
  // Attendance", so it is hidden from the sidebar (hideInSidebar) while remaining a
  // valid routable page. Governed by the `payroll` permission (no matrix row —
  // inMatrix:false) so access stays gated exactly like Payroll everywhere.
  { id: 'attendance-sync', label: 'Attendance Synchronization', icon: <RefreshCcw size={15} />, roles: ['Company Head', 'HR', 'Finance'], permission: 'payroll', inMatrix: false, hideInSidebar: true },
  { id: 'invoice-management', label: 'Invoice Management', icon: <ReceiptText size={15} />, roles: ['Company Head', 'Finance', 'HR'], permission: 'invoicing', inMatrix: true, beta: true },
  // Finance & Compliance — the single sidebar entry that unifies Employee Loans
  // and Statutory Compliance. Visible when the user can VIEW EITHER underlying
  // module (anyPermission OR-logic). It is NOT itself a matrix row (inMatrix:
  // false) — access stays governed by the individual `loans` / `compliance`
  // rows below, which remain in both permission matrices (hideInSidebar keeps
  // them out of the nav so there is only one menu item).
  { id: 'finance-compliance', label: 'Finance & Compliance', icon: <Landmark size={15} />, roles: ['Company Head', 'HR', 'Finance'], permission: 'loans', anyPermission: ['loans', 'compliance'], inMatrix: false, beta: true },
  { id: 'loan-management', label: 'Employee Loan Management', icon: <HandCoins size={15} />, roles: ['Company Head', 'HR', 'Finance'], permission: 'loans', inMatrix: true, hideInSidebar: true },
  { id: 'compliance-management', label: 'Compliance Management', icon: <ShieldCheck size={15} />, roles: ['Company Head', 'HR', 'Finance'], permission: 'compliance', inMatrix: true, hideInSidebar: true },
  // Label only — the id, route and `documents` permission are unchanged, so the
  // permission matrix, saved links and API calls are unaffected. "Employee
  // Documents" distinguishes it from Finance & Compliance ▸ Documents, which is
  // a separate statutory-document repository.
  { id: 'documents', label: 'Employee Documents', icon: <FileText size={15} />, roles: ['Company Head', 'HR', 'Finance'], permission: 'documents', inMatrix: true },
  { id: 'vendor-management', label: 'Vendor Management', icon: <Building2 size={15} />, roles: ['Company Head', 'HR'], permission: 'vendors', inMatrix: true },
  { id: 'asset-management', label: 'Asset Management', icon: <Laptop size={15} />, roles: ['Company Head', 'HR'], permission: 'assets', inMatrix: true },
  { id: 'visitor-management', label: 'Visitor Management', icon: <UserCheck size={15} />, roles: ['Company Head', 'HR'], permission: 'visitors', inMatrix: true },
  { id: 'facility-booking', label: 'Facility Booking', icon: <CalendarDays size={15} />, roles: ['Company Head', 'HR', 'Employee'], permission: 'facilities', inMatrix: true },
  { id: 'reports', label: 'Reports', icon: <BarChart3 size={15} />, roles: ['Company Head', 'HR'], permission: 'reports', inMatrix: true },
  // Custom Report Builder — drag & drop report designer. Shares the `reports`
  // permission (no separate matrix row — inMatrix:false), like Employee Cards
  // shares `employees`. Company Head / HR / Finance who can see Reports get it.
  { id: 'saas-admin-dashboard', label: 'SaaS Admin', icon: <Globe size={15} />, roles: ['Super Admin'], permission: 'dashboard', inMatrix: false },
  { id: 'security-center', label: 'Security Center', icon: <Shield size={15} />, roles: ['Super Admin', 'Company Head'], permission: 'settings', inMatrix: true },
  { id: 'custom-report-builder', label: 'Custom Report Builder', icon: <Wand2 size={15} />, roles: ['Company Head', 'HR', 'Finance'], permission: 'reports', inMatrix: false, beta: true },
  { id: 'ess-dashboard', label: 'Employee Self-Service', icon: <UserCheck size={15} />, roles: ['Company Head', 'HR', 'Employee'], permission: 'dashboard', inMatrix: true, beta: true },
  { id: 'recruitment-crm', label: 'Recruitment CRM', icon: <Briefcase size={15} />, roles: ['Company Head', 'HR'], permission: 'recruitment', inMatrix: true, beta: true },
  { id: 'workflow-engine', label: 'Workflow Automation', icon: <GitMerge size={15} />, roles: ['Company Head', 'HR'], permission: 'settings', inMatrix: true, beta: true },
  { id: 'integration-hub', label: 'Integration Hub', icon: <Blocks size={15} />, roles: ['Company Head'], permission: 'settings', inMatrix: true, beta: true },
  { id: 'performance-management', label: 'Performance Management', icon: <Target size={15} />, roles: ['Company Head', 'HR', 'Employee'], permission: 'performance', inMatrix: true, beta: true },
  { id: 'lms', label: 'Learning Management', icon: <BookOpen size={15} />, roles: ['Company Head', 'HR', 'Employee'], permission: 'lms', inMatrix: true, beta: true },
  { id: 'knowledge-base', label: 'Knowledge Base', icon: <Book size={15} />, roles: ['Company Head', 'HR', 'Employee'], permission: 'knowledge', inMatrix: true },
  { id: 'internal-communication', label: 'Internal Communication', icon: <MessageSquare size={15} />, roles: ['Company Head', 'HR', 'Employee'], permission: 'social', inMatrix: true },
  { id: 'ai-assistant', label: 'AI Assistant', icon: <Sparkles size={15} />, roles: ['Company Head', 'HR', 'Employee'], permission: 'dashboard', inMatrix: true },
  { id: 'template-management', label: 'Template Management', icon: <FileText size={15} />, roles: ['Super Admin', 'Company Head'], permission: 'templates', inMatrix: true, beta: true },
  { id: 'document-vault', label: 'Document Vault', icon: <HardDrive size={15} />, roles: ['Company Head', 'HR'], permission: 'vault', inMatrix: true, beta: true },
  { id: 'communication', label: 'Communication Center', icon: <MessageSquare size={15} />, roles: ['Company Head', 'HR'], permission: 'communication', inMatrix: true, beta: true },
  { id: 'tasks', label: 'Task Manager', icon: <ClipboardList size={15} />, roles: ['Super Admin', 'Company Head', 'HR', 'Finance', 'Employee'], permission: 'tasks', inMatrix: true },
  { id: 'tenders', label: 'Tender Management', icon: <Briefcase size={15} />, roles: ['Company Head'], permission: 'tenders', inMatrix: true },
  { id: 'contracts', label: 'Contract Management', icon: <FileSignature size={15} />, roles: ['Company Head'], permission: 'contracts', inMatrix: true },
  { id: 'company-profile', label: 'Company Profile', icon: <Building2 size={15} />, roles: ['Company Head'], permission: 'company-profile', inMatrix: true },
  // Premium page riding the `settings` permission (same pattern as the Custom
  // Report Builder on `reports`); the plan lock is by PAGE ID 'custom-domain'.
  { id: 'custom-domain', label: '🧪 Custom Domain (Beta)', icon: <PlugZap size={15} />, roles: ['Company Head'], permission: 'settings', inMatrix: false, beta: true },
  // Company-facing Verification Credits page (quota, analytics, verification +
  // recharge history). Distinct from the platform-only 'verification-credits'
  // Super-Admin portal above. Rides the dashboard permission (no matrix row);
  // the page + backend both refuse the Employee role themselves.
  { id: 'verification-wallet', label: 'Verification Credits', icon: <ShieldCheck size={15} />, roles: ['Company Head', 'HR', 'Finance'], permission: 'dashboard', inMatrix: false },
  { id: 'payroll-wallet', label: 'Payroll Wallet', icon: <Wallet size={15} />, roles: ['Company Head', 'HR', 'Finance'], permission: 'payroll', inMatrix: false },
  { id: 'settings', label: 'Settings', icon: <Settings size={15} />, roles: ['Company Head', 'HR', 'Finance', 'Employee'], permission: 'settings', inMatrix: true },
  { id: 'users', label: 'User Management', icon: <ShieldCheck size={15} />, roles: ['Super Admin'], permission: 'users', inMatrix: true },
  { id: 'audit', label: 'Audit Trail', icon: <History size={15} />, roles: ['Super Admin'], permission: 'audit', inMatrix: true, platformOnly: true },
];

/** A permission-matrix row: a unique rowId + the permission key it edits + label. */
export interface MatrixModule {
  /** Unique row id (React key) — from the registry `id`. */
  rowId: PageId;
  /** Permission key this row reads/writes (from the registry `permission`). */
  key: AppModules;
  /** Display label. */
  label: string;
}

const toMatrixModule = (e: ModuleRegistryEntry): MatrixModule => ({ rowId: e.id, key: e.permission, label: e.label });

/**
 * Modules shown in the COMPANY-level permission matrix (Company Head → Settings ▸
 * User Roles & Permissions). Every matrix module except platform-only ones.
 */
export const getCompanyMatrixModules = (): MatrixModule[] =>
  MODULE_REGISTRY.filter(e => e.inMatrix && !e.platformOnly).map(toMatrixModule);

/**
 * Modules shown in the SUPER ADMIN permission matrix (User Management ▸
 * Permissions) — every matrix module, including platform-only ones.
 */
export const getPlatformMatrixModules = (): MatrixModule[] =>
  MODULE_REGISTRY.filter(e => e.inMatrix).map(toMatrixModule);
