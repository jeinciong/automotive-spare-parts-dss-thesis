-- AlterTable
ALTER TABLE `recommendation_actions` ADD COLUMN `executed_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0);
