import React, { useState, useRef, useEffect } from 'react';
import { MessageSquarePlus, X, Send, Smile, Meh, Frown, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

type Sentiment = 'positive' | 'neutral' | 'negative';

interface FeedbackWidgetProps {
  /** Optional context tag (e.g. current page/feature name) */
  context?: string;
  getAuthHeaders?: () => Promise<Record<string, string>>;
}

const SENTIMENT_OPTIONS: Array<{ value: Sentiment; icon: React.ElementType; label: string; color: string }> = [
  { value: 'positive', icon: Smile,  label: 'Love it',    color: 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/15' },
  { value: 'neutral',  icon: Meh,    label: "It's okay",  color: 'text-amber-600  dark:text-amber-400  hover:bg-amber-50  dark:hover:bg-amber-500/15'  },
  { value: 'negative', icon: Frown,  label: 'Not great',  color: 'text-red-600    dark:text-red-400    hover:bg-red-50    dark:hover:bg-red-500/15'    },
];

export function FeedbackWidget({ context, getAuthHeaders }: FeedbackWidgetProps) {
  const [open, setOpen] = useState(false);
  const [sentiment, setSentiment] = useState<Sentiment | null>(null);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on click-outside
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!sentiment) return;
    setSubmitting(true);
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: getAuthHeaders ? await getAuthHeaders() : { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sentiment, message: message.trim(), context: context || window.location.pathname }),
      });
    } catch {
      // Best-effort — don't block the user
    }
    setSubmitting(false);
    setSubmitted(true);
    setTimeout(() => { setOpen(false); setSubmitted(false); setSentiment(null); setMessage(''); }, 2200);
  }

  return (
    <div className="fixed bottom-[5.5rem] right-4 z-50 md:bottom-8">
      <AnimatePresence>
        {open && (
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, scale: 0.9, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 12 }}
            transition={{ duration: 0.18 }}
            className="mb-3 w-72 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 rounded-2xl shadow-xl dark:shadow-2xl overflow-hidden"
          >
            {submitted ? (
              <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
                <CheckCircle className="w-10 h-10 text-emerald-500 dark:text-emerald-400" />
                <p className="text-sm font-semibold text-gray-900 dark:text-white">Thanks for your feedback!</p>
                <p className="text-xs text-gray-500 dark:text-zinc-500">Your input helps us improve.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-white/8">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">Share feedback</p>
                  <button type="button" onClick={() => setOpen(false)} className="text-gray-400 dark:text-zinc-500 hover:text-gray-700 dark:hover:text-white transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-4 space-y-4">
                  <div>
                    <p className="text-xs text-gray-500 dark:text-zinc-500 mb-2">How is your experience?</p>
                    <div className="flex gap-2">
                      {SENTIMENT_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setSentiment(opt.value)}
                          className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-xl border text-xs font-medium transition-all ${
                            sentiment === opt.value
                              ? 'border-purple-500 bg-purple-50 dark:bg-purple-500/15 text-purple-700 dark:text-white'
                              : `border-zinc-200 dark:border-white/10 ${opt.color}`
                          }`}
                        >
                          <opt.icon className="w-5 h-5" />
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-gray-500 dark:text-zinc-500 mb-2">Tell us more (optional)</p>
                    <textarea
                      value={message}
                      onChange={e => setMessage(e.target.value)}
                      placeholder="What can we improve?"
                      rows={3}
                      maxLength={500}
                      className="w-full bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-xl px-3 py-2 text-xs text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-zinc-600 resize-none focus:outline-none focus:border-purple-500 dark:focus:border-purple-500 transition-colors"
                    />
                  </div>

                  <p className="text-[10px] text-gray-400 dark:text-zinc-600 text-center leading-snug">
                    Your feedback is stored to help us improve the product.
                  </p>

                  <button
                    type="submit"
                    disabled={!sentiment || submitting}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-br from-purple-500 to-blue-600 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition-all"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {submitting ? 'Sending…' : 'Send Feedback'}
                  </button>
                </div>
              </form>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        onClick={() => setOpen(o => !o)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="w-12 h-12 rounded-full bg-white border border-zinc-200 shadow-[0_4px_20px_rgba(0,0,0,0.35)] flex items-center justify-center text-purple-600 hover:bg-zinc-50 transition-all"
        aria-label={open ? 'Close feedback' : 'Share feedback'}
      >
        {open ? <X className="w-5 h-5" /> : <MessageSquarePlus className="w-5 h-5" />}
      </motion.button>
    </div>
  );
}
