CREATE TABLE "time_logs" (
	"id" text PRIMARY KEY,
	"sync_key" text NOT NULL,
	"date" text NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"total_hours" real NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"method" text DEFAULT 'Manual' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
