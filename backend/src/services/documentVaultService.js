const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const ocrService = require('./ocrService');

exports.getVaultHierarchy = async (companyId, parentId = null) => {
  try {
    const folders = await prisma.documentFolder.findMany({
      where: { companyId, parentId },
      orderBy: { name: 'asc' }
    });

    const documents = await prisma.documentVault.findMany({
      where: { companyId, folderId: parentId, isArchived: false },
      orderBy: { createdAt: 'desc' }
    });

    return { folders, documents };
  } catch (error) {
    throw new Error('Failed to fetch vault hierarchy: ' + error.message);
  }
};

exports.createFolder = async (companyId, name, parentId = null) => {
  try {
    const folder = await prisma.documentFolder.create({
      data: { companyId, name, parentId }
    });
    return folder;
  } catch (error) {
    throw new Error('Failed to create folder: ' + error.message);
  }
};

exports.uploadDocument = async (data) => {
  try {
    // Run OCR Analysis
    const { ocrText, extractedData } = await ocrService.extractData(data.url, data.fileType);

    const document = await prisma.documentVault.create({
      data: {
        companyId: data.companyId,
        folderId: data.folderId,
        name: data.name,
        originalName: data.originalName,
        fileType: data.fileType,
        size: data.size,
        url: data.url,
        uploadedBy: data.uploadedBy,
        tags: data.tags || [],
        category: data.category,
        ocrText,
        extractedData
      }
    });
    
    // Log Audit
    await prisma.documentAuditLog.create({
      data: {
        companyId: data.companyId,
        documentId: document.id,
        action: 'Upload',
        performedBy: `User:${data.uploadedBy}`
      }
    });

    return document;
  } catch (error) {
    throw new Error('Failed to upload document: ' + error.message);
  }
};

exports.getStorageMetrics = async (companyId) => {
  try {
    const documents = await prisma.documentVault.findMany({
      where: { companyId, isArchived: false },
      select: { size: true, fileType: true, createdAt: true }
    });

    const totalUsed = documents.reduce((acc, doc) => acc + doc.size, 0);
    const count = documents.length;
    
    // Group by type for charts
    const typeDistribution = documents.reduce((acc, doc) => {
      acc[doc.fileType] = (acc[doc.fileType] || 0) + doc.size;
      return acc;
    }, {});

    return {
      totalUsed, // in bytes
      count,
      typeDistribution,
      quota: 5368709120 // e.g., 5GB default quota
    };
  } catch (error) {
    throw new Error('Failed to fetch metrics: ' + error.message);
  }
};

exports.getPortalDocuments = async (companyId, portalUserId) => {
  try {
    // Basic implementation: fetch all documents assigned/accessible to this portal client.
    // To implement strict sharing, we would look at DocumentApprovalWorkflow or 
    // a DocumentAssignment model. For now, fetch generic documents labeled 'Portal'.
    return await prisma.documentVault.findMany({
      where: { companyId, category: 'Portal', isArchived: false },
      orderBy: { createdAt: 'desc' }
    });
  } catch (error) {
    throw new Error('Failed to fetch portal documents: ' + error.message);
  }
};
