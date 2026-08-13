const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { resolveInvoiceTemplate, renderInvoiceHtml } = require('../services/invoiceTemplateService');
const { actorOf, targetCompanyId } = require('../utils/invoiceScope');
const calc = require('../services/invoiceCalc');

exports.list = async (req, res) => {
  try {
    const companyId = targetCompanyId(req);
    if (!companyId) return res.status(403).json({ error: 'Select a company.' });

    const templates = await prisma.documentTemplate.findMany({
      where: { companyId, type: 'Invoice' },
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: { select: { usageLogs: true } }
      }
    });
    res.json(templates);
  } catch (e) {
    console.error('invoiceTemplate.list', e);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.active = async (req, res) => {
  try {
    const companyId = targetCompanyId(req);
    if (!companyId) return res.status(403).json({ error: 'Select a company.' });
    const branchId = req.query.branchId ? Number(req.query.branchId) : null;
    const { resolveInvoiceTemplate } = require('../services/invoiceTemplateService');
    
    const template = await resolveInvoiceTemplate(companyId, branchId);
    console.log('[InvoiceTemplateResolver]', {
      companyId,
      branchId,
      templateId: template?.id,
      templateName: template?.name
    });
    res.json(template);
  } catch (e) {
    console.error('invoiceTemplate.active', e);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getOne = async (req, res) => {
  try {
    const companyId = targetCompanyId(req);
    const id = Number(req.params.id);
    
    const template = await prisma.documentTemplate.findFirst({
      where: { id, companyId, type: 'Invoice' },
      include: {
        versions: { orderBy: { version: 'desc' } }
      }
    });

    if (!template) return res.status(404).json({ error: 'Template not found' });
    res.json(template);
  } catch (e) {
    console.error('invoiceTemplate.getOne', e);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.create = async (req, res) => {
  try {
    const companyId = targetCompanyId(req);
    const { name, content, status, description, branchId } = req.body;
    
    if (!name) return res.status(400).json({ error: 'Name is required' });

    // If activating, deactivate others
    if (status === 'Active') {
      await prisma.documentTemplate.updateMany({
        where: { companyId, branchId: branchId || null, type: 'Invoice', status: 'Active' },
        data: { status: 'Draft' }
      });
    }

    const template = await prisma.documentTemplate.create({
      data: {
        companyId,
        branchId: branchId || null,
        name,
        type: 'Invoice',
        status: status || 'Draft',
        designType: req.body.designType || 'HTML',
        content: content || '',
        description,
        version: 1,
        createdBy: actorOf(req) ? Number(actorOf(req)) : null,
        versions: {
          create: {
            version: 1,
            designType: req.body.designType || 'HTML',
            content: content || '',
            changeSummary: 'Initial creation',
            createdBy: actorOf(req) ? Number(actorOf(req)) : null
          }
        }
      }
    });

    res.status(201).json(template);
  } catch (e) {
    console.error('invoiceTemplate.create', e);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.update = async (req, res) => {
  try {
    const companyId = targetCompanyId(req);
    const id = Number(req.params.id);
    const { name, content, status, description, branchId } = req.body;

    const existing = await prisma.documentTemplate.findFirst({
      where: { id, companyId, type: 'Invoice' }
    });
    if (!existing) return res.status(404).json({ error: 'Template not found' });

    if (status === 'Active') {
      await prisma.documentTemplate.updateMany({
        where: { companyId, branchId: branchId || null, type: 'Invoice', status: 'Active', id: { not: id } },
        data: { status: 'Draft' }
      });
    }

    const newVersion = existing.version + 1;

    const template = await prisma.documentTemplate.update({
      where: { id },
      data: {
        name: name || existing.name,
        content: content !== undefined ? content : existing.content,
        status: status || existing.status,
        designType: req.body.designType || existing.designType,
        description: description !== undefined ? description : existing.description,
        branchId: branchId !== undefined ? branchId : existing.branchId,
        version: newVersion,
        versions: {
          create: {
            version: newVersion,
            designType: req.body.designType || existing.designType,
            content: content !== undefined ? content : existing.content,
            changeSummary: 'Updated template',
            createdBy: actorOf(req) ? Number(actorOf(req)) : null
          }
        }
      }
    });

    res.json(template);
  } catch (e) {
    console.error('invoiceTemplate.update', e);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.remove = async (req, res) => {
  try {
    const companyId = targetCompanyId(req);
    const id = Number(req.params.id);

    const existing = await prisma.documentTemplate.findFirst({
      where: { id, companyId, type: 'Invoice' }
    });
    if (!existing) return res.status(404).json({ error: 'Template not found' });

    if (existing.status === 'Active') {
      return res.status(400).json({ error: 'Cannot delete an active template' });
    }

    await prisma.documentTemplate.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) {
    console.error('invoiceTemplate.remove', e);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.activate = async (req, res) => {
  try {
    const companyId = targetCompanyId(req);
    const id = Number(req.params.id);

    const existing = await prisma.documentTemplate.findFirst({
      where: { id, companyId, type: 'Invoice' }
    });
    if (!existing) return res.status(404).json({ error: 'Template not found' });

    await prisma.documentTemplate.updateMany({
      where: { companyId, branchId: existing.branchId, type: 'Invoice', status: 'Active' },
      data: { status: 'Draft' }
    });

    const template = await prisma.documentTemplate.update({
      where: { id },
      data: { status: 'Active' }
    });

    res.json(template);
  } catch (e) {
    console.error('invoiceTemplate.activate', e);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.activateDefault = async (req, res) => {
  try {
    const companyId = targetCompanyId(req);
    if (!companyId) return res.status(403).json({ error: 'Select a company.' });

    await prisma.documentTemplate.updateMany({
      where: { companyId, type: 'Invoice', status: 'Active' },
      data: { status: 'Draft' }
    });

    await prisma.invoiceLayout.updateMany({
      where: { companyId, isDefault: true },
      data: { isDefault: false }
    });

    res.json({ ok: true, isDefault: true, name: 'Default Template', message: 'Default Template activated successfully' });
  } catch (e) {
    console.error('invoiceTemplate.activateDefault', e);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.duplicate = async (req, res) => {
  try {
    const companyId = targetCompanyId(req);
    const id = Number(req.params.id);

    const source = await prisma.documentTemplate.findFirst({
      where: { id, companyId, type: 'Invoice' }
    });
    if (!source) return res.status(404).json({ error: 'Template not found' });

    const template = await prisma.documentTemplate.create({
      data: {
        companyId,
        branchId: source.branchId,
        name: `${source.name} (Copy)`,
        type: 'Invoice',
        status: 'Draft',
        designType: 'HTML',
        content: source.content,
        version: 1,
        createdBy: actorOf(req) ? Number(actorOf(req)) : null,
        versions: {
          create: {
            version: 1,
            designType: 'HTML',
            content: source.content,
            changeSummary: 'Duplicated template',
            createdBy: actorOf(req) ? Number(actorOf(req)) : null
          }
        }
      }
    });

    res.status(201).json(template);
  } catch (e) {
    console.error('invoiceTemplate.duplicate', e);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.preview = async (req, res) => {
  try {
    const companyId = targetCompanyId(req);
    const { content } = req.body;

    let company = null;
    if (companyId) {
      company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { name: true, address: true, gstNumber: true, contactEmail: true, contactNumber: true, website: true, logo: true }
      });
    }

    // Map gstNumber to gstin for preview
    const mappedCompany = company ? { ...company, gstin: company.gstNumber } : null;

    const previewData = {
      company: mappedCompany || { name: 'Demo Company', address: '123 Business St', gstin: '27AADCB2230M1Z2' },
      invoice: req.body.invoice || {
        invoiceNumber: 'INV-2023-001',
        invoiceDate: new Date().toISOString(),
        dueDate: new Date(Date.now() + 86400000 * 7).toISOString(),
        billToName: 'Acme Corporation',
        billToAddress: '456 Client Ave, Suite 100',
        billToGstin: '29ABCDE1234F1Z5',
        subtotal: 10000,
        discountTotal: 500,
        cgst: 855,
        sgst: 855,
        igst: 0,
        grandTotal: 11210,
        bankDetails: 'Bank: HDFC Bank\\nAccount: 1234567890\\nIFSC: HDFC0001234',
        notes: 'Thank you for your business!'
      },
      items: req.body.items || [
        { name: 'Web Development Services', description: 'Frontend and Backend Development', quantity: 1, unit: 'Project', rate: 5000, amount: 5000 },
        { name: 'Server Hosting', description: 'Annual server hosting and maintenance', quantity: 12, unit: 'Months', rate: 416.67, amount: 5000 }
      ]
    };

    const html = renderInvoiceHtml(content, previewData);
    res.send(html);
  } catch (e) {
    console.error('invoiceTemplate.preview', e);
    res.status(500).json({ error: 'Server error' });
  }
};
