CREATE TABLE public.user_skills (
  id text PRIMARY KEY NOT NULL,
  owner_email text NOT NULL REFERENCES public.users(email) ON DELETE CASCADE,
  skill_key text NOT NULL,
  skill_name text NOT NULL,
  proficiency_level text NOT NULL DEFAULT 'unknown'
    CHECK (proficiency_level IN ('unknown', 'beginner', 'developing', 'competent', 'advanced')),
  confidence_level text NOT NULL DEFAULT 'low'
    CHECK (confidence_level IN ('low', 'medium', 'high')),
  evidence_count integer NOT NULL DEFAULT 0 CHECK (evidence_count >= 0),
  last_evidence_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uniq_user_skills_owner_skill UNIQUE (owner_email, skill_key)
);
--> statement-breakpoint
ALTER TABLE public.user_skills ENABLE ROW LEVEL SECURITY;
