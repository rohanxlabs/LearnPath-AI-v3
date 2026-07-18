CREATE TABLE "user_roadmap_state" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_email" text NOT NULL,
	"roadmap_id" text NOT NULL,
	"current_lesson_id" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_roadmap_state" ADD CONSTRAINT "user_roadmap_state_owner_email_users_email_fk" FOREIGN KEY ("owner_email") REFERENCES "public"."users"("email") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roadmap_state" ADD CONSTRAINT "user_roadmap_state_roadmap_id_roadmaps_id_fk" FOREIGN KEY ("roadmap_id") REFERENCES "public"."roadmaps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_roadmap_state_owner" ON "user_roadmap_state" USING btree ("owner_email");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_roadmap_state_owner" ON "user_roadmap_state" USING btree ("owner_email","roadmap_id");