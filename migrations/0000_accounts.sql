CREATE TABLE `capture_job_progress` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`message` text NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `capture_jobs`(`job_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `capture_job_progress_latest` ON `capture_job_progress` (`job_id`,`id`);--> statement-breakpoint
CREATE TABLE `capture_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`job_id` text NOT NULL,
	`status` text NOT NULL,
	`attempts` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`dispatched_at` integer,
	`lease` text,
	`lease_until` integer,
	`error` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `capture_jobs_job_id_unique` ON `capture_jobs` (`job_id`);--> statement-breakpoint
CREATE INDEX `capture_jobs_user` ON `capture_jobs` (`user_id`,`id`);--> statement-breakpoint
CREATE INDEX `capture_jobs_dispatch` ON `capture_jobs` (`dispatched_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `capture_jobs_active_user` ON `capture_jobs` (`user_id`) WHERE "capture_jobs"."status" IN ('queued', 'running');--> statement-breakpoint
CREATE TABLE `capture_results` (
	`user_id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`quip_user_id` text NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`captured_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `credentials` (
	`user_id` text PRIMARY KEY NOT NULL,
	`encrypted_pat` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_expiry` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`quip_origin` text NOT NULL,
	`quip_user_id` text NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `users_email` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_quip_origin_quip_user_id_unique` ON `users` (`quip_origin`,`quip_user_id`);