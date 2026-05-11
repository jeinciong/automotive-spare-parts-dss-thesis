-- DropForeignKey
ALTER TABLE `activity_logs` DROP FOREIGN KEY `activity_logs_business_id_fkey`;

-- DropForeignKey
ALTER TABLE `activity_logs` DROP FOREIGN KEY `activity_logs_user_id_fkey`;

-- DropForeignKey
ALTER TABLE `inventory` DROP FOREIGN KEY `inventory_ibfk_1`;

-- DropForeignKey
ALTER TABLE `predictions` DROP FOREIGN KEY `predictions_ibfk_1`;

-- DropForeignKey
ALTER TABLE `purchase_orders` DROP FOREIGN KEY `purchase_orders_ibfk_1`;

-- DropForeignKey
ALTER TABLE `purchase_orders` DROP FOREIGN KEY `purchase_orders_ibfk_2`;

-- DropForeignKey
ALTER TABLE `recommendation_actions` DROP FOREIGN KEY `recommendation_actions_ibfk_1`;

-- DropForeignKey
ALTER TABLE `sales_reports` DROP FOREIGN KEY `sales_reports_ibfk_1`;

-- DropForeignKey
ALTER TABLE `suppliers` DROP FOREIGN KEY `suppliers_ibfk_1`;

-- DropForeignKey
ALTER TABLE `users` DROP FOREIGN KEY `users_ibfk_1`;
