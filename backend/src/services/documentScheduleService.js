const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { distributeDocument } = require('./documentDistributionService');

const activeJobs = new Map();

/**
 * Initializes all active document schedules on startup
 */
exports.initSchedules = async () => {
  try {
    const schedules = await prisma.documentSchedule.findMany({
      where: { isActive: true },
      include: { template: true }
    });

    schedules.forEach(schedule => {
      this.scheduleJob(schedule);
    });

    console.log(`[DocumentSchedule] Initialized ${schedules.length} automated document schedules.`);
  } catch (error) {
    console.error('[DocumentSchedule] Failed to init schedules:', error);
  }
};

/**
 * Registers a cron job in memory
 */
exports.scheduleJob = (schedule) => {
  // Cancel existing job if restarting
  if (activeJobs.has(schedule.id)) {
    activeJobs.get(schedule.id).stop();
  }

  const job = cron.schedule(schedule.cronExpr, async () => {
    console.log(`[DocumentSchedule] Running scheduled generation for ${schedule.name}`);
    try {
      // Find targets based on targetGroup
      let employees = [];
      if (schedule.targetGroup === 'All Employees') {
        employees = await prisma.employee.findMany({
          where: { companyId: schedule.companyId, status: 'Active' }
        });
      }
      
      // In a real scenario, this could batch process them via queues.
      for (const emp of employees) {
        await distributeDocument({
          templateId: schedule.templateId,
          companyId: schedule.companyId,
          employee: emp,
          data: {
            employee_name: emp.name,
            employee_id: emp.employeeId,
            designation: emp.designation,
            department: emp.department
          },
          methods: ['email'] // Could be read from DB configuration
        });
      }

      await prisma.documentSchedule.update({
        where: { id: schedule.id },
        data: { lastRunAt: new Date() }
      });
      
    } catch (err) {
      console.error(`[DocumentSchedule] Job Error (ID: ${schedule.id}):`, err);
    }
  });

  activeJobs.set(schedule.id, job);
};

/**
 * Cancels a job
 */
exports.cancelJob = (scheduleId) => {
  if (activeJobs.has(scheduleId)) {
    activeJobs.get(scheduleId).stop();
    activeJobs.delete(scheduleId);
  }
};
