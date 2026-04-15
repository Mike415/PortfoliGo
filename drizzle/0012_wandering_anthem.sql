CREATE TABLE `cash_adjustments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sleeveId` int NOT NULL,
	`groupId` int NOT NULL,
	`userId` int NOT NULL,
	`adminId` int NOT NULL,
	`amount` decimal(18,2) NOT NULL,
	`reason` varchar(512) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cash_adjustments_id` PRIMARY KEY(`id`)
);
