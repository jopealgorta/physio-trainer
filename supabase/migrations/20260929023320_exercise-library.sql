CREATE TYPE "public"."exercise_media_kind" AS ENUM('youtube');--> statement-breakpoint
CREATE TYPE "public"."prescription_side" AS ENUM('left', 'right', 'both', 'alternating');--> statement-breakpoint
CREATE TABLE "exercise_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"physio_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exercise_categories_physio_id_id_unique" UNIQUE("physio_id","id"),
	CONSTRAINT "exercise_categories_name_length" CHECK (char_length("exercise_categories"."name") between 1 and 60),
	CONSTRAINT "exercise_categories_not_own_parent" CHECK ("exercise_categories"."parent_id" <> "exercise_categories"."id"),
	CONSTRAINT "exercise_categories_position" CHECK ("exercise_categories"."position" >= 0)
);
--> statement-breakpoint
ALTER TABLE "exercise_categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "exercise_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"physio_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"kind" "exercise_media_kind" NOT NULL,
	"external_url" text NOT NULL,
	"external_id" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exercise_media_position_unique" UNIQUE("physio_id","exercise_id","position"),
	CONSTRAINT "exercise_media_position" CHECK ("exercise_media"."position" between 0 and 9),
	CONSTRAINT "exercise_media_youtube_id" CHECK ("exercise_media"."kind" <> 'youtube' or "exercise_media"."external_id" ~ '^[A-Za-z0-9_-]{11}$')
);
--> statement-breakpoint
ALTER TABLE "exercise_media" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"physio_id" uuid NOT NULL,
	"category_id" uuid,
	"name" text NOT NULL,
	"instructions" text,
	"body_areas" "body_area"[] DEFAULT '{}' NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"sets" smallint,
	"reps" smallint,
	"reps_max" smallint,
	"duration_seconds" integer,
	"hold_seconds" smallint,
	"rest_seconds" smallint,
	"load" text,
	"side" "prescription_side",
	"notes" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exercises_physio_id_id_unique" UNIQUE("physio_id","id"),
	CONSTRAINT "exercises_name_length" CHECK (char_length("exercises"."name") between 1 and 120),
	CONSTRAINT "exercises_instructions_length" CHECK (char_length("exercises"."instructions") <= 5000),
	CONSTRAINT "exercises_tags_count" CHECK (cardinality("exercises"."tags") <= 20),
	CONSTRAINT "exercises_sets_range" CHECK ("exercises"."sets" between 1 and 99),
	CONSTRAINT "exercises_reps_range" CHECK ("exercises"."reps" between 1 and 999),
	CONSTRAINT "exercises_reps_max_range" CHECK ("exercises"."reps_max" between 1 and 999),
	CONSTRAINT "exercises_duration_seconds_range" CHECK ("exercises"."duration_seconds" between 1 and 7200),
	CONSTRAINT "exercises_hold_seconds_range" CHECK ("exercises"."hold_seconds" between 1 and 3600),
	CONSTRAINT "exercises_rest_seconds_range" CHECK ("exercises"."rest_seconds" between 1 and 3600),
	CONSTRAINT "exercises_reps_range_order" CHECK ("exercises"."reps_max" is null or ("exercises"."reps" is not null and "exercises"."reps_max" > "exercises"."reps")),
	CONSTRAINT "exercises_load_length" CHECK (char_length("exercises"."load") <= 40),
	CONSTRAINT "exercises_notes_length" CHECK (char_length("exercises"."notes") <= 500)
);
--> statement-breakpoint
ALTER TABLE "exercises" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "exercise_categories" ADD CONSTRAINT "exercise_categories_physio_id_physios_id_fk" FOREIGN KEY ("physio_id") REFERENCES "public"."physios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_categories" ADD CONSTRAINT "exercise_categories_parent_fk" FOREIGN KEY ("physio_id","parent_id") REFERENCES "public"."exercise_categories"("physio_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_media" ADD CONSTRAINT "exercise_media_physio_id_physios_id_fk" FOREIGN KEY ("physio_id") REFERENCES "public"."physios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_media" ADD CONSTRAINT "exercise_media_exercise_fk" FOREIGN KEY ("physio_id","exercise_id") REFERENCES "public"."exercises"("physio_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_physio_id_physios_id_fk" FOREIGN KEY ("physio_id") REFERENCES "public"."physios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "exercise_categories_name_unique" ON "exercise_categories" USING btree ("physio_id",coalesce("parent_id", '00000000-0000-0000-0000-000000000000'::uuid),lower("name"));--> statement-breakpoint
CREATE INDEX "exercise_categories_parent_id_idx" ON "exercise_categories" USING btree ("physio_id","parent_id");--> statement-breakpoint
CREATE INDEX "exercise_media_physio_exercise_idx" ON "exercise_media" USING btree ("physio_id","exercise_id");--> statement-breakpoint
CREATE INDEX "exercises_physio_id_archived_at_idx" ON "exercises" USING btree ("physio_id","archived_at");--> statement-breakpoint
CREATE INDEX "exercises_category_id_idx" ON "exercises" USING btree ("physio_id","category_id");--> statement-breakpoint
CREATE INDEX "exercises_body_areas_idx" ON "exercises" USING gin ("body_areas");--> statement-breakpoint
CREATE INDEX "exercises_tags_idx" ON "exercises" USING gin ("tags");--> statement-breakpoint
CREATE POLICY "exercise_categories_own" ON "exercise_categories" AS PERMISSIVE FOR ALL TO "authenticated" USING ("exercise_categories"."physio_id" = (select auth.uid())) WITH CHECK ("exercise_categories"."physio_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "exercise_media_own" ON "exercise_media" AS PERMISSIVE FOR ALL TO "authenticated" USING ("exercise_media"."physio_id" = (select auth.uid())) WITH CHECK ("exercise_media"."physio_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "exercises_own" ON "exercises" AS PERMISSIVE FOR ALL TO "authenticated" USING ("exercises"."physio_id" = (select auth.uid())) WITH CHECK ("exercises"."physio_id" = (select auth.uid()));