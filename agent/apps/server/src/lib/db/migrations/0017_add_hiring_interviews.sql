CREATE TABLE IF NOT EXISTS `hiring_interviews` (
	`id` text PRIMARY KEY NOT NULL,
	`role_id` text NOT NULL,
	`person_id` text NOT NULL,
	`connector` text NOT NULL,
	`length_minutes` integer NOT NULL,
	`status` text NOT NULL,
	`slots` text NOT NULL,
	`chosen` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`role_id`) REFERENCES `hiring_roles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `hiring_people`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `hiring_interviews_role_idx` ON `hiring_interviews` (`role_id`);