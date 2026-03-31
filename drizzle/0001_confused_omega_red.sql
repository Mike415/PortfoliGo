CREATE TABLE `group_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`groupId` int NOT NULL,
	`userId` int NOT NULL,
	`role` enum('admin','member') NOT NULL DEFAULT 'member',
	`joinedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `group_members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `groups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`description` text,
	`inviteCode` varchar(32) NOT NULL,
	`totalCapital` decimal(18,2) NOT NULL DEFAULT '1000000.00',
	`sleeveSize` decimal(18,2) NOT NULL DEFAULT '200000.00',
	`maxParticipants` int NOT NULL DEFAULT 5,
	`reallocationInterval` enum('6months','12months') NOT NULL DEFAULT '6months',
	`reallocationPercent` decimal(5,2) NOT NULL DEFAULT '5.00',
	`startDate` timestamp NOT NULL DEFAULT (now()),
	`nextReallocationDate` timestamp,
	`lastReallocationDate` timestamp,
	`status` enum('active','paused','completed') NOT NULL DEFAULT 'active',
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `groups_id` PRIMARY KEY(`id`),
	CONSTRAINT `groups_inviteCode_unique` UNIQUE(`inviteCode`)
);
--> statement-breakpoint
CREATE TABLE `positions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sleeveId` int NOT NULL,
	`ticker` varchar(32) NOT NULL,
	`assetType` enum('stock','etf','crypto') NOT NULL DEFAULT 'stock',
	`quantity` decimal(20,8) NOT NULL,
	`avgCostBasis` decimal(18,6) NOT NULL,
	`currentPrice` decimal(18,6) DEFAULT '0.000000',
	`currentValue` decimal(18,2) DEFAULT '0.00',
	`unrealizedPnl` decimal(18,2) DEFAULT '0.00',
	`unrealizedPnlPct` decimal(10,4) DEFAULT '0.0000',
	`lastPricedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `positions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `price_cache` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ticker` varchar(32) NOT NULL,
	`assetType` enum('stock','etf','crypto') NOT NULL DEFAULT 'stock',
	`price` decimal(18,6) NOT NULL,
	`change` decimal(18,6),
	`changePct` decimal(10,4),
	`name` varchar(256),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `price_cache_id` PRIMARY KEY(`id`),
	CONSTRAINT `price_cache_ticker_unique` UNIQUE(`ticker`)
);
--> statement-breakpoint
CREATE TABLE `reallocation_changes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` int NOT NULL,
	`sleeveId` int NOT NULL,
	`userId` int NOT NULL,
	`previousAllocation` decimal(18,2) NOT NULL,
	`newAllocation` decimal(18,2) NOT NULL,
	`changeAmount` decimal(18,2) NOT NULL,
	`returnPctAtTime` decimal(10,4) NOT NULL,
	`rank` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `reallocation_changes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reallocation_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`groupId` int NOT NULL,
	`triggeredBy` int NOT NULL,
	`status` enum('preview','confirmed','rolled_back') NOT NULL DEFAULT 'confirmed',
	`notes` text,
	`executedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `reallocation_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`expiresAt` bigint NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sleeves` (
	`id` int AUTO_INCREMENT NOT NULL,
	`groupId` int NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(128),
	`allocatedCapital` decimal(18,2) NOT NULL DEFAULT '200000.00',
	`cashBalance` decimal(18,2) NOT NULL DEFAULT '200000.00',
	`positionsValue` decimal(18,2) NOT NULL DEFAULT '0.00',
	`totalValue` decimal(18,2) NOT NULL DEFAULT '200000.00',
	`realizedPnl` decimal(18,2) NOT NULL DEFAULT '0.00',
	`unrealizedPnl` decimal(18,2) NOT NULL DEFAULT '0.00',
	`returnPct` decimal(10,4) NOT NULL DEFAULT '0.0000',
	`lastPricedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sleeves_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `trades` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sleeveId` int NOT NULL,
	`ticker` varchar(32) NOT NULL,
	`assetType` enum('stock','etf','crypto') NOT NULL DEFAULT 'stock',
	`side` enum('buy','sell') NOT NULL,
	`quantity` decimal(20,8) NOT NULL,
	`price` decimal(18,6) NOT NULL,
	`totalValue` decimal(18,2) NOT NULL,
	`realizedPnl` decimal(18,2) DEFAULT '0.00',
	`notes` text,
	`executedAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `trades_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` DROP INDEX `users_openId_unique`;--> statement-breakpoint
ALTER TABLE `users` ADD `username` varchar(64) NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `passcodeHash` varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `displayName` varchar(128);--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_username_unique` UNIQUE(`username`);--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `openId`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `name`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `email`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `loginMethod`;