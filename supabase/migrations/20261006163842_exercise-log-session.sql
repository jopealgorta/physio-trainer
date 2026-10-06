ALTER TABLE "session_logs" ADD CONSTRAINT "session_logs_physio_id_unique" UNIQUE("physio_id","id");--> statement-breakpoint
ALTER TABLE "exercise_logs" ADD COLUMN "session_log_id" uuid;--> statement-breakpoint
ALTER TABLE "exercise_logs" ADD CONSTRAINT "exercise_logs_session_fk" FOREIGN KEY ("physio_id","session_log_id") REFERENCES "public"."session_logs"("physio_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exercise_logs_session_idx" ON "exercise_logs" USING btree ("session_log_id");
