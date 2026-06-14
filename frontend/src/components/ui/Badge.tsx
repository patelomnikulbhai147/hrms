import React from 'react';
import { cn } from '../../utils/cn';

type BadgeVariant = 'green' | 'red' | 'yellow' | 'blue' | 'gray' | 'orange' | 'purple' | 'indigo' | 'danger' | 'success' | 'warning' | 'amber';

const variantClasses: Record<BadgeVariant, string> = {
  green: 'bg-emerald-500/10 text-emerald-450 border border-emerald-500/25',
  success: 'bg-emerald-500/10 text-emerald-450 border border-emerald-500/25',
  red: 'bg-rose-500/10 text-rose-450 border border-rose-500/25',
  danger: 'bg-rose-500/10 text-rose-450 border border-rose-500/25',
  yellow: 'bg-amber-500/10 text-amber-400 border border-amber-500/25',
  amber: 'bg-amber-500/10 text-amber-400 border border-amber-500/25',
  warning: 'bg-amber-500/10 text-amber-400 border border-amber-500/25',
  blue: 'bg-blue-500/10 text-blue-400 border border-blue-500/25',
  gray: 'bg-slate-800/60 text-slate-300 border border-slate-700/50',
  orange: 'bg-orange-500/10 text-orange-400 border border-orange-500/25',
  purple: 'bg-purple-500/10 text-purple-400 border border-purple-500/25',
  indigo: 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/25',
};

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
  dot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'gray', className, dot }) => {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider shadow-sm select-none', variantClasses[variant], className)}>
      {dot && (
        <span className={cn('h-1.5 w-1.5 rounded-full relative flex-shrink-0', {
          'bg-emerald-500': variant === 'green' || variant === 'success',
          'bg-rose-500': variant === 'red' || variant === 'danger',
          'bg-amber-500': variant === 'yellow' || variant === 'warning' || variant === 'amber',
          'bg-blue-500': variant === 'blue',
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
