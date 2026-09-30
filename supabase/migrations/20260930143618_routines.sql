CREATE TYPE "public"."routine_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TABLE "routine_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"physio_id" uuid NOT NULL,
	"routine_id" uuid NOT NULL,
	"rest_seconds" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "routine_groups_physio_routine_id_unique" UNIQUE("physio_id","routine_id","id"),
	CONSTRAINT "routine_groups_rest_seconds_range" CHECK ("routine_groups"."rest_seconds" between 1 and 3600)
);
--> statement-breakpoint
ALTER TABLE "routine_groups" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "routine_item_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"physio_id" uuid NOT NULL,
	"routine_item_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"reps" smallint,
	"reps_max" smallint,
	"duration_seconds" integer,
	"load" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "routine_item_sets_position_unique" UNIQUE("physio_id","routine_item_id","position"),
	CONSTRAINT "routine_item_sets_position" CHECK ("routine_item_sets"."position" between 0 and 19),
	CONSTRAINT "routine_item_sets_reps_range" CHECK ("routine_item_sets"."reps" between 1 and 999),
	CONSTRAINT "routine_item_sets_reps_max_range" CHECK ("routine_item_sets"."reps_max" between 1 and 999),
	CONSTRAINT "routine_item_sets_duration_seconds_range" CHECK ("routine_item_sets"."duration_seconds" between 1 and 7200),
	CONSTRAINT "routine_item_sets_reps_range_order" CHECK ("routine_item_sets"."reps_max" is null or ("routine_item_sets"."reps" is not null and "routine_item_sets"."reps_max" > "routine_item_sets"."reps")),
	CONSTRAINT "routine_item_sets_load_length" CHECK (char_length("routine_item_sets"."load") <= 40)
);
--> statement-breakpoint
ALTER TABLE "routine_item_sets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "routine_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"physio_id" uuid NOT NULL,
	"routine_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"group_id" uuid,
	"hold_seconds" smallint,
	"rest_seconds" smallint,
	"side" "prescription_side",
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "routine_items_physio_id_id_unique" UNIQUE("physio_id","id"),
	CONSTRAINT "routine_items_position_unique" UNIQUE("physio_id","routine_id","position"),
	CONSTRAINT "routine_items_position" CHECK ("routine_items"."position" >= 0),
	CONSTRAINT "routine_items_group_no_rest" CHECK ("routine_items"."group_id" is null or "routine_items"."rest_seconds" is null),
	CONSTRAINT "routine_items_hold_seconds_range" CHECK ("routine_items"."hold_seconds" between 1 and 3600),
	CONSTRAINT "routine_items_rest_seconds_range" CHECK ("routine_items"."rest_seconds" between 1 and 3600),
	CONSTRAINT "routine_items_notes_length" CHECK (char_length("routine_items"."notes") <= 500)
);
--> statement-breakpoint
ALTER TABLE "routine_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "routines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"physio_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"case_id" uuid,
	"name" text NOT NULL,
	"notes" text,
	"is_standalone" boolean DEFAULT true NOT NULL,
	"sessions_per_week" smallint,
	"sessions_per_day" smallint,
	"status" "routine_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "routines_physio_id_id_unique" UNIQUE("physio_id","id"),
	CONSTRAINT "routines_name_length" CHECK (char_length("routines"."name") between 1 and 80),
	CONSTRAINT "routines_notes_length" CHECK (char_length("routines"."notes") <= 2000),
	CONSTRAINT "routines_sessions_per_week" CHECK ("routines"."sessions_per_week" between 1 and 14),
	CONSTRAINT "routines_sessions_per_day" CHECK ("routines"."sessions_per_day" between 1 and 5),
	CONSTRAINT "routines_version_positive" CHECK ("routines"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "routines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "routine_groups" ADD CONSTRAINT "routine_groups_physio_id_physios_id_fk" FOREIGN KEY ("physio_id") REFERENCES "public"."physios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_groups" ADD CONSTRAINT "routine_groups_routine_fk" FOREIGN KEY ("physio_id","routine_id") REFERENCES "public"."routines"("physio_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_item_sets" ADD CONSTRAINT "routine_item_sets_physio_id_physios_id_fk" FOREIGN KEY ("physio_id") REFERENCES "public"."physios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_item_sets" ADD CONSTRAINT "routine_item_sets_item_fk" FOREIGN KEY ("physio_id","routine_item_id") REFERENCES "public"."routine_items"("physio_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_items" ADD CONSTRAINT "routine_items_physio_id_physios_id_fk" FOREIGN KEY ("physio_id") REFERENCES "public"."physios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_items" ADD CONSTRAINT "routine_items_routine_fk" FOREIGN KEY ("physio_id","routine_id") REFERENCES "public"."routines"("physio_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_items" ADD CONSTRAINT "routine_items_exercise_fk" FOREIGN KEY ("physio_id","exercise_id") REFERENCES "public"."exercises"("physio_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_items" ADD CONSTRAINT "routine_items_group_fk" FOREIGN KEY ("physio_id","routine_id","group_id") REFERENCES "public"."routine_groups"("physio_id","routine_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routines" ADD CONSTRAINT "routines_physio_id_physios_id_fk" FOREIGN KEY ("physio_id") REFERENCES "public"."physios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routines" ADD CONSTRAINT "routines_customer_fk" FOREIGN KEY ("physio_id","customer_id") REFERENCES "public"."customers"("physio_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "routine_groups_routine_idx" ON "routine_groups" USING btree ("physio_id","routine_id");--> statement-breakpoint
CREATE INDEX "routine_items_routine_idx" ON "routine_items" USING btree ("physio_id","routine_id");--> statement-breakpoint
CREATE INDEX "routines_customer_idx" ON "routines" USING btree ("physio_id","customer_id","status");--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_physio_customer_id_unique" UNIQUE("physio_id","customer_id","id");--> statement-breakpoint
CREATE POLICY "routine_groups_own" ON "routine_groups" AS PERMISSIVE FOR ALL TO "authenticated" USING ("routine_groups"."physio_id" = (select auth.uid())) WITH CHECK ("routine_groups"."physio_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "routine_item_sets_own" ON "routine_item_sets" AS PERMISSIVE FOR ALL TO "authenticated" USING ("routine_item_sets"."physio_id" = (select auth.uid())) WITH CHECK ("routine_item_sets"."physio_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "routine_items_own" ON "routine_items" AS PERMISSIVE FOR ALL TO "authenticated" USING ("routine_items"."physio_id" = (select auth.uid())) WITH CHECK ("routine_items"."physio_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "routines_own" ON "routines" AS PERMISSIVE FOR ALL TO "authenticated" USING ("routines"."physio_id" = (select auth.uid())) WITH CHECK ("routines"."physio_id" = (select auth.uid()));