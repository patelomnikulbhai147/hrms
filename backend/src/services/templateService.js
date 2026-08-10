const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.createTemplate = async (data) => {
  if (data.status === 'Active') {
    await prisma.documentTemplate.updateMany({
      where: { companyId: Number(data.companyId), type: data.type, status: 'Active' },
      data: { status: 'Archived' }
    });
  }

  return prisma.documentTemplate.create({
    data: {
      companyId: data.companyId,
      branchId: data.branchId || null,
      name: data.name,
      type: data.type,
      status: data.status || 'Draft',
      designType: data.designType || 'HTML',
      content: data.content || '',
      backgroundImage: data.backgroundImage || null,
      version: 1,
      isGlobal: data.isGlobal || false,
      description: data.description || null,
      createdBy: data.createdBy,
      versions: {
        create: {
          version: 1,
          designType: data.designType || 'HTML',
          content: data.content || '',
          backgroundImage: data.backgroundImage || null,
          changeSummary: 'Initial creation',
          createdBy: data.createdBy
        }
      }
    }
  });
};

exports.updateTemplate = async (id, data, userId) => {
  const currentTemplate = await prisma.documentTemplate.findUnique({
    where: { id: Number(id) }
  });

  if (!currentTemplate) throw new Error('Template not found');

  const newVersion = currentTemplate.version + 1;

  if (data.status === 'Active' && currentTemplate.status !== 'Active') {
    await prisma.documentTemplate.updateMany({
      where: { companyId: currentTemplate.companyId, type: currentTemplate.type, status: 'Active' },
      data: { status: 'Archived' }
    });
  }

  return prisma.documentTemplate.update({
    where: { id: Number(id) },
    data: {
      name: data.name || currentTemplate.name,
      status: data.status || currentTemplate.status,
      designType: data.designType || currentTemplate.designType,
      content: data.content !== undefined ? data.content : currentTemplate.content,
      backgroundImage: data.backgroundImage !== undefined ? data.backgroundImage : currentTemplate.backgroundImage,
      description: data.description !== undefined ? data.description : currentTemplate.description,
      version: newVersion,
      versions: {
        create: {
          version: newVersion,
          designType: data.designType || currentTemplate.designType,
          content: data.content !== undefined ? data.content : currentTemplate.content,
          backgroundImage: data.backgroundImage !== undefined ? data.backgroundImage : currentTemplate.backgroundImage,
          changeSummary: data.changeSummary || 'Updated template',
          createdBy: userId
        }
      }
    }
  });
};

exports.getTemplates = async (companyId, query = {}) => {
  return prisma.documentTemplate.findMany({
    where: {
      companyId: Number(companyId),
      ...query
    },
    include: {
      assignments: true,
      _count: {
        select: { usageLogs: true }
      }
    },
    orderBy: { updatedAt: 'desc' }
  });
};

exports.getTemplateById = async (id) => {
  return prisma.documentTemplate.findUnique({
    where: { id: Number(id) },
    include: {
      versions: { orderBy: { version: 'desc' } },
      assignments: true
    }
  });
};

exports.assignTemplate = async (templateId, companyId, targetType, targetId, userId) => {
  return prisma.templateAssignment.upsert({
    where: {
      templateId_targetType_targetId: {
        templateId: Number(templateId),
        targetType,
        targetId: targetId ? Number(targetId) : null
      }
    },
    update: { assignedBy: userId },
    create: {
      templateId: Number(templateId),
      companyId: Number(companyId),
      targetType,
      targetId: targetId ? Number(targetId) : null,
      assignedBy: userId
    }
  });
};

exports.removeAssignment = async (assignmentId) => {
  return prisma.templateAssignment.delete({
    where: { id: Number(assignmentId) }
  });
};

exports.logUsage = async (templateId, companyId, moduleUsedIn, targetEntityId, generatedBy) => {
  return prisma.templateUsageLog.create({
    data: {
      templateId: Number(templateId),
      companyId: Number(companyId),
      moduleUsedIn,
      targetEntityId: targetEntityId ? Number(targetEntityId) : null,
      generatedBy: generatedBy ? Number(generatedBy) : null
    }
  });
};

exports.restoreVersion = async (templateId, versionId, userId) => {
  const versionToRestore = await prisma.templateVersion.findUnique({
    where: { id: Number(versionId) }
  });

  if (!versionToRestore || versionToRestore.templateId !== Number(templateId)) {
    throw new Error('Version not found or mismatch');
  }

  return exports.updateTemplate(templateId, {
    content: versionToRestore.content,
    designType: versionToRestore.designType,
    backgroundImage: versionToRestore.backgroundImage,
    changeSummary: `Restored from version ${versionToRestore.version}`
  }, userId);
};

exports.getMarketplaceTemplates = async () => {
  return prisma.documentTemplate.findMany({
    where: { isGlobal: true },
    orderBy: { updatedAt: 'desc' }
  });
};

exports.duplicateTemplate = async (templateId, targetCompanyId, userId) => {
  const source = await prisma.documentTemplate.findUnique({
    where: { id: Number(templateId) }
  });

  if (!source) throw new Error('Template not found');

  return exports.createTemplate({
    companyId: Number(targetCompanyId),
    name: `${source.name} (Copy)`,
    type: source.type,
    status: 'Draft',
    designType: source.designType,
    content: source.content,
    backgroundImage: source.backgroundImage,
    description: source.description,
    isGlobal: false,
    createdBy: userId
  });
};
