-- AlterTable
ALTER TABLE `payroll` ADD COLUMN `approvedAt` DATETIME(3) NULL,
    ADD COLUMN `approvedBy` VARCHAR(191) NULL,
    ADD COLUMN `downloadedAt` DATETIME(3) NULL,
    ADD COLUMN `emailSentAt` DATETIME(3) NULL,
    ADD COLUMN `generatedAt` DATETIME(3) NULL,
    ADD COLUMN `lockedAt` DATETIME(3) NULL,
    ADD COLUMN `payslipFileName` VARCHAR(191) NULL;
