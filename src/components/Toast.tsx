import React, { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'error' | 'success' | 'info';

export interface ToastMessage {
  message: string;
  type: ToastType;
}

interface ToastProps {
  toast: ToastMessage | null;
  onDismiss: () => void;
}

const ICONS: Record<ToastType, React.ReactNode> = {
  error:   <AlertCircle  className="w-4 h-4 flex-shrink-0 text-red-400" />,
  success: <CheckCircle  className="w-4 h-4 flex-shrink-0 text-emerald-400" />,
  info:    <Info         className="w-4 h-4 flex-shrink-0 text-blue-400" />,
};

const BG: Record<ToastType, string> = {
  error:   'bg-red-50 dark:bg-[#1c0505] border-red-300 dark:border-red-500/40 text-red-900 dark:text-white',
  success: 'bg-emerald-50 dark:bg-[#031a0a] border-emerald-300 dark:border-emerald-500/40 text-emerald-900 dark:text-white',
  info:    'bg-blue-50 dark:bg-[#030d1c] border-blue-300 dark:border-blue-500/40 text-blue-900 dark:text-white',
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
          className={`fixed bottom-[5.5rem] left-1/2 -translate-x-1/2 z-[200] flex items-center gap-2.5 px-4 py-3 rounded-2xl border shadow-xl backdrop-blur-md max-w-sm w-[90vw] md:bottom-8 ${BG[toast.type]}`}
          role="alert"
          aria-live="assertive"
        >
          {ICONS[toast.type]}
          <span className="text-sm font-medium flex-1 leading-snug">{toast.message}</span>
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
