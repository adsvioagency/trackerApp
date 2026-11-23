CREATE TABLE "goal_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal_id" uuid NOT NULL,
	"title" text NOT NULL,
	"due_date" date,
	"position" integer NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracked_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"workspace" "workspace" NOT NULL,
	"year" integer NOT NULL,
	"area" text NOT NULL,
	"title" text NOT NULL,
	"motivation" text,
	"outcome" text,
	"due_date" date,
	"completed_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "goal_milestones" ADD CONSTRAINT "goal_milestones_goal_id_tracked_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."tracked_goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracked_goals" ADD CONSTRAINT "tracked_goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "goal_milestones_goal" ON "goal_milestones" USING btree ("goal_id");--> statement-breakpoint
CREATE INDEX "tracked_goals_owner_year" ON "tracked_goals" USING btree ("user_id","year","workspace");