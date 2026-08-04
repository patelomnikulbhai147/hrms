const prisma = require('../config/prisma');
const { ensureEmployeeProfileForUser } = require('../services/userEmployeeProfileService');
const AuditService = require('../services/auditService');

const respond = (res, statusCode, success, message, data = null) => {
  res.status(statusCode).json({
    success,
    message,
    data,
    timestamp: new Date().toISOString()
  });
};

exports.getTypes = (req, res) => {
    const types = [
        "Aadhaar Card",
        "PAN Card",
        "Passport",
        "Driving License",
        "Voter ID",
        "10th Certificate",
        "12th Certificate",
        "Degree Certificate",
        "Relieving Letter",
        "Experience Letter",
        "Payslip",
        "Bank Proof",
        "Other"
    ];
    return respond(res, 200, true, 'Document types retrieved.', types);
};

exports.getAll = async (req, res) => {
  try {
    const { employee } = await ensureEmployeeProfileForUser(req.user);
    if (!employee) return respond(res, 404, false, 'Employee profile not found.');

    const { page = 1, limit = 20, type, status } = req.query;
    
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const skip = (pageNum - 1) * limitNum;

    const where = { employeeId: employee.id };
    if (type) {
        where.type = String(type);
    }
    // Note: status is not explicitly in Document model, but we can filter by remarks or just omit if missing

    const [documents, total] = await Promise.all([
      prisma.document.findMany({
        where,
        select: { // Do not return fileData here to save bandwidth
            id: true,
            name: true,
            type: true,
            uploadedOn: true,
            size: true,
            mimeType: true,
            category: true,
            expiryDate: true,
            documentNumber: true
        },
        orderBy: { id: 'desc' },
        skip,
        take: limitNum
      }),
      prisma.document.count({ where })
    ]);

    return res.status(200).json({
      success: true,
      message: 'Documents retrieved successfully.',
      data: documents,
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[mobileDocumentController.getAll] Error:', error);
    return respond(res, 500, false, 'Failed to fetch documents.');
  }
};

exports.getById = async (req, res) => {
  try {
    const { employee } = await ensureEmployeeProfileForUser(req.user);
    if (!employee) return respond(res, 404, false, 'Employee profile not found.');

    const documentId = parseInt(req.params.id, 10);
    const doc = await prisma.document.findUnique({
        where: { id: documentId }
    });

    if (!doc || doc.employeeId !== employee.id) {
        return respond(res, 404, false, 'Document not found.');
    }

    return respond(res, 200, true, 'Document details retrieved.', doc);
  } catch (error) {
    console.error('[mobileDocumentController.getById] Error:', error);
    return respond(res, 500, false, 'Failed to fetch document.');
  }
};

exports.upload = async (req, res) => {
  try {
    const { employee } = await ensureEmployeeProfileForUser(req.user);
    if (!employee) return respond(res, 404, false, 'Employee profile not found.');

    const { name, type, fileData, mimeType, size, documentNumber, expiryDate } = req.body;
    
    if (!name || !type || !fileData) {
        return respond(res, 400, false, 'name, type, and fileData (base64) are required.');
    }

    // Basic file size validation via base64 length (~ 1.37 * actual size). Max 10MB approx
    if (fileData.length > 14000000) {
        return respond(res, 413, false, 'File size exceeds 10MB limit.');
    }

    const doc = await prisma.document.create({
        data: {
            companyId: employee.companyId,
            branchId: employee.branchId || null,
            name: String(name),
            type: String(type),
            employeeId: employee.id,
            employeeName: employee.name,
            uploadedBy: req.user.name || 'Mobile User',
            uploadedOn: new Date().toISOString().slice(0, 10),
            size: size || 'Unknown',
            fileData: fileData, // Store base64 string
            mimeType: mimeType || 'application/octet-stream',
            documentNumber: documentNumber || null,
            expiryDate: expiryDate || null,
            category: 'HR' // default mapping
        }
    });

    await AuditService.logAudit(req.user.id, 'MOBILE_DOC_UPLOAD', 'Document', doc.id, {
        name: doc.name,
        type: doc.type
    });

    // Exclude fileData from response
    const { fileData: _fd, ...safeDoc } = doc;

    return respond(res, 201, true, 'Document uploaded successfully.', safeDoc);
  } catch (error) {
    console.error('[mobileDocumentController.upload] Error:', error);
    return respond(res, 500, false, 'Failed to upload document.');
  }
};

exports.delete = async (req, res) => {
  try {
    const { employee } = await ensureEmployeeProfileForUser(req.user);
    if (!employee) return respond(res, 404, false, 'Employee profile not found.');

    const documentId = parseInt(req.params.id, 10);
    const existing = await prisma.document.findUnique({
        where: { id: documentId }
    });

    if (!existing || existing.employeeId !== employee.id) {
        return respond(res, 404, false, 'Document not found.');
    }

    await prisma.document.delete({
        where: { id: documentId }
    });

    await AuditService.logAudit(req.user.id, 'MOBILE_DOC_DELETE', 'Document', existing.id, {
        name: existing.name,
        type: existing.type
    });

    return respond(res, 200, true, 'Document deleted successfully.');
  } catch (error) {
    console.error('[mobileDocumentController.delete] Error:', error);
    return respond(res, 500, false, 'Failed to delete document.');
  }
};
