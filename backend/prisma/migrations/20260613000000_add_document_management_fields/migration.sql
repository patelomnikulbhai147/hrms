-- Document Management upgrade: add file storage, identity, validity, remarks and
-- audit-trail columns to Document. All columns are NULLable / additive, so this
-- is non-destructive and safe to run against a populated table.

ALTER TABLE `Document`
  ADD COLUMN `branchId` INTEGER NULL,
  ADD COLUMN `fileData` LONGTEXT NULL,
  ADD COLUMN `mimeType` VARCHAR(191) NULL,
  ADD COLUMN `documentNumber` VARCHAR(191) NULL,
  ADD COLUMN `issueDate` VARCHAR(191) NULL,
  ADD COLUMN `expiryDate` VARCHAR(191) NULL,
  ADD COLUMN `remarks` TEXT NULL,
  ADD COLUMN `verifiedBy` VARCHAR(191) NULL,
  ADD COLUMN `verifiedOn` VARCHAR(191) NULL,
  ADD COLUMN `editedBy` VARCHAR(191) NULL,
  ADD COLUMN `editedOn` VARCHAR(191) NULL;

-- Widen url so long external links (Google Drive / OneDrive share URLs) fit.
ALTER TABLE `Document` MODIFY `url` TEXT NULL;
