CREATE TABLE "session_secret" (
	"id" text PRIMARY KEY NOT NULL,
	"secret" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_access" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"site_id" text NOT NULL,
	"granted_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_invites" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"email" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" text NOT NULL,
	"expires_at" text NOT NULL,
	"claimed_at" text,
	"claimed_by_user_id" text
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" text PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"token" text NOT NULL,
	"owner_id" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"password_salt" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"status" text NOT NULL,
	"timezone" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "site_access_user_id_idx" ON "site_access" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "site_access_site_id_idx" ON "site_access" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "site_invites_site_id_idx" ON "site_invites" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "sites_owner_id_idx" ON "sites" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");