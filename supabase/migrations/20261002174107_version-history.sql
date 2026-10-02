CREATE TYPE "public"."version_kind" AS ENUM('created', 'edited', 'restored');--> statement-breakpoint
CREATE TABLE "routine_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"physio_id" uuid NOT NULL,
	"routine_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"kind" "version_kind" NOT NULL,
	"restored_from" integer,
	"snapshot" jsonb NOT NULL,
	"summary" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "routine_versions_routine_version_unique" UNIQUE("routine_id","version"),
	CONSTRAINT "routine_versions_version_positive" CHECK ("routine_versions"."version" >= 1),
	CONSTRAINT "routine_versions_restored_from" CHECK (("routine_versions"."kind" = 'restored') = ("routine_versions"."restored_from" is not null))
);
--> statement-breakpoint
ALTER TABLE "routine_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "weekly_plan_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"physio_id" uuid NOT NULL,
	"weekly_plan_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"kind" "version_kind" NOT NULL,
	"restored_from" integer,
	"snapshot" jsonb NOT NULL,
	"summary" jsonb,
	"session_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weekly_plan_versions_plan_version_unique" UNIQUE("weekly_plan_id","version"),
	CONSTRAINT "weekly_plan_versions_version_positive" CHECK ("weekly_plan_versions"."version" >= 1),
	CONSTRAINT "weekly_plan_versions_restored_from" CHECK (("weekly_plan_versions"."kind" = 'restored') = ("weekly_plan_versions"."restored_from" is not null))
);
--> statement-breakpoint
ALTER TABLE "weekly_plan_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "routine_versions" ADD CONSTRAINT "routine_versions_physio_id_physios_id_fk" FOREIGN KEY ("physio_id") REFERENCES "public"."physios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_versions" ADD CONSTRAINT "routine_versions_routine_fk" FOREIGN KEY ("physio_id","routine_id") REFERENCES "public"."routines"("physio_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_plan_versions" ADD CONSTRAINT "weekly_plan_versions_physio_id_physios_id_fk" FOREIGN KEY ("physio_id") REFERENCES "public"."physios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_plan_versions" ADD CONSTRAINT "weekly_plan_versions_plan_fk" FOREIGN KEY ("physio_id","weekly_plan_id") REFERENCES "public"."weekly_plans"("physio_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "routine_versions_routine_idx" ON "routine_versions" USING btree ("physio_id","routine_id","version" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "weekly_plan_versions_plan_idx" ON "weekly_plan_versions" USING btree ("physio_id","weekly_plan_id","version" DESC NULLS LAST);--> statement-breakpoint
CREATE POLICY "routine_versions_select" ON "routine_versions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("routine_versions"."physio_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "routine_versions_insert" ON "routine_versions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("routine_versions"."physio_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "weekly_plan_versions_select" ON "weekly_plan_versions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("weekly_plan_versions"."physio_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "weekly_plan_versions_insert" ON "weekly_plan_versions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("weekly_plan_versions"."physio_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "weekly_plan_versions_update" ON "weekly_plan_versions" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("weekly_plan_versions"."physio_id" = (select auth.uid())) WITH CHECK ("weekly_plan_versions"."physio_id" = (select auth.uid()));