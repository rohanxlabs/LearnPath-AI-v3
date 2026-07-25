-- Persist authenticated product feedback. This table was previously referenced
-- by the API and RLS migration but was absent from the migration chain.
CREATE TABLE IF NOT EXISTS public.feedback (
  id bigserial PRIMARY KEY,
  user_email text NOT NULL REFERENCES public.users(email) ON DELETE CASCADE,
  sentiment text NOT NULL CHECK (sentiment IN ('positive', 'neutral', 'negative')),
  message text NOT NULL DEFAULT '',
  context text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_feedback_user_created_at
  ON public.feedback (user_email, created_at DESC);--> statement-breakpoint
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
