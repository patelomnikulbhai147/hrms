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
    <div className="flex flex-col gap-1.5 w-full">
      {label && <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">{label}</label>}
      <div className="relative w-full">
        {icon && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">{icon}</span>}
        <input
          {...props}
          className={cn(
            'w-full rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur-md px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 disabled:opacity-40 disabled:cursor-not-allowed',
            icon && 'pl-9.5',
            error && 'border-rose-500/50 focus:ring-rose-500/10 focus:border-rose-500',
            success && !error && 'border-emerald-500/50 focus:ring-emerald-500/10 focus:border-emerald-500',
            className
          )}
        />
      </div>
      {error && <p className="text-[11px] text-rose-450 font-bold">{error}</p>}
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
    <div className="flex flex-col gap-1.5 w-full">
      {label && <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">{label}</label>}
      <select
        {...props}
        className={cn(
          'w-full rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur-md px-3.5 py-2 text-xs text-slate-100 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 disabled:opacity-40 disabled:cursor-not-allowed appearance-none cursor-pointer',
          error && 'border-rose-500/50 focus:ring-rose-500/10 focus:border-rose-500',
          className
        )}
      >
        {options.map(o => <option key={o.value} value={o.value} className="bg-slate-950 text-slate-100">{o.label}</option>)}
      </select>
      {error && <p className="text-[11px] text-rose-450 font-bold">{error}</p>}
    </div>
  );
};

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea: React.FC<TextareaProps> = ({ label, error, className, ...props }) => {
  return (
    <div className="flex flex-col gap-1.5 w-full">
      {label && <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">{label}</label>}
      <textarea
        {...props}
        rows={props.rows ?? 3}
        className={cn(
          'w-full rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur-md px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 resize-none disabled:opacity-40 disabled:cursor-not-allowed',
          error && 'border-rose-500/50 focus:ring-rose-500/10 focus:border-rose-500',
          className
        )}
      />
      {error && <p className="text-[11px] text-rose-450 font-bold">{error}</p>}
    </div>
  );
};
