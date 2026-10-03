CREATE TYPE "public"."exercise_kind" AS ENUM('strength', 'aerobic');--> statement-breakpoint
ALTER TABLE "routine_item_sets" DROP CONSTRAINT "routine_item_sets_duration_seconds_range";--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "kind" "exercise_kind" DEFAULT 'strength' NOT NULL;--> statement-breakpoint
ALTER TABLE "routine_item_sets" ADD COLUMN "distance_meters" integer;--> statement-breakpoint
ALTER TABLE "routine_item_sets" ADD COLUMN "intensity" text;--> statement-breakpoint
ALTER TABLE "routine_item_sets" ADD CONSTRAINT "routine_item_sets_distance_meters_range" CHECK ("routine_item_sets"."distance_meters" between 1 and 200000);--> statement-breakpoint
ALTER TABLE "routine_item_sets" ADD CONSTRAINT "routine_item_sets_intensity_length" CHECK (char_length("routine_item_sets"."intensity") <= 40);--> statement-breakpoint
ALTER TABLE "routine_item_sets" ADD CONSTRAINT "routine_item_sets_duration_seconds_range" CHECK ("routine_item_sets"."duration_seconds" between 1 and 14400);