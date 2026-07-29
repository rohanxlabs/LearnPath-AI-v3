import React, { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'error' | 'success' | 'info';

export interface ToastMessage {
  message: string;
  type: ToastType;
  /** Optional undo callback — renders an "Undo" button in the toast. */
  onUndo?: () => void;
}

interface ToastProps {
  toast: ToastMessage | null;
  onDismiss: () => void;
}

const ICONS: Record<ToastType, React.ReactNode> = {
  error:   <AlertCircle  className="w-4 h-4 flex-shrink-0 text-red-600" />,
  success: <CheckCircle  className="w-4 h-4 flex-shrink-0 text-emerald-600" />,
  info:    <Info         className="w-4 h-4 flex-shrink-0 text-blue-600" />,
};

const BG: Record<ToastType, string> = {
  error:   'bg-red-50 border-red-300 text-red-900',
  success: 'bg-emerald-50 border-emerald-300 text-emerald-900',
  info:    'bg-blue-50 border-blue-300 text-blue-900',
};

export function Toast({ toast, onDismiss }: ToastProps) {
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(onDismiss, 4000);
    return () => clearTimeout(id);
  }, [toast, onDismiss]);

  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          key={toast.message}
          initial={{ opacity: 0, y: 40, scale: 0.95 }}
          animate={{ opacity: 1, y: 0,  scale: 1 }}
          exit={{    opacity: 0, y: 20, scale: 0.95 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className={`fixed bottom-[calc(4rem+env(safe-area-inset-bottom)+12px)] left-1/2 -translate-x-1/2 z-[200] flex items-center gap-2.5 px-4 py-3 rounded-2xl border shadow-xl backdrop-blur-md max-w-sm w-[90vw] md:bottom-8 ${BG[toast.type]}`}
          role="alert"
          aria-live="assertive"
        >
          {ICONS[toast.type]}
          <span className="text-sm font-medium flex-1 leading-snug">{toast.message}</span>
          {toast.onUndo && (
            <button
              onClick={() => { toast.onUndo!(); onDismiss(); }}
              aria-label="Undo"
              className="text-sm font-bold underline underline-offset-2 opacity-80 hover:opacity-100 transition-opacity cursor-pointer shrink-0"
            >
              Undo
            </button>
          )}
          <button
            onClick={onDismiss}
            aria-label="Dismiss notification"
            className="opacity-50 hover:opacity-100 transition-opacity cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
