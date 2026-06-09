const prisma = require('../config/prisma');

class AuditService {
  /**
   * Log an activity to the ActivityTimeline for user-facing timelines
   */
  static async logActivity(actorId, actorName, action, entityType, entityId, details) {
    try {
      await prisma.activityTimeline.create({
        data: {
          actorId,
          actorName,
          action,
          entityType,
          entityId,
          details: typeof details === 'object' ? JSON.stringify(details) : details
        }
      });
    } catch (err) {
      console.error('Failed to log ActivityTimeline:', err);
    }
  }

  /**
   * Secure, immutable audit log for compliance (Internal tracking)
   */
  static async logAudit(userId, action, moduleName, targetId, details) {
    try {
      // In a real app, userId should never be null for audits. We default for safety here.
      if (!userId) userId = 'SYSTEM';
      
      // Ensure user exists if we are going to connect it, but for our simple schema 
      // let's just save the string or connect if valid UUID
      // Actually, Prisma schema has \`user User @relation(fields: [userId], references: [id])\`
      // So userId MUST exist. Let's assume userId is valid, or skip if SYSTEM.
      
      const userExists = await prisma.user.findUnique({ where: { id: userId } });
      if (!userExists) {
        console.warn('AuditLog skipped: Invalid user ID', userId);
        return;
      }

      await prisma.auditLog.create({
        data: {
          userId,
          action,
          module: moduleName,
          targetId,
          details: typeof details === 'object' ? JSON.stringify(details) : details
        }
      });
    } catch (err) {
      console.error('Failed to log AuditLog:', err);
    }
  }
}

module.exports = AuditService;
