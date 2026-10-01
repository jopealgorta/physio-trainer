CREATE TYPE "public"."share_target" AS ENUM('customer', 'routine', 'weekly_plan');--> statement-breakpoint
CREATE TABLE "share_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"physio_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"target" "share_target" NOT NULL,
	"routine_id" uuid,
	"weekly_plan_id" uuid,
	"slug" text NOT NULL,
	"code" text NOT NULL,
	"pin_hash" text,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"last_opened_at" timestamp with time zone,
	"open_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "share_links_target_ids" CHECK (("share_links"."target" = 'customer' and "share_links"."routine_id" is null and "share_links"."weekly_plan_id" is null)
        or ("share_links"."target" = 'routine' and "share_links"."routine_id" is not null and "share_links"."weekly_plan_id" is null)
        or ("share_links"."target" = 'weekly_plan' and "share_links"."routine_id" is null and "share_links"."weekly_plan_id" is not null)),
	CONSTRAINT "share_links_code_format" CHECK ("share_links"."code" ~ '^[0-9a-hjkmnp-tv-z]{8}$'),
	CONSTRAINT "share_links_slug_format" CHECK (char_length("share_links"."slug") between 1 and 40
        and "share_links"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "share_links_open_count" CHECK ("share_links"."open_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "share_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_physio_id_physios_id_fk" FOREIGN KEY ("physio_id") REFERENCES "public"."physios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_customer_fk" FOREIGN KEY ("physio_id","customer_id") REFERENCES "public"."customers"("physio_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_routine_fk" FOREIGN KEY ("physio_id","routine_id") REFERENCES "public"."routines"("physio_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_weekly_plan_fk" FOREIGN KEY ("physio_id","weekly_plan_id") REFERENCES "public"."weekly_plans"("physio_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "share_links_code_unique" ON "share_links" USING btree ("code");--> statement-breakpoint
CREATE INDEX "share_links_customer_idx" ON "share_links" USING btree ("physio_id","customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "share_links_live_customer_unique" ON "share_links" USING btree ("customer_id") WHERE "share_links"."target" = 'customer' and "share_links"."revoked_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "share_links_live_routine_unique" ON "share_links" USING btree ("routine_id") WHERE "share_links"."target" = 'routine' and "share_links"."revoked_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "share_links_live_weekly_plan_unique" ON "share_links" USING btree ("weekly_plan_id") WHERE "share_links"."target" = 'weekly_plan' and "share_links"."revoked_at" is null;--> statement-breakpoint
CREATE POLICY "share_links_own" ON "share_links" AS PERMISSIVE FOR ALL TO "authenticated" USING ("share_links"."physio_id" = (select auth.uid())) WITH CHECK ("share_links"."physio_id" = (select auth.uid()));