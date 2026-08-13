/**
 * recruitmentCodes.js
 * Generates formatted, sequential human-readable codes for recruitment entities:
 * - Requirements: RQ-YYYY-XXX (e.g. RQ-2026-001)
 * - Job Posts:    JOB-YYYY-XXX (e.g. JOB-2026-001)
 * - Applications: APP-YYYY-XXXXX (e.g. APP-2026-00001)
 */

async function generateRequirementCode(companyId, prisma) {
  const currentYear = new Date().getFullYear();
  const prefix = `RQ-${currentYear}-`;
  
  const lastReq = await prisma.requirement.findFirst({
    where: {
      requirementCode: { startsWith: prefix }
    },
    orderBy: { id: 'desc' },
    select: { requirementCode: true }
  });

  if (!lastReq || !lastReq.requirementCode) {
    return `${prefix}001`;
  }

  const parts = lastReq.requirementCode.split('-');
  const lastSeq = parseInt(parts[parts.length - 1], 10);
  const nextSeq = isNaN(lastSeq) ? 1 : lastSeq + 1;
  return `${prefix}${String(nextSeq).padStart(3, '0')}`;
}

async function generateJobCode(companyId, prisma) {
  const currentYear = new Date().getFullYear();
  const prefix = `JOB-${currentYear}-`;

  const lastJob = await prisma.jobPost.findFirst({
    where: {
      jobCode: { startsWith: prefix }
    },
    orderBy: { id: 'desc' },
    select: { jobCode: true }
  });

  if (!lastJob || !lastJob.jobCode) {
    return `${prefix}001`;
  }

  const parts = lastJob.jobCode.split('-');
  const lastSeq = parseInt(parts[parts.length - 1], 10);
  const nextSeq = isNaN(lastSeq) ? 1 : lastSeq + 1;
  return `${prefix}${String(nextSeq).padStart(3, '0')}`;
}

async function generateApplicationId(companyId, prisma) {
  const currentYear = new Date().getFullYear();
  const prefix = `APP-${currentYear}-`;

  const lastApp = await prisma.application.findFirst({
    where: {
      applicationId: { startsWith: prefix }
    },
    orderBy: { id: 'desc' },
    select: { applicationId: true }
  });

  if (!lastApp || !lastApp.applicationId) {
    return `${prefix}00001`;
  }

  const parts = lastApp.applicationId.split('-');
  const lastSeq = parseInt(parts[parts.length - 1], 10);
  const nextSeq = isNaN(lastSeq) ? 1 : lastSeq + 1;
  return `${prefix}${String(nextSeq).padStart(5, '0')}`;
}

module.exports = {
  generateRequirementCode,
  generateJobCode,
  generateApplicationId
};
