CREATE TABLE IF NOT EXISTS `hiring_events` (
	`id` text PRIMARY KEY NOT NULL,
	`role_id` text,
	`person_id` text,
	`kind` text NOT NULL,
	`actor` text NOT NULL,
	`detail` text,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `hiring_events_role_at_idx` ON `hiring_events` (`role_id`,`at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `hiring_people` (
	`id` text PRIMARY KEY NOT NULL,
	`record` text NOT NULL,
	`keys` text NOT NULL,
	`sites` text NOT NULL,
	`read_by_model` integer DEFAULT false NOT NULL,
	`last_activity_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `hiring_people_last_activity_idx` ON `hiring_people` (`last_activity_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `hiring_role_people` (
	`role_id` text NOT NULL,
	`person_id` text NOT NULL,
	`stage` text DEFAULT 'found' NOT NULL,
	`reason` text,
	`evaluation` text,
	`found_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`role_id`, `person_id`),
	FOREIGN KEY (`role_id`) REFERENCES `hiring_roles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `hiring_people`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `hiring_role_people_stage_idx` ON `hiring_role_people` (`role_id`,`stage`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `hiring_roles` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`location` text,
	`description` text,
	`criteria` text NOT NULL,
	`mode` text DEFAULT 'review' NOT NULL,
	`sites` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `hiring_suppressions` (
	`hash` text PRIMARY KEY NOT NULL,
	`at` integer NOT NULL
);
