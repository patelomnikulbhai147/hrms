import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight, Home } from 'lucide-react';
import { cn } from '@/utils/cn';
import { motion, AnimatePresence } from 'framer-motion';

export interface ModalCrumb { label: string; onClick?: () => void; }

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  footer?: React.ReactNode;
  /**
   * 'dialog' (default) → classic centered popup.
   * 'page'  → dedicated FULL-PAGE form: renders full-bleed inside the app's
   *           <main> content area, so the left sidebar and top navigation stay
   *           visible. Use for LARGE forms / wizards (Employee, Branch, Company,
   *           Payroll Generate, Document Upload, …). Presentation only — the form
   *           body, state, validation and submit handlers are unchanged.
   */
  variant?: 'dialog' | 'page';
  /** Page-variant only: breadcrumb trail, subtitle, and company/branch context. */
  breadcrumbs?: ModalCrumb[];
  subtitle?: string;
  context?: React.ReactNode;
  /** Page-variant content max width (default 1180). */
  pageMaxWidth?: number | string;
}

const sizeClasses = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

export const Modal: React.FC<ModalProps> = ({
  open, onClose, title, children, size = 'md', footer,
  variant = 'dialog', breadcrumbs, subtitle, context, pageMaxWidth = 1180,
}) => {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (open) document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // ── FULL-PAGE variant ──────────────────────────────────────────────────────
  // Portals into <main> and covers it (absolute inset-0), hiding the page list
  // behind it while the sidebar + top nav (outside <main>) remain visible.
  const mainEl = typeof document !== 'undefined' ? document.querySelector('main') : null;
  useEffect(() => {
    if (variant !== 'page') return;
    const m = document.querySelector('main') as HTMLElement | null;
    if (!m) return;
    if (open) {
      m.style.position = m.style.position || 'relative';
      const prevOverflow = m.style.overflow;
      m.style.overflow = 'hidden';
      return () => { m.style.overflow = prevOverflow; };
    }
  }, [open, variant]);

  if (variant === 'page') {
    const node = (
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 z-40 bg-slate-50 flex flex-col"
          >
            {/* Header: breadcrumb + title + context */}
            <div className="bg-white border-b border-slate-200 shadow-sm shrink-0">
              <div className="px-5 pt-3 pb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 flex-wrap">
                <Home size={12} className="text-slate-300" />
                {(breadcrumbs && breadcrumbs.length ? breadcrumbs : [{ label: title }]).map((c, i, arr) => (
                  <React.Fragment key={i}>
                    {i > 0 && <ChevronRight size={11} className="text-slate-300" />}
                    {c.onClick && i < arr.length - 1
                      ? <button onClick={c.onClick} className="hover:text-indigo-600 transition-colors">{c.label}</button>
                      : <span className={i === arr.length - 1 ? 'text-slate-700' : ''}>{c.label}</span>}
                  </React.Fragment>
                ))}
              </div>
              <div className="px-5 pb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <button onClick={onClose} className="flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-indigo-600 transition shrink-0"><ChevronLeft size={16} /> Back</button>
                  <div className="border-l border-slate-200 pl-3">
                    <h2 className="text-base font-extrabold text-slate-800 leading-tight">{title}</h2>
                    {subtitle && <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {context && <div className="text-[11px] font-semibold text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">{context}</div>}
                  <button onClick={onClose} className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1.5 rounded-full transition-all active:scale-90"><X size={18} /></button>
                </div>
              </div>
            </div>

            {/* Scrollable full-width content */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6">
              <div style={{ maxWidth: pageMaxWidth, margin: '0 auto', width: '100%' }} className="text-sm text-slate-600">
                {children}
              </div>
            </div>

            {/* Sticky action bar */}
            {footer && (
              <div className="bg-white/95 backdrop-blur border-t border-slate-200 shadow-[0_-2px_8px_rgba(0,0,0,0.05)] shrink-0">
                <div style={{ maxWidth: pageMaxWidth, margin: '0 auto', width: '100%' }} className="px-4 py-3 flex items-center justify-end gap-2">
                  {footer}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    );
    return mainEl ? createPortal(node, mainEl) : node;
  }

  // ── DIALOG variant (unchanged) ─────────────────────────────────────────────
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0"
            style={{ backgroundColor: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)' }}
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ type: 'spring', duration: 0.35, bounce: 0.15 }}
            className={cn('relative bg-white rounded-2xl shadow-2xl w-full flex flex-col max-h-[90vh] z-10 border border-slate-100/50 overflow-hidden', sizeClasses[size])}
          >
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 font-heading">{title}</h3>
              <button
                onClick={onClose}
                className="text-slate-400 hover:text-slate-600 hover:bg-slate-50 p-1.5 rounded-full transition-all duration-150 active:scale-90"
              >
                <X size={18} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-5 text-sm text-slate-600">{children}</div>
            {footer && (
              <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-2 bg-slate-50/50">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
