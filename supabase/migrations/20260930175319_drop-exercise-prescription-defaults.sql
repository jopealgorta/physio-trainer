ALTER TABLE "exercises" DROP CONSTRAINT "exercises_sets_range";--> statement-breakpoint
ALTER TABLE "exercises" DROP CONSTRAINT "exercises_reps_range";--> statement-breakpoint
ALTER TABLE "exercises" DROP CONSTRAINT "exercises_reps_max_range";--> statement-breakpoint
ALTER TABLE "exercises" DROP CONSTRAINT "exercises_duration_seconds_range";--> statement-breakpoint
ALTER TABLE "exercises" DROP CONSTRAINT "exercises_hold_seconds_range";--> statement-breakpoint
ALTER TABLE "exercises" DROP CONSTRAINT "exercises_rest_seconds_range";--> statement-breakpoint
ALTER TABLE "exercises" DROP CONSTRAINT "exercises_reps_range_order";--> statement-breakpoint
ALTER TABLE "exercises" DROP CONSTRAINT "exercises_load_length";--> statement-breakpoint
ALTER TABLE "exercises" DROP CONSTRAINT "exercises_notes_length";--> statement-breakpoint
ALTER TABLE "exercises" DROP COLUMN "sets";--> statement-breakpoint
ALTER TABLE "exercises" DROP COLUMN "reps";--> statement-breakpoint
ALTER TABLE "exercises" DROP COLUMN "reps_max";--> statement-breakpoint
ALTER TABLE "exercises" DROP COLUMN "duration_seconds";--> statement-breakpoint
ALTER TABLE "exercises" DROP COLUMN "hold_seconds";--> statement-breakpoint
ALTER TABLE "exercises" DROP COLUMN "rest_seconds";--> statement-breakpoint
ALTER TABLE "exercises" DROP COLUMN "load";--> statement-breakpoint
ALTER TABLE "exercises" DROP COLUMN "side";--> statement-breakpoint
ALTER TABLE "exercises" DROP COLUMN "notes";