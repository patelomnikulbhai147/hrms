-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `username` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `role` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NULL,
    `accessibleCompanyIds` JSON NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'Active',
    `avatar` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `employeeId` VARCHAR(191) NULL,
    `permissions` JSON NULL,
    `password` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NULL,
    `lastLoginAt` DATETIME(3) NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    UNIQUE INDEX `User_username_key`(`username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PasswordResetToken` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `otpHash` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `consumed` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PasswordResetToken_userId_idx`(`userId`),
    INDEX `PasswordResetToken_email_idx`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LoginAudit` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `email` VARCHAR(191) NOT NULL,
    `success` BOOLEAN NOT NULL,
    `reason` VARCHAR(191) NULL,
    `ipAddress` VARCHAR(191) NULL,
    `userAgent` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `LoginAudit_userId_idx`(`userId`),
    INDEX `LoginAudit_email_idx`(`email`),
    INDEX `LoginAudit_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Company` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `domain` VARCHAR(191) NULL,
    `adminName` VARCHAR(191) NULL,
    `adminEmail` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `industry` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'Active',
    `accountStatus` VARCHAR(191) NOT NULL DEFAULT 'Active',
    `paymentStatus` VARCHAR(191) NOT NULL DEFAULT 'Paid',
    `plan` VARCHAR(191) NOT NULL DEFAULT 'Starter',
    `employeeCount` INTEGER NOT NULL DEFAULT 0,
    `joinDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `logo` VARCHAR(191) NULL,
    `logoImage` VARCHAR(191) NULL,
    `isHeadOffice` BOOLEAN NOT NULL DEFAULT true,
    `parentCompanyId` VARCHAR(191) NULL,
    `offboardingState` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `basicPercent` DOUBLE NULL,
    `esicRate` DOUBLE NULL,
    `overtimeRate` DOUBLE NULL,
    `pfRate` DOUBLE NULL,
    `primaryColor` VARCHAR(191) NULL,
    `profTaxRate` DOUBLE NULL,
    `themeStyle` VARCHAR(191) NULL,
    `activeHrUsers` INTEGER NULL,
    `billingAddress` VARCHAR(191) NULL,
    `billingCycle` VARCHAR(191) NULL,
    `billingIncluded` BOOLEAN NULL,
    `branchCode` VARCHAR(191) NULL,
    `branchLicenseActive` BOOLEAN NULL,
    `branchLicenseStatus` VARCHAR(191) NULL,
    `branchName` VARCHAR(191) NULL,
    `branchPortalActive` BOOLEAN NULL,
    `branchPriceAddon` DOUBLE NULL,
    `branchRenewalDate` VARCHAR(191) NULL,
    `companyIndustry` VARCHAR(191) NULL,
    `customDepartments` JSON NULL,
    `departmentTemplateType` VARCHAR(191) NULL,
    `employeeCapacity` INTEGER NULL,
    `footerText` VARCHAR(191) NULL,
    `gstNumber` VARCHAR(191) NULL,
    `headerText` VARCHAR(191) NULL,
    `inheritParentDepartments` BOOLEAN NULL,
    `licensedEmployeeLimit` INTEGER NULL,
    `monthlyBranchCost` DOUBLE NULL,
    `monthlyUsage` DOUBLE NULL,
    `payrollLoad` DOUBLE NULL,
    `priceMonthly` DOUBLE NULL,
    `priceYearly` DOUBLE NULL,
    `purchasedAdditionalBranches` INTEGER NULL,
    `signatureText` VARCHAR(191) NULL,
    `storageUsed` VARCHAR(191) NULL,
    `subscriptionPrice` DOUBLE NULL,
    `isArchived` BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Branch` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `branchName` VARCHAR(191) NOT NULL,
    `location` VARCHAR(191) NULL,
    `headcount` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(191) NOT NULL DEFAULT 'Active',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `isArchived` BOOLEAN NOT NULL DEFAULT false,
    `adminEmail` VARCHAR(191) NULL,
    `adminName` VARCHAR(191) NULL,
    `basicPercent` DOUBLE NOT NULL DEFAULT 50,
    `branchCode` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `employeeCapacity` INTEGER NOT NULL DEFAULT 200,
    `esicRate` DOUBLE NOT NULL DEFAULT 3.25,
    `overtimeRate` DOUBLE NOT NULL DEFAULT 1.5,
    `pfRate` DOUBLE NOT NULL DEFAULT 12,
    `phone` VARCHAR(191) NULL,
    `profTaxRate` DOUBLE NOT NULL DEFAULT 200,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Employee` (
    `id` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `branchId` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `firstName` VARCHAR(191) NULL,
    `lastName` VARCHAR(191) NULL,
    `email` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NULL,
    `department` VARCHAR(191) NOT NULL,
    `designation` VARCHAR(191) NOT NULL,
    `role` VARCHAR(191) NOT NULL DEFAULT 'Staff',
    `status` VARCHAR(191) NOT NULL DEFAULT 'Active',
    `joinDate` DATETIME(3) NOT NULL,
    `exitDate` DATETIME(3) NULL,
    `exitReason` VARCHAR(191) NULL,
    `location` VARCHAR(191) NULL,
    `avatar` VARCHAR(191) NULL,
    `salary` DOUBLE NOT NULL DEFAULT 0,
    `manager` VARCHAR(191) NULL,
    `pan` VARCHAR(191) NULL,
    `aadhaar` VARCHAR(191) NULL,
    `uan` VARCHAR(191) NULL,
    `pfNumber` VARCHAR(191) NULL,
    `esiNumber` VARCHAR(191) NULL,
    `bankName` VARCHAR(191) NULL,
    `accountNumber` VARCHAR(191) NULL,
    `ifsc` VARCHAR(191) NULL,
    `offboardingState` JSON NULL,
    `employmentHistory` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `documents` JSON NULL,
    `aadhaarName` VARCHAR(191) NULL,
    `aadhaarUpload` VARCHAR(191) NULL,
    `branchLocation` VARCHAR(191) NULL,
    `category` VARCHAR(191) NULL,
    `dob` VARCHAR(191) NULL,
    `emergencyContact` VARCHAR(191) NULL,
    `employmentType` VARCHAR(191) NULL,
    `fatherSpouseName` VARCHAR(191) NULL,
    `gender` VARCHAR(191) NULL,
    `maritalStatus` VARCHAR(191) NULL,
    `middleName` VARCHAR(191) NULL,
    `nationality` VARCHAR(191) NULL,
    `panUpload` VARCHAR(191) NULL,
    `permanentAddress` VARCHAR(191) NULL,
    `photoUpload` VARCHAR(191) NULL,
    `presentAddress` VARCHAR(191) NULL,
    `relationType` VARCHAR(191) NULL,
    `serviceBookNo` VARCHAR(191) NULL,
    `signatureUpload` VARCHAR(191) NULL,

    UNIQUE INDEX `Employee_employeeId_key`(`employeeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Payroll` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL DEFAULT 'c-gcri',
    `employeeId` VARCHAR(191) NOT NULL,
    `employeeName` VARCHAR(191) NOT NULL DEFAULT 'Unknown',
    `department` VARCHAR(191) NOT NULL DEFAULT 'General',
    `month` VARCHAR(191) NOT NULL,
    `year` INTEGER NOT NULL DEFAULT 2026,
    `basicSalary` DOUBLE NOT NULL DEFAULT 0,
    `allowances` DOUBLE NOT NULL DEFAULT 0,
    `deductions` DOUBLE NOT NULL DEFAULT 0,
    `netSalary` DOUBLE NOT NULL DEFAULT 0,
    `payrollStatus` VARCHAR(191) NOT NULL DEFAULT 'draft',
    `paymentStatus` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `payslipGenerated` BOOLEAN NOT NULL DEFAULT false,
    `processedOn` VARCHAR(191) NULL,
    `paymentDate` VARCHAR(191) NULL,
    `dueDate` VARCHAR(191) NULL,
    `paymentMethod` VARCHAR(191) NULL,
    `paidBy` VARCHAR(191) NULL,
    `bonus` DOUBLE NULL,
    `tax` DOUBLE NULL,
    `notes` VARCHAR(191) NULL,
    `companyPayrollId` VARCHAR(191) NULL,
    `branchPayrollId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Payroll_employeeId_month_year_companyId_key`(`employeeId`, `month`, `year`, `companyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CompanyPayroll` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `payroll_month` VARCHAR(191) NOT NULL,
    `payroll_year` INTEGER NOT NULL,
    `total_employees` INTEGER NOT NULL,
    `processed_employees` INTEGER NOT NULL,
    `pending_employees` INTEGER NOT NULL,
    `total_amount` DOUBLE NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'Pending',
    `generated_by` VARCHAR(191) NOT NULL,
    `generated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `CompanyPayroll_companyId_payroll_month_payroll_year_key`(`companyId`, `payroll_month`, `payroll_year`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BranchPayroll` (
    `id` VARCHAR(191) NOT NULL,
    `branch_id` VARCHAR(191) NOT NULL,
    `company_id` VARCHAR(191) NOT NULL,
    `payroll_month` VARCHAR(191) NOT NULL,
    `payroll_year` INTEGER NOT NULL,
    `total_employees` INTEGER NOT NULL,
    `processed_employees` INTEGER NOT NULL,
    `pending_employees` INTEGER NOT NULL,
    `total_amount` DOUBLE NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'Pending',
    `generated_by` VARCHAR(191) NOT NULL,
    `generated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `BranchPayroll_branch_id_payroll_month_payroll_year_key`(`branch_id`, `payroll_month`, `payroll_year`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Attendance` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL DEFAULT 'c-gcri',
    `employeeId` VARCHAR(191) NOT NULL,
    `employeeName` VARCHAR(191) NOT NULL DEFAULT 'Unknown',
    `department` VARCHAR(191) NOT NULL DEFAULT 'General',
    `branch` VARCHAR(191) NULL,
    `date` VARCHAR(191) NOT NULL DEFAULT '2026-05-20',
    `clockIn` VARCHAR(191) NOT NULL DEFAULT '09:00',
    `clockOut` VARCHAR(191) NOT NULL DEFAULT '18:00',
    `status` VARCHAR(191) NOT NULL DEFAULT 'Present',
    `hoursWorked` DOUBLE NOT NULL DEFAULT 8,
    `flags` JSON NULL,
    `leaveType` VARCHAR(191) NULL,
    `shift` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Overtime` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `employeeName` VARCHAR(191) NOT NULL,
    `employeeCode` VARCHAR(191) NULL,
    `department` VARCHAR(191) NULL,
    `branch` VARCHAR(191) NULL,
    `shift` VARCHAR(191) NULL,
    `date` VARCHAR(191) NOT NULL,
    `inTime` VARCHAR(191) NOT NULL,
    `outTime` VARCHAR(191) NOT NULL,
    `otHours` DOUBLE NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `reason` VARCHAR(191) NULL,
    `remarks` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'Pending',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Shift` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NULL,
    `start` VARCHAR(191) NOT NULL,
    `end` VARCHAR(191) NOT NULL,
    `grace` VARCHAR(191) NULL,
    `breakTime` VARCHAR(191) NULL,
    `otEnabled` BOOLEAN NOT NULL DEFAULT false,
    `status` VARCHAR(191) NOT NULL DEFAULT 'Active',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LeaveRequest` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `employeeName` VARCHAR(191) NOT NULL,
    `department` VARCHAR(191) NOT NULL,
    `leaveType` VARCHAR(191) NOT NULL,
    `fromDate` VARCHAR(191) NOT NULL,
    `toDate` VARCHAR(191) NOT NULL,
    `days` DOUBLE NOT NULL,
    `reason` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'Pending',
    `appliedOn` VARCHAR(191) NOT NULL,
    `approvedBy` VARCHAR(191) NULL,
    `approvedOn` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Document` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NULL,
    `employeeName` VARCHAR(191) NULL,
    `uploadedBy` VARCHAR(191) NOT NULL,
    `uploadedOn` VARCHAR(191) NOT NULL,
    `size` VARCHAR(191) NOT NULL,
    `url` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'Pending',

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PaymentRecord` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `companyName` VARCHAR(191) NOT NULL,
    `planName` VARCHAR(191) NOT NULL,
    `amount` DOUBLE NOT NULL,
    `billingCycle` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `date` VARCHAR(191) NOT NULL,
    `invoiceUrl` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Notification` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NULL,
    `type` VARCHAR(191) NOT NULL,
    `message` VARCHAR(191) NOT NULL,
    `timestamp` VARCHAR(191) NOT NULL,
    `read` BOOLEAN NOT NULL DEFAULT false,
    `priority` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `module` VARCHAR(191) NOT NULL,
    `targetId` VARCHAR(191) NOT NULL,
    `details` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SubscriptionPlan` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `priceMonthly` DOUBLE NOT NULL,
    `priceYearly` DOUBLE NOT NULL,
    `employeeLimit` INTEGER NOT NULL,
    `hrLimit` INTEGER NOT NULL,
    `storageLimit` VARCHAR(191) NOT NULL,
    `payrollAccess` BOOLEAN NOT NULL,
    `documentAccess` BOOLEAN NOT NULL,
    `includedBranchLimit` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PasswordResetToken` ADD CONSTRAINT `PasswordResetToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Branch` ADD CONSTRAINT `Branch_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Employee` ADD CONSTRAINT `Employee_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Employee` ADD CONSTRAINT `Employee_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payroll` ADD CONSTRAINT `Payroll_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payroll` ADD CONSTRAINT `Payroll_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CompanyPayroll` ADD CONSTRAINT `CompanyPayroll_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BranchPayroll` ADD CONSTRAINT `BranchPayroll_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `Branch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Attendance` ADD CONSTRAINT `Attendance_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Attendance` ADD CONSTRAINT `Attendance_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Overtime` ADD CONSTRAINT `Overtime_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Overtime` ADD CONSTRAINT `Overtime_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Shift` ADD CONSTRAINT `Shift_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeaveRequest` ADD CONSTRAINT `LeaveRequest_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeaveRequest` ADD CONSTRAINT `LeaveRequest_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Document` ADD CONSTRAINT `Document_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentRecord` ADD CONSTRAINT `PaymentRecord_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
