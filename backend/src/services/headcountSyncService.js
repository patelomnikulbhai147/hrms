const prisma = require('../config/prisma');

class HeadcountSyncService {
  /**
   * Recalculates and updates the headcount (active employees count) for a single branch.
   */
  static async syncBranchHeadcount(branchId, tx) {
    if (!branchId) return;
    const client = tx || prisma;
    try {
      const activeCount = await client.employee.count({
        where: {
          branchId: Number(branchId),
          status: { in: ['Active', 'ACTIVE'] },
        },
      });

      await client.branch.update({
        where: { id: Number(branchId) },
        data: { headcount: activeCount },
      });

      console.log(`[headcount:sync] Branch ID ${branchId} headcount updated to ${activeCount}`);
      return activeCount;
    } catch (error) {
      console.error(`[headcount:sync] Failed to sync headcount for Branch ID ${branchId}:`, error);
    }
  }

  /**
   * Run-once data repair to synchronize headcounts for all branches.
   */
  static async syncAllBranches(tx) {
    const client = tx || prisma;
    try {
      const branches = await client.branch.findMany({ select: { id: true } });
      console.log(`[headcount:repair] Found ${branches.length} branches to synchronize.`);
      
      let updatedCount = 0;
      for (const branch of branches) {
        await this.syncBranchHeadcount(branch.id, client);
        updatedCount++;
      }
      
      console.log(`[headcount:repair] Completed synchronization of ${updatedCount} branches.`);
      return updatedCount;
    } catch (error) {
      console.error('[headcount:repair] Failed to synchronize all branches:', error);
    }
  }

  /**
   * Automatically handles headcount updates when an employee is created, updated, or deleted.
   */
  static async handleEmployeeChange(oldEmp, newEmp, tx) {
    const client = tx || prisma;
    const oldBranchId = oldEmp ? oldEmp.branchId : null;
    const newBranchId = newEmp ? newEmp.branchId : null;
    const oldStatus = oldEmp ? String(oldEmp.status).toUpperCase() : null;
    const newStatus = newEmp ? String(newEmp.status).toUpperCase() : null;

    const branchesToSync = new Set();

    // 1. Employee Created
    if (!oldEmp && newEmp) {
      if (newBranchId && newStatus === 'ACTIVE') {
        branchesToSync.add(newBranchId);
      }
    }
    // 2. Employee Deleted
    else if (oldEmp && !newEmp) {
      if (oldBranchId && oldStatus === 'ACTIVE') {
        branchesToSync.add(oldBranchId);
      }
    }
    // 3. Employee Updated (Status or Branch changed)
    else if (oldEmp && newEmp) {
      const branchChanged = oldBranchId !== newBranchId;
      const statusChanged = oldStatus !== newStatus;

      if (branchChanged || statusChanged) {
        if (oldBranchId) branchesToSync.add(oldBranchId);
        if (newBranchId) branchesToSync.add(newBranchId);
      }
    }

    for (const bId of branchesToSync) {
      await this.syncBranchHeadcount(bId, client);
    }
  }
}

module.exports = HeadcountSyncService;
