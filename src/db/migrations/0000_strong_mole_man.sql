CREATE TABLE IF NOT EXISTS "files" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"encoded_name" varchar(255) NOT NULL,
	"extension" varchar(10),
	"size" bigint NOT NULL,
	"location" varchar(255) NOT NULL,
	"location_type" varchar(10) DEFAULT 'local',
	"management_key" varchar(64) NOT NULL,
	"created_at" timestamp DEFAULT now()
);
