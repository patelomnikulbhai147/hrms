import React from 'react';
import { cn } from '../../utils/cn';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  success?: boolean;
  icon?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({ label, error, success, icon, className, ...props }) => {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{label}</label>}
      <div className="relative">
        {icon && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{icon}</span>}
        <input
          {...props}
          className={cn(
            'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500 disabled:bg-slate-50 disabled:text-slate-400',
            icon && 'pl-9.5',
            error && 'border-rose-300 focus:ring-rose-500/15 focus:border-rose-500',
            success && !error && 'border-emerald-300 focus:ring-emerald-500/15 focus:border-emerald-500',
            className
          )}
        />
      </div>
      {error && <p className="text-xs text-rose-600 font-semibold">{error}</p>}
    </div>
  );
};

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
}

export const Select: React.FC<SelectProps> = ({ label, error, options, className, ...props }) => {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{label}</label>}
      <select
        {...props}
        className={cn(
          'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500 disabled:bg-slate-50',
          error && 'border-rose-300 focus:ring-rose-500/15 focus:border-rose-500',
          className
        )}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {error && <p className="text-xs text-rose-600 font-semibold">{error}</p>}
    </div>
  );
};

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea: React.FC<TextareaProps> = ({ label, error, className, ...props }) => {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{label}</label>}
      <textarea
        {...props}
        rows={props.rows ?? 3}
        className={cn(
          'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500 resize-none',
          error && 'border-rose-300 focus:ring-rose-500/15 focus:border-rose-500',
          className
        )}
      />
      {error && <p className="text-xs text-rose-600 font-semibold">{error}</p>}
    </div>
  );
};
