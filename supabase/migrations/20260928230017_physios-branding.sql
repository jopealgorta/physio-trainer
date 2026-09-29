ALTER TABLE "physios" ADD COLUMN "clinic_name" text;--> statement-breakpoint
ALTER TABLE "physios" ADD COLUMN "logo_path" text;--> statement-breakpoint
ALTER TABLE "physios" ADD COLUMN "accent_color" text;--> statement-breakpoint
ALTER TABLE "physios" ADD COLUMN "contact_email" text;--> statement-breakpoint
ALTER TABLE "physios" ADD COLUMN "contact_phone" text;--> statement-breakpoint
ALTER TABLE "physios" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "physios" ADD COLUMN "show_contact_to_patients" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "physios" ADD CONSTRAINT "physios_clinic_name_length" CHECK (char_length("physios"."clinic_name") between 1 and 80);--> statement-breakpoint
ALTER TABLE "physios" ADD CONSTRAINT "physios_accent_color_format" CHECK ("physios"."accent_color" ~ '^#[0-9a-f]{6}$');--> statement-breakpoint
ALTER TABLE "physios" ADD CONSTRAINT "physios_logo_path_own" CHECK ("physios"."logo_path" ~ ('^' || "physios"."id"::text || '/logo-[0-9a-f-]{36}\.(png|webp|jpg)$'));--> statement-breakpoint
ALTER TABLE "physios" ADD CONSTRAINT "physios_contact_email_length" CHECK (char_length("physios"."contact_email") between 3 and 254);--> statement-breakpoint
ALTER TABLE "physios" ADD CONSTRAINT "physios_contact_phone_format" CHECK ("physios"."contact_phone" ~ '^\+[0-9]{7,15}$');--> statement-breakpoint
ALTER TABLE "physios" ADD CONSTRAINT "physios_website_format" CHECK ("physios"."website" ~ '^https://' and char_length("physios"."website") <= 2048);