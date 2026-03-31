CREATE TABLE `portfolio_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sleeveId` int NOT NULL,
	`totalValue` decimal(18,2) NOT NULL,
	`positionsValue` decimal(18,2) NOT NULL,
	`cashBalance` decimal(18,2) NOT NULL,
	`returnPct` decimal(10,4) NOT NULL DEFAULT '0.0000',
	`snapshotAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `portfolio_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `trades` MODIFY COLUMN `side` enum('buy','sell','short','cover') NOT NULL;--> statement-breakpoint
ALTER TABLE `positions` ADD `isShort` int DEFAULT 0 NOT NULL;