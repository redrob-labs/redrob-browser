CREATE TABLE IF NOT EXISTS `hiring_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`role_id` text NOT NULL,
	`person_id` text NOT NULL,
	`channel` text NOT NULL,
	`recipient` text,
	`connector` text,
	`sequence` integer DEFAULT 0 NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`approved_by` text,
	`note` text,
	`sent_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`role_id`) REFERENCES `hiring_roles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `hiring_people`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `hiring_messages_status_idx` ON `hiring_messages` (`status`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `hiring_messages_person_idx` ON `hiring_messages` (`person_id`);