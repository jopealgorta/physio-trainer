CREATE TABLE "exercise_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"physio_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"share_link_id" uuid,
	"routine_id" uuid NOT NULL,
	"weekly_plan_entry_id" uuid,
	"exercise_id" uuid NOT NULL,
	"performed_on" date NOT NULL,
	"pain" smallint,
	"rpe" smallint,
	"weight_kg" numeric(5, 1),
	"comment" text,
	"seen_by_physio_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exercise_logs_routine_entry_exercise_day_unique" UNIQUE NULLS NOT DISTINCT("routine_id","weekly_plan_entry_id","exercise_id","performed_on"),
	CONSTRAINT "exercise_logs_pain_range" CHECK ("exercise_logs"."pain" between 0 and 10),
	CONSTRAINT "exercise_logs_rpe_range" CHECK ("exercise_logs"."rpe" between 0 and 10),
	CONSTRAINT "exercise_logs_weight_range" CHECK ("exercise_logs"."weight_kg" between 0 and 999.9),
	CONSTRAINT "exercise_logs_comment_length" CHECK (char_length("exercise_logs"."comment") between 1 and 1000),
	CONSTRAINT "exercise_logs_not_empty" CHECK (num_nonnulls("exercise_logs"."pain", "exercise_logs"."rpe", "exercise_logs"."weight_kg", "exercise_logs"."comment") > 0)
);
--> statement-breakpoint
ALTER TABLE "exercise_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "exercise_logs" ADD CONSTRAINT "exercise_logs_physio_id_physios_id_fk" FOREIGN KEY ("physio_id") REFERENCES "public"."physios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_logs" ADD CONSTRAINT "exercise_logs_customer_fk" FOREIGN KEY ("physio_id","customer_id") REFERENCES "public"."customers"("physio_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_logs" ADD CONSTRAINT "exercise_logs_routine_fk" FOREIGN KEY ("physio_id","routine_id") REFERENCES "public"."routines"("physio_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_logs" ADD CONSTRAINT "exercise_logs_exercise_fk" FOREIGN KEY ("physio_id","exercise_id") REFERENCES "public"."exercises"("physio_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exercise_logs_customer_idx" ON "exercise_logs" USING btree ("physio_id","customer_id","performed_on" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "exercise_logs_routine_idx" ON "exercise_logs" USING btree ("physio_id","routine_id");--> statement-breakpoint
CREATE POLICY "exercise_logs_own" ON "exercise_logs" AS PERMISSIVE FOR ALL TO "authenticated" USING ("exercise_logs"."physio_id" = (select auth.uid())) WITH CHECK ("exercise_logs"."physio_id" = (select auth.uid()));