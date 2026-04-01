CREATE TABLE `challenge_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`challengeId` int NOT NULL,
	`sleeveId` int NOT NULL,
	`userId` int NOT NULL,
	`ticker` varchar(32),
	`assetName` varchar(128),
	`entryPrice` decimal(18,6),
	`exitPrice` decimal(18,6),
	`startValue` decimal(18,2),
	`endValue` decimal(18,2),
	`returnPct` decimal(10,4),
	`rank` int,
	`isWinner` int NOT NULL DEFAULT 0,
	`enteredAt` timestamp NOT NULL DEFAULT (now()),
	`scoredAt` timestamp,
	CONSTRAINT `challenge_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `challenges` (
	`id` int AUTO_INCREMENT NOT NULL,
	`groupId` int NOT NULL,
	`name` varchar(128) NOT NULL,
	`description` text,
	`type` enum('conviction','sprint') NOT NULL DEFAULT 'sprint',
	`startDate` timestamp NOT NULL,
	`pickWindowEnd` timestamp,
	`endDate` timestamp NOT NULL,
	`allocationBump` decimal(18,2) NOT NULL DEFAULT '5000.00',
	`recurring` int NOT NULL DEFAULT 0,
	`recurringInterval` enum('weekly','monthly'),
	`status` enum('upcoming','picking','active','scoring','completed') NOT NULL DEFAULT 'upcoming',
	`winnerId` int,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `challenges_id` PRIMARY KEY(`id`)
);
