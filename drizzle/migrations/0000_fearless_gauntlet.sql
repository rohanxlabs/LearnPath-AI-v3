CREATE TABLE "assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"lesson_id" text NOT NULL,
	"module_id" text NOT NULL,
	"phase_id" text NOT NULL,
	"roadmap_id" text NOT NULL,
	"title" text NOT NULL,
	"instructions" text,
	"template_code" text,
	"solution_code" text,
	"validation_snippet" text,
	"hint" text,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lesson_content" (
	"lesson_id" text PRIMARY KEY NOT NULL,
	"markdown_content" text,
	"worked_examples" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"exercises" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"summary" text,
	"generated_at" timestamp,
	"model_used" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lessons" (
	"id" text PRIMARY KEY NOT NULL,
	"module_id" text NOT NULL,
	"phase_id" text NOT NULL,
	"roadmap_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"type" text DEFAULT 'learn' NOT NULL,
	"xp_reward" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'locked' NOT NULL,
	"learning_objectives" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"prerequisites" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"difficulty" text,
	"estimated_minutes" integer,
	"skill_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"content_status" text DEFAULT 'pending' NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "modules" (
	"id" text PRIMARY KEY NOT NULL,
	"phase_id" text NOT NULL,
	"roadmap_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text,
	"status" text DEFAULT 'current' NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "phase_projects" (
	"id" text PRIMARY KEY NOT NULL,
	"roadmap_id" text NOT NULL,
	"phase_id" text,
	"title" text NOT NULL,
	"difficulty" text DEFAULT 'beginner' NOT NULL,
	"description" text,
	"tech_stack" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"github_url" text,
	"progress" integer DEFAULT 0 NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "phases" (
	"id" text PRIMARY KEY NOT NULL,
	"roadmap_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"estimated_hours" integer,
	"skills_covered" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"xp_earned" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'current' NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quizzes" (
	"id" text PRIMARY KEY NOT NULL,
	"lesson_id" text NOT NULL,
	"module_id" text NOT NULL,
	"phase_id" text NOT NULL,
	"roadmap_id" text NOT NULL,
	"title" text NOT NULL,
	"questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resources" (
	"id" text PRIMARY KEY NOT NULL,
	"roadmap_id" text NOT NULL,
	"phase_id" text,
	"module_id" text,
	"title" text NOT NULL,
	"type" text DEFAULT 'article' NOT NULL,
	"provider" text,
	"url" text,
	"description" text,
	"duration" text,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roadmaps" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_email" text NOT NULL,
	"title" text NOT NULL,
	"goal" text NOT NULL,
	"experience_level" text,
	"weekly_hours" integer,
	"preferred_style" text,
	"college" text,
	"branch" text,
	"year" text,
	"progress_percent" integer DEFAULT 0 NOT NULL,
	"total_xp" integer DEFAULT 0 NOT NULL,
	"lessons_completed" integer DEFAULT 0 NOT NULL,
	"hours_remaining" integer,
	"status" text DEFAULT 'current' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_lesson_progress" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_email" text NOT NULL,
	"roadmap_id" text NOT NULL,
	"lesson_id" text NOT NULL,
	"module_id" text NOT NULL,
	"phase_id" text NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp,
	"attempts" integer DEFAULT 0 NOT NULL,
	"quiz_score" integer,
	"study_minutes" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"email" text PRIMARY KEY NOT NULL,
	"password_hash" text,
	"roadmap" jsonb,
	"progress" jsonb,
	"xp" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_phase_id_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."phases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_roadmap_id_roadmaps_id_fk" FOREIGN KEY ("roadmap_id") REFERENCES "public"."roadmaps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_content" ADD CONSTRAINT "lesson_content_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_phase_id_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."phases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_roadmap_id_roadmaps_id_fk" FOREIGN KEY ("roadmap_id") REFERENCES "public"."roadmaps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modules" ADD CONSTRAINT "modules_phase_id_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."phases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modules" ADD CONSTRAINT "modules_roadmap_id_roadmaps_id_fk" FOREIGN KEY ("roadmap_id") REFERENCES "public"."roadmaps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phase_projects" ADD CONSTRAINT "phase_projects_roadmap_id_roadmaps_id_fk" FOREIGN KEY ("roadmap_id") REFERENCES "public"."roadmaps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phase_projects" ADD CONSTRAINT "phase_projects_phase_id_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."phases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phases" ADD CONSTRAINT "phases_roadmap_id_roadmaps_id_fk" FOREIGN KEY ("roadmap_id") REFERENCES "public"."roadmaps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_phase_id_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."phases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_roadmap_id_roadmaps_id_fk" FOREIGN KEY ("roadmap_id") REFERENCES "public"."roadmaps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_roadmap_id_roadmaps_id_fk" FOREIGN KEY ("roadmap_id") REFERENCES "public"."roadmaps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_phase_id_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."phases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roadmaps" ADD CONSTRAINT "roadmaps_owner_email_users_email_fk" FOREIGN KEY ("owner_email") REFERENCES "public"."users"("email") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_lesson_progress" ADD CONSTRAINT "user_lesson_progress_owner_email_users_email_fk" FOREIGN KEY ("owner_email") REFERENCES "public"."users"("email") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_lesson_progress" ADD CONSTRAINT "user_lesson_progress_roadmap_id_roadmaps_id_fk" FOREIGN KEY ("roadmap_id") REFERENCES "public"."roadmaps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_lesson_progress" ADD CONSTRAINT "user_lesson_progress_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_lesson_progress" ADD CONSTRAINT "user_lesson_progress_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_lesson_progress" ADD CONSTRAINT "user_lesson_progress_phase_id_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."phases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_assignments_lesson" ON "assignments" USING btree ("lesson_id");--> statement-breakpoint
CREATE INDEX "idx_assignments_roadmap" ON "assignments" USING btree ("roadmap_id");--> statement-breakpoint
CREATE INDEX "idx_lessons_module" ON "lessons" USING btree ("module_id","order_index");--> statement-breakpoint
CREATE INDEX "idx_lessons_roadmap" ON "lessons" USING btree ("roadmap_id");--> statement-breakpoint
CREATE INDEX "idx_modules_phase" ON "modules" USING btree ("phase_id","order_index");--> statement-breakpoint
CREATE INDEX "idx_modules_roadmap" ON "modules" USING btree ("roadmap_id");--> statement-breakpoint
CREATE INDEX "idx_phase_projects_roadmap" ON "phase_projects" USING btree ("roadmap_id");--> statement-breakpoint
CREATE INDEX "idx_phases_roadmap" ON "phases" USING btree ("roadmap_id","order_index");--> statement-breakpoint
CREATE INDEX "idx_quizzes_lesson" ON "quizzes" USING btree ("lesson_id");--> statement-breakpoint
CREATE INDEX "idx_quizzes_roadmap" ON "quizzes" USING btree ("roadmap_id");--> statement-breakpoint
CREATE INDEX "idx_resources_roadmap" ON "resources" USING btree ("roadmap_id");--> statement-breakpoint
CREATE INDEX "idx_resources_phase" ON "resources" USING btree ("phase_id");--> statement-breakpoint
CREATE INDEX "idx_progress_owner" ON "user_lesson_progress" USING btree ("owner_email");--> statement-breakpoint
CREATE INDEX "idx_progress_lesson" ON "user_lesson_progress" USING btree ("lesson_id");--> statement-breakpoint
CREATE INDEX "idx_progress_roadmap" ON "user_lesson_progress" USING btree ("roadmap_id","owner_email");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_progress_owner_lesson" ON "user_lesson_progress" USING btree ("owner_email","lesson_id");