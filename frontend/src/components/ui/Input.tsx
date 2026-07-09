import React from 'react';
import { cn } from '@/utils/cn';

/** One control geometry for every field type, so forms line up on a grid. */
const fieldBase =
  'w-full h-10 rounded-[10px] border border-hairline bg-surface px-3.5 text-[13px] text-ink ' +
  'placeholder:text-ink-muted transition-[border-color,box-shadow] duration-150 ' +
  'focus:outline-none focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/15 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed';

const labelBase = 'text-[12px] font-semibold text-ink-secondary';

const errorBase = 'border-red-400 focus:border-red-500 focus:ring-red-500/15';
const successBase = 'border-emerald-400 focus:border-emerald-500 focus:ring-emerald-500/15';

const ErrorText: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-[12px] text-red-600 font-medium flex items-center gap-1">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="flex-shrink-0">
      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
    {children}
  </p>
);

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  success?: boolean;
  icon?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({ label, error, success, icon, className, ...props }) => {
  return (
    <div className="flex flex-col gap-1.5 w-full">
      {label && <label className={labelBase}>{label}</label>}
      <div className="relative w-full">
        {icon && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none">{icon}</span>}
        <input
          {...props}
          aria-invalid={!!error || undefined}
          className={cn(
            fieldBase,
            icon && 'pl-9.5',
            error && errorBase,
            success && !error && successBase,
            className
          )}
        />
      </div>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
};

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string; disabled?: boolean }[];
}

export const Select: React.FC<SelectProps> = ({ label, error, options, className, ...props }) => {
  return (
    <div className="flex flex-col gap-1.5 w-full">
      {label && <label className={labelBase}>{label}</label>}
      <select
        {...props}
        aria-invalid={!!error || undefined}
        className={cn(fieldBase, 'appearance-none cursor-pointer pr-9', error && errorBase, className)}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%239CA3AF' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")",
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 0.75rem center',
        }}
      >
        {options.map(o => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
      </select>
      {error && <ErrorText>{error}</ErrorText>}
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
      {label && <label className={labelBase}>{label}</label>}
      <textarea
        {...props}
        rows={props.rows ?? 3}
        aria-invalid={!!error || undefined}
        className={cn(fieldBase, 'h-auto py-2.5 resize-none leading-relaxed', error && errorBase, className)}
      />
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
};
