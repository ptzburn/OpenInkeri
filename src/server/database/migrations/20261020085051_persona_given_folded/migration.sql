ALTER TABLE `persona` ADD `given_ru_folded` text;--> statement-breakpoint
ALTER TABLE `persona` ADD `given_fi_folded` text;--> statement-breakpoint
CREATE INDEX `persona_given_ru_folded_idx` ON `persona` (`given_ru_folded`);--> statement-breakpoint
CREATE INDEX `persona_given_fi_folded_idx` ON `persona` (`given_fi_folded`);