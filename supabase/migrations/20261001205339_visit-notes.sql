CREATE TABLE "visit_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"physio_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"case_id" uuid,
	"visited_on" date DEFAULT current_date NOT NULL,
	"subjective" text,
	"objective" text,
	"assessment" text,
	"plan" text,
	"pain" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "visit_notes_subjective_length" CHECK (char_length("visit_notes"."subjective") <= 10000),
	CONSTRAINT "visit_notes_objective_length" CHECK (char_length("visit_notes"."objective") <= 10000),
	CONSTRAINT "visit_notes_assessment_length" CHECK (char_length("visit_notes"."assessment") <= 10000),
	CONSTRAINT "visit_notes_plan_length" CHECK (char_length("visit_notes"."plan") <= 10000),
	CONSTRAINT "visit_notes_pain_range" CHECK ("visit_notes"."pain" between 0 and 10),
	CONSTRAINT "visit_notes_has_content" CHECK (btrim(coalesce("visit_notes"."subjective", '') || coalesce("visit_notes"."objective", '') || coalesce("visit_notes"."assessment", '') || coalesce("visit_notes"."plan", '')) <> '')
);
--> statement-breakpoint
ALTER TABLE "visit_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "visit_notes" ADD CONSTRAINT "visit_notes_physio_id_physios_id_fk" FOREIGN KEY ("physio_id") REFERENCES "public"."physios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_notes" ADD CONSTRAINT "visit_notes_customer_fk" FOREIGN KEY ("physio_id","customer_id") REFERENCES "public"."customers"("physio_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "visit_notes_customer_idx" ON "visit_notes" USING btree ("physio_id","customer_id","visited_on" DESC NULLS LAST);--> statement-breakpoint
CREATE POLICY "visit_notes_own" ON "visit_notes" AS PERMISSIVE FOR ALL TO "authenticated" USING ("visit_notes"."physio_id" = (select auth.uid())) WITH CHECK ("visit_notes"."physio_id" = (select auth.uid()));