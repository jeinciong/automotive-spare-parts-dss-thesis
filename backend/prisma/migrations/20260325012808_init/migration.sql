-- CreateTable
CREATE TABLE `activity_logs` (
    `log_id` INTEGER NOT NULL AUTO_INCREMENT,
    `business_id` INTEGER NOT NULL,
    `user_id` INTEGER NULL,
    `action_type` VARCHAR(50) NULL,
    `description` TEXT NULL,
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `activity_logs_business_id_fkey`(`business_id`),
    INDEX `activity_logs_user_id_fkey`(`user_id`),
    PRIMARY KEY (`log_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `businesses` (
    `business_id` INTEGER NOT NULL AUTO_INCREMENT,
    `business_name` VARCHAR(100) NOT NULL,
    `business_address` TEXT NULL,
    `email` VARCHAR(255) NULL,
    `password_hash` VARCHAR(255) NULL,
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`business_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inventory` (
    `product_id` INTEGER NOT NULL AUTO_INCREMENT,
    `business_id` INTEGER NOT NULL,
    `sku` VARCHAR(50) NOT NULL,
    `product_name` VARCHAR(100) NOT NULL,
    `category` VARCHAR(50) NULL,
    `current_stock` INTEGER NULL DEFAULT 10,
    `min_stock` INTEGER NULL DEFAULT 10,
    `unit_cost` DECIMAL(10, 2) NULL,
    `supplier` VARCHAR(100) NULL,
    `status` ENUM('In Stock', 'Low Stock', 'Critical') NULL DEFAULT 'In Stock',
    `location` VARCHAR(100) NULL,

    INDEX `business_id`(`business_id`),
    PRIMARY KEY (`product_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `predictions` (
    `prediction_id` INTEGER NOT NULL AUTO_INCREMENT,
    `business_id` INTEGER NOT NULL,
    `product_id` INTEGER NULL,
    `forecast_date` DATE NULL,
    `predicted_quantity` DECIMAL(10, 2) NULL,
    `confidence_interval` DECIMAL(5, 2) NULL,
    `recommendation_priority` ENUM('Low', 'Medium', 'High') NULL,

    INDEX `business_id`(`business_id`),
    PRIMARY KEY (`prediction_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchase_orders` (
    `po_id` INTEGER NOT NULL AUTO_INCREMENT,
    `business_id` INTEGER NOT NULL,
    `supplier_id` INTEGER NOT NULL,
    `order_date` DATE NOT NULL,
    `delivery_date` DATE NULL,
    `total_amount` DECIMAL(15, 2) NOT NULL,
    `status` ENUM('Pending', 'Shipped', 'Delivered', 'Cancelled') NULL DEFAULT 'Pending',

    INDEX `business_id`(`business_id`),
    INDEX `supplier_id`(`supplier_id`),
    PRIMARY KEY (`po_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `recommendation_actions` (
    `action_id` INTEGER NOT NULL AUTO_INCREMENT,
    `business_id` INTEGER NOT NULL,
    `prediction_id` INTEGER NULL,
    `action_taken` VARCHAR(100) NULL,
    `status` VARCHAR(20) NULL DEFAULT 'Pending',
    `recommendation_key` VARCHAR(191) NULL,
    `product_name` VARCHAR(100) NULL,
    `priority` VARCHAR(20) NULL,
    `title` VARCHAR(255) NULL,
    `description` TEXT NULL,
    `recommended_action` VARCHAR(100) NULL,
    `impact` VARCHAR(255) NULL,
    `generated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `completed_at` TIMESTAMP NULL DEFAULT NULL,
    `action_history` TEXT NULL,

    INDEX `business_id`(`business_id`),
    PRIMARY KEY (`action_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sales_reports` (
    `report_id` INTEGER NOT NULL AUTO_INCREMENT,
    `business_id` INTEGER NOT NULL,
    `date` DATE NOT NULL,
    `order_number` VARCHAR(50) NOT NULL,
    `product_name` VARCHAR(100) NULL,
    `category` VARCHAR(50) NULL,
    `customer_type` VARCHAR(20) NULL,
    `quantity` INTEGER NOT NULL,
    `unit_price` DECIMAL(10, 2) NOT NULL,
    `total_amount` DECIMAL(10, 2) NOT NULL,
    `payment_method` VARCHAR(20) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'Completed',

    INDEX `business_id`(`business_id`),
    PRIMARY KEY (`report_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `suppliers` (
    `supplier_id` INTEGER NOT NULL AUTO_INCREMENT,
    `business_id` INTEGER NOT NULL,
    `supplier_name` VARCHAR(100) NOT NULL,
    `category` VARCHAR(50) NULL,
    `location` VARCHAR(100) NULL,
    `contact_email` VARCHAR(100) NULL,
    `contact_number` VARCHAR(100) NULL,
    `rating` DECIMAL(3, 2) NULL DEFAULT 0.00,
    `total_spend` DECIMAL(15, 2) NULL DEFAULT 0.00,
    `total_orders` INTEGER NULL DEFAULT 0,
    `status` ENUM('Active', 'Warning', 'Inactive') NULL DEFAULT 'Active',
    `delivery_time` VARCHAR(50) NULL,

    INDEX `business_id`(`business_id`),
    PRIMARY KEY (`supplier_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `user_id` INTEGER NOT NULL AUTO_INCREMENT,
    `business_id` INTEGER NOT NULL,
    `full_name` VARCHAR(100) NOT NULL,
    `email` VARCHAR(100) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `role` ENUM('Admin', 'Business') NOT NULL DEFAULT 'Business',
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `email`(`email`),
    INDEX `business_id`(`business_id`),
    PRIMARY KEY (`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `activity_logs` ADD CONSTRAINT `activity_logs_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`business_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `activity_logs` ADD CONSTRAINT `activity_logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory` ADD CONSTRAINT `inventory_ibfk_1` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`business_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `predictions` ADD CONSTRAINT `predictions_ibfk_1` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`business_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `purchase_orders` ADD CONSTRAINT `purchase_orders_ibfk_1` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`business_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `purchase_orders` ADD CONSTRAINT `purchase_orders_ibfk_2` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`supplier_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `recommendation_actions` ADD CONSTRAINT `recommendation_actions_ibfk_1` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`business_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `sales_reports` ADD CONSTRAINT `sales_reports_ibfk_1` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`business_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `suppliers` ADD CONSTRAINT `suppliers_ibfk_1` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`business_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_ibfk_1` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`business_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
