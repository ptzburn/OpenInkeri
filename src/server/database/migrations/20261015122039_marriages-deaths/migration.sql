ALTER TABLE `persona` ADD `residence_text` text;--> statement-breakpoint
ALTER TABLE `persona` ADD `residence_id` integer REFERENCES place(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `persona` ADD `religion_text` text;--> statement-breakpoint
ALTER TABLE `persona` ADD `religion_term_id` integer REFERENCES term(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `record_death` ADD `burial_place_text` text;--> statement-breakpoint
ALTER TABLE `record_death` ADD `stillborn` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `persona_residence_idx` ON `persona` (`residence_id`);