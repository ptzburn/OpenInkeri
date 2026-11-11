CREATE TABLE `source_page` (
	`id` integer PRIMARY KEY,
	`source_id` integer NOT NULL,
	`position` integer NOT NULL,
	`label` text,
	`file` text NOT NULL,
	`file_hash` text NOT NULL,
	`key` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`bytes` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_source_page_source_id_source_id_fk` FOREIGN KEY (`source_id`) REFERENCES `source`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX `source_page_position_idx` ON `source_page` (`source_id`,`position`);