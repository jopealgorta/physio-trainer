CREATE TABLE "routine_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"physio_id" uuid NOT NULL,
	"routine_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "routine_sections_physio_routine_id_unique" UNIQUE("physio_id","routine_id","id"),
	CONSTRAINT "routine_sections_position_unique" UNIQUE("physio_id","routine_id","position"),
	CONSTRAINT "routine_sections_position" CHECK ("routine_sections"."position" >= 0),
	CONSTRAINT "routine_sections_name_length" CHECK (char_length("routine_sections"."name") between 1 and 60)
);
--> statement-breakpoint
ALTER TABLE "routine_sections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "routine_items" ADD COLUMN "section_id" uuid;--> statement-breakpoint
ALTER TABLE "routine_sections" ADD CONSTRAINT "routine_sections_physio_id_physios_id_fk" FOREIGN KEY ("physio_id") REFERENCES "public"."physios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_sections" ADD CONSTRAINT "routine_sections_routine_fk" FOREIGN KEY ("physio_id","routine_id") REFERENCES "public"."routines"("physio_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "routine_sections_routine_idx" ON "routine_sections" USING btree ("physio_id","routine_id");--> statement-breakpoint
ALTER TABLE "routine_items" ADD CONSTRAINT "routine_items_section_fk" FOREIGN KEY ("physio_id","routine_id","section_id") REFERENCES "public"."routine_sections"("physio_id","routine_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "routine_sections_own" ON "routine_sections" AS PERMISSIVE FOR ALL TO "authenticated" USING ("routine_sections"."physio_id" = (select auth.uid())) WITH CHECK ("routine_sections"."physio_id" = (select auth.uid()));