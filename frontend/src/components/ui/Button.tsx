import React from 'react';
import { cn } from '@/utils/cn';
import { motion } from 'framer-motion';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline' | 'success' | 'primary-light-blue';
type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-gradient-to-r from-[#4F7CFF] to-[#6AA8FF] text-white hover:opacity-90 hover:shadow-lg hover:shadow-[#4F7CFF]/20 border-transparent',
  'primary-light-blue': 'bg-gradient-to-r from-[#4F7CFF] to-[#6AA8FF] text-white hover:opacity-90 hover:shadow-lg hover:shadow-[#4F7CFF]/20 border-transparent',
  secondary: 'bg-[#F1F5F9] text-[#475569] hover:bg-[#E2E8F0] hover:text-[#1E293B] border-transparent shadow-sm',
  danger: 'bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-100 hover:text-rose-700 hover:border-rose-300 shadow-sm',
  ghost: 'bg-transparent text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#1E293B] border-transparent',
  outline: 'bg-white border border-[#E2E8F0] text-[#475569] hover:bg-[#F8FAFC] hover:text-[#1E293B] hover:border-[#CBD5E1] shadow-sm',
  success: 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:opacity-90 hover:shadow-lg hover:shadow-emerald-500/15 border-transparent',
};

const sizeClasses: Record<ButtonSize, string> = {
  xs: 'px-2.5 py-1 text-[11px] rounded-lg',
  sm: 'px-3 py-1.5 text-xs rounded-xl',
  md: 'px-4.5 py-2 text-xs rounded-xl',
  lg: 'px-5.5 py-2.5 text-sm rounded-2xl',
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
        'inline-flex items-center justify-center gap-1.5 font-bold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/10 disabled:opacity-40 disabled:cursor-not-allowed select-none',
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
