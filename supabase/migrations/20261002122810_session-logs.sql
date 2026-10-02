CREATE TABLE "session_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"physio_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"share_link_id" uuid,
	"routine_id" uuid NOT NULL,
	"weekly_plan_entry_id" uuid,
	"performed_on" date NOT NULL,
	"completed" boolean DEFAULT true NOT NULL,
	"pain" smallint,
	"comment" text,
	"seen_by_physio_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_logs_routine_entry_day_unique" UNIQUE NULLS NOT DISTINCT("routine_id","weekly_plan_entry_id","performed_on"),
	CONSTRAINT "session_logs_pain_range" CHECK ("session_logs"."pain" between 0 and 10),
	CONSTRAINT "session_logs_comment_length" CHECK (char_length("session_logs"."comment") between 1 and 1000)
);
--> statement-breakpoint
ALTER TABLE "session_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "session_logs" ADD CONSTRAINT "session_logs_physio_id_physios_id_fk" FOREIGN KEY ("physio_id") REFERENCES "public"."physios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_logs" ADD CONSTRAINT "session_logs_customer_fk" FOREIGN KEY ("physio_id","customer_id") REFERENCES "public"."customers"("physio_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_logs" ADD CONSTRAINT "session_logs_routine_fk" FOREIGN KEY ("physio_id","routine_id") REFERENCES "public"."routines"("physio_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "session_logs_customer_idx" ON "session_logs" USING btree ("physio_id","customer_id","performed_on" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "session_logs_physio_day_idx" ON "session_logs" USING btree ("physio_id","performed_on" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "session_logs_routine_idx" ON "session_logs" USING btree ("physio_id","routine_id");--> statement-breakpoint
CREATE POLICY "session_logs_own" ON "session_logs" AS PERMISSIVE FOR ALL TO "authenticated" USING ("session_logs"."physio_id" = (select auth.uid())) WITH CHECK ("session_logs"."physio_id" = (select auth.uid()));