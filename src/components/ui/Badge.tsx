import React from 'react';
import { cn } from '../../utils/cn';

type BadgeVariant = 'green' | 'red' | 'yellow' | 'blue' | 'gray' | 'orange' | 'purple' | 'indigo' | 'danger' | 'success' | 'warning' | 'amber';

const variantClasses: Record<BadgeVariant, string> = {
  green: 'bg-emerald-50/75 text-emerald-700 border border-emerald-200/50',
  success: 'bg-emerald-50/75 text-emerald-700 border border-emerald-200/50',
  red: 'bg-rose-50/75 text-rose-700 border border-rose-200/50',
  danger: 'bg-rose-50/75 text-rose-700 border border-rose-200/50',
  yellow: 'bg-amber-50/75 text-amber-700 border border-amber-200/50',
  amber: 'bg-amber-50/75 text-amber-700 border border-amber-200/50',
  warning: 'bg-amber-50/75 text-amber-700 border border-amber-200/50',
  blue: 'bg-sky-50/75 text-sky-700 border border-sky-200/50',
  gray: 'bg-slate-100/70 text-slate-600 border border-slate-200/50',
  orange: 'bg-orange-50/75 text-orange-700 border border-orange-200/50',
  purple: 'bg-purple-50/75 text-purple-700 border border-purple-200/50',
  indigo: 'bg-indigo-50/75 text-indigo-700 border border-indigo-200/50',
};

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
  dot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'gray', className, dot }) => {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide shadow-sm/5', variantClasses[variant], className)}>
      {dot && (
        <span className={cn('h-1.5 w-1.5 rounded-full relative flex-shrink-0', {
          'bg-emerald-500': variant === 'green' || variant === 'success',
          'bg-rose-500': variant === 'red' || variant === 'danger',
          'bg-amber-500': variant === 'yellow' || variant === 'warning' || variant === 'amber',
          'bg-sky-500': variant === 'blue',
          'bg-slate-400': variant === 'gray',
          'bg-orange-500': variant === 'orange',
          'bg-purple-500': variant === 'purple',
          'bg-indigo-500': variant === 'indigo',
        })}>
          {/* Elegant active pulsate effect */}
          {(variant === 'green' || variant === 'success' || variant === 'red' || variant === 'danger' || variant === 'yellow' || variant === 'warning') && (
            <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping bg-current" />
          )}
        </span>
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
