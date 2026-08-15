-- CreateTable
CREATE TABLE `payment_attempts` (
    `id` VARCHAR(191) NOT NULL,
    `invoiceId` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `gateway` VARCHAR(191) NOT NULL,
    `amount` INTEGER NOT NULL,
    `gatewayAmount` INTEGER NULL,
    `status` ENUM('CREATED', 'PROCESSING', 'PENDING', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED') NOT NULL DEFAULT 'CREATED',
    `paymentToken` VARCHAR(191) NULL,
    `transactionId` VARCHAR(191) NULL,
    `paymentUrl` LONGTEXT NULL,
    `snapToken` VARCHAR(191) NULL,
    `qrString` LONGTEXT NULL,
    `mismatchFlagged` BOOLEAN NOT NULL DEFAULT false,
    `errorMessage` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `paidAt` DATETIME(3) NULL,
    `expiredAt` DATETIME(3) NULL,

    UNIQUE INDEX `payment_attempts_orderId_key`(`orderId`),
    INDEX `payment_attempts_invoiceId_idx`(`invoiceId`),
    INDEX `payment_attempts_status_idx`(`status`),
    INDEX `payment_attempts_gateway_idx`(`gateway`),
    INDEX `payment_attempts_transactionId_idx`(`transactionId`),
    INDEX `payment_attempts_mismatchFlagged_idx`(`mismatchFlagged`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `payment_attempts` ADD CONSTRAINT `payment_attempts_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `invoices`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
