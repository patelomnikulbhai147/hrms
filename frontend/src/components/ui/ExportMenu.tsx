import React, { useState, useRef, useEffect } from 'react';
import { Download, FileSpreadsheet, FileText, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/utils/cn';
import { ui } from '@/components/ui/feedback';
import {
  exportRowsToExcel,
  exportRowsToPDF,
  type ExportColumn,
} from '@/utils/exportUtils';

interface ExportMenuProps {
  /** Columns to include in the exported file (header + key into each row). */
  columns: ExportColumn[];
  /**
   * Rows to export. Pass the data the user is currently looking at (after
   * search / filters) so the file matches exactly what's on screen.
   * Can be a value or a getter (evaluated at click time for freshest data).
   */
  rows: any[] | (() => any[]);
  /** Base file name, no extension. A timestamp is appended automatically. */
  fileName: string;
  /** Title printed at the top of the PDF (defaults to fileName). */
  title?: string;
  /** Optional subtitle line in the PDF, e.g. company / active filter. */
  subtitle?: string;
  /** Worksheet name for the Excel file. */
  sheetName?: string;
  /** Disable the button (e.g. while data is loading). */
  disabled?: boolean;
  /** Visual size to match surrounding buttons. */
  size?: 'sm' | 'md';
  className?: string;
  /** Optional callback after a successful export (e.g. audit logging). */
  onExported?: (format: 'excel' | 'pdf', count: number) => void;
}

const todayStamp = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/**
 * Shared "Export" dropdown offering Excel (.xlsx) and PDF downloads of the
 * current on-screen table. Drop it onto any page and feed it the visible
 * columns + rows — the actual file generation lives in utils/exportUtils.ts.
 */
export const ExportMenu: React.FC<ExportMenuProps> = ({
  columns,
  rows,
  fileName,
  title,
  subtitle,
  sheetName,
  disabled,
  size = 'md',
  className,
  onExported,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDocClick); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const getRows = (): any[] => (typeof rows === 'function' ? rows() : rows) || [];

  const handle = (format: 'excel' | 'pdf') => {
    setOpen(false);
    try {
      const data = getRows();
      if (!data.length) {
        ui.toast.info('There is no data to export for the current view.');
        return;
      }
      const stampedName = `${fileName}_${todayStamp()}`;
      if (format === 'excel') {
        exportRowsToExcel(stampedName, columns, data, sheetName);
      } else {
        exportRowsToPDF(stampedName, title || fileName, columns, data, subtitle);
      }
      onExported?.(format, data.length);
    } catch (err: any) {
      console.error('Export failed:', err);
      ui.toast.error('Export failed: ' + (err?.message || 'Unknown error'));
    }
  };

  const sizeCls = size === 'sm'
    ? 'px-3 py-1.5 text-xs rounded-xl'
    : 'px-4.5 py-2 text-xs rounded-xl';

  return (
    <div className={cn('relative inline-block', className)} ref={ref}>
      <motion.button
        type="button"
        whileHover={{ scale: disabled ? 1 : 1.015 }}
        whileTap={{ scale: disabled ? 1 : 0.985 }}
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className={cn(
          'inline-flex items-center justify-center gap-1.5 font-bold transition-all duration-200',
          'bg-white border border-[#E2E8F0] text-[#475569] shadow-sm',
          'hover:bg-[#F8FAFC] hover:text-[#1E293B] hover:border-[#CBD5E1]',
          'focus:outline-none focus:ring-2 focus:ring-blue-500/10 disabled:opacity-40 disabled:cursor-not-allowed select-none',
          sizeCls
        )}
      >
        <Download size={14} />
        Export
        <ChevronDown size={13} className={cn('transition-transform', open && 'rotate-180')} />
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 z-50 mt-1.5 w-48 overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-xl shadow-slate-200/60"
          >
            <button
              type="button"
              onClick={() => handle('excel')}
              className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-xs font-semibold text-[#475569] transition-colors hover:bg-emerald-50 hover:text-emerald-700"
            >
              <FileSpreadsheet size={15} className="text-emerald-600" />
              Export to Excel
            </button>
            <div className="h-px bg-[#F1F5F9]" />
            <button
              type="button"
              onClick={() => handle('pdf')}
              className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-xs font-semibold text-[#475569] transition-colors hover:bg-rose-50 hover:text-rose-700"
            >
              <FileText size={15} className="text-rose-600" />
              Export to PDF
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ExportMenu;
