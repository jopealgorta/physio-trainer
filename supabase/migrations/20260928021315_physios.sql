CREATE TABLE "physios" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"handle" text NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"onboarded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "physios_handle_unique" UNIQUE("handle"),
	CONSTRAINT "physios_handle_format" CHECK ("physios"."handle" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length("physios"."handle") between 3 and 30),
	CONSTRAINT "physios_display_name_length" CHECK (char_length("physios"."display_name") between 1 and 80)
);
--> statement-breakpoint
ALTER TABLE "physios" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "physios" ADD CONSTRAINT "physios_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "physios_select_own" ON "physios" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("physios"."id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "physios_update_own" ON "physios" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("physios"."id" = (select auth.uid())) WITH CHECK ("physios"."id" = (select auth.uid()));