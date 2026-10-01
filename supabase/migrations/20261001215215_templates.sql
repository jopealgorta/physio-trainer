ALTER TABLE "routines" ALTER COLUMN "customer_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "routines" ADD COLUMN "is_template" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "routines" ADD COLUMN "source_template_id" uuid;--> statement-breakpoint
ALTER TABLE "weekly_plans" ADD COLUMN "is_template" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "weekly_plans" ADD COLUMN "source_template_id" uuid;--> statement-breakpoint
CREATE INDEX "routines_template_idx" ON "routines" USING btree ("physio_id","is_template","status");--> statement-breakpoint
CREATE INDEX "weekly_plans_template_idx" ON "weekly_plans" USING btree ("physio_id","is_template","status");--> statement-breakpoint
ALTER TABLE "routines" ADD CONSTRAINT "routines_template_customer" CHECK ("routines"."is_template" = ("routines"."customer_id" is null));--> statement-breakpoint
ALTER TABLE "routines" ADD CONSTRAINT "routines_template_not_draft" CHECK (not "routines"."is_template" or "routines"."status" <> 'draft');--> statement-breakpoint
ALTER TABLE "routines" ADD CONSTRAINT "routines_case_needs_customer" CHECK ("routines"."case_id" is null or "routines"."customer_id" is not null);--> statement-breakpoint
ALTER TABLE "weekly_plans" ADD CONSTRAINT "weekly_plans_template_customer" CHECK ("weekly_plans"."is_template" = ("weekly_plans"."customer_id" is null));--> statement-breakpoint
ALTER TABLE "weekly_plans" ADD CONSTRAINT "weekly_plans_template_not_draft" CHECK (not "weekly_plans"."is_template" or "weekly_plans"."status" <> 'draft');