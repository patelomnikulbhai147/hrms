/**
 * Shared next-id for Company / Branch.
 *
 * Company.id and Branch.id live in ONE collision-free numeric namespace (the
 * app matches a workspace id against both companyId and branchId). MySQL keeps
 * a separate AUTO_INCREMENT counter per table, which would eventually collide,
 * so new company/branch ids are assigned from a single shared sequence:
 *   next id = max(max(Company.id), max(Branch.id)) + 1
 */
const prisma = require('../config/prisma');

async function nextEntityId() {
  const [c, b] = await Promise.all([
    prisma.company.aggregate({ _max: { id: true } }),
    prisma.branch.aggregate({ _max: { id: true } }),
  ]);
  return Math.max(c._max.id || 0, b._max.id || 0) + 1;
}

/**
 * Company-scoped branch number. Each company keeps its OWN 1..N branch
 * sequence (branchNo restarts at 1 per company), independent of the global
 * Branch.id namespace used for relationships. A new branch gets
 *   next branchNo = max(branchNo WHERE companyId) + 1
 */
async function nextBranchNo(companyId) {
  const cid = Number(companyId);
  if (!cid) return 1;
  const agg = await prisma.branch.aggregate({
    where: { companyId: cid },
    _max: { branchNo: true },
  });
  return (agg._max.branchNo || 0) + 1;
}

module.exports = { nextEntityId, nextBranchNo };
