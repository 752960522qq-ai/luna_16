CREATE TABLE `commands` (
	`room_code` text NOT NULL,
	`seq` integer NOT NULL,
	`payload` text NOT NULL,
	PRIMARY KEY(`room_code`, `seq`),
	FOREIGN KEY (`room_code`) REFERENCES `rooms`(`code`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`host_key` text NOT NULL,
	`guest_key` text,
	`status` text DEFAULT 'waiting' NOT NULL,
	`created_at` integer NOT NULL,
	`last_host` integer NOT NULL,
	`last_guest` integer,
	`expires_at` integer NOT NULL,
	`state` text,
	`state_seq` integer DEFAULT 0 NOT NULL,
	`acked_seq` integer DEFAULT 0 NOT NULL,
	`guest_seq` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_rooms_expiry` ON `rooms` (`expires_at`);