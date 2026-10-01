ALTER TABLE "routines" ADD COLUMN "phase_label" text;--> statement-breakpoint
ALTER TABLE "routines" ADD COLUMN "starts_on" date;--> statement-breakpoint
ALTER TABLE "routines" ADD COLUMN "ends_on" date;--> statement-breakpoint
ALTER TABLE "routines" ADD COLUMN "previous_id" uuid;--> statement-breakpoint
ALTER TABLE "weekly_plans" ADD COLUMN "phase_label" text;--> statement-breakpoint
ALTER TABLE "weekly_plans" ADD COLUMN "starts_on" date;--> statement-breakpoint
ALTER TABLE "weekly_plans" ADD COLUMN "ends_on" date;--> statement-breakpoint
ALTER TABLE "weekly_plans" ADD COLUMN "previous_id" uuid;--> statement-breakpoint
CREATE INDEX "routines_previous_idx" ON "routines" USING btree ("physio_id","previous_id");--> statement-breakpoint
CREATE INDEX "weekly_plans_previous_idx" ON "weekly_plans" USING btree ("physio_id","previous_id");--> statement-breakpoint
ALTER TABLE "routines" ADD CONSTRAINT "routines_phase_label_length" CHECK (char_length("routines"."phase_label") between 1 and 40);--> statement-breakpoint
ALTER TABLE "routines" ADD CONSTRAINT "routines_phase_window" CHECK ("routines"."ends_on" >= "routines"."starts_on");--> statement-breakpoint
ALTER TABLE "routines" ADD CONSTRAINT "routines_previous_not_self" CHECK ("routines"."previous_id" <> "routines"."id");--> statement-breakpoint
ALTER TABLE "weekly_plans" ADD CONSTRAINT "weekly_plans_phase_label_length" CHECK (char_length("weekly_plans"."phase_label") between 1 and 40);--> statement-breakpoint
ALTER TABLE "weekly_plans" ADD CONSTRAINT "weekly_plans_phase_window" CHECK ("weekly_plans"."ends_on" >= "weekly_plans"."starts_on");--> statement-breakpoint
ALTER TABLE "weekly_plans" ADD CONSTRAINT "weekly_plans_previous_not_self" CHECK ("weekly_plans"."previous_id" <> "weekly_plans"."id");