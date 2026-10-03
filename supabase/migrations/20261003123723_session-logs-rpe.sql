ALTER TABLE "session_logs" ADD COLUMN "rpe" smallint;--> statement-breakpoint
ALTER TABLE "session_logs" ADD CONSTRAINT "session_logs_rpe_range" CHECK ("session_logs"."rpe" between 0 and 10);