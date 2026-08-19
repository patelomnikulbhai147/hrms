/**
 * Tender Information — future-ready tender management. The current version is a
 * placeholder (no live tender API integration), but the table + endpoints are
 * ready so real Government / Private / HR-Service / Recruitment / Vendor tenders
 * can be ingested later. Reads are workspace-scoped on the backend.
 */
const prisma = require('../config/prisma');
const idParam = require('../utils/idParam');

// Includes company-wide grants AND specific branch grants, so a branch-restricted
// user is scoped to exactly their branch workspace(s) — never sibling branches.
const allowedIdsFor = (req) =>
  [req.user?.companyId, ...(req.user?.accessibleCompanyIds || []), ...(req.user?.accessibleBranchIds || [])].filter(Boolean);

// Tenders carry commercial terms (value) — only Company Head / Super Admin may
// create, edit, convert or delete. HR is view-only on tenders & contracts.
const canManageTenders = (req) => ['Super Admin', 'Company Head'].includes(req.user?.role);

// Load a tender and verify it belongs to the caller's workspace BEFORE any
// update/delete. Without this a Company Head of company A could edit or delete
// company B's tender (commercial value) by naming its id. Returns the tender, or
// sends the response (404) and returns null. Mirrors create's allowedIdsFor check.
async function loadOwnedTender(req, res) {
  const id = idParam(req.params.id);
  const tender = await prisma.tender.findUnique({ where: { id } });
  if (!tender) { res.status(404).json({ error: 'Tender not found.' }); return null; }
  if (req.user?.role !== 'Super Admin') {
    const allowed = allowedIdsFor(req);
    const ok = (tender.companyId != null && allowed.includes(tender.companyId)) ||
               (tender.branchId != null && allowed.includes(tender.branchId));
    if (!ok) { res.status(404).json({ error: 'Tender not found.' }); return null; }
  }
  return tender;
}

exports.getAll = async (req, res) => {
  try {
    const companyId = req.query.all === 'true' ? null : idParam(req.query.companyId || req.headers['x-workspace-id']);
    let where = {};
    if (req.user && req.user.role !== 'Super Admin') {
      const allowed = allowedIdsFor(req);
      // Company-wide tenders (companyId null) are visible to everyone; otherwise
      // scope to the caller's accessible companies.
      where.OR = [{ companyId: null }, { companyId: { in: allowed } }];
    } else if (companyId) {
      where.OR = [{ companyId: null }, { companyId }];
    }
    const tenders = await prisma.tender.findMany({ where, orderBy: { createdAt: 'desc' } });
    res.json(tenders);
  } catch (e) {
    console.error('tender.getAll', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

exports.create = async (req, res) => {
  try {
    if (!canManageTenders(req)) return res.status(403).json({ error: 'You do not have permission to manage tenders.' });
    const b = req.body || {};
    if (!b.tenderName || !String(b.tenderName).trim()) {
      return res.status(400).json({ error: 'Tender name is required.' });
    }
    let companyId = idParam(b.companyId || req.headers['x-workspace-id']);
    if (req.user && req.user.role !== 'Super Admin') {
      const allowed = allowedIdsFor(req);
      if (companyId && !allowed.includes(companyId)) {
        return res.status(403).json({ error: 'You cannot create tenders outside your workspace.' });
      }
      if (!companyId) companyId = req.user.companyId;
    }
    const tender = await prisma.tender.create({
      data: {
        tenderNumber: b.tenderNumber || null,
        tenderName: String(b.tenderName).trim(),
        department: b.department || null,
        tenderValue: Number(b.tenderValue) || 0,
        publishDate: b.publishDate || null,
        closingDate: b.closingDate || null,
        status: b.status || 'Draft',
        documentPath: b.documentPath || null,
        category: b.category || null,
        companyId: companyId ?? null,
        notes: b.notes || null,
        clientName: b.clientName || null,
        branchId: b.branchId ? idParam(b.branchId) : null,
        serviceType: b.serviceType || null,
        startDate: b.startDate || null,
        endDate: b.endDate || null,
        remarks: b.remarks || null,
      },
    });
    res.status(201).json(tender);
  } catch (e) {
    console.error('tender.create', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

exports.update = async (req, res) => {
  try {
    if (!canManageTenders(req)) return res.status(403).json({ error: 'You do not have permission to manage tenders.' });
    if (!(await loadOwnedTender(req, res))) return;
    const id = idParam(req.params.id);
    const fields = [
      'tenderNumber', 'tenderName', 'department', 'publishDate', 'closingDate', 'status',
      'documentPath', 'category', 'notes', 'clientName', 'serviceType', 'startDate', 'endDate',
      'remarks', 'submissionOutcome', 'submissionDate'
    ];
    const data = {};
    for (const f of fields) if (req.body[f] !== undefined) data[f] = req.body[f];
    if (req.body.tenderValue !== undefined) data.tenderValue = Number(req.body.tenderValue) || 0;
    if (req.body.quotedValue !== undefined) data.quotedValue = Number(req.body.quotedValue) || 0;
    if (req.body.branchId !== undefined) data.branchId = req.body.branchId ? idParam(req.body.branchId) : null;

    // Submission workflow status & outcome synchronization
    if (req.body.status === 'Submitted') {
      data.status = 'Submitted';
      if (!data.submissionOutcome || data.submissionOutcome === 'NOT_SUBMITTED') {
        data.submissionOutcome = 'UNDER_EVALUATION';
      }
      data.submittedAt = new Date();
      data.submissionDate = data.submissionDate || new Date().toISOString().slice(0, 10);
      data.submittedByUserId = req.user?.id || null;
    } else if (req.body.status === 'Won') {
      data.submissionOutcome = 'AWARDED';
    } else if (req.body.status === 'Lost') {
      data.submissionOutcome = 'NOT_AWARDED';
    }

    // Explicit submissionOutcome updates (UNDER_EVALUATION, AWARDED, NOT_AWARDED, WITHDRAWN)
    if (req.body.submissionOutcome) {
      data.submissionOutcome = req.body.submissionOutcome;
      if (req.body.submissionOutcome === 'AWARDED') {
        data.status = 'Won';
      } else if (req.body.submissionOutcome === 'NOT_AWARDED') {
        data.status = 'Lost';
      }
    }

    const tender = await prisma.tender.update({ where: { id }, data });
    res.json(tender);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Tender not found.' });
    console.error('tender.update', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

exports.remove = async (req, res) => {
  try {
    if (!canManageTenders(req)) return res.status(403).json({ error: 'You do not have permission to manage tenders.' });
    if (!(await loadOwnedTender(req, res))) return;
    const id = idParam(req.params.id);
    await prisma.tender.delete({ where: { id } });
    res.json({ message: 'Deleted' });
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Tender not found.' });
    console.error('tender.remove', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

// POST /api/tenders/:id/convert — a Won tender becomes a Contract (1:1).
// Auto-fills the contract from the tender; idempotent (returns the existing
// contract if already converted).
exports.convertToContract = async (req, res) => {
  try {
    if (!canManageTenders(req)) return res.status(403).json({ error: 'Only a Company Head can convert a tender to a contract.' });
    const id = idParam(req.params.id);
    const tender = await prisma.tender.findUnique({ where: { id } });
    if (!tender) return res.status(404).json({ error: 'Tender not found.' });
    if (req.user?.role !== 'Super Admin') {
      const allowed = allowedIdsFor(req);
      if (tender.companyId && !allowed.includes(tender.companyId)) return res.status(403).json({ error: 'This tender is outside your workspace.' });
    }
    if (String(tender.status).toLowerCase() !== 'won') {
      return res.status(400).json({ error: 'Only a tender with status "Won" can be converted to a contract.' });
    }
    // Idempotent — if already converted, return the existing contract.
    if (tender.convertedContractId) {
      const existing = await prisma.contract.findUnique({ where: { id: tender.convertedContractId } });
      if (existing) return res.json({ contract: existing, alreadyConverted: true });
    }
    const companyId = tender.companyId || req.user?.companyId;
    if (!companyId) return res.status(400).json({ error: 'Tender has no company; cannot create a contract.' });

    const contract = await prisma.contract.create({
      data: {
        contractNumber: tender.tenderNumber ? `C-${tender.tenderNumber}` : null,
        contractName: tender.tenderName,
        clientName: tender.clientName || null,
        companyId,
        branchId: tender.branchId || null,
        tenderId: tender.id,
        contractValue: tender.tenderValue || 0,
        startDate: tender.startDate || null,
        endDate: tender.endDate || null,
        status: 'Active',
        documentPath: tender.documentPath || null,
        notes: tender.remarks || tender.notes || null,
      },
    });
    await prisma.tender.update({ where: { id }, data: { convertedContractId: contract.id } });
    res.status(201).json({ contract });
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'This tender already has a contract.' });
    console.error('tender.convertToContract', e);
    res.status(500).json({ error: 'Could not convert the tender to a contract.' });
  }
};

exports.syncExternal = async (req, res) => {
  try {
    if (!canManageTenders(req)) return res.status(403).json({ error: 'You do not have permission to manage tenders.' });
    const axios = require('axios');

    const apiUrl = (process.env.TENDERGURUJI_API_URL || 'https://tenderguruji.com/api/export/manpower-tenders').trim();
    const apiKey = (process.env.TENDERGURUJI_API_KEY || '').trim();

    if (!apiKey) {
      return res.json({
        success: false,
        source: 'TenderGuruji',
        errorCode: 'TENDERGURUJI_AUTH_FAILED',
        error: 'TenderGuruji authentication failed. Please verify API credentials in backend/.env.',
        message: 'TenderGuruji authentication failed. Please verify API credentials in backend/.env.'
      });
    }

    const headers = {
      'Accept': 'application/json',
      'X-API-Key': apiKey
    };

    let page = 1;
    const limit = 100;
    let allTenders = [];
    let hasMorePages = true;
    const maxPages = 3; // Fetch up to 300 tenders per sync operation for fast, reliable ingestion

    while (hasMorePages && page <= maxPages) {
      try {
        const response = await axios.get(apiUrl, {
          timeout: 15000,
          params: { page, limit },
          headers
        });

        const resData = response.data;
        let pageItems = [];

        if (Array.isArray(resData)) {
          pageItems = resData;
        } else if (resData && Array.isArray(resData.data)) {
          pageItems = resData.data;
        } else if (resData && Array.isArray(resData.tenders)) {
          pageItems = resData.tenders;
        } else if (resData && Array.isArray(resData.items)) {
          pageItems = resData.items;
        }

        if (!pageItems.length) {
          hasMorePages = false;
          break;
        }

        allTenders.push(...pageItems);

        const totalPages = resData?.totalPages || resData?.pagination?.totalPages || resData?.meta?.totalPages;
        const totalCount = resData?.total || resData?.totalCount || resData?.pagination?.total;

        if (totalPages && page >= totalPages) {
          hasMorePages = false;
        } else if (totalCount && allTenders.length >= totalCount) {
          hasMorePages = false;
        } else if (pageItems.length < limit) {
          hasMorePages = false;
        } else {
          page++;
        }
      } catch (apiError) {
        const status = apiError.response ? apiError.response.status : 500;
        let errorMsg = 'Unknown error occurred while fetching external tenders.';
        let errorCode = 'TENDERGURUJI_ERROR';

        if (status === 401 || status === 403) {
          errorCode = 'TENDERGURUJI_AUTH_FAILED';
          errorMsg = 'TenderGuruji authentication failed. Please verify API credentials.';
        } else if (status === 404) {
          errorCode = 'TENDERGURUJI_NOT_FOUND';
          errorMsg = 'TenderGuruji endpoint not found.';
        } else if (status === 429) {
          errorCode = 'TENDERGURUJI_RATE_LIMIT';
          errorMsg = 'TenderGuruji API rate limit reached. Please try again later.';
        } else if (status >= 500) {
          errorCode = 'TENDERGURUJI_SERVICE_UNAVAILABLE';
          errorMsg = 'TenderGuruji service is temporarily unavailable.';
        } else if (apiError.code === 'ECONNABORTED' || apiError.code === 'ETIMEDOUT') {
          errorCode = 'TENDERGURUJI_TIMEOUT';
          errorMsg = 'TenderGuruji request timed out. Please try again.';
        } else {
          errorMsg = apiError.response?.data?.message || apiError.message || errorMsg;
        }

        return res.json({
          success: false,
          source: 'TenderGuruji',
          errorCode,
          error: errorMsg,
          message: errorMsg,
          details: apiError.response?.data || null
        });
      }
    }

    const companyId = req.user?.companyId || null;

    const existingRecords = await prisma.tender.findMany({
      where: { source: 'TenderGuruji', companyId },
      select: { id: true, externalId: true, status: true, submissionOutcome: true }
    });
    const existingMap = new Map(existingRecords.filter(r => r.externalId).map(r => [String(r.externalId), r]));

    let createdCount = 0;
    let updatedCount = 0;

    for (const extTender of allTenders) {
      const extId = String(
        extTender.id ||
        extTender.bidId ||
        extTender.gemBidId ||
        extTender.gemNumericId ||
        ''
      ).trim();

      if (!extId) continue;

      const tenderName = String(
        extTender.title ||
        extTender.items ||
        extTender.gemBidId ||
        'Untitled Manpower Tender'
      ).trim();

      const tenderNumber = extTender.gemBidId || extTender.bidId || extTender.raNo || extTender.referenceNumber || null;
      const clientName = extTender.organization || extTender.department || extTender.clientName || 'Government / Defense Dept';
      const department = extTender.stateCode || extTender.department || extTender.location || null;
      const category = extTender.category || 'Government';
      const serviceType = extTender.serviceType || 'Manpower Outsourcing';
      const publishDate = extTender.publishedAt || extTender.bidStartDate || extTender.scrapedAt || null;
      const closingDate = extTender.bidEndDate || extTender.closingDate || null;

      const val = extTender.estimatedValue || (extTender.estimatedValueCr ? extTender.estimatedValueCr * 10000000 : 0);
      const tenderValue = Number(val) || 0;

      const rawStatus = String(extTender.status || '').toLowerCase();
      const status = (rawStatus === 'live' || rawStatus === 'active' || rawStatus === 'open') ? 'Live' : 'Draft';

      const sourceUrl = extTender.bidPdfUrl || extTender.raPdfUrl || extTender.sourceUrl || extTender.url || null;
      const notes = extTender.items ? `Items: ${extTender.items}${extTender.quantity ? ` | Quantity: ${extTender.quantity}` : ''}` : null;

      const data = {
        tenderNumber,
        tenderName,
        clientName,
        department,
        category,
        serviceType,
        publishDate,
        closingDate,
        tenderValue,
        status,
        source: 'TenderGuruji',
        externalId: extId,
        sourceUrl,
        notes,
        companyId
      };

      if (existingMap.has(extId)) {
        const existingRecord = existingMap.get(extId);
        
        // Internal workflow protection: DO NOT overwrite internal workflow fields if already submitted / processed
        const isSubmittedOrProcessed = 
          ['Submitted', 'Under Review', 'Won', 'Lost', 'Cancelled'].includes(existingRecord.status) ||
          (existingRecord.submissionOutcome && existingRecord.submissionOutcome !== 'NOT_SUBMITTED');

        const updateData = {
          tenderNumber,
          tenderName,
          clientName,
          department,
          category,
          serviceType,
          publishDate,
          closingDate,
          tenderValue,
          sourceUrl,
        };

        if (!isSubmittedOrProcessed) {
          updateData.status = status;
          updateData.notes = notes;
        }

        await prisma.tender.update({ where: { id: existingRecord.id }, data: updateData });
        updatedCount++;
      } else {
        const created = await prisma.tender.create({ data });
        existingMap.set(extId, created);
        createdCount++;
      }
    }

    res.json({
      success: true,
      source: 'TenderGuruji',
      message: 'Sync complete',
      synced: createdCount + updatedCount,
      created: createdCount,
      updated: updatedCount,
      totalFetched: allTenders.length
    });
  } catch (e) {
    console.error('tender.syncExternal', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};
