CREATE TABLE "exercise_category_links" (
	"physio_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	CONSTRAINT "exercise_category_links_pkey" PRIMARY KEY("exercise_id","category_id")
);
--> statement-breakpoint
ALTER TABLE "exercise_category_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "exercise_category_links" ADD CONSTRAINT "exercise_category_links_physio_id_physios_id_fk" FOREIGN KEY ("physio_id") REFERENCES "public"."physios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_category_links" ADD CONSTRAINT "exercise_category_links_exercise_fk" FOREIGN KEY ("physio_id","exercise_id") REFERENCES "public"."exercises"("physio_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_category_links" ADD CONSTRAINT "exercise_category_links_category_fk" FOREIGN KEY ("physio_id","category_id") REFERENCES "public"."exercise_categories"("physio_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exercise_category_links_category_idx" ON "exercise_category_links" USING btree ("physio_id","category_id");--> statement-breakpoint
CREATE POLICY "exercise_category_links_own" ON "exercise_category_links" AS PERMISSIVE FOR ALL TO "authenticated" USING ("exercise_category_links"."physio_id" = (select auth.uid())) WITH CHECK ("exercise_category_links"."physio_id" = (select auth.uid()));