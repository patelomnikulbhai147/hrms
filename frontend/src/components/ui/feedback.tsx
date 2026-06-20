import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import { Button } from './Button';

/**
 * Global HRMS dialog + toast system.
 *
 * `ui` is a module-level singleton so it can be called from ANYWHERE — components,
 * utils, event handlers — without hooks or prop drilling. `<DialogHost />` is
 * mounted once at the app root and renders the actual UI. Until it mounts (or in
 * tests), the API degrades gracefully to the native dialog so nothing breaks.
 *
 * Replaces window.alert / window.confirm / window.prompt across the platform.
 *
 *   await ui.confirm({ title, message, confirmText, variant: 'danger' }) -> boolean
 *   await ui.alert({ title, message, variant: 'error' })                 -> void
 *   await ui.prompt({ title, message, defaultValue })                    -> string | null
 *   ui.toast.success('Saved')  / error / warning / info
 */

type DialogVariant = 'primary' | 'danger' | 'warning' | 'success' | 'error' | 'info';
type ToastType = 'success' | 'error' | 'warning' | 'info';

interface DialogReq {
  id: number;
  kind: 'confirm' | 'alert' | 'prompt';
  title?: string;
  message?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: DialogVariant;
  placeholder?: string;
  defaultValue?: string;
  resolve: (v: any) => void;
}
interface ToastReq { id: number; type: ToastType; message: string; duration?: number; }

type Opts = Partial<Omit<DialogReq, 'id' | 'kind' | 'resolve'>>;
const asOpts = (o: Opts | string): Opts => (typeof o === 'string' ? { message: o } : o);

let pushDialog: ((d: DialogReq) => void) | null = null;
let pushToast: ((t: ToastReq) => void) | null = null;
let counter = 1;
const text = (m: any) => (typeof m === 'string' ? m : '');

export const ui = {
  confirm(opts: Opts | string): Promise<boolean> {
    const o = asOpts(opts);
    return new Promise<boolean>(resolve => {
      const req: DialogReq = { id: counter++, kind: 'confirm', variant: 'primary', confirmText: 'Confirm', cancelText: 'Cancel', ...o, resolve };
      if (pushDialog) pushDialog(req); else resolve(window.confirm(text(o.message)));
    });
  },
  alert(opts: Opts | string): Promise<void> {
    const o = asOpts(opts);
    return new Promise<void>(resolve => {
      const req: DialogReq = { id: counter++, kind: 'alert', variant: 'info', confirmText: 'Close', ...o, resolve: () => resolve() };
      if (pushDialog) pushDialog(req); else { window.alert(text(o.message)); resolve(); }
    });
  },
  prompt(opts: Opts | string): Promise<string | null> {
    const o = asOpts(opts);
    return new Promise<string | null>(resolve => {
      const req: DialogReq = { id: counter++, kind: 'prompt', variant: 'primary', confirmText: 'OK', cancelText: 'Cancel', ...o, resolve };
      if (pushDialog) pushDialog(req); else resolve(window.prompt(text(o.message), o.defaultValue || ''));
    });
  },
  toast: {
    success: (message: string, duration?: number) => emitToast('success', message, duration),
    error: (message: string, duration?: number) => emitToast('error', message, duration),
    warning: (message: string, duration?: number) => emitToast('warning', message, duration),
    info: (message: string, duration?: number) => emitToast('info', message, duration),
  },
};
function emitToast(type: ToastType, message: string, duration?: number) {
  const t: ToastReq = { id: counter++, type, message, duration };
  if (pushToast) pushToast(t); else console.log(`[toast:${type}]`, message);
}

// ── Visual config ──────────────────────────────────────────────────────────
const VARIANT_ICON: Record<DialogVariant, { icon: React.ReactNode; ring: string }> = {
  primary: { icon: <Info size={20} />, ring: 'text-blue-600 bg-blue-50' },
  info: { icon: <Info size={20} />, ring: 'text-blue-600 bg-blue-50' },
  success: { icon: <CheckCircle2 size={20} />, ring: 'text-emerald-600 bg-emerald-50' },
  error: { icon: <XCircle size={20} />, ring: 'text-rose-600 bg-rose-50' },
  danger: { icon: <AlertTriangle size={20} />, ring: 'text-rose-600 bg-rose-50' },
  warning: { icon: <AlertTriangle size={20} />, ring: 'text-amber-600 bg-amber-50' },
};
const confirmBtnVariant = (v?: DialogVariant): any => (v === 'danger' || v === 'error' ? 'danger' : v === 'warning' ? 'primary' : 'primary');
const defaultTitle = (kind: string, v?: DialogVariant) =>
  kind === 'confirm' ? 'Please confirm'
    : v === 'success' ? 'Success' : v === 'error' ? 'Error' : v === 'warning' ? 'Warning' : 'Notice';

const TOAST_CFG: Record<ToastType, { icon: React.ReactNode; cls: string }> = {
  success: { icon: <CheckCircle2 size={16} />, cls: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  error: { icon: <XCircle size={16} />, cls: 'border-rose-200 bg-rose-50 text-rose-800' },
  warning: { icon: <AlertTriangle size={16} />, cls: 'border-amber-200 bg-amber-50 text-amber-800' },
  info: { icon: <Info size={16} />, cls: 'border-blue-200 bg-blue-50 text-blue-800' },
};

// ── Host (mounted once) ──────────────────────────────────────────────────────
export const DialogHost: React.FC = () => {
  const [queue, setQueue] = useState<DialogReq[]>([]);
  const [toasts, setToasts] = useState<ToastReq[]>([]);
  const [inputVal, setInputVal] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    pushDialog = (d) => setQueue(q => [...q, d]);
    pushToast = (t) => {
      setToasts(list => [...list, t]);
      const ms = t.duration ?? 3800;
      window.setTimeout(() => setToasts(list => list.filter(x => x.id !== t.id)), ms);
    };
    return () => { pushDialog = null; pushToast = null; };
  }, []);

  const current = queue[0];

  // Prepare input + focus when a dialog appears.
  useEffect(() => {
    if (!current) return;
    setInputVal(current.defaultValue || '');
    const t = window.setTimeout(() => {
      if (current.kind === 'prompt') inputRef.current?.focus();
      else document.querySelector<HTMLButtonElement>('[data-dialog-confirm]')?.focus();
    }, 70);
    return () => window.clearTimeout(t);
  }, [current?.id]);

  const close = (result: any) => {
    if (!current) return;
    current.resolve(result);
    setQueue(q => q.slice(1));
  };
  const onConfirm = () => close(current.kind === 'prompt' ? inputVal : true);
  const onCancel = () => close(current.kind === 'prompt' ? null : current?.kind === 'alert' ? undefined : false);

  useEffect(() => {
    if (!current) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
      else if (e.key === 'Enter' && current.kind !== 'prompt') { e.preventDefault(); onConfirm(); }
      else if (e.key === 'Enter' && current.kind === 'prompt' && document.activeElement === inputRef.current) { e.preventDefault(); onConfirm(); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [current?.id, inputVal]);

  const v = current?.variant || 'primary';
  const vi = VARIANT_ICON[v];

  return createPortal(
    <>
      {/* Dialog */}
      <AnimatePresence>
        {current && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
              className="absolute inset-0" style={{ backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }} onClick={onCancel} />
            <motion.div role="dialog" aria-modal="true"
              initial={{ opacity: 0, scale: 0.95, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ type: 'spring', duration: 0.32, bounce: 0.15 }}
              className="relative z-10 w-full max-w-md rounded-2xl border border-slate-100/50 bg-white shadow-2xl overflow-hidden">
              <div className="flex items-start gap-3 px-6 pt-5">
                <span className={`shrink-0 mt-0.5 flex h-9 w-9 items-center justify-center rounded-full ${vi.ring}`}>{vi.icon}</span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-bold text-slate-900 font-heading">{current.title || defaultTitle(current.kind, v)}</h3>
                  {current.message != null && <div className="mt-1 text-sm text-slate-600 whitespace-pre-line break-words">{current.message}</div>}
                </div>
                <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 hover:bg-slate-50 p-1.5 rounded-full transition-all active:scale-90"><X size={16} /></button>
              </div>

              {current.kind === 'prompt' && (
                <div className="px-6 pt-3">
                  <input ref={inputRef} value={inputVal} placeholder={current.placeholder || ''} onChange={e => setInputVal(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10" />
                </div>
              )}

              <div className="mt-5 flex items-center justify-end gap-2 px-6 py-4 bg-slate-50/60 border-t border-slate-100">
                {current.kind !== 'alert' && (
                  <Button variant="outline" size="sm" onClick={onCancel}>{current.cancelText || 'Cancel'}</Button>
                )}
                <Button data-dialog-confirm variant={confirmBtnVariant(v)} size="sm" onClick={onConfirm}>{current.confirmText || (current.kind === 'alert' ? 'Close' : 'Confirm')}</Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toasts */}
      <div className="fixed top-4 right-4 z-[130] flex flex-col gap-2 w-[min(92vw,360px)] pointer-events-none">
        <AnimatePresence>
          {toasts.map(t => (
            <motion.div key={t.id} layout initial={{ opacity: 0, x: 40, scale: 0.96 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 40, scale: 0.96 }}
              transition={{ type: 'spring', duration: 0.3, bounce: 0.2 }}
              className={`pointer-events-auto flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 shadow-lg ${TOAST_CFG[t.type].cls}`}>
              <span className="shrink-0 mt-0.5">{TOAST_CFG[t.type].icon}</span>
              <p className="text-[13px] font-semibold leading-snug flex-1 whitespace-pre-line break-words">{t.message}</p>
              <button onClick={() => setToasts(list => list.filter(x => x.id !== t.id))} className="shrink-0 opacity-50 hover:opacity-100"><X size={14} /></button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </>,
    document.body
  );
};

export default DialogHost;
