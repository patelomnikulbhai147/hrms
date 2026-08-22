import React from 'react';
import { cn } from '@/utils/cn';

/** One control geometry for every field type, so forms line up on a grid. */
const fieldBase =
  'w-full h-12 rounded-xl border border-hairline bg-surface px-4 text-sm text-ink ' +
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

/**
 * DateField — a date input that ALWAYS displays as DD/MM/YYYY (day-month-year),
 * regardless of the browser locale (a native <input type="date"> follows the OS
 * locale, so US machines show MM/DD/YYYY). Stores/emits an ISO `yyyy-MM-dd` string
 * via onChange, so it's a drop-in for the fields that used `type="date"`. A calendar
 * button opens the native OS date picker for mouse users; the text box accepts typed
 * DD/MM/YYYY with auto-inserted slashes.
 */
const isoToDMY = (s: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((s || '').slice(0, 10)); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };

interface DateFieldProps {
  label?: string;
  value?: string;               // yyyy-MM-dd (or ISO datetime — first 10 chars used)
  onChange: (iso: string) => void;
  error?: string;
  id?: string;
  max?: string;                 // yyyy-MM-dd upper bound for the picker (e.g. today)
  min?: string;
  disabled?: boolean;
  className?: string;
}

export const DateField: React.FC<DateFieldProps> = ({ label, value, onChange, error, id, max, min, disabled, className }) => {
  const iso = (value || '').slice(0, 10);
  const [text, setText] = React.useState(isoToDMY(iso));
  const focusedRef = React.useRef(false);
  // Reflect external changes only while the user isn't mid-edit, so a half-typed
  // "17/09" is never wiped by the parent round-tripping an empty value back.
  React.useEffect(() => { if (!focusedRef.current) setText(isoToDMY(iso)); }, [iso]);

  const emit = (digits: string) => {
    if (digits.length !== 8) { onChange(''); return; }
    const dd = +digits.slice(0, 2), mm = +digits.slice(2, 4), yyyy = +digits.slice(4);
    const out = `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    const d = new Date(out + 'T00:00:00');
    const valid = d.getFullYear() === yyyy && d.getMonth() + 1 === mm && d.getDate() === dd;
    onChange(valid ? out : '');
  };
  const onText = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 8); // DDMMYYYY
    const out = digits.length >= 5 ? `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
      : digits.length >= 3 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
    setText(out);
    emit(digits);
  };

  return (
    <div className="flex flex-col gap-1.5 w-full">
      {label && <label className={labelBase}>{label}</label>}
      <div className="relative w-full">
        <input
          id={id} inputMode="numeric" placeholder="DD/MM/YYYY" value={text} disabled={disabled}
          onChange={e => onText(e.target.value)}
          onFocus={() => { focusedRef.current = true; }}
          onBlur={() => { focusedRef.current = false; setText(isoToDMY(iso)); }}
          aria-invalid={!!error || undefined}
          className={cn(fieldBase, 'pr-10', error && errorBase, className)}
        />
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
        </span>
        {/* Native picker overlaid on the calendar icon (opacity 0). Clicking opens the OS picker. */}
        <input
          type="date" tabIndex={-1} aria-hidden max={max} min={min} value={iso} disabled={disabled}
          onClick={e => { try { (e.currentTarget as any).showPicker?.(); } catch { /* older browsers: click still focuses */ } }}
          onChange={e => { const v = e.target.value; setText(isoToDMY(v)); onChange(v); }}
          className="absolute right-0 top-0 h-full w-10 opacity-0 cursor-pointer disabled:cursor-not-allowed"
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
