/*
  Warnings:

  - Made the column `flags` on table `attendance` required. This step will fail if there are existing NULL values in that column.
  - Made the column `customDepartments` on table `company` required. This step will fail if there are existing NULL values in that column.
  - Made the column `accessibleCompanyIds` on table `user` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE `attendance` MODIFY `flags` JSON NOT NULL DEFAULT (JSON_ARRAY());

-- AlterTable
ALTER TABLE `company` MODIFY `customDepartments` JSON NOT NULL DEFAULT (JSON_ARRAY());

-- AlterTable
ALTER TABLE `user` MODIFY `accessibleCompanyIds` JSON NOT NULL DEFAULT (JSON_ARRAY());
