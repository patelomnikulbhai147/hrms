// ─────────────────────────────────────────────────────────────────────────────
// SUBSCRIPTION PRICING (frontend mirror of backend/src/services/planEntitlements.js
// PLAN_PRICING/PLAN_META/calcAmount). Drives the live amount preview in the
// Manage-Subscription page. The backend is authoritative for stored amounts.
//
// Rate is per employee PER billing period (Quarterly/Yearly) — no proration:
//   amount = employeeCount × rate − discount   (75×₹25=₹1,875; 220×₹16=₹3,520)
// ⚠️ Keep in sync with the backend map.
// ─────────────────────────────────────────────────────────────────────────────

export type PlanKey = 'Free' | 'Starter' | 'Professional' | 'Enterprise' | 'Custom';
export type BillingCycle = 'Quarterly' | 'Yearly';

export interface PlanMeta {
  key: PlanKey;
  label: string;
  range: string;
  quarterly?: number;   // ₹/employee/quarter
  yearly?: number;      // ₹/employee/year
  yearlySavings?: string;
  custom?: boolean;
}

export const PLAN_PRICING: Record<PlanKey, { quarterly: number; yearly: number } | null> = {
  Free: { quarterly: 0, yearly: 0 },
  Starter: { quarterly: 25, yearly: 20 },
  Professional: { quarterly: 20, yearly: 16 },
  Enterprise: { quarterly: 15, yearly: 12 },
  Custom: null,
};

export const PLAN_CATALOG: PlanMeta[] = [
  { key: 'Free', label: 'Free', range: 'Up to 100 employees', quarterly: 0, yearly: 0 },
  { key: 'Starter', label: 'Starter', range: '0–100 employees', quarterly: 25, yearly: 20, yearlySavings: '20%' },
  { key: 'Professional', label: 'Professional', range: '101–500 employees', quarterly: 20, yearly: 16, yearlySavings: '20%' },
  { key: 'Enterprise', label: 'Enterprise', range: '500+ employees', quarterly: 15, yearly: 12, yearlySavings: '20%' },
  { key: 'Custom', label: 'Custom', range: 'Manual pricing', custom: true },
];

const cycleKey = (cycle: string): 'quarterly' | 'yearly' =>
  String(cycle).toLowerCase() === 'yearly' ? 'yearly' : 'quarterly';

export function pricePerEmployee(plan: string, cycle: string, customRate?: number | null): number {
  if (plan === 'Custom') return Number(customRate) || 0;
  const tier = PLAN_PRICING[plan as PlanKey];
  return tier ? tier[cycleKey(cycle)] : 0;
}

/** amount = employeeCount × ratePerEmployee − discount. */
export function calcAmount(plan: string, cycle: string, employeeCount: number, customRate?: number | null, discountPercent = 0): number {
  const rate = pricePerEmployee(plan, cycle, customRate);
  const gross = (Number(employeeCount) || 0) * rate;
  const disc = Math.round(gross * ((Number(discountPercent) || 0) / 100));
  return Math.max(0, gross - disc);
}

export const inr = (n: number): string =>
  '₹' + (Number(n) || 0).toLocaleString('en-IN');
