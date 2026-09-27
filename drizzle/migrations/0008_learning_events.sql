CREATE TABLE public.learning_events (
  id text PRIMARY KEY NOT NULL,
  owner_email text NOT NULL REFERENCES public.users(email) ON DELETE CASCADE,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  roadmap_id text REFERENCES public.roadmaps(id) ON DELETE SET NULL,
  phase_id text REFERENCES public.phases(id) ON DELETE SET NULL,
  module_id text REFERENCES public.modules(id) ON DELETE SET NULL,
  lesson_id text REFERENCES public.lessons(id) ON DELETE SET NULL,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX idx_learning_events_owner_occurred ON public.learning_events (owner_email, occurred_at);
--> statement-breakpoint
CREATE INDEX idx_learning_events_owner_type_occurred ON public.learning_events (owner_email, event_type, occurred_at);
--> statement-breakpoint
ALTER TABLE public.learning_events ENABLE ROW LEVEL SECURITY;
