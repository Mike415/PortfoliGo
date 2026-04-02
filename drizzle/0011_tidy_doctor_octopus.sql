ALTER TABLE `users` MODIFY COLUMN `displayName` varchar(128) NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `email` varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_email_unique` UNIQUE(`email`);