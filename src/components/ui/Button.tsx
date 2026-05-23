import React from 'react';
import { cn } from '../../utils/cn';
import { motion } from 'framer-motion';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline' | 'success';
type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-gradient-to-r from-blue-600 to-indigo-650 text-white hover:from-blue-500 hover:to-indigo-600 hover:shadow-lg hover:shadow-blue-500/15 border-transparent',
  secondary: 'bg-slate-800/60 text-slate-200 hover:bg-slate-800/90 hover:text-white border-slate-700/60 hover:shadow-md shadow-sm',
  danger: 'bg-slate-900/20 border border-red-500/35 text-red-450 hover:bg-rose-955/35 hover:text-red-400 hover:border-red-450/70 hover:shadow-lg hover:shadow-red-955/15',
  ghost: 'bg-transparent text-slate-400 hover:bg-slate-800/60 hover:text-white border-transparent',
  outline: 'bg-slate-900/40 border border-slate-800/80 text-slate-300 hover:bg-slate-800/60 hover:text-white hover:border-slate-700 shadow-md',
  success: 'bg-gradient-to-r from-emerald-600 to-teal-650 text-white hover:from-emerald-500 hover:to-teal-600 hover:shadow-lg hover:shadow-emerald-500/15 border-transparent',
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
