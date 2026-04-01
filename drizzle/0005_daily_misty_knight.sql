CREATE TABLE `earnings_picks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`challengeId` int NOT NULL,
	`sleeveId` int NOT NULL,
	`userId` int NOT NULL,
	`ticker` varchar(32) NOT NULL,
	`assetName` varchar(128),
	`direction` enum('up','down') NOT NULL,
	`prevClose` decimal(18,6),
	`openPrice` decimal(18,6),
	`result` enum('pending','correct','wrong') NOT NULL DEFAULT 'pending',
	`points` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`scoredAt` timestamp,
	CONSTRAINT `earnings_picks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `challenges` MODIFY COLUMN `type` enum('conviction','sprint','earnings') NOT NULL DEFAULT 'sprint';