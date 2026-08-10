const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.createApprovalWorkflow = async (companyId, documentId, approvers) => {
  // approvers: [{ level: 1, role: 'HR', id: 5 }, { level: 2, role: 'Finance' }]
  try {
    const workflowPromises = approvers.map(approver => 
      prisma.documentApprovalWorkflow.create({
        data: {
          companyId,
          documentId,
          level: approver.level,
          approverRole: approver.role,
          approverId: approver.id || null
        }
      })
    );
    await Promise.all(workflowPromises);
    
    // Log Audit
    await prisma.documentAuditLog.create({
      data: {
        companyId,
        documentId,
        action: 'Approval Workflow Created',
        performedBy: 'System'
      }
    });

    return true;
  } catch (error) {
    throw new Error('Failed to create workflow: ' + error.message);
  }
};

exports.approveDocument = async (workflowId, approverId, comments, signatureUrl) => {
  try {
    const step = await prisma.documentApprovalWorkflow.findUnique({ where: { id: workflowId } });
    if (!step) throw new Error('Workflow step not found');
    
    if (step.status !== 'Pending') throw new Error('Step is already ' + step.status);

    const updated = await prisma.documentApprovalWorkflow.update({
      where: { id: workflowId },
      data: {
        status: 'Approved',
        comments,
        signatureUrl,
        approverId, // lock in who actually approved it if it was role-based
        actionAt: new Date()
      }
    });

    // Log Audit
    await prisma.documentAuditLog.create({
      data: {
        companyId: updated.companyId,
        documentId: updated.documentId,
        action: 'Document Approved',
        performedBy: `User:${approverId}`
      }
    });

    return updated;
  } catch (error) {
    throw new Error('Approval failed: ' + error.message);
  }
};
