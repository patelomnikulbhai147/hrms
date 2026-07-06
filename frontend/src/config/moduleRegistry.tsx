import React from 'react';
import {
  LayoutDashboard, Users as UsersIcon, CalendarDays, DollarSign,
  FileText, BarChart3, Settings, Building2, CreditCard, ShieldCheck, CalendarCheck,
  ClipboardList, Briefcase, History, IdCard, FileSignature, MessageSquare, PlugZap, ReceiptText, HandCoins
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
  | 'attendance-integration' | 'documents' | 'reports' | 'settings' | 'billing' | 'users' | 'tasks' | 'tenders' | 'contracts' | 'audit'
  | 'company-profile' | 'communication' | 'invoice-management' | 'loan-management';

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
}

// The canonical, ordered list. Order here === sidebar order === matrix order.
export const MODULE_REGISTRY: ModuleRegistryEntry[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={15} />, roles: ['Super Admin', 'Company Head', 'HR', 'Finance'], permission: 'dashboard', inMatrix: true },
  { id: 'companies', label: 'Companies', icon: <Building2 size={15} />, roles: ['Super Admin'], permission: 'companies', inMatrix: true, platformOnly: true },
  { id: 'billing', label: 'SaaS Subscriptions', icon: <CreditCard size={15} />, roles: ['Super Admin'], permission: 'billing', inMatrix: true, platformOnly: true },
  { id: 'employees', label: 'Employees', icon: <UsersIcon size={15} />, roles: ['Company Head', 'HR', 'Finance'], permission: 'employees', inMatrix: true },
  // Employee Cards is a sub-feature of Employees — it is governed by the
  // `employees` permission everywhere in the app, so it shares that key here.
  { id: 'employee-cards', label: 'Employee Cards', icon: <IdCard size={15} />, roles: ['Company Head', 'HR'], permission: 'employees', inMatrix: true },
  { id: 'attendance', label: 'Attendance', icon: <CalendarCheck size={15} />, roles: ['Company Head', 'HR', 'Finance', 'Employee'], permission: 'attendance', inMatrix: true },
  // Attendance Devices is a sub-feature of Attendance — governed by the
  // `attendance` permission, so it shares that key here.
  // Attendance API Integration (E-TimeOffice pull sync) — the single source of
  // truth for attendance device/vendor integration. Rides on the `attendance`
  // permission (no separate matrix row — inMatrix:false — so it doesn't duplicate
  // the Attendance permission row); hidden from the Super-Admin root menu.
  { id: 'attendance-integration', label: 'Attendance API Integration', icon: <PlugZap size={15} />, roles: ['Super Admin', 'Company Head', 'HR'], permission: 'attendance', inMatrix: false },
  { id: 'leaves', label: 'Leave Management', icon: <CalendarDays size={15} />, roles: ['Company Head', 'HR'], permission: 'leaves', inMatrix: true },
  { id: 'payroll', label: 'Payroll', icon: <DollarSign size={15} />, roles: ['Company Head', 'HR', 'Finance', 'Employee'], permission: 'payroll', inMatrix: true },
  { id: 'invoice-management', label: 'Invoice Management', icon: <ReceiptText size={15} />, roles: ['Company Head', 'Finance', 'HR'], permission: 'invoicing', inMatrix: true },
  { id: 'loan-management', label: 'Employee Loan Management', icon: <HandCoins size={15} />, roles: ['Company Head', 'HR', 'Finance'], permission: 'loans', inMatrix: true },
  { id: 'documents', label: 'Documents', icon: <FileText size={15} />, roles: ['Company Head', 'HR', 'Finance'], permission: 'documents', inMatrix: true },
  { id: 'reports', label: 'Reports', icon: <BarChart3 size={15} />, roles: ['Company Head', 'HR'], permission: 'reports', inMatrix: true },
  { id: 'communication', label: 'Communication Center', icon: <MessageSquare size={15} />, roles: ['Company Head', 'HR'], permission: 'communication', inMatrix: true },
  { id: 'tasks', label: 'Task Manager', icon: <ClipboardList size={15} />, roles: ['Super Admin', 'Company Head', 'HR', 'Finance', 'Employee'], permission: 'tasks', inMatrix: true },
  { id: 'tenders', label: 'Tender Management', icon: <Briefcase size={15} />, roles: ['Company Head'], permission: 'tenders', inMatrix: true },
  { id: 'contracts', label: 'Contract Management', icon: <FileSignature size={15} />, roles: ['Company Head'], permission: 'contracts', inMatrix: true },
  { id: 'company-profile', label: 'Company Profile', icon: <Building2 size={15} />, roles: ['Company Head'], permission: 'company-profile', inMatrix: true },
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
