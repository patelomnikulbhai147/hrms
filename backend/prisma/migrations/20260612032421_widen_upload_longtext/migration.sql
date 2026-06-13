-- AlterTable
ALTER TABLE `company` MODIFY `logo` LONGTEXT NULL,
    MODIFY `logoImage` LONGTEXT NULL;

-- AlterTable
ALTER TABLE `employee` MODIFY `avatar` LONGTEXT NULL,
    MODIFY `aadhaarUpload` LONGTEXT NULL,
    MODIFY `panUpload` LONGTEXT NULL,
    MODIFY `permanentAddress` TEXT NULL,
    MODIFY `photoUpload` LONGTEXT NULL,
    MODIFY `presentAddress` TEXT NULL,
    MODIFY `signatureUpload` LONGTEXT NULL;

-- AlterTable
ALTER TABLE `user` MODIFY `avatar` LONGTEXT NULL;
