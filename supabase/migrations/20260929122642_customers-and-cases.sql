CREATE TYPE "public"."case_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TYPE "public"."customer_sex" AS ENUM('female', 'male', 'other', 'undisclosed');--> statement-breakpoint
CREATE TABLE "cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"physio_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"title" text NOT NULL,
	"diagnosis" text,
	"body_area" "body_area",
	"side" "body_side",
	"injury_on" date,
	"surgery_on" date,
	"precautions" text,
	"goals" text,
	"initial_pain" smallint,
	"notes" text,
	"status" "case_status" DEFAULT 'open' NOT NULL,
	"opened_on" date DEFAULT current_date NOT NULL,
	"closed_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cases_title_length" CHECK (char_length("cases"."title") between 1 and 120),
	CONSTRAINT "cases_diagnosis_length" CHECK (char_length("cases"."diagnosis") <= 500),
	CONSTRAINT "cases_precautions_length" CHECK (char_length("cases"."precautions") <= 2000),
	CONSTRAINT "cases_goals_length" CHECK (char_length("cases"."goals") <= 2000),
	CONSTRAINT "cases_notes_length" CHECK (char_length("cases"."notes") <= 5000),
	CONSTRAINT "cases_initial_pain_range" CHECK ("cases"."initial_pain" between 0 and 10),
	CONSTRAINT "cases_area_not_full_body" CHECK ("cases"."body_area" <> 'full_body'),
	CONSTRAINT "cases_side_needs_area" CHECK ("cases"."side" is null or "cases"."body_area" is not null),
	CONSTRAINT "cases_closed_on_matches_status" CHECK (("cases"."status" = 'closed') = ("cases"."closed_on" is not null)),
	CONSTRAINT "cases_closed_not_before_opened" CHECK ("cases"."closed_on" >= "cases"."opened_on")
);
--> statement-breakpoint
ALTER TABLE "cases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"physio_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text,
	"email" text,
	"phone" text,
	"date_of_birth" date,
	"sex" "customer_sex",
	"occupation" text,
	"activity" text,
	"medical_history" text,
	"locale" text NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_physio_id_id_unique" UNIQUE("physio_id","id"),
	CONSTRAINT "customers_first_name_length" CHECK (char_length("customers"."first_name") between 1 and 60),
	CONSTRAINT "customers_last_name_length" CHECK (char_length("customers"."last_name") <= 60),
	CONSTRAINT "customers_email_length" CHECK (char_length("customers"."email") <= 254),
	CONSTRAINT "customers_phone_length" CHECK (char_length("customers"."phone") <= 30),
	CONSTRAINT "customers_occupation_length" CHECK (char_length("customers"."occupation") <= 100),
	CONSTRAINT "customers_activity_length" CHECK (char_length("customers"."activity") <= 200),
	CONSTRAINT "customers_medical_history_length" CHECK (char_length("customers"."medical_history") <= 5000)
);
--> statement-breakpoint
ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_physio_id_physios_id_fk" FOREIGN KEY ("physio_id") REFERENCES "public"."physios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_customer_fk" FOREIGN KEY ("physio_id","customer_id") REFERENCES "public"."customers"("physio_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_physio_id_physios_id_fk" FOREIGN KEY ("physio_id") REFERENCES "public"."physios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cases_customer_id_idx" ON "cases" USING btree ("physio_id","customer_id","status");--> statement-breakpoint
CREATE INDEX "customers_physio_id_archived_at_idx" ON "customers" USING btree ("physio_id","archived_at");--> statement-breakpoint
CREATE POLICY "cases_own" ON "cases" AS PERMISSIVE FOR ALL TO "authenticated" USING ("cases"."physio_id" = (select auth.uid())) WITH CHECK ("cases"."physio_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "customers_own" ON "customers" AS PERMISSIVE FOR ALL TO "authenticated" USING ("customers"."physio_id" = (select auth.uid())) WITH CHECK ("customers"."physio_id" = (select auth.uid()));