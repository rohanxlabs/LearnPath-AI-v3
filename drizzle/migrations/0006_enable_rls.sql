-- The application accesses product data exclusively through its authenticated
-- Express API.  Do not grant direct PostgREST access to these tables: the
-- backend connects as the database owner and bypasses RLS.
--
-- Enabling RLS with no public policies denies anon/authenticated API access
-- by default, closing the externally exposed-table findings from Supabase.

ALTER TABLE public."session" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.phases ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.roadmaps ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.lesson_content ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.phase_projects ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.user_lesson_progress ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.user_roadmap_state ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
