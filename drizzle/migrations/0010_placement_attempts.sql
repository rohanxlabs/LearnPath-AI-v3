CREATE TABLE public.placement_attempts (
  id text PRIMARY KEY NOT NULL,
  owner_email text NOT NULL REFERENCES public.users(email) ON DELETE CASCADE,
  roadmap_id text NOT NULL REFERENCES public.roadmaps(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'started'
    CHECK (status IN ('started', 'completed')),
  questions jsonb NOT NULL,
  responses jsonb,
  result jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT uniq_placement_attempt_owner_key UNIQUE (owner_email, idempotency_key)
);
--> statement-breakpoint
CREATE INDEX idx_placement_attempt_owner_started
  ON public.placement_attempts (owner_email, started_at DESC);
--> statement-breakpoint
ALTER TABLE public.placement_attempts ENABLE ROW LEVEL SECURITY;
