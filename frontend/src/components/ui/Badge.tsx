import React from 'react';
import { cn } from '@/utils/cn';

type BadgeVariant = 'green' | 'red' | 'yellow' | 'blue' | 'gray' | 'orange' | 'purple' | 'indigo' | 'danger' | 'success' | 'warning' | 'amber';

// Soft tint + readable text. `emerald-450`/`rose-450` are not real Tailwind
// shades — they emitted no colour at all, so those badges rendered with
// inherited text. Snapped to the nearest real shade.
const variantClasses: Record<BadgeVariant, string> = {
  green: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  success: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  red: 'bg-red-50 text-red-700 border border-red-200',
  danger: 'bg-red-50 text-red-700 border border-red-200',
  yellow: 'bg-amber-50 text-amber-700 border border-amber-200',
  amber: 'bg-amber-50 text-amber-700 border border-amber-200',
  warning: 'bg-amber-50 text-amber-700 border border-amber-200',
  blue: 'bg-blue-50 text-blue-700 border border-blue-200',
  gray: 'bg-surface-muted text-ink-secondary border border-hairline',
  orange: 'bg-orange-50 text-orange-700 border border-orange-200',
  purple: 'bg-brand-50 text-brand-700 border border-brand-200',
  indigo: 'bg-brand-50 text-brand-700 border border-brand-200',
};

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
  dot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'gray', className, dot }) => {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-tight select-none', variantClasses[variant], className)}>
      {dot && (
        <span className={cn('h-1.5 w-1.5 rounded-full relative flex-shrink-0', {
          'bg-emerald-500': variant === 'green' || variant === 'success',
          'bg-red-500': variant === 'red' || variant === 'danger',
          'bg-amber-500': variant === 'yellow' || variant === 'warning' || variant === 'amber',
          'bg-blue-500': variant === 'blue',
          'bg-ink-muted': variant === 'gray',
          'bg-orange-500': variant === 'orange',
          'bg-brand-500': variant === 'purple' || variant === 'indigo',
        })} />
      )}
      {children}
    </span>
  );
};

// Status-specific badge helpers
export const statusBadge = (status: string) => {
  const map: Record<string, BadgeVariant> = {
    Active: 'green', Present: 'green', Approved: 'green', Processed: 'green', Selected: 'green',
    Placed: 'green', Verified: 'green', Paid: 'green', Completed: 'green',
    Generated: 'purple', Processing: 'blue', Draft: 'gray', Overdue: 'red',
    Inactive: 'gray', Absent: 'red', Rejected: 'red', Failed: 'red', Churned: 'red', Terminated: 'red', Cancelled: 'gray',
    Archived: 'gray', Resigned: 'orange',
    Pending: 'yellow', 'On Leave': 'orange', Late: 'orange', 'Half Day': 'orange', 'On Hold': 'orange',
    WFH: 'blue', Planning: 'blue', Screening: 'blue', Applied: 'indigo',
    Interview: 'purple', Prospect: 'blue',
    
    // Lowercase payroll workflow mapping
    draft: 'gray',
    prepared: 'blue',
    verified: 'orange',
    payment_pending: 'yellow',
    paid: 'green',
    payslip_generated: 'purple',
    failed: 'red'
  };
  return map[status] ?? 'gray';
};
