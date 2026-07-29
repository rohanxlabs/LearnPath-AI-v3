import React, { useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Trash2, X } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface ConfirmDialogProps {
  /** Whether the dialog is visible. */
  open: boolean;
  /** Title shown at the top of the dialog. */
  title: string;
  /** Body message explaining what will happen. */
  message: string;
  /** Label for the confirm/destructive button. */
  confirmLabel?: string;
  /** Called when the user confirms. */
  onConfirm: () => void;
  /** Called when the user cancels or clicks outside. */
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open);

  // Close on ESC
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onCancel]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[180] bg-black/60 backdrop-blur-sm"
            onClick={onCancel}
            aria-hidden="true"
          />

          {/* Dialog panel */}
          <motion.div
            key="panel"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-message"
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 10 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="fixed inset-0 z-[181] flex items-center justify-center p-4 pointer-events-none"
          >
            <div
              ref={dialogRef}
              tabIndex={-1}
              className="pointer-events-auto w-full max-w-sm rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#161616]/95 backdrop-blur-md p-6 shadow-[0_16px_48px_rgba(0,0,0,0.18)] dark:shadow-[0_16px_48px_rgba(0,0,0,0.4)] outline-none"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center flex-shrink-0">
                    <Trash2 className="w-5 h-5 text-red-400" />
                  </div>
                  <h3 id="confirm-title" className="text-base font-bold text-zinc-900 dark:text-white">{title}</h3>
                </div>
                <button
                  onClick={onCancel}
                  aria-label="Cancel"
                  className="p-1.5 -mr-1 text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <p id="confirm-message" className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed mb-6">{message}</p>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={onCancel}
                  className="flex-1 py-2.5 rounded-xl border border-zinc-200 dark:border-white/10 text-sm font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={onConfirm}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-sm font-bold text-white transition-colors cursor-pointer shadow-[0_4px_12px_rgba(220,38,38,0.4)]"
                >
                  {confirmLabel}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
