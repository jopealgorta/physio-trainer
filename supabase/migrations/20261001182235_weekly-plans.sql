CREATE TABLE "weekly_plan_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"physio_id" uuid NOT NULL,
	"weekly_plan_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"routine_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weekly_plan_entries_weekday" CHECK ("weekly_plan_entries"."weekday" between 1 and 7),
	CONSTRAINT "weekly_plan_entries_position" CHECK ("weekly_plan_entries"."position" >= 0),
	CONSTRAINT "weekly_plan_entries_label_length" CHECK (char_length("weekly_plan_entries"."label") between 1 and 40)
);
--> statement-breakpoint
ALTER TABLE "weekly_plan_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "weekly_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"physio_id" uuid NOT NULL,
	"customer_id" uuid,
	"case_id" uuid,
	"name" text NOT NULL,
	"notes" text,
	"status" "routine_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weekly_plans_physio_id_id_unique" UNIQUE("physio_id","id"),
	CONSTRAINT "weekly_plans_name_length" CHECK (char_length("weekly_plans"."name") between 1 and 80),
	CONSTRAINT "weekly_plans_notes_length" CHECK (char_length("weekly_plans"."notes") <= 2000),
	CONSTRAINT "weekly_plans_version_positive" CHECK ("weekly_plans"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "weekly_plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "weekly_plan_entries" ADD CONSTRAINT "weekly_plan_entries_physio_id_physios_id_fk" FOREIGN KEY ("physio_id") REFERENCES "public"."physios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_plan_entries" ADD CONSTRAINT "weekly_plan_entries_plan_fk" FOREIGN KEY ("physio_id","weekly_plan_id") REFERENCES "public"."weekly_plans"("physio_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_plan_entries" ADD CONSTRAINT "weekly_plan_entries_routine_fk" FOREIGN KEY ("physio_id","routine_id") REFERENCES "public"."routines"("physio_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_plans" ADD CONSTRAINT "weekly_plans_physio_id_physios_id_fk" FOREIGN KEY ("physio_id") REFERENCES "public"."physios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_plans" ADD CONSTRAINT "weekly_plans_customer_fk" FOREIGN KEY ("physio_id","customer_id") REFERENCES "public"."customers"("physio_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "weekly_plan_entries_plan_idx" ON "weekly_plan_entries" USING btree ("physio_id","weekly_plan_id","weekday","position");--> statement-breakpoint
CREATE INDEX "weekly_plan_entries_routine_idx" ON "weekly_plan_entries" USING btree ("physio_id","routine_id");--> statement-breakpoint
CREATE INDEX "weekly_plans_customer_idx" ON "weekly_plans" USING btree ("physio_id","customer_id","status");--> statement-breakpoint
CREATE POLICY "weekly_plan_entries_own" ON "weekly_plan_entries" AS PERMISSIVE FOR ALL TO "authenticated" USING ("weekly_plan_entries"."physio_id" = (select auth.uid())) WITH CHECK ("weekly_plan_entries"."physio_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "weekly_plans_own" ON "weekly_plans" AS PERMISSIVE FOR ALL TO "authenticated" USING ("weekly_plans"."physio_id" = (select auth.uid())) WITH CHECK ("weekly_plans"."physio_id" = (select auth.uid()));