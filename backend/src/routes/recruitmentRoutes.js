const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const prisma = require('../config/prisma');
const { protect } = require('../middleware/authMiddleware');
const { generateRequirementCode, generateJobCode, generateApplicationId } = require('../utils/recruitmentCodes');
const { analyzeCandidateMatch, computeAnalysisHash, computeRequirementHash } = require('../services/atsEngine');
const {
  sendFixedInterviewEmail,
  sendCandidateScheduleInviteEmail,
  sendInterviewBookingConfirmationEmail,
  sendOfferLetterEmail
} = require('../services/recruitmentMailer');
const { notify } = require('../services/notificationService');
const slotEngine = require('../services/interviewSlots');
const { targetCompanyId } = require('../utils/workspaceScope');
const { requireModuleAccess } = require('../middleware/rbacMiddleware');

const router = express.Router();

// Role-default fallback for users whose permission matrix predates the
// Recruitment module — mirrors NEW_MODULE_ROLE_DEFAULTS.recruitment in the
// frontend PermissionContext so API and UI agree.
const RECRUITMENT_ROLE_DEFAULTS = {
  view: ['HR', 'Finance', 'Manager'],
  edit: ['HR'],
  export: ['HR'],
};

// ── Uploads configuration ────────────────────────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, '../../uploads/resumes');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const sanitized = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `${timestamp}_${sanitized}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = ['.pdf', '.doc', '.docx'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only PDF, DOC, and DOCX resumes are allowed.'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

/**
 * Tenant resolution — the COMPANY the request operates on.
 *
 * Recruitment data belongs to the COMPANY/TENANT, never to the individual user
 * who created it. This resolves through utils/workspaceScope (the standard
 * tenant resolver), which:
 *   • maps a BRANCH workspace/user to its PARENT COMPANY (User.companyId and
 *     x-workspace-id may hold a branch id — Company and Branch share one id
 *     sequence), so every authorized user of a company reads and writes the
 *     same rows;
 *   • validates any client-named workspace (?companyId= / x-workspace-id)
 *     against the caller's grants — a spoofed id from React is refused, not
 *     trusted;
 *   • leaves Super Admin free to name any workspace.
 *
 * Returns the company id, or -1 when no authorized company can be determined
 * (-1 matches no rows, and write endpoints reject it explicitly).
 *
 * The previous implementation returned `req.user.companyId` RAW — for a user
 * attached to a branch this scoped all recruitment data to the branch id, so
 * jobs became visible only to users sharing that exact id (in practice: only
 * the creator). It also trusted client-supplied companyId as a fallback.
 */
function resolveCompanyId(req) {
  const c = targetCompanyId(req);
  return Number.isFinite(c) && c > 0 ? c : -1;
}

/**
 * Automatically integrates accepted/joined candidate into the main ZeniaHR Employee table.
 * Prevents duplicate employee creation by checking existing email and phone.
 */
async function autoOnboardCandidateToEmployee(applicationId, companyId) {
  try {
    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        requirement: true,
        offers: { orderBy: { id: 'desc' }, take: 1 }
      }
    });

    if (!application) return null;

    const email = application.email.trim().toLowerCase();
    const phone = application.mobile ? application.mobile.trim() : null;

    // Check if employee already exists in this company
    const existing = await prisma.employee.findFirst({
      where: {
        companyId: application.companyId,
        OR: [
          { email },
          ...(phone ? [{ phone }] : [])
        ]
      }
    });

    if (existing) {
      console.log(`[Recruitment-Onboarding] Employee already exists (#${existing.id} - ${existing.email}). Skipping duplicate creation.`);
      await prisma.applicationTimeline.create({
        data: {
          applicationId: application.id,
          action: 'Employee Record Linked',
          description: `Candidate profile matches existing employee record (${existing.employeeId}).`
        }
      });
      return existing;
    }

    // Generate unique sequential employee code (e.g. EMP-001)
    const count = await prisma.employee.count({ where: { companyId: application.companyId } });
    const empSeq = String(count + 1).padStart(3, '0');
    const employeeIdCode = `EMP-${empSeq}`;

    const nameParts = (application.fullName || '').trim().split(/\s+/);
    const firstName = nameParts[0] || 'Staff';
    const lastName = nameParts.slice(1).join(' ') || '';

    const latestOffer = application.offers?.[0];
    let joinDateObj = new Date();
    if (latestOffer?.joiningDate) {
      const parsedDate = new Date(latestOffer.joiningDate);
      if (!isNaN(parsedDate.getTime())) joinDateObj = parsedDate;
    }

    let salaryVal = 0;
    if (latestOffer?.salary) {
      const numMatch = String(latestOffer.salary).replace(/,/g, '').match(/\d+/);
      if (numMatch) salaryVal = parseFloat(numMatch[0]);
    } else if (application.requirement?.salaryMin) {
      salaryVal = application.requirement.salaryMin;
    }

    const newEmployee = await prisma.employee.create({
      data: {
        employeeId: employeeIdCode,
        companyId: application.companyId,
        name: application.fullName.trim(),
        firstName,
        lastName,
        email,
        phone: application.mobile,
        department: application.requirement?.department || 'Engineering',
        designation: latestOffer?.designation || application.requirement?.jobTitle || 'Software Engineer',
        location: application.city || application.requirement?.location || 'Headquarters',
        joinDate: joinDateObj,
        salary: salaryVal,
        status: 'Active',
        role: 'Staff'
      }
    });

    await prisma.applicationTimeline.create({
      data: {
        applicationId: application.id,
        action: 'Employee Auto-Onboarded',
        description: `Candidate successfully created in Employee Management with Employee ID: ${employeeIdCode}.`
      }
    });

    console.log(`[Recruitment-Onboarding] Successfully created employee #${newEmployee.id} (${employeeIdCode}) for candidate ${application.fullName}`);
    return newEmployee;
  } catch (error) {
    console.error('[Recruitment-Onboarding] Failed to auto-onboard candidate to employee:', error);
    return null;
  }
}

/**
 * Runs (or re-runs) ATS analysis for one application in the background.
 * The single ATS entry point for apply / retry / requirement-change triggers.
 *
 * - Reuses the cached structured resume parse when the file is unchanged, so a
 *   requirement edit only re-SCORES (no re-extraction, no AI call).
 * - Skips entirely when both resume and requirement are unchanged, unless
 *   `force` is set (explicit "Retry ATS" button).
 */
async function runAtsForApplication(appId, { force = false, trigger = 'Application submitted' } = {}) {
  const application = await prisma.application.findUnique({
    where: { id: appId },
    include: { requirement: true }
  });
  if (!application || !application.resumePath) return;

  const resumeFullPath = path.join(UPLOAD_DIR, application.resumePath);
  const currentHash = computeAnalysisHash(resumeFullPath, application.requirement);

  if (!force && currentHash && application.analysisHash === currentHash && application.analysisStatus === 'COMPLETED') {
    console.log(`[ATS-Worker] App #${appId}: resume and requirement unchanged — skipping re-analysis.`);
    return;
  }

  await prisma.application.update({
    where: { id: appId },
    data: { analysisStatus: 'PROCESSING' }
  }).catch(() => null);

  try {
    const atsResult = await analyzeCandidateMatch(resumeFullPath, application.requirement, {
      cachedParsedResume: application.parsedResume || null
    });

    await prisma.application.update({
      where: { id: appId },
      data: {
        analysisStatus: atsResult.status || 'COMPLETED',
        atsMatchScore: atsResult.ats_match_score || 0,
        skillsScore: atsResult.skills_score || 0,
        experienceScore: atsResult.experience_score || 0,
        educationScore: atsResult.education_score || 0,
        projectsScore: atsResult.projects_score || 0,
        jobDescriptionScore: atsResult.job_description_score || 0,
        matchedSkills: atsResult.matched_skills || [],
        missingSkills: atsResult.missing_skills || [],
        warnings: atsResult.warnings || [],
        aiSummary: atsResult.ai_summary || '',
        matchBreakdown: atsResult.match_breakdown || {},
        parsedResume: atsResult.parsed_data || undefined,
        analysisHash: atsResult.analysis_hash || currentHash || null,
        analyzedAt: new Date()
      }
    });

    await prisma.applicationTimeline.create({
      data: {
        applicationId: appId,
        action: 'ATS Analysis Complete',
        description: `${trigger}: match calculated ${atsResult.ats_match_score}% (skills ${atsResult.skills_score}/40, experience ${atsResult.experience_score}/25, role ${atsResult.projects_score}/15).`
      }
    });

    console.log(`[ATS-Worker] App #${appId}: analysis complete (${atsResult.ats_match_score}%).`);
  } catch (err) {
    console.error(`[ATS-Worker] App #${appId} failed:`, err);
    await prisma.application.update({
      where: { id: appId },
      data: {
        analysisStatus: 'FAILED',
        aiSummary: `ATS analysis failed: ${err.message}`,
        analyzedAt: new Date()
      }
    }).catch(() => null);
  }
}

/** Re-run ATS for every application of a requirement (fired when the job's ATS-relevant fields change). */
function reanalyzeRequirementApplications(requirementId, trigger) {
  setImmediate(async () => {
    try {
      const apps = await prisma.application.findMany({
        where: { requirementId },
        select: { id: true }
      });
      console.log(`[ATS-Worker] Requirement #${requirementId} changed — re-scoring ${apps.length} application(s).`);
      for (const a of apps) {
        await runAtsForApplication(a.id, { trigger });
      }
    } catch (err) {
      console.error(`[ATS-Worker] Requirement #${requirementId} re-analysis sweep failed:`, err);
    }
  });
}

/**
 * A self-scheduling link stays valid for 48h after (re)issue, and never dies
 * before the availability window it advertises has ended.
 */
function isScheduleInviteExpired(interview) {
  const issuedAt = interview.tokenIssuedAt || interview.createdAt;
  const elapsedHours = (Date.now() - new Date(issuedAt).getTime()) / (1000 * 60 * 60);
  if (elapsedHours <= 48) return false;
  if (interview.availableTo && slotEngine.isValidDateStr(interview.availableTo)) {
    const { date: today } = slotEngine.nowInTimezone(interview.timezone || 'Asia/Kolkata');
    if (today <= interview.availableTo) return false;
  }
  return true;
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. PUBLIC CANDIDATE ENDPOINTS (NO JWT REQUIRED)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/recruitment/public/job-posts/:jobCode
 * Fetch public job posting details.
 */
router.get('/public/job-posts/:jobCode', async (req, res) => {
  try {
    const { jobCode } = req.params;
    let job = await prisma.jobPost.findUnique({
      where: { jobCode },
      include: {
        requirement: {
          select: {
            id: true,
            status: true,
            jobTitle: true,
            department: true,
            location: true,
            workMode: true,
            employmentType: true,
            salaryMin: true,
            salaryMax: true,
            experience: true,
            qualification: true,
            requiredSkills: true,
            jobDescription: true,
            responsibilities: true,
            applicationDeadline: true
          }
        }
      }
    });

    if (!job) {
      // Fallback: check if the param is a requirementCode (e.g. RQ-2026-026) or requirement ID
      const reqRecord = await prisma.requirement.findFirst({
        where: {
          OR: [
            { requirementCode: jobCode },
            ...(!isNaN(Number(jobCode)) ? [{ id: Number(jobCode) }] : [])
          ]
        },
        include: {
          jobPosts: true
        }
      });

      if (reqRecord) {
        let jPost = reqRecord.jobPosts?.find(j => j.status === 'PUBLISHED') || reqRecord.jobPosts?.[0];
        if (!jPost) {
          const newJobCode = await generateJobCode(reqRecord.companyId, prisma);
          jPost = await prisma.jobPost.create({
            data: {
              companyId: reqRecord.companyId,
              jobCode: newJobCode,
              requirementId: reqRecord.id,
              jobTitle: reqRecord.jobTitle,
              department: reqRecord.department,
              location: reqRecord.location,
              workMode: reqRecord.workMode,
              employmentType: reqRecord.employmentType,
              salaryMin: reqRecord.salaryMin,
              salaryMax: reqRecord.salaryMax,
              experience: reqRecord.experience,
              qualification: reqRecord.qualification,
              numberOfOpenings: reqRecord.numberOfOpenings,
              requiredSkills: reqRecord.requiredSkills,
              jobDescription: reqRecord.jobDescription,
              responsibilities: reqRecord.responsibilities,
              applicationDeadline: reqRecord.applicationDeadline,
              status: reqRecord.status === 'OPEN' ? 'PUBLISHED' : 'DRAFT'
            }
          });
        }
        job = {
          ...jPost,
          requirement: {
            id: reqRecord.id,
            status: reqRecord.status,
            jobTitle: reqRecord.jobTitle,
            department: reqRecord.department,
            location: reqRecord.location,
            workMode: reqRecord.workMode,
            employmentType: reqRecord.employmentType,
            salaryMin: reqRecord.salaryMin,
            salaryMax: reqRecord.salaryMax,
            experience: reqRecord.experience,
            qualification: reqRecord.qualification,
            requiredSkills: reqRecord.requiredSkills,
            jobDescription: reqRecord.jobDescription,
            responsibilities: reqRecord.responsibilities,
            applicationDeadline: reqRecord.applicationDeadline
          }
        };
      }
    }

    if (!job) {
      return res.status(404).json({ error: 'Job posting not found.' });
    }

    if (job.status !== 'PUBLISHED' && job.requirement?.status !== 'OPEN') {
      return res.status(403).json({ error: 'This position is no longer active or accepting applications.' });
    }

    const company = await prisma.company.findUnique({
      where: { id: job.companyId },
      select: { name: true, logo: true, logoImage: true, shortName: true }
    }).catch(() => null);

    res.json({
      ...job,
      company: company || { name: 'ZeniaHR Enterprise' }
    });
  } catch (error) {
    console.error('Public job fetch error:', error);
    res.status(500).json({ error: 'Failed to retrieve job details.' });
  }
});

/**
 * POST /api/recruitment/public/apply
 * Candidate submits application + resume file (multipart/form-data).
 */
router.post('/public/apply', upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Resume document (.pdf, .doc, .docx) is required.' });
    }

    const {
      job_code,
      jobCode: rawJobCode,
      full_name,
      fullName: rawFullName,
      email,
      mobile,
      city,
      state,
      address,
      highest_qualification,
      highestQualification: rawHighestQual,
      college,
      passing_year,
      passingYear: rawPassingYear,
      course,
      experience_type,
      experienceType: rawExpType,
      years_experience,
      yearsExperience: rawYearsExp,
      current_company,
      currentCompany: rawCurrentCo,
      current_designation,
      currentDesignation: rawCurrentDesig,
      candidate_skills,
      candidateSkills: rawCandSkills,
      coverLetter
    } = req.body;

    const jobCode = job_code || rawJobCode;
    const fullName = full_name || rawFullName;
    const highestQualification = highest_qualification || rawHighestQual;
    const passingYear = passing_year || rawPassingYear;
    const experienceType = experience_type || rawExpType;
    const yearsExperience = years_experience || rawYearsExp;
    const currentCompany = current_company || rawCurrentCo;
    const currentDesignation = current_designation || rawCurrentDesig;
    const candidateSkills = candidate_skills || rawCandSkills;

    if (!jobCode || !fullName || !email || !mobile) {
      return res.status(400).json({ error: 'Full name, email, mobile, and job code are required.' });
    }

    let job = await prisma.jobPost.findUnique({
      where: { jobCode },
      include: { requirement: true }
    });

    if (!job) {
      const reqRecord = await prisma.requirement.findFirst({
        where: {
          OR: [
            { requirementCode: jobCode },
            ...(!isNaN(Number(jobCode)) ? [{ id: Number(jobCode) }] : [])
          ]
        },
        include: { jobPosts: true }
      });
      if (reqRecord) {
        const jPost = reqRecord.jobPosts?.find(j => j.status === 'PUBLISHED') || reqRecord.jobPosts?.[0];
        if (jPost) {
          job = { ...jPost, requirement: reqRecord };
        }
      }
    }

    if (!job) {
      return res.status(404).json({ error: 'Invalid or inactive job position.' });
    }

    if (job.status !== 'PUBLISHED' && job.requirement?.status !== 'OPEN') {
      return res.status(403).json({ error: 'This requisition is closed and no longer accepting applications.' });
    }

    // Check for duplicate application by email for this job post
    const existing = await prisma.application.findFirst({
      where: {
        jobPostId: job.id,
        email: email.trim().toLowerCase()
      }
    });

    if (existing) {
      return res.status(409).json({ error: 'You have already submitted an application for this position.' });
    }

    const applicationId = await generateApplicationId(job.companyId, prisma);
    const resumeFilename = req.file.filename;

    const application = await prisma.application.create({
      data: {
        companyId: job.companyId,
        applicationId,
        jobPostId: job.id,
        requirementId: job.requirementId,
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        mobile: mobile.trim(),
        city: city?.trim() || null,
        state: state?.trim() || null,
        address: address?.trim() || null,
        highestQualification: highestQualification?.trim() || null,
        college: college?.trim() || null,
        passingYear: passingYear ? String(passingYear) : null,
        course: course?.trim() || null,
        experienceType: experienceType || 'Experienced',
        yearsExperience: yearsExperience ? String(yearsExperience) : '0',
        currentCompany: currentCompany?.trim() || null,
        currentDesignation: currentDesignation?.trim() || null,
        candidateSkills: candidateSkills?.trim() || null,
        coverLetter: coverLetter?.trim() || null,
        resumePath: resumeFilename,
        analysisStatus: 'PROCESSING',
        status: 'NEW',
        atsMatchScore: 0
      }
    });

    // Record initial timeline event
    await prisma.applicationTimeline.create({
      data: {
        applicationId: application.id,
        action: 'Application Submitted',
        description: 'Candidate submitted application with resume.'
      }
    });

    // Asynchronous background ATS parsing & scoring (does not block HTTP response)
    const appId = application.id;
    setImmediate(() => runAtsForApplication(appId, { force: true, trigger: 'Resume screened on application' }));

    res.status(201).json({
      message: 'Application submitted successfully! Our recruitment team will review your profile.',
      applicationId: application.applicationId
    });
  } catch (error) {
    console.error('Application submission error:', error);
    res.status(500).json({ error: error.message || 'Failed to submit application.' });
  }
});

/**
 * GET /api/recruitment/public/interview-schedule/:token
 * Candidate views available slots for self-scheduling.
 */
router.get('/public/interview-schedule/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const interview = await prisma.recruitmentInterview.findUnique({
      where: { token },
      include: {
        application: {
          include: {
            requirement: { select: { jobTitle: true, companyId: true } }
          }
        }
      }
    });

    if (!interview || interview.status !== 'PENDING') {
      return res.status(400).json({ error: 'This scheduling link is invalid or has already been used.' });
    }

    if (isScheduleInviteExpired(interview)) {
      return res.status(400).json({ error: 'This scheduling invitation has expired. Please contact the hiring team.' });
    }

    const companyId = interview.application.companyId;
    const settings = await prisma.interviewScheduleSettings.findUnique({
      where: { companyId }
    }).catch(() => null);

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true }
    }).catch(() => null);

    // Server-computed availability: valid dates + per-date slots with
    // availability flags. The candidate can only ever pick from this payload,
    // and the booking POST re-derives the same grid for validation.
    const { window, dates, slots } = await slotEngine.buildAvailability(prisma, interview, settings);

    res.json({
      candidateName: interview.application.fullName,
      jobTitle: interview.application.requirement?.jobTitle || 'Role',
      companyName: company?.name || 'ZeniaHR Enterprise',
      interviewer: interview.interviewer || null,
      interviewMode: interview.interviewMode || null,
      duration: window.duration,
      timezone: window.timezone,
      window: {
        availableFrom: window.from,
        availableTo: window.to,
        workingDays: window.workingDays,
        startTime: window.startTime,
        endTime: window.endTime,
        bufferMinutes: window.buffer
      },
      dates,
      slots
    });
  } catch (error) {
    console.error('Interview schedule fetch error:', error);
    res.status(500).json({ error: 'Failed to retrieve scheduling details.' });
  }
});

/**
 * POST /api/recruitment/public/interview-schedule/:token
 * Candidate selects and confirms their interview slot.
 */
router.post('/public/interview-schedule/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { date, time } = req.body;

    if (!date || !time) {
      return res.status(400).json({ error: 'Selected date and time are required.' });
    }

    const interview = await prisma.recruitmentInterview.findUnique({
      where: { token },
      include: {
        application: {
          include: { requirement: { select: { jobTitle: true } } }
        }
      }
    });

    if (!interview || interview.status !== 'PENDING') {
      return res.status(400).json({ error: 'This scheduling link is invalid or already confirmed.' });
    }

    if (isScheduleInviteExpired(interview)) {
      return res.status(400).json({ error: 'This scheduling invitation has expired. Please contact the hiring team.' });
    }

    const companyId = interview.application.companyId;
    const settings = await prisma.interviewScheduleSettings.findUnique({
      where: { companyId }
    }).catch(() => null);

    // Re-derive the offered grid server-side: date inside window, allowed
    // weekday, slot aligned to the grid, not in the past. The client payload
    // is never trusted.
    const window = slotEngine.resolveWindow(interview, settings);
    const validation = slotEngine.validateSlotSelection(window, date, String(time));
    if (!validation.ok) {
      return res.status(400).json({ error: validation.error });
    }
    const { start: slotStart, end: slotEnd } = validation.slot;

    // Transactional booking (Serializable): conflict re-check + write commit
    // atomically so two candidates confirming the same slot cannot both win.
    try {
      await prisma.$transaction(async (tx) => {
        const fresh = await tx.recruitmentInterview.findUnique({ where: { id: interview.id } });
        if (!fresh || fresh.status !== 'PENDING') {
          throw Object.assign(new Error('This scheduling link is invalid or already confirmed.'), { httpStatus: 400 });
        }

        const sameDay = await tx.recruitmentInterview.findMany({
          where: {
            application: { companyId },
            status: 'SCHEDULED',
            scheduledDate: date,
            scheduledTime: { not: null },
            id: { not: interview.id }
          },
          select: { scheduledTime: true, scheduledEndTime: true, duration: true, interviewer: true }
        });

        const busy = sameDay.map(r => {
          const start = slotEngine.toMinutes(r.scheduledTime);
          let end = slotEngine.toMinutes(r.scheduledEndTime);
          if (start === null) return null;
          if (end === null || end <= start) end = start + (r.duration || 30);
          return { start, end, interviewer: (r.interviewer || '').trim().toLowerCase() };
        }).filter(Boolean);

        if (slotEngine.slotBlockedBy(busy, slotEngine.toMinutes(slotStart), slotEngine.toMinutes(slotEnd), interview.interviewer)) {
          throw Object.assign(new Error('This time slot has just been booked. Please select another available time.'), { httpStatus: 409 });
        }

        await tx.recruitmentInterview.update({
          where: { id: interview.id },
          data: {
            scheduledDate: date,
            scheduledTime: slotStart,
            scheduledEndTime: slotEnd,
            status: 'SCHEDULED',
            schedulingSource: 'CANDIDATE',
            bookedAt: new Date()
          }
        });

        await tx.application.update({
          where: { id: interview.applicationId },
          data: { status: 'INTERVIEW' }
        });

        await tx.applicationTimeline.create({
          data: {
            applicationId: interview.applicationId,
            action: 'Interview Confirmed by Candidate',
            description: `Candidate self-scheduled the interview for ${date}, ${slotStart}–${slotEnd} (${window.timezone}).`
          }
        });
      }, { isolationLevel: 'Serializable' });
    } catch (txErr) {
      if (txErr.httpStatus) {
        return res.status(txErr.httpStatus).json({ error: txErr.message });
      }
      // Serialization conflict (two simultaneous bookings) → treat as slot taken
      if (txErr.code === 'P2034') {
        return res.status(409).json({ error: 'This time slot has just been booked. Please select another available time.' });
      }
      throw txErr;
    }

    const jobTitle = interview.application.requirement?.jobTitle || 'Role';

    // In-app notification for the HR/recruitment team (existing bell infra)
    notify({
      companyId,
      type: 'recruitment',
      title: 'Interview slot booked by candidate',
      message: `${interview.application.fullName} booked the ${jobTitle} interview on ${date}, ${slotStart}–${slotEnd}${interview.interviewer ? ` with ${interview.interviewer}` : ''}.`,
      priority: 'high'
    }).catch(() => null);

    // Confirmation email to the candidate (guarded — mail failure never breaks the booking)
    if (interview.application.email) {
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { name: true }
      }).catch(() => null);

      sendInterviewBookingConfirmationEmail({
        candidateEmail: interview.application.email,
        candidateName: interview.application.fullName,
        jobTitle,
        companyName: company?.name,
        date,
        startTime: slotStart,
        endTime: slotEnd,
        timezone: window.timezone,
        interviewer: interview.interviewer,
        interviewMode: interview.interviewMode,
        meetingLink: interview.meetingLink,
        location: interview.location
      }).catch(err => console.error('[Mailer] Booking confirmation email error:', err.message));
    }

    res.json({
      message: 'Interview scheduled successfully! We look forward to meeting with you.',
      scheduledDate: date,
      scheduledTime: slotStart,
      scheduledEndTime: slotEnd,
      interviewMode: interview.interviewMode || null,
      meetingLink: interview.meetingLink || null,
      location: interview.location || null
    });
  } catch (error) {
    console.error('Candidate schedule post error:', error);
    res.status(500).json({ error: error.message || 'Failed to confirm interview schedule.' });
  }
});

/**
 * GET /api/recruitment/public/offer/:token
 * Candidate views offer letter details.
 */
router.get('/public/offer/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const offer = await prisma.recruitmentOffer.findUnique({
      where: { token },
      include: {
        application: {
          include: {
            requirement: { select: { jobTitle: true, companyId: true, department: true, location: true } }
          }
        }
      }
    });

    if (!offer) {
      return res.status(404).json({ error: 'Offer link is invalid.' });
    }

    const company = await prisma.company.findUnique({
      where: { id: offer.application.companyId },
      select: { name: true, logo: true, shortName: true }
    }).catch(() => null);

    res.json({
      candidateName: offer.application.fullName,
      jobTitle: offer.designation || offer.application.requirement?.jobTitle || 'Role',
      department: offer.department || offer.application.requirement?.department || 'General',
      salary: offer.salary,
      joiningDate: offer.joiningDate,
      location: offer.location || offer.application.requirement?.location,
      employmentType: offer.employmentType,
      terms: offer.terms,
      status: offer.status,
      companyName: company?.name || 'ZeniaHR Enterprise'
    });
  } catch (error) {
    console.error('Offer fetch error:', error);
    res.status(500).json({ error: 'Failed to retrieve offer details.' });
  }
});

/**
 * POST /api/recruitment/public/offer/:token
 * Candidate accepts or declines the offer.
 */
router.post('/public/offer/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { action, reason } = req.body; // action: 'accept' | 'decline'

    const offer = await prisma.recruitmentOffer.findUnique({
      where: { token },
      include: {
        application: {
          include: { requirement: true }
        }
      }
    });

    if (!offer) {
      return res.status(404).json({ error: 'Invalid offer link.' });
    }

    if (offer.status !== 'SENT' && offer.status !== 'CREATED') {
      return res.status(400).json({ error: `You have already responded to this offer (${offer.status}).` });
    }

    if (action === 'accept') {
      const requirement = offer.application.requirement;
      if (requirement) {
        const joinedCount = await prisma.application.count({
          where: {
            requirementId: requirement.id,
            status: 'JOINED'
          }
        });

        if (joinedCount >= requirement.numberOfOpenings) {
          return res.status(400).json({ error: 'No available openings remain for this requirement position.' });
        }
      }

      await prisma.recruitmentOffer.update({
        where: { id: offer.id },
        data: { status: 'ACCEPTED' }
      });

      await prisma.application.update({
        where: { id: offer.applicationId },
        data: { status: 'JOINED' }
      });

      await prisma.applicationTimeline.create({
        data: {
          applicationId: offer.applicationId,
          action: 'Offer Accepted',
          description: 'Candidate accepted the offer package.'
        }
      });

      // Directly auto-onboard to Employee Management table
      await autoOnboardCandidateToEmployee(offer.applicationId, offer.application.companyId);

      return res.json({ message: 'Offer accepted! Welcome to the team.' });
    } else if (action === 'decline') {
      const declineReason = reason?.trim() || 'Candidate declined the offer.';

      await prisma.recruitmentOffer.update({
        where: { id: offer.id },
        data: { status: 'DECLINED' }
      });

      await prisma.application.update({
        where: { id: offer.applicationId },
        data: {
          status: 'REJECTED',
          previousStatus: 'OFFER',
          rejectionReason: declineReason,
          rejectedAt: new Date(),
          rejectedBy: 'Candidate'
        }
      });

      await prisma.applicationTimeline.create({
        data: {
          applicationId: offer.applicationId,
          action: 'Offer Declined',
          description: declineReason
        }
      });

      return res.json({ message: 'Offer response recorded. Thank you for your time.' });
    }

    return res.status(400).json({ error: 'Invalid offer response action.' });
  } catch (error) {
    console.error('Offer response error:', error);
    res.status(500).json({ error: error.message || 'Failed to submit offer response.' });
  }
});

// NOTE: the old GET /public/resume/:filename endpoint streamed ANY company's
// resume to anyone holding a filename — removed. Resumes are candidate PII and
// are now served only through the authenticated, company-scoped route below
// (registered after protect + the recruitment RBAC gate).

// ═════════════════════════════════════════════════════════════════════════════
// 2. AUTHENTICATED HR / ADMIN RECRUITMENT ENDPOINTS
// ═════════════════════════════════════════════════════════════════════════════

router.use(protect);

// Existing RBAC matrix, module key 'recruitment': GET → view, everything else
// (create/update/delete/dispatch) folds to edit per the canonical 3-action
// model. Super Admin and Company Head always pass; other roles need a matrix
// grant (or the role default when their matrix predates this module).
router.use((req, res, next) =>
  requireModuleAccess('recruitment', req.method === 'GET' ? 'view' : 'edit', {
    label: 'Recruitment',
    defaults: RECRUITMENT_ROLE_DEFAULTS,
  })(req, res, next)
);

/**
 * GET /api/recruitment/resume/:filename
 * Stream an uploaded resume — only when an application in the caller's own
 * company references that file.
 */
router.get('/resume/:filename', async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const safeFilename = path.basename(req.params.filename);

    const owned = await prisma.application.findFirst({
      where: { resumePath: safeFilename, companyId },
      select: { id: true }
    });
    if (!owned) {
      return res.status(404).send('File not found');
    }

    const filePath = path.join(UPLOAD_DIR, safeFilename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).send('File not found');
    }
    res.sendFile(filePath);
  } catch (error) {
    console.error('Resume stream error:', error);
    res.status(500).send('Failed to load resume');
  }
});

/**
 * GET /api/recruitment/requirements/stats
 * Dashboard KPI statistics for company requirements and candidate pipeline.
 */
router.get('/requirements/stats', async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const todayStr = new Date().toISOString().split('T')[0];

    const [
      openPositions,
      draftRequirements,
      closedPositions,
      totalCandidates,
      candidatesInScreening,
      pendingOffers,
      joined,
      todayInterviews
    ] = await Promise.all([
      prisma.requirement.count({ where: { companyId, status: 'OPEN' } }),
      prisma.requirement.count({ where: { companyId, status: 'DRAFT' } }),
      prisma.requirement.count({ where: { companyId, status: 'CLOSED' } }),
      prisma.application.count({ where: { companyId } }),
      prisma.application.count({ where: { companyId, status: 'SCREENING' } }),
      prisma.application.count({ where: { companyId, status: { in: ['OFFER_SENT', 'OFFER'] } } }),
      prisma.application.count({ where: { companyId, status: 'JOINED' } }),
      prisma.recruitmentInterview.count({
        where: {
          application: { companyId },
          scheduledDate: todayStr
        }
      })
    ]);

    res.json({
      open: openPositions,
      openPositions,
      draft: draftRequirements,
      draftRequirements,
      closed: closedPositions,
      closedPositions,
      totalCandidates,
      candidatesInScreening,
      interviewsToday: todayInterviews,
      pendingOffers,
      joined
    });
  } catch (error) {
    console.error('Recruitment stats error:', error);
    res.status(500).json({ error: 'Failed to calculate recruitment statistics.' });
  }
});

/**
 * GET /api/recruitment/departments
 * Dynamic list of distinct departments across company.
 */
router.get('/departments', async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const set = new Set(['Engineering', 'Human Resources', 'Finance', 'Sales', 'Marketing', 'Operations', 'Product', 'IT Support', 'Design', 'Customer Success']);

    const reqDepts = await prisma.requirement.findMany({
      where: { companyId },
      select: { department: true }
    });
    reqDepts.forEach(d => d.department && set.add(d.department.trim()));

    const empDepts = await prisma.employee.findMany({
      where: { companyId },
      select: { department: true }
    }).catch(() => []);
    empDepts.forEach(d => d.department && set.add(d.department.trim()));

    res.json(Array.from(set).sort());
  } catch (error) {
    res.json(['Engineering', 'Human Resources', 'Finance', 'Sales', 'Marketing', 'Operations', 'Product', 'IT Support']);
  }
});

/**
 * GET /api/recruitment/requirements
 * List all job requisitions for company with search and filters.
 */
router.get('/requirements', async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const { search, status, department, location } = req.query;

    const where = { companyId };

    if (status && status !== 'All Status' && status !== 'ALL') {
      where.status = String(status).toUpperCase();
    } else {
      where.status = { not: 'ARCHIVED' };
    }

    if (department && department !== 'All Departments' && department !== 'ALL') {
      where.department = String(department);
    }

    if (location && location !== 'All Locations' && location !== 'ALL') {
      where.location = { contains: String(location) };
    }

    if (search) {
      where.OR = [
        { jobTitle: { contains: String(search) } },
        { requirementCode: { contains: String(search) } },
        { department: { contains: String(search) } },
        { location: { contains: String(search) } }
      ];
    }

    const requirements = await prisma.requirement.findMany({
      where,
      include: {
        jobPosts: {
          select: { id: true, jobCode: true, status: true, createdAt: true }
        },
        applications: {
          select: {
            id: true,
            status: true,
            atsMatchScore: true
          }
        }
      },
      orderBy: { id: 'desc' }
    });

    const result = requirements.map(r => {
      const apps = r.applications || [];
      const filled = apps.filter(a => a.status === 'JOINED').length;
      return {
        id: r.id,
        requirementCode: r.requirementCode,
        jobTitle: r.jobTitle,
        department: r.department,
        hiringManager: r.hiringManager,
        recruiter: r.recruiter,
        numberOfOpenings: r.numberOfOpenings,
        employmentType: r.employmentType,
        location: r.location,
        workMode: r.workMode,
        experience: r.experience,
        salaryMin: r.salaryMin,
        salaryMax: r.salaryMax,
        qualification: r.qualification,
        requiredSkills: r.requiredSkills,
        jobDescription: r.jobDescription,
        responsibilities: r.responsibilities,
        hiringReason: r.hiringReason,
        priority: r.priority,
        openingDate: r.openingDate,
        expectedJoiningDate: r.expectedJoiningDate,
        applicationDeadline: r.applicationDeadline,
        status: r.status,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        jobPosts: r.jobPosts,
        applicantsCount: apps.length,
        filledCount: filled,
        countNew: apps.filter(a => a.status === 'NEW').length,
        countScreening: apps.filter(a => a.status === 'SCREENING').length,
        countShortlisted: apps.filter(a => a.status === 'SHORTLISTED').length,
        countInterview: apps.filter(a => a.status === 'INTERVIEW').length,
        countSelected: apps.filter(a => a.status === 'SELECTED').length,
        countOfferSent: apps.filter(a => a.status === 'OFFER_SENT' || a.status === 'OFFER').length,
        countJoined: filled,
        countRejected: apps.filter(a => a.status === 'REJECTED').length
      };
    });

    res.json(result);
  } catch (error) {
    console.error('List requirements error:', error);
    res.status(500).json({ error: 'Failed to fetch job requirements.' });
  }
});

/**
 * POST /api/recruitment/requirements
 * Create a new job requisition (Draft or Published).
 */
router.post('/requirements', async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    if (companyId < 0) {
      return res.status(403).json({ error: 'No authorized company workspace in context. Select a company workspace and try again.' });
    }
    const {
      jobTitle,
      department,
      hiringManager,
      recruiter,
      numberOfOpenings,
      employmentType,
      location,
      workMode,
      experience,
      salaryMin,
      salaryMax,
      qualification,
      requiredSkills,
      jobDescription,
      responsibilities,
      hiringReason,
      priority,
      openingDate,
      expectedJoiningDate,
      applicationDeadline,
      status
    } = req.body;

    if (!jobTitle || !jobTitle.trim()) {
      return res.status(400).json({ error: 'Job title is required.' });
    }

    const openings = parseInt(numberOfOpenings || '1', 10);
    if (openings < 1) {
      return res.status(400).json({ error: 'Number of openings must be at least 1.' });
    }

    const reqStatus = (status || 'DRAFT').toUpperCase();
    const requirementCode = await generateRequirementCode(companyId, prisma);

    const requirement = await prisma.requirement.create({
      data: {
        companyId,
        requirementCode,
        jobTitle: jobTitle.trim(),
        department: department?.trim() || 'General',
        hiringManager: hiringManager?.trim() || null,
        recruiter: recruiter?.trim() || null,
        numberOfOpenings: openings,
        employmentType: employmentType || 'Full-Time',
        location: location?.trim() || null,
        workMode: workMode || 'On-site',
        experience: experience?.trim() || null,
        salaryMin: salaryMin ? parseInt(salaryMin, 10) : null,
        salaryMax: salaryMax ? parseInt(salaryMax, 10) : null,
        qualification: qualification?.trim() || null,
        requiredSkills: requiredSkills?.trim() || null,
        jobDescription: jobDescription?.trim() || null,
        responsibilities: responsibilities?.trim() || null,
        hiringReason: hiringReason?.trim() || null,
        priority: priority || 'Medium',
        openingDate: openingDate || null,
        expectedJoiningDate: expectedJoiningDate || null,
        applicationDeadline: applicationDeadline || null,
        status: reqStatus
      }
    });

    // Auto-create JobPost if published immediately
    if (reqStatus === 'OPEN') {
      const jobCode = await generateJobCode(companyId, prisma);
      await prisma.jobPost.create({
        data: {
          companyId,
          jobCode,
          requirementId: requirement.id,
          jobTitle: requirement.jobTitle,
          department: requirement.department,
          location: requirement.location,
          workMode: requirement.workMode,
          employmentType: requirement.employmentType,
          salaryMin: requirement.salaryMin,
          salaryMax: requirement.salaryMax,
          experience: requirement.experience,
          qualification: requirement.qualification,
          numberOfOpenings: requirement.numberOfOpenings,
          requiredSkills: requirement.requiredSkills,
          jobDescription: requirement.jobDescription,
          responsibilities: requirement.responsibilities,
          applicationDeadline: requirement.applicationDeadline,
          status: 'PUBLISHED'
        }
      });
    }

    res.status(201).json(requirement);
  } catch (error) {
    console.error('Create requirement error:', error);
    res.status(500).json({ error: error.message || 'Failed to create requirement.' });
  }
});

/**
 * PUT /api/recruitment/requirements/:id
 * Update an existing requisition.
 */
router.put('/requirements/:id', async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const id = parseInt(req.params.id, 10);

    const existing = await prisma.requirement.findFirst({
      where: { id, companyId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Requirement not found.' });
    }

    const {
      jobTitle,
      department,
      hiringManager,
      recruiter,
      numberOfOpenings,
      employmentType,
      location,
      workMode,
      experience,
      salaryMin,
      salaryMax,
      qualification,
      requiredSkills,
      jobDescription,
      responsibilities,
      hiringReason,
      priority,
      openingDate,
      expectedJoiningDate,
      applicationDeadline,
      status
    } = req.body;

    const openings = numberOfOpenings ? parseInt(numberOfOpenings, 10) : existing.numberOfOpenings;
    if (openings < 1) {
      return res.status(400).json({ error: 'Number of openings must be at least 1.' });
    }

    const atsHashBefore = computeRequirementHash(existing);

    const updated = await prisma.requirement.update({
      where: { id },
      data: {
        jobTitle: jobTitle !== undefined ? jobTitle.trim() : existing.jobTitle,
        department: department !== undefined ? department?.trim() : existing.department,
        hiringManager: hiringManager !== undefined ? hiringManager?.trim() : existing.hiringManager,
        recruiter: recruiter !== undefined ? recruiter?.trim() : existing.recruiter,
        numberOfOpenings: openings,
        employmentType: employmentType !== undefined ? employmentType : existing.employmentType,
        location: location !== undefined ? location?.trim() : existing.location,
        workMode: workMode !== undefined ? workMode : existing.workMode,
        experience: experience !== undefined ? experience?.trim() : existing.experience,
        salaryMin: salaryMin !== undefined ? (salaryMin ? parseInt(salaryMin, 10) : null) : existing.salaryMin,
        salaryMax: salaryMax !== undefined ? (salaryMax ? parseInt(salaryMax, 10) : null) : existing.salaryMax,
        qualification: qualification !== undefined ? qualification?.trim() : existing.qualification,
        requiredSkills: requiredSkills !== undefined ? requiredSkills?.trim() : existing.requiredSkills,
        jobDescription: jobDescription !== undefined ? jobDescription?.trim() : existing.jobDescription,
        responsibilities: responsibilities !== undefined ? responsibilities?.trim() : existing.responsibilities,
        hiringReason: hiringReason !== undefined ? hiringReason?.trim() : existing.hiringReason,
        priority: priority !== undefined ? priority : existing.priority,
        openingDate: openingDate !== undefined ? openingDate : existing.openingDate,
        expectedJoiningDate: expectedJoiningDate !== undefined ? expectedJoiningDate : existing.expectedJoiningDate,
        applicationDeadline: applicationDeadline !== undefined ? applicationDeadline : existing.applicationDeadline,
        status: status !== undefined ? String(status).toUpperCase() : existing.status
      }
    });

    // If requirement became OPEN, ensure a JobPost exists or update existing
    if (updated.status === 'OPEN') {
      const existingJob = await prisma.jobPost.findFirst({
        where: { requirementId: id }
      });
      if (!existingJob) {
        const jobCode = await generateJobCode(companyId, prisma);
        await prisma.jobPost.create({
          data: {
            companyId,
            jobCode,
            requirementId: id,
            jobTitle: updated.jobTitle,
            department: updated.department,
            location: updated.location,
            workMode: updated.workMode,
            employmentType: updated.employmentType,
            salaryMin: updated.salaryMin,
            salaryMax: updated.salaryMax,
            experience: updated.experience,
            qualification: updated.qualification,
            numberOfOpenings: updated.numberOfOpenings,
            requiredSkills: updated.requiredSkills,
            jobDescription: updated.jobDescription,
            responsibilities: updated.responsibilities,
            applicationDeadline: updated.applicationDeadline,
            status: 'PUBLISHED'
          }
        });
      } else {
        await prisma.jobPost.update({
          where: { id: existingJob.id },
          data: {
            jobTitle: updated.jobTitle,
            department: updated.department,
            location: updated.location,
            workMode: updated.workMode,
            employmentType: updated.employmentType,
            salaryMin: updated.salaryMin,
            salaryMax: updated.salaryMax,
            experience: updated.experience,
            qualification: updated.qualification,
            numberOfOpenings: updated.numberOfOpenings,
            requiredSkills: updated.requiredSkills,
            jobDescription: updated.jobDescription,
            responsibilities: updated.responsibilities,
            applicationDeadline: updated.applicationDeadline,
            status: 'PUBLISHED'
          }
        });
      }
    } else {
      // Sync active job post fields
      await prisma.jobPost.updateMany({
        where: { requirementId: id },
        data: {
          jobTitle: updated.jobTitle,
          department: updated.department,
          location: updated.location,
          workMode: updated.workMode,
          employmentType: updated.employmentType,
          salaryMin: updated.salaryMin,
          salaryMax: updated.salaryMax,
          experience: updated.experience,
          qualification: updated.qualification,
          numberOfOpenings: updated.numberOfOpenings,
          requiredSkills: updated.requiredSkills,
          jobDescription: updated.jobDescription,
          responsibilities: updated.responsibilities,
          applicationDeadline: updated.applicationDeadline
        }
      });
    }

    // ATS-relevant fields changed (title/skills/JD/experience/qualification/…)
    // → re-score every applicant of this requirement in the background.
    if (computeRequirementHash(updated) !== atsHashBefore) {
      reanalyzeRequirementApplications(id, 'Job requirement updated');
    }

    res.json(updated);
  } catch (error) {
    console.error('Update requirement error:', error);
    res.status(500).json({ error: 'Failed to update requirement.' });
  }
});

/**
 * PATCH /api/recruitment/requirements/:id/status
 * Change requirement status (e.g. DRAFT -> OPEN -> CLOSED -> ARCHIVED).
 */
router.patch('/requirements/:id/status', async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const id = parseInt(req.params.id, 10);
    const newStatus = (req.body.status || '').toUpperCase();

    if (!['DRAFT', 'OPEN', 'CLOSED', 'ARCHIVED'].includes(newStatus)) {
      return res.status(400).json({ error: 'Invalid status code.' });
    }

    const requirement = await prisma.requirement.findFirst({
      where: { id, companyId }
    });

    if (!requirement) {
      return res.status(404).json({ error: 'Requirement not found.' });
    }

    const updated = await prisma.requirement.update({
      where: { id },
      data: { status: newStatus }
    });

    if (newStatus === 'OPEN') {
      const existingJob = await prisma.jobPost.findFirst({
        where: { requirementId: id }
      });

      if (!existingJob) {
        const jobCode = await generateJobCode(companyId, prisma);
        await prisma.jobPost.create({
          data: {
            companyId,
            jobCode,
            requirementId: id,
            jobTitle: requirement.jobTitle,
            department: requirement.department,
            location: requirement.location,
            workMode: requirement.workMode,
            employmentType: requirement.employmentType,
            salaryMin: requirement.salaryMin,
            salaryMax: requirement.salaryMax,
            experience: requirement.experience,
            qualification: requirement.qualification,
            numberOfOpenings: requirement.numberOfOpenings,
            requiredSkills: requirement.requiredSkills,
            jobDescription: requirement.jobDescription,
            responsibilities: requirement.responsibilities,
            applicationDeadline: requirement.applicationDeadline,
            status: 'PUBLISHED'
          }
        });
      } else {
        await prisma.jobPost.update({
          where: { id: existingJob.id },
          data: { status: 'PUBLISHED' }
        });
      }
    } else if (newStatus === 'CLOSED' || newStatus === 'ARCHIVED') {
      await prisma.jobPost.updateMany({
        where: { requirementId: id },
        data: { status: 'CLOSED' }
      });
    }

    res.json(updated);
  } catch (error) {
    console.error('Requirement status error:', error);
    res.status(500).json({ error: 'Failed to update requirement status.' });
  }
});

/**
 * DELETE /api/recruitment/requirements/:id
 * Delete requirement if no candidate applications exist.
 */
router.delete('/requirements/:id', async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const id = parseInt(req.params.id, 10);

    // Ownership check FIRST — a requirement outside the caller's company must
    // be indistinguishable from a missing one, and never deletable.
    const requirement = await prisma.requirement.findFirst({
      where: { id, companyId }
    });
    if (!requirement) {
      return res.status(404).json({ error: 'Requirement not found.' });
    }

    const appsCount = await prisma.application.count({
      where: { requirementId: id }
    });

    if (appsCount > 0) {
      return res.status(400).json({
        error: `Cannot delete requirement with ${appsCount} applicant(s). Please archive or close it instead.`
      });
    }

    await prisma.requirement.delete({
      where: { id }
    });

    res.json({ message: 'Requirement deleted successfully.' });
  } catch (error) {
    console.error('Delete requirement error:', error);
    res.status(500).json({ error: 'Failed to delete requirement.' });
  }
});

/**
 * GET /api/recruitment/applications/requirement/:reqId
 * Fetch full candidate pipeline for a specific requisition (or all requisitions) with filters.
 */
router.get('/applications/requirement/:reqId', async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const reqId = parseInt(req.params.reqId, 10);
    const { search, minScore, status, experience, department, page, limit } = req.query;

    const where = { companyId };
    if (!isNaN(reqId) && reqId > 0) {
      where.requirementId = reqId;
    }

    if (status && status !== 'All' && status !== 'ALL') {
      if (status === 'Active') {
        where.status = { not: 'REJECTED' };
      } else if (status === 'Rejected') {
        where.status = 'REJECTED';
      } else {
        where.status = String(status).toUpperCase();
      }
    }

    if (minScore && Number(minScore) > 0) {
      where.atsMatchScore = { gte: Number(minScore) };
    }

    if (experience && experience !== 'Any' && experience !== 'ALL') {
      where.experienceType = experience;
    }

    if (search) {
      where.OR = [
        { fullName: { contains: String(search) } },
        { email: { contains: String(search) } },
        { mobile: { contains: String(search) } },
        { applicationId: { contains: String(search) } },
        { candidateSkills: { contains: String(search) } },
        { requirement: { jobTitle: { contains: String(search) } } }
      ];
    }

    const pageNum = parseInt(String(page || '1'), 10);
    const pageLimit = parseInt(String(limit || '100'), 10);
    const skip = (pageNum - 1) * pageLimit;

    const [applications, totalCount] = await Promise.all([
      prisma.application.findMany({
        where,
        include: {
          requirement: {
            select: { id: true, requirementCode: true, jobTitle: true, department: true, location: true, numberOfOpenings: true }
          },
          jobPost: {
            select: { id: true, jobCode: true }
          },
          interviews: {
            orderBy: { id: 'desc' }
          },
          offers: {
            orderBy: { id: 'desc' }
          },
          timeline: {
            orderBy: { createdAt: 'desc' }
          }
        },
        orderBy: { id: 'desc' },
        skip,
        take: pageLimit
      }),
      prisma.application.count({ where })
    ]);

    res.json({
      data: applications,
      totalCount,
      page: pageNum,
      limit: pageLimit,
      totalPages: Math.ceil(totalCount / pageLimit)
    });
  } catch (error) {
    console.error('Fetch applications error:', error);
    res.status(500).json({ error: 'Failed to fetch candidate applications.' });
  }
});

/**
 * GET /api/recruitment/applications/:id
 * Single application detailed record.
 */
router.get('/applications/:id', async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const id = parseInt(req.params.id, 10);

    const application = await prisma.application.findFirst({
      where: { id, companyId },
      include: {
        requirement: true,
        jobPost: true,
        interviews: { orderBy: { id: 'desc' } },
        offers: { orderBy: { id: 'desc' } },
        timeline: { orderBy: { createdAt: 'desc' } }
      }
    });

    if (!application) {
      return res.status(404).json({ error: 'Application not found.' });
    }

    res.json(application);
  } catch (error) {
    console.error('Application fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch application details.' });
  }
});

/**
 * PATCH /api/recruitment/applications/:id/status
 * Transition candidate along pipeline stages.
 */
router.patch('/applications/:id/status', async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const id = parseInt(req.params.id, 10);
    const { status: newStatus, reason, feedback } = req.body;

    const application = await prisma.application.findFirst({
      where: { id, companyId },
      include: { requirement: true }
    });

    if (!application) {
      return res.status(404).json({ error: 'Application not found.' });
    }

    const updateData = { status: newStatus };

    if (newStatus === 'REJECTED') {
      if (application.status !== 'REJECTED') {
        updateData.previousStatus = application.status;
      }
      updateData.rejectionReason = reason || feedback || 'Rejected by HR during evaluation.';
      updateData.rejectedAt = new Date();
      updateData.rejectedBy = req.user?.name || 'HR';
    } else if (newStatus === 'JOINED') {
      const requirement = application.requirement;
      if (requirement) {
        const joinedCount = await prisma.application.count({
          where: { requirementId: requirement.id, status: 'JOINED' }
        });
        if (joinedCount >= requirement.numberOfOpenings && application.status !== 'JOINED') {
          return res.status(400).json({ error: 'All openings for this requisition have already been filled.' });
        }
      }
      // Auto-onboard to Employee table
      await autoOnboardCandidateToEmployee(id, companyId);
    }

    const updated = await prisma.application.update({
      where: { id },
      data: updateData
    });

    await prisma.applicationTimeline.create({
      data: {
        applicationId: id,
        action: `Moved to ${newStatus}`,
        description: reason || `Status updated to ${newStatus} by ${req.user?.name || 'HR'}.`
      }
    });

    res.json(updated);
  } catch (error) {
    console.error('Update candidate status error:', error);
    res.status(500).json({ error: error.message || 'Failed to update candidate status.' });
  }
});

/**
 * POST /api/recruitment/applications/:id/screening
 * Save HR screening evaluation and notes.
 */
router.post('/applications/:id/screening', async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const id = parseInt(req.params.id, 10);
    const { notes, decision } = req.body;

    const owned = await prisma.application.findFirst({ where: { id, companyId }, select: { id: true } });
    if (!owned) {
      return res.status(404).json({ error: 'Application not found.' });
    }

    const targetStatus = decision === 'REJECT' ? 'REJECTED' : (decision === 'SHORTLIST' ? 'SHORTLISTED' : 'SCREENING');

    const application = await prisma.application.update({
      where: { id },
      data: {
        screeningNotes: notes || '',
        screeningDecision: decision || 'SHORTLIST',
        status: targetStatus
      }
    });

    await prisma.applicationTimeline.create({
      data: {
        applicationId: id,
        action: 'Screening Evaluation',
        description: `Decision: ${decision}. Notes: ${notes || 'None'}`
      }
    });

    res.json(application);
  } catch (error) {
    console.error('Screening error:', error);
    res.status(500).json({ error: 'Failed to record screening notes.' });
  }
});

/**
 * POST /api/recruitment/applications/:id/interviews
 * Schedule fixed interview & send candidate confirmation email.
 */
router.post('/applications/:id/interviews', async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const id = parseInt(req.params.id, 10);
    const {
      interviewType,
      scheduledDate,
      scheduledTime,
      interviewer,
      location,
      meetingLink,
      interviewMode,
      notes,
      duration,
      sendEmail
    } = req.body;

    if (!scheduledDate || !scheduledTime) {
      return res.status(400).json({ error: 'Scheduled date and time are required.' });
    }

    const application = await prisma.application.findFirst({
      where: { id, companyId },
      include: { requirement: true }
    });

    if (!application) {
      return res.status(404).json({ error: 'Application not found.' });
    }

    const durationMin = duration ? parseInt(duration, 10) : 30;
    const startMin = slotEngine.toMinutes(scheduledTime);
    const scheduledEndTime = startMin !== null ? slotEngine.toHHMM(Math.min(startMin + durationMin, 24 * 60 - 1)) : null;

    const interview = await prisma.recruitmentInterview.create({
      data: {
        applicationId: id,
        interviewType: interviewType || 'Technical',
        scheduledDate,
        scheduledTime,
        scheduledEndTime,
        interviewer: interviewer || req.user?.name || 'Talent Team',
        location: location || 'Google Meet / Zoom',
        meetingLink: meetingLink || null,
        interviewMode: interviewMode || null,
        notes: notes || '',
        duration: durationMin,
        schedulingSource: 'HR',
        status: 'SCHEDULED'
      }
    });

    await prisma.application.update({
      where: { id },
      data: { status: 'INTERVIEW' }
    });

    await prisma.applicationTimeline.create({
      data: {
        applicationId: id,
        action: 'Interview Scheduled',
        description: `Type: ${interview.interviewType} on ${scheduledDate} at ${scheduledTime} with ${interview.interviewer}.`
      }
    });

    if (sendEmail !== false && application.email) {
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { name: true }
      }).catch(() => null);

      sendFixedInterviewEmail({
        candidateEmail: application.email,
        candidateName: application.fullName,
        jobTitle: application.requirement?.jobTitle || 'Role',
        scheduledDate,
        scheduledTime,
        scheduledEndTime,
        interviewer: interview.interviewer,
        location: interview.location,
        meetingLink: interview.meetingLink,
        interviewMode: interview.interviewMode,
        companyName: company?.name
      }).catch(err => console.error('[Mailer] Fixed interview email error:', err.message));
    }

    res.status(201).json(interview);
  } catch (error) {
    console.error('Schedule interview error:', error);
    res.status(500).json({ error: 'Failed to schedule interview.' });
  }
});

/**
 * POST /api/recruitment/applications/:id/interview-invitation
 * Send candidate self-scheduling link or fixed invite.
 */
router.post('/applications/:id/interview-invitation', async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const id = parseInt(req.params.id, 10);
    const {
      scheduleOption, interviewer, interviewType, duration,
      availableFrom, availableTo, workingDays, startTime, endTime,
      bufferMinutes, interviewMode, meetingLink, location, notes
    } = req.body;

    const application = await prisma.application.findFirst({
      where: { id, companyId },
      include: { requirement: true }
    });

    if (!application) {
      return res.status(404).json({ error: 'Application not found.' });
    }

    if (!application.email) {
      return res.status(400).json({ error: 'Candidate email address is required.' });
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true }
    }).catch(() => null);

    const companyName = company?.name || 'ZeniaHR Enterprise';

    if (scheduleOption === 'CANDIDATE') {
      // ── Validate the availability window HR configured for THIS invitation ──
      if (!availableFrom || !availableTo) {
        return res.status(400).json({ error: 'Available From and Available Until dates are required.' });
      }
      if (!slotEngine.isValidDateStr(availableFrom) || !slotEngine.isValidDateStr(availableTo)) {
        return res.status(400).json({ error: 'Availability dates must be valid dates (YYYY-MM-DD).' });
      }
      if (availableTo < availableFrom) {
        return res.status(400).json({ error: 'Available Until date cannot be before Available From date.' });
      }
      const { date: today } = slotEngine.nowInTimezone('Asia/Kolkata');
      if (availableTo < today) {
        return res.status(400).json({ error: 'The availability window is entirely in the past.' });
      }

      const days = Array.isArray(workingDays) && workingDays.length
        ? workingDays.filter(d => slotEngine.DAY_NAMES.includes(d))
        : slotEngine.DEFAULT_WORKING_DAYS;
      if (!days.length) {
        return res.status(400).json({ error: 'Select at least one available weekday.' });
      }

      const dayStart = startTime || '10:00';
      const dayEnd = endTime || '17:00';
      if (slotEngine.toMinutes(dayStart) === null || slotEngine.toMinutes(dayEnd) === null) {
        return res.status(400).json({ error: 'Available times must be valid HH:MM values.' });
      }
      const durationMin = duration ? parseInt(duration, 10) : 30;
      const bufferMin = bufferMinutes ? parseInt(bufferMinutes, 10) : 0;
      if (!(durationMin > 0 && durationMin <= 240)) {
        return res.status(400).json({ error: 'Interview duration must be between 5 and 240 minutes.' });
      }
      if (!(bufferMin >= 0 && bufferMin <= 120)) {
        return res.status(400).json({ error: 'Buffer must be between 0 and 120 minutes.' });
      }
      if (slotEngine.toMinutes(dayStart) + durationMin > slotEngine.toMinutes(dayEnd)) {
        return res.status(400).json({ error: 'The daily time window is shorter than one interview slot.' });
      }

      // Ensure the window actually yields at least one bookable slot
      const probeWindow = {
        from: availableFrom, to: availableTo, workingDays: days,
        startTime: dayStart, endTime: dayEnd, duration: durationMin,
        buffer: bufferMin, timezone: 'Asia/Kolkata'
      };
      const probeDates = slotEngine.generateDates(probeWindow);
      if (!probeDates.length || !probeDates.some(d => slotEngine.generateSlotGrid(probeWindow, d.date).length)) {
        return res.status(400).json({ error: 'This window produces no bookable slots. Widen the dates, days, or times.' });
      }

      const token = crypto.randomUUID();

      // The window is stored ON the invitation itself — sending an invite no
      // longer overwrites the company-wide scheduling defaults.
      const interview = await prisma.recruitmentInterview.create({
        data: {
          applicationId: id,
          interviewType: interviewType || 'Technical',
          interviewer: interviewer || req.user?.name || 'Talent Team',
          token,
          tokenIssuedAt: new Date(),
          status: 'PENDING',
          duration: durationMin,
          bufferMinutes: bufferMin,
          timezone: 'Asia/Kolkata',
          availableFrom,
          availableTo,
          workingDays: days,
          dayStartTime: dayStart,
          dayEndTime: dayEnd,
          interviewMode: interviewMode || 'Online',
          meetingLink: meetingLink || null,
          location: location || null,
          notes: notes || '',
          schedulingSource: 'CANDIDATE'
        }
      });

      await prisma.application.update({
        where: { id },
        data: { status: 'INTERVIEW' }
      });

      const baseUrl = process.env.PUBLIC_BASE_URL || 'http://localhost:5173';
      const scheduleUrl = `${baseUrl}/?schedule=${token}`;

      await prisma.applicationTimeline.create({
        data: {
          applicationId: id,
          action: 'Self-Scheduling Invitation Sent',
          description: `Candidate invited to pick a slot between ${availableFrom} and ${availableTo} (${dayStart}–${dayEnd}, ${durationMin} min slots${bufferMin ? `, ${bufferMin} min buffer` : ''}).`
        }
      }).catch(() => null);

      try {
        await sendCandidateScheduleInviteEmail({
          candidateEmail: application.email,
          candidateName: application.fullName,
          jobTitle: application.requirement?.jobTitle || 'Role',
          token,
          duration: interview.duration,
          availableFrom,
          availableTo,
          startTime: dayStart,
          endTime: dayEnd,
          interviewMode: interview.interviewMode,
          publicBaseUrl: baseUrl,
          companyName
        });
      } catch (mailErr) {
        console.error('[RecruitmentMailer] Schedule invite email dispatch failed:', mailErr.message);
      }

      return res.json({
        message: 'Interview self-scheduling invitation sent successfully.',
        token,
        scheduleUrl,
        interview
      });
    }

    res.status(400).json({ error: 'Please specify scheduleOption.' });
  } catch (error) {
    console.error('Interview invitation error:', error);
    res.status(500).json({ error: error.message || 'Failed to dispatch interview invitation.' });
  }
});

/**
 * PUT /api/recruitment/applications/:id/interviews/:intId
 * Save interview ratings, feedback notes, and selection decision.
 */
router.put('/applications/:id/interviews/:intId', async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const intId = parseInt(req.params.intId, 10);
    const appId = parseInt(req.params.id, 10);

    const owned = await prisma.recruitmentInterview.findFirst({
      where: { id: intId, applicationId: appId, application: { companyId } },
      select: { id: true }
    });
    if (!owned) {
      return res.status(404).json({ error: 'Interview not found.' });
    }

    const {
      technicalSkills,
      communication,
      problemSolving,
      cultureFit,
      overallRating,
      strengths,
      weaknesses,
      feedbackComments,
      feedbackDecision
    } = req.body;

    const interview = await prisma.recruitmentInterview.update({
      where: { id: intId },
      data: {
        technicalSkills: technicalSkills ? parseInt(technicalSkills, 10) : null,
        communication: communication ? parseInt(communication, 10) : null,
        problemSolving: problemSolving ? parseInt(problemSolving, 10) : null,
        cultureFit: cultureFit ? parseInt(cultureFit, 10) : null,
        overallRating: overallRating ? parseInt(overallRating, 10) : null,
        strengths: strengths || '',
        weaknesses: weaknesses || '',
        feedbackComments: feedbackComments || '',
        feedbackDecision: feedbackDecision || 'SELECTED',
        status: 'COMPLETED'
      }
    });

    if (feedbackDecision === 'SELECT' || feedbackDecision === 'SELECTED') {
      await prisma.application.update({
        where: { id: appId },
        data: { status: 'SELECTED' }
      });
    } else if (feedbackDecision === 'REJECT' || feedbackDecision === 'REJECTED') {
      await prisma.application.update({
        where: { id: appId },
        data: {
          status: 'REJECTED',
          previousStatus: 'INTERVIEW',
          rejectionReason: feedbackComments || 'Interview feedback was not favorable.',
          rejectedAt: new Date(),
          rejectedBy: req.user?.name || 'Interviewer'
        }
      });
    }

    await prisma.applicationTimeline.create({
      data: {
        applicationId: appId,
        action: 'Interview Completed',
        description: `Feedback: ${feedbackDecision}. Rating: ${overallRating || 'N/A'}/5. Notes: ${feedbackComments || 'None'}`
      }
    });

    res.json(interview);
  } catch (error) {
    console.error('Interview feedback error:', error);
    res.status(500).json({ error: 'Failed to record interview feedback.' });
  }
});

/**
 * PATCH /api/recruitment/applications/:id/interviews/:intId/status
 * Update interview round status (e.g. COMPLETED, CANCELLED).
 */
router.patch('/applications/:id/interviews/:intId/status', async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const intId = parseInt(req.params.intId, 10);
    const appId = parseInt(req.params.id, 10);
    const { status } = req.body;

    const owned = await prisma.recruitmentInterview.findFirst({
      where: { id: intId, applicationId: appId, application: { companyId } },
      select: { id: true }
    });
    if (!owned) {
      return res.status(404).json({ error: 'Interview not found.' });
    }

    const interview = await prisma.recruitmentInterview.update({
      where: { id: intId },
      data: { status: status || 'COMPLETED' }
    });

    await prisma.applicationTimeline.create({
      data: {
        applicationId: appId,
        action: `Interview ${status === 'COMPLETED' ? 'Completed' : status}`,
        description: `Interview round status updated to ${status}.`
      }
    });

    res.json(interview);
  } catch (error) {
    console.error('Update interview status error:', error);
    res.status(500).json({ error: 'Failed to update interview status.' });
  }
});

/**
 * POST /api/recruitment/applications/:id/interviews/:intId/reopen-scheduling
 * HR reopens candidate self-scheduling (reschedule): the previous slot is
 * released, a fresh secure token is issued and the invitation email re-sent.
 * The previous slot is preserved in the timeline — nothing is silently
 * overwritten.
 */
router.post('/applications/:id/interviews/:intId/reopen-scheduling', async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const appId = parseInt(req.params.id, 10);
    const intId = parseInt(req.params.intId, 10);
    const { availableFrom, availableTo, workingDays, startTime, endTime, duration, bufferMinutes } = req.body || {};

    const application = await prisma.application.findFirst({
      where: { id: appId, companyId },
      include: { requirement: true }
    });
    if (!application) {
      return res.status(404).json({ error: 'Application not found.' });
    }

    const interview = await prisma.recruitmentInterview.findFirst({
      where: { id: intId, applicationId: appId }
    });
    if (!interview) {
      return res.status(404).json({ error: 'Interview not found.' });
    }
    if (interview.status === 'COMPLETED') {
      return res.status(400).json({ error: 'A completed interview cannot be rescheduled. Schedule a new round instead.' });
    }
    if (!application.email) {
      return res.status(400).json({ error: 'Candidate email address is required.' });
    }

    // Optional window override on reschedule; otherwise keep the invite's window
    const newFrom = availableFrom || interview.availableFrom;
    const newTo = availableTo || interview.availableTo;
    if (newFrom && newTo && newTo < newFrom) {
      return res.status(400).json({ error: 'Available Until date cannot be before Available From date.' });
    }

    const previousSlot = interview.scheduledDate
      ? `${interview.scheduledDate} ${interview.scheduledTime || ''}${interview.scheduledEndTime ? `–${interview.scheduledEndTime}` : ''}`.trim()
      : null;

    const token = crypto.randomUUID();
    const updated = await prisma.recruitmentInterview.update({
      where: { id: intId },
      data: {
        token,
        tokenIssuedAt: new Date(),
        status: 'PENDING',
        scheduledDate: null,
        scheduledTime: null,
        scheduledEndTime: null,
        bookedAt: null,
        schedulingSource: 'CANDIDATE',
        ...(newFrom ? { availableFrom: newFrom } : {}),
        ...(newTo ? { availableTo: newTo } : {}),
        ...(Array.isArray(workingDays) && workingDays.length ? { workingDays: workingDays.filter(d => slotEngine.DAY_NAMES.includes(d)) } : {}),
        ...(startTime ? { dayStartTime: startTime } : {}),
        ...(endTime ? { dayEndTime: endTime } : {}),
        ...(duration ? { duration: parseInt(duration, 10) } : {}),
        ...(bufferMinutes !== undefined && bufferMinutes !== null ? { bufferMinutes: parseInt(bufferMinutes, 10) || 0 } : {})
      }
    });

    await prisma.applicationTimeline.create({
      data: {
        applicationId: appId,
        action: 'Interview Rescheduling Opened',
        description: previousSlot
          ? `Previous slot ${previousSlot} released by ${req.user?.name || 'HR'}; candidate invited to pick a new time.`
          : `Self-scheduling link re-issued by ${req.user?.name || 'HR'}.`
      }
    });

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true }
    }).catch(() => null);

    const baseUrl = process.env.PUBLIC_BASE_URL || 'http://localhost:5173';
    try {
      await sendCandidateScheduleInviteEmail({
        candidateEmail: application.email,
        candidateName: application.fullName,
        jobTitle: application.requirement?.jobTitle || 'Role',
        token,
        duration: updated.duration,
        availableFrom: updated.availableFrom,
        availableTo: updated.availableTo,
        startTime: updated.dayStartTime,
        endTime: updated.dayEndTime,
        interviewMode: updated.interviewMode,
        publicBaseUrl: baseUrl,
        companyName: company?.name,
        isReschedule: true
      });
    } catch (mailErr) {
      console.error('[RecruitmentMailer] Reschedule invite email failed:', mailErr.message);
    }

    res.json({
      message: 'Candidate scheduling reopened and a fresh invitation link was sent.',
      scheduleUrl: `${baseUrl}/?schedule=${token}`,
      interview: updated
    });
  } catch (error) {
    console.error('Reopen scheduling error:', error);
    res.status(500).json({ error: 'Failed to reopen candidate scheduling.' });
  }
});

/**
 * POST /api/recruitment/applications/:id/offers
 * Generate & dispatch formal offer letter to candidate.
 */
router.post('/applications/:id/offers', async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const id = parseInt(req.params.id, 10);
    const { designation, department, salary, employmentType, location, joiningDate, offerExpiry, terms } = req.body;

    const application = await prisma.application.findFirst({
      where: { id, companyId },
      include: { requirement: true }
    });

    if (!application) {
      return res.status(404).json({ error: 'Application not found.' });
    }

    if (!application.email) {
      return res.status(400).json({ error: 'Candidate email address is missing.' });
    }

    const token = crypto.randomUUID();

    const offer = await prisma.recruitmentOffer.create({
      data: {
        applicationId: id,
        designation: designation || application.requirement?.jobTitle || '',
        department: department || application.requirement?.department || 'General',
        salary: salary || '',
        employmentType: employmentType || 'Full-Time',
        location: location || application.requirement?.location || '',
        joiningDate: joiningDate || '',
        offerExpiry: offerExpiry || null,
        terms: terms || null,
        token,
        status: 'SENT'
      }
    });

    await prisma.application.update({
      where: { id },
      data: { status: 'OFFER_SENT' }
    });

    await prisma.applicationTimeline.create({
      data: {
        applicationId: id,
        action: 'Offer Letter Dispatched',
        description: `Position: ${offer.designation}. Offered Salary: ${salary}. Joining: ${joiningDate}.`
      }
    });

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true }
    }).catch(() => null);

    sendOfferLetterEmail({
      candidateEmail: application.email,
      candidateName: application.fullName,
      jobTitle: offer.designation || application.requirement?.jobTitle || 'Role',
      offer: { salary, joiningDate, location: offer.location, employmentType: offer.employmentType },
      token,
      publicBaseUrl: process.env.PUBLIC_BASE_URL || 'http://localhost:5173',
      companyName: company?.name
    }).catch(err => console.error('[Mailer] Offer email dispatch error:', err.message));

    res.status(201).json(offer);
  } catch (error) {
    console.error('Create offer error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate and dispatch offer.' });
  }
});

/**
 * POST /api/recruitment/applications/:id/retry-ats
 * Re-trigger background ATS analysis on a candidate resume.
 */
router.post('/applications/:id/retry-ats', async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const id = parseInt(req.params.id, 10);

    const application = await prisma.application.findFirst({
      where: { id, companyId },
      include: { requirement: true }
    });

    if (!application) {
      return res.status(404).json({ error: 'Application not found.' });
    }

    if (!application.resumePath) {
      return res.status(400).json({ error: 'No resume file found for this applicant.' });
    }

    await prisma.application.update({
      where: { id },
      data: { analysisStatus: 'PROCESSING' }
    });

    setImmediate(() => runAtsForApplication(id, { force: true, trigger: 'Manual ATS re-analysis' }));

    res.json({ message: 'ATS analysis re-triggered in background.' });
  } catch (error) {
    console.error('Retry ATS error:', error);
    res.status(500).json({ error: 'Failed to re-trigger ATS analysis.' });
  }
});

/**
 * GET /api/recruitment/settings/interview
 * Get company interview schedule settings.
 */
router.get('/settings/interview', async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    if (companyId < 0) {
      return res.status(403).json({ error: 'No authorized company workspace in context.' });
    }
    let settings = await prisma.interviewScheduleSettings.findUnique({
      where: { companyId }
    });

    if (!settings) {
      settings = await prisma.interviewScheduleSettings.create({
        data: {
          companyId,
          availableFrom: new Date().toISOString().split('T')[0],
          availableTo: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
          workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
          startTime: '10:00',
          endTime: '17:00',
          duration: 30,
          timezone: 'Asia/Kolkata'
        }
      });
    }

    res.json(settings);
  } catch (error) {
    console.error('Get interview settings error:', error);
    res.status(500).json({ error: 'Failed to fetch interview settings.' });
  }
});

/**
 * POST /api/recruitment/settings/interview
 * Update company interview schedule settings.
 */
router.post('/settings/interview', async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    if (companyId < 0) {
      return res.status(403).json({ error: 'No authorized company workspace in context.' });
    }
    const { availableFrom, availableTo, workingDays, startTime, endTime, duration, timezone } = req.body;

    const settings = await prisma.interviewScheduleSettings.upsert({
      where: { companyId },
      create: {
        companyId,
        availableFrom,
        availableTo,
        workingDays: workingDays || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        startTime: startTime || '10:00',
        endTime: endTime || '17:00',
        duration: duration ? parseInt(duration, 10) : 30,
        timezone: timezone || 'Asia/Kolkata'
      },
      update: {
        availableFrom,
        availableTo,
        workingDays: workingDays || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        startTime: startTime || '10:00',
        endTime: endTime || '17:00',
        duration: duration ? parseInt(duration, 10) : 30,
        timezone: timezone || 'Asia/Kolkata'
      }
    });

    res.json(settings);
  } catch (error) {
    console.error('Update interview settings error:', error);
    res.status(500).json({ error: 'Failed to update interview settings.' });
  }
});

module.exports = router;
