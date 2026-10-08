ALTER TABLE "exercises" DROP CONSTRAINT "exercises_tags_count";--> statement-breakpoint
DROP INDEX "exercises_category_id_idx";--> statement-breakpoint
DROP INDEX "exercises_tags_idx";--> statement-breakpoint
ALTER TABLE "exercises" DROP COLUMN "category_id";--> statement-breakpoint
ALTER TABLE "exercises" DROP COLUMN "tags";