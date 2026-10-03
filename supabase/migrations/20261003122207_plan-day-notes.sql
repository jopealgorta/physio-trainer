CREATE TABLE "weekly_plan_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"physio_id" uuid NOT NULL,
	"weekly_plan_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"notes" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weekly_plan_days_plan_weekday_unique" UNIQUE("physio_id","weekly_plan_id","weekday"),
	CONSTRAINT "weekly_plan_days_weekday" CHECK ("weekly_plan_days"."weekday" between 1 and 7),
	CONSTRAINT "weekly_plan_days_notes_length" CHECK (char_length("weekly_plan_days"."notes") between 1 and 500)
);
--> statement-breakpoint
ALTER TABLE "weekly_plan_days" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "weekly_plan_days" ADD CONSTRAINT "weekly_plan_days_physio_id_physios_id_fk" FOREIGN KEY ("physio_id") REFERENCES "public"."physios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_plan_days" ADD CONSTRAINT "weekly_plan_days_plan_fk" FOREIGN KEY ("physio_id","weekly_plan_id") REFERENCES "public"."weekly_plans"("physio_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "weekly_plan_days_own" ON "weekly_plan_days" AS PERMISSIVE FOR ALL TO "authenticated" USING ("weekly_plan_days"."physio_id" = (select auth.uid())) WITH CHECK ("weekly_plan_days"."physio_id" = (select auth.uid()));