CREATE TABLE `change_log` (
	`id` integer PRIMARY KEY,
	`at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`user_id` text,
	`entity` text NOT NULL,
	`entity_id` integer NOT NULL,
	`action` text NOT NULL,
	`before` text,
	`after` text,
	CONSTRAINT `fk_change_log_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `clergy` (
	`id` integer PRIMARY KEY,
	`name_ru` text NOT NULL,
	`name_fi` text,
	`note` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`created_by` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_by` text,
	`version` integer DEFAULT 1 NOT NULL,
	CONSTRAINT `fk_clergy_created_by_user_id_fk` FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_clergy_updated_by_user_id_fk` FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `parish` (
	`id` integer PRIMARY KEY,
	`name_ru` text NOT NULL,
	`name_fi` text,
	`note` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`created_by` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_by` text,
	`version` integer DEFAULT 1 NOT NULL,
	CONSTRAINT `fk_parish_created_by_user_id_fk` FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_parish_updated_by_user_id_fk` FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `person` (
	`id` integer PRIMARY KEY,
	`sex` text,
	`name_ru` text,
	`name_fi` text,
	`birth_date` text,
	`death_date` text,
	`note` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`created_by` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_by` text,
	`version` integer DEFAULT 1 NOT NULL,
	CONSTRAINT `fk_person_created_by_user_id_fk` FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_person_updated_by_user_id_fk` FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `persona` (
	`id` integer PRIMARY KEY,
	`record_id` integer NOT NULL,
	`role` text NOT NULL,
	`sex` text,
	`name_ru` text,
	`given_ru` text,
	`patronymic_ru` text,
	`surname_ru` text,
	`maiden_ru` text,
	`name_fi` text,
	`given_fi` text,
	`patronymic_fi` text,
	`surname_fi` text,
	`maiden_fi` text,
	`age_text` text,
	`birth_date` text,
	`death_date` text,
	`birthplace_text` text,
	`birthplace_id` integer,
	`relation_text` text,
	`relation_term_id` integer,
	`rank_text` text,
	`rank_term_id` integer,
	`civil_status_text` text,
	`civil_status_term_id` integer,
	`family_no` text,
	`has_wife` integer,
	`origin` text,
	`note` text,
	`note_original` text,
	`person_id` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`created_by` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_by` text,
	`version` integer DEFAULT 1 NOT NULL,
	CONSTRAINT `fk_persona_record_id_record_id_fk` FOREIGN KEY (`record_id`) REFERENCES `record`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_persona_birthplace_id_place_id_fk` FOREIGN KEY (`birthplace_id`) REFERENCES `place`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_persona_relation_term_id_term_id_fk` FOREIGN KEY (`relation_term_id`) REFERENCES `term`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_persona_rank_term_id_term_id_fk` FOREIGN KEY (`rank_term_id`) REFERENCES `term`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_persona_civil_status_term_id_term_id_fk` FOREIGN KEY (`civil_status_term_id`) REFERENCES `term`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_persona_person_id_person_id_fk` FOREIGN KEY (`person_id`) REFERENCES `person`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_persona_created_by_user_id_fk` FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_persona_updated_by_user_id_fk` FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `place` (
	`id` integer PRIMARY KEY,
	`kind` text DEFAULT 'village' NOT NULL,
	`name_ru` text NOT NULL,
	`name_fi` text,
	`parish_id` integer,
	`latitude` real,
	`longitude` real,
	`coordinate_status` text DEFAULT 'unknown' NOT NULL,
	`note` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`created_by` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_by` text,
	`version` integer DEFAULT 1 NOT NULL,
	CONSTRAINT `fk_place_parish_id_parish_id_fk` FOREIGN KEY (`parish_id`) REFERENCES `parish`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_place_created_by_user_id_fk` FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_place_updated_by_user_id_fk` FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `place_alias` (
	`id` integer PRIMARY KEY,
	`place_id` integer NOT NULL,
	`name` text NOT NULL,
	CONSTRAINT `fk_place_alias_place_id_place_id_fk` FOREIGN KEY (`place_id`) REFERENCES `place`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `record` (
	`id` integer PRIMARY KEY,
	`source_id` integer NOT NULL,
	`section_id` integer,
	`page` text,
	`entry_no` text,
	`status` text DEFAULT 'ok' NOT NULL,
	`date` text,
	`year` integer GENERATED ALWAYS AS (cast(substr(date, 1, 4) as integer)) VIRTUAL,
	`place_text` text,
	`place_id` integer,
	`note` text,
	`raw` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`created_by` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_by` text,
	`version` integer DEFAULT 1 NOT NULL,
	CONSTRAINT `fk_record_source_id_source_id_fk` FOREIGN KEY (`source_id`) REFERENCES `source`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `fk_record_section_id_source_section_id_fk` FOREIGN KEY (`section_id`) REFERENCES `source_section`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_record_place_id_place_id_fk` FOREIGN KEY (`place_id`) REFERENCES `place`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_record_created_by_user_id_fk` FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_record_updated_by_user_id_fk` FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `record_baptism` (
	`record_id` integer PRIMARY KEY,
	`birth_date` text,
	`officiant_text` text,
	`officiant_id` integer,
	`location` text,
	`location_place_id` integer,
	`emergency_date` text,
	`multiple_birth` integer,
	`illegitimate` integer DEFAULT false NOT NULL,
	`stillborn` integer DEFAULT false NOT NULL,
	CONSTRAINT `fk_record_baptism_record_id_record_id_fk` FOREIGN KEY (`record_id`) REFERENCES `record`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_record_baptism_officiant_id_clergy_id_fk` FOREIGN KEY (`officiant_id`) REFERENCES `clergy`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_record_baptism_location_place_id_place_id_fk` FOREIGN KEY (`location_place_id`) REFERENCES `place`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `record_death` (
	`record_id` integer PRIMARY KEY,
	`burial_date` text,
	`cause_text` text,
	`cause_term_id` integer,
	CONSTRAINT `fk_record_death_record_id_record_id_fk` FOREIGN KEY (`record_id`) REFERENCES `record`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_record_death_cause_term_id_term_id_fk` FOREIGN KEY (`cause_term_id`) REFERENCES `term`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `record_holding` (
	`record_id` integer PRIMARY KEY,
	`holding_no` text,
	`estate_text` text,
	`estate_place_id` integer,
	`tenant_text` text,
	CONSTRAINT `fk_record_holding_record_id_record_id_fk` FOREIGN KEY (`record_id`) REFERENCES `record`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_record_holding_estate_place_id_place_id_fk` FOREIGN KEY (`estate_place_id`) REFERENCES `place`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `source` (
	`id` integer PRIMARY KEY,
	`kind` text NOT NULL,
	`parish_id` integer,
	`title` text NOT NULL,
	`archive_reference` text,
	`year_from` integer,
	`year_to` integer,
	`language` text,
	`note` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`created_by` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_by` text,
	`version` integer DEFAULT 1 NOT NULL,
	CONSTRAINT `fk_source_parish_id_parish_id_fk` FOREIGN KEY (`parish_id`) REFERENCES `parish`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_source_created_by_user_id_fk` FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_source_updated_by_user_id_fk` FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `source_section` (
	`id` integer PRIMARY KEY,
	`source_id` integer NOT NULL,
	`title` text NOT NULL,
	CONSTRAINT `fk_source_section_source_id_source_id_fk` FOREIGN KEY (`source_id`) REFERENCES `source`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `term` (
	`id` integer PRIMARY KEY,
	`vocabulary` text NOT NULL,
	`ru` text NOT NULL,
	`fi` text,
	`en` text,
	`note` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`created_by` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_by` text,
	`version` integer DEFAULT 1 NOT NULL,
	CONSTRAINT `fk_term_created_by_user_id_fk` FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_term_updated_by_user_id_fk` FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX `change_log_entity_idx` ON `change_log` (`entity`,`entity_id`);--> statement-breakpoint
CREATE INDEX `change_log_at_idx` ON `change_log` (`at`);--> statement-breakpoint
CREATE INDEX `persona_record_idx` ON `persona` (`record_id`);--> statement-breakpoint
CREATE INDEX `persona_person_idx` ON `persona` (`person_id`);--> statement-breakpoint
CREATE INDEX `persona_surname_ru_idx` ON `persona` (`surname_ru`);--> statement-breakpoint
CREATE INDEX `persona_surname_fi_idx` ON `persona` (`surname_fi`);--> statement-breakpoint
CREATE INDEX `persona_maiden_ru_idx` ON `persona` (`maiden_ru`);--> statement-breakpoint
CREATE INDEX `place_parish_idx` ON `place` (`parish_id`);--> statement-breakpoint
CREATE INDEX `place_name_ru_idx` ON `place` (`name_ru`);--> statement-breakpoint
CREATE UNIQUE INDEX `place_alias_place_name_idx` ON `place_alias` (`place_id`,`name`);--> statement-breakpoint
CREATE INDEX `place_alias_name_idx` ON `place_alias` (`name`);--> statement-breakpoint
CREATE INDEX `record_source_idx` ON `record` (`source_id`);--> statement-breakpoint
CREATE INDEX `record_place_year_idx` ON `record` (`place_id`,`year`);--> statement-breakpoint
CREATE INDEX `record_date_idx` ON `record` (`date`);--> statement-breakpoint
CREATE INDEX `record_baptism_birth_date_idx` ON `record_baptism` (`birth_date`);--> statement-breakpoint
CREATE INDEX `source_parish_idx` ON `source` (`parish_id`);--> statement-breakpoint
CREATE INDEX `source_section_source_idx` ON `source_section` (`source_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `term_vocabulary_ru_idx` ON `term` (`vocabulary`,`ru`);