CREATE TABLE `gazetteer` (
	`id` integer PRIMARY KEY,
	`source` text NOT NULL,
	`source_id` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`name_ru` text,
	`name_fi` text,
	`names` text NOT NULL,
	`search_text` text NOT NULL,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`imported_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gazetteer_source_idx` ON `gazetteer` (`source`,`source_id`);--> statement-breakpoint
CREATE INDEX `gazetteer_name_idx` ON `gazetteer` (`name`);