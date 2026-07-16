import React from 'react';
import { cn } from '@/utils/cn';
import { motion } from 'framer-motion';

// Colour is semantic — pick the variant that matches what the action DOES:
//   primary   purple gradient  Generate, Save, Create — the one filled button
//   secondary purple outline   Download, Email, Export, Bank Sheet
//   success   soft green       Approve, Mark Paid, Lock Month
//   warning   soft amber       Recalculate, Regenerate, Reprocess
//   danger    soft red         Delete, Unlock Month, Cancel Payroll
//   outline   neutral grey     Cancel, Close, filters — deliberately NOT purple
//   ghost     bare             icon-only / tertiary
// Every tone is defined once in index.css (`.btn-*`), which also owns dark mode.
type ButtonVariant =
  | 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline'
  | 'success' | 'warning' | 'primary-light-blue';
type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'btn-tone btn-primary',
  // Retained for API compatibility — callers still pass this variant name.
  'primary-light-blue': 'btn-tone btn-primary',
  secondary: 'btn-tone btn-secondary',
  success: 'btn-tone btn-success',
  warning: 'btn-tone btn-warning',
  danger: 'btn-tone btn-danger',
  outline: 'btn-tone btn-outline',
  ghost: 'btn-tone btn-ghost',
};

// One 12px radius everywhere. `md` (the default) is the 40px standard action
// height; `lg` is 44px. `xs`/`sm` stay compact on purpose — they sit in table
// rows, toolbars and the payroll workflow strip, where a 40px control would
// force every row taller.
const sizeClasses: Record<ButtonSize, string> = {
  xs: 'h-7      px-2.5 text-[11px] rounded-xl',
  sm: 'h-9      px-3.5 text-xs     rounded-xl',
  md: 'h-[42px] px-[18px] text-[13px] rounded-xl',
  lg: 'h-12     px-6   text-sm     rounded-xl',
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  loading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children, variant = 'primary', size = 'md', icon, loading, className, disabled, ...props
}) => {
  return (
    <motion.button
      // A 1px lift rather than a scale — text stays pixel-crisp on hover.
      whileHover={{ y: disabled || loading ? 0 : -1 }}
      whileTap={{ scale: disabled || loading ? 1 : 0.985 }}
      {...props as any}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 font-semibold whitespace-nowrap',
        'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-500/25',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none select-none',
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
    >
      {loading ? <span className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" /> : icon}
      {children}
    </motion.button>
  );
};
