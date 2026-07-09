import React from 'react';
import { cn } from '@/utils/cn';
import { motion } from 'framer-motion';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline' | 'success' | 'primary-light-blue';
type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-gradient-to-r from-brand-600 to-brand-500 text-white border-transparent shadow-[0_2px_8px_rgba(108,60,240,0.24)] hover:from-brand-700 hover:to-brand-600 hover:shadow-[0_6px_20px_rgba(108,60,240,0.32)]',
  // Retained for API compatibility — callers still pass this variant name.
  'primary-light-blue': 'bg-gradient-to-r from-brand-600 to-brand-500 text-white border-transparent shadow-[0_2px_8px_rgba(108,60,240,0.24)] hover:from-brand-700 hover:to-brand-600 hover:shadow-[0_6px_20px_rgba(108,60,240,0.32)]',
  secondary: 'bg-brand-50 text-brand-700 hover:bg-brand-100 border-transparent',
  danger: 'bg-white border border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300',
  ghost: 'bg-transparent text-ink-secondary hover:bg-[var(--surface-hover)] hover:text-brand-600 border-transparent',
  outline: 'bg-surface border border-hairline text-ink-secondary hover:border-brand-300 hover:text-brand-600 hover:bg-brand-50',
  success: 'bg-gradient-to-r from-emerald-600 to-emerald-500 text-white border-transparent shadow-[0_2px_8px_rgba(22,163,74,0.24)] hover:shadow-[0_6px_20px_rgba(22,163,74,0.30)]',
};

const sizeClasses: Record<ButtonSize, string> = {
  xs: 'h-7  px-2.5 text-[11px] rounded-lg',
  sm: 'h-8  px-3   text-xs    rounded-lg',
  md: 'h-9.5 px-4  text-[13px] rounded-[10px]',
  lg: 'h-11 px-5   text-sm    rounded-xl',
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
      whileHover={{ scale: disabled || loading ? 1 : 1.015 }}
      whileTap={{ scale: disabled || loading ? 1 : 0.985 }}
      {...props as any}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 font-semibold whitespace-nowrap transition-all duration-200',
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
