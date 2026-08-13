const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const EMBEDDING_MODEL = 'text-embedding-004';

/**
 * Extracts raw text from a PDF, DOCX, or DOC file.
 */
async function extractTextFromFile(filePath) {
  console.log(`[ATS] Extracting text from: ${filePath}`);
  if (!fs.existsSync(filePath)) {
    console.error(`[ATS] Error: File does not exist at ${filePath}`);
    return '';
  }

  try {
    if (ext === '.pdf') {
      try {
        const dataBuffer = fs.readFileSync(filePath);
        const pdfData = await pdfParse(dataBuffer);
        text = pdfData.text || '';
      } catch (pdfErr) {
        console.warn('[ATS] PDF extraction note:', pdfErr.message);
        try { text = fs.readFileSync(filePath, 'utf8'); } catch (_) {}
      }
    } else if (ext === '.docx' || ext === '.doc') {
      try {
        const result = await mammoth.extractRawText({ path: filePath });
        text = result.value || '';
      } catch (docErr) {
        console.warn('[ATS] Mammoth extraction note:', docErr.message);
        try { text = fs.readFileSync(filePath, 'utf8'); } catch (_) {}
      }
    } else {
      text = fs.readFileSync(filePath, 'utf8');
    }

    if (!text || text.trim().length === 0) {
      try { text = fs.readFileSync(filePath, 'utf8'); } catch (_) {}
    }

    console.log(`[ATS] Resume text extracted: ${text.length} characters`);
  } catch (error) {
    console.error(`[ATS] Error extracting text from ${filePath}:`, error.message);
    try { text = fs.readFileSync(filePath, 'utf8'); } catch (_) { text = ''; }
  }

  return (text || '').trim();
}

/**
 * Parses raw resume text into structured JSON using Gemini AI.
 */
async function parseResumeWithGemini(resumeText) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[ATS] GEMINI_API_KEY is not configured. Skipping Gemini structured extraction.');
    return null;
  }

  const prompt = `You are an expert HR ATS (Applicant Tracking System) parser.
Extract the following structured information from the provided resume text.
Return ONLY a valid, raw JSON object with NO markdown formatting (do not include \`\`\`json or \`\`\`).

JSON Schema required:
{
  "candidate_name": "string or null",
  "email": "string or null",
  "phone": "string or null",
  "skills": ["skill1", "skill2"],
  "years_of_experience": 2.5,
  "education_levels": ["B.Tech", "MCA", "High School"],
  "projects": ["Project 1 summary", "Project 2 summary"],
  "resume_summary": "Comprehensive summary of experience and domain expertise"
}

Resume Text:
${resumeText.slice(0, 15000)}`;

  try {
    console.log('[ATS] Requesting structured extraction from Gemini AI...');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    let content = response.text().trim();

    // Clean markdown codeblocks if model includes them
    if (content.startsWith('```json')) {
      content = content.replace(/^```json/, '').replace(/```$/, '').trim();
    } else if (content.startsWith('```')) {
      content = content.replace(/^```/, '').replace(/```$/, '').trim();
    }

    const parsed = JSON.parse(content);
    console.log('[ATS] Structured AI data parsed successfully.');
    return parsed;
  } catch (err) {
    console.error('[ATS] Gemini Resume Parse Error:', err.message);
    return null;
  }
}

/**
 * Deterministic Jaccard word-overlap similarity (fallback).
 */
function computeJaccardSimilarity(text1, text2) {
  if (!text1 || !text2) return 0;
  const words1 = new Set((text1.toLowerCase().match(/\w+/g) || []));
  const words2 = new Set((text2.toLowerCase().match(/\w+/g) || []));
  if (words1.size === 0 || words2.size === 0) return 0;

  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  return intersection.size / union.size;
}

/**
 * Computes semantic similarity between two texts using Gemini Embeddings with deterministic fallback.
 */
async function computeSimilarity(text1, text2) {
  if (!text1 || !text2) return 0.0;
  const apiKey = process.env.GEMINI_API_KEY;

  if (apiKey) {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });

      const [res1, res2] = await Promise.all([
        model.embedContent(text1.slice(0, 2000)),
        model.embedContent(text2.slice(0, 2000))
      ]);

      const vec1 = res1.embedding.values;
      const vec2 = res2.embedding.values;

      let dotProduct = 0;
      let mag1 = 0;
      let mag2 = 0;
      for (let i = 0; i < vec1.length; i++) {
        dotProduct += vec1[i] * vec2[i];
        mag1 += vec1[i] * vec1[i];
        mag2 += vec2[i] * vec2[i];
      }
      mag1 = Math.sqrt(mag1);
      mag2 = Math.sqrt(mag2);

      if (mag1 === 0 || mag2 === 0) return 0.0;
      const sim = dotProduct / (mag1 * mag2);
      return Math.max(0, Math.min(1, sim));
    } catch (err) {
      console.warn('[ATS] Embedding API error, falling back to deterministic matching:', err.message);
    }
  }

  return computeJaccardSimilarity(text1, text2);
}

/**
 * Full ATS Matching pipeline for a candidate resume against a job requirement.
 */
async function analyzeCandidateMatch(resumePath, requirement) {
  console.log(`[ATS] Starting ATS analysis for resume at: ${resumePath}`);

  // 1. Extract raw text from file
  const rawText = await extractTextFromFile(resumePath);
  if (!rawText) {
    return {
      status: 'FAILED',
      ai_summary: 'Could not extract readable text from the uploaded resume file. File may be corrupted or unreadable.',
      ats_match_score: 0,
      skills_score: 0,
      experience_score: 0,
      education_score: 0,
      projects_score: 0,
      job_description_score: 0,
      matched_skills: [],
      missing_skills: [],
      warnings: ['Resume text could not be extracted.'],
      match_breakdown: {}
    };
  }

  // 2. Parse structured data via Gemini AI (or fallback parser)
  let parsedData = await parseResumeWithGemini(rawText);

  // If Gemini extraction failed or is unconfigured, create best-effort structured data from raw text
  if (!parsedData) {
    console.log('[ATS] Using deterministic text analyzer fallback...');
    parsedData = {
      candidate_name: null,
      email: null,
      phone: null,
      skills: (rawText.match(/([a-zA-Z+#.-]{2,20})/g) || []).slice(0, 30),
      years_of_experience: 0,
      education_levels: [],
      projects: [],
      resume_summary: rawText.slice(0, 1000)
    };
  }

  // 3. Extract requirement fields
  const reqSkillsRaw = (requirement.requiredSkills || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const candSkillsRaw = Array.isArray(parsedData.skills)
    ? parsedData.skills
    : String(parsedData.skills || '').split(',').map(s => s.trim()).filter(Boolean);

  const candSkillsStr = candSkillsRaw.join(', ').toLowerCase();

  // 4. Skills Matching — 40%
  const matchedSkills = [];
  const missingSkills = [];
  let skillsScore = 0;

  if (reqSkillsRaw.length > 0) {
    let matchCount = 0;
    for (const rSkill of reqSkillsRaw) {
      const lowerReq = rSkill.toLowerCase();
      // Exact / substring check first
      if (candSkillsStr.includes(lowerReq) || rawText.toLowerCase().includes(lowerReq)) {
        matchedSkills.push(rSkill);
        matchCount++;
      } else {
        // Semantic similarity check
        const sim = await computeSimilarity(rSkill, candSkillsStr);
        if (sim > 0.65) {
          matchedSkills.push(rSkill);
          matchCount++;
        } else {
          missingSkills.push(rSkill);
        }
      }
    }
    skillsScore = Math.round((matchCount / reqSkillsRaw.length) * 40);
  } else {
    skillsScore = 40; // Full points if no specific skills specified
  }

  // 5. Experience Matching — 25%
  let reqExpVal = 0;
  const expMatch = String(requirement.experience || '').match(/\d+/);
  if (expMatch) reqExpVal = parseFloat(expMatch[0]) || 0;

  let candExpVal = parseFloat(parsedData.years_of_experience) || 0;
  let experienceScore = 0;

  if (reqExpVal === 0) {
    experienceScore = 25;
  } else if (candExpVal >= reqExpVal) {
    experienceScore = 25;
  } else if (candExpVal >= reqExpVal * 0.7) {
    experienceScore = 15; // Partial
  } else if (candExpVal > 0) {
    experienceScore = 5;
  } else {
    experienceScore = 0;
  }

  // 6. Education Matching — 10%
  const reqEdu = (requirement.qualification || '').toLowerCase();
  const candEduList = parsedData.education_levels || [];
  const candEduStr = (candEduList.join(' ') + ' ' + rawText.slice(0, 2000)).toLowerCase();
  let educationScore = 0;

  if (!reqEdu) {
    educationScore = 10;
  } else {
    const reqKeywords = reqEdu.split(/\W+/).filter(w => w.length > 2);
    const hasMatch = reqKeywords.some(kw => candEduStr.includes(kw));
    if (hasMatch) {
      educationScore = 10;
    } else {
      const sim = await computeSimilarity(reqEdu, candEduStr);
      educationScore = sim > 0.6 ? 10 : 5;
    }
  }

  // 7. Projects Relevance — 10%
  const candProjects = parsedData.projects || [];
  const candProjectsStr = candProjects.join(' ');
  let projectsScore = 0;

  if (reqSkillsRaw.length > 0 && candProjectsStr) {
    const projSim = await computeSimilarity(reqSkillsRaw.join(', '), candProjectsStr);
    projectsScore = Math.round(Math.min(Math.max(projSim * 10, 0), 10));
  } else if (candProjects.length > 0) {
    projectsScore = 6;
  } else {
    projectsScore = 0;
  }

  // 8. Job Description Semantic Match — 15%
  const jd = requirement.jobDescription || '';
  let jdScore = 0;
  if (jd) {
    const candidateCorpus = `${parsedData.resume_summary || ''} ${candProjectsStr} ${rawText.slice(0, 1500)}`;
    const jdSim = await computeSimilarity(jd, candidateCorpus);
    jdScore = Math.round(Math.min(Math.max(jdSim * 15, 0), 15));
  } else {
    jdScore = 15;
  }

  // 9. Total Score & Warnings
  const totalScore = Math.min(100, Math.max(0, skillsScore + experienceScore + educationScore + projectsScore + jdScore));
  const warnings = [];

  if (candExpVal < reqExpVal && reqExpVal > 0) {
    warnings.push(`Candidate experience (${candExpVal}y) is below required ${reqExpVal}y.`);
  }
  if (missingSkills.length > matchedSkills.length && reqSkillsRaw.length > 0) {
    warnings.push('Candidate is missing several required core skills.');
  }
  if (candExpVal > 0 && candProjects.length === 0) {
    warnings.push('Experience claimed, but detailed project achievements were not explicitly detected.');
  }

  let aiSummary = `Candidate ATS match rating is ${totalScore}%. `;
  if (totalScore >= 80) {
    aiSummary += 'Strong match with high alignment in skills, experience, and qualification.';
  } else if (totalScore >= 60) {
    aiSummary += 'Moderate match. Review missing skills and evaluate candidate during screening.';
  } else {
    aiSummary += 'Weak match based on extracted resume qualifications and requirements.';
  }

  console.log(`[ATS] Final score: ${totalScore}% (Skills: ${skillsScore}/40, Exp: ${experienceScore}/25, Edu: ${educationScore}/10, Proj: ${projectsScore}/10, JD: ${jdScore}/15)`);

  return {
    status: 'COMPLETED',
    ats_match_score: totalScore,
    skills_score: skillsScore,
    experience_score: experienceScore,
    education_score: educationScore,
    projects_score: projectsScore,
    job_description_score: jdScore,
    matched_skills: matchedSkills,
    missing_skills: missingSkills,
    warnings: warnings,
    ai_summary: aiSummary,
    match_breakdown: {
      total: totalScore,
      skills: skillsScore,
      experience: experienceScore,
      education: educationScore,
      projects: projectsScore,
      jobDescription: jdScore
    },
    parsed_data: parsedData
  };
}

module.exports = {
  extractTextFromFile,
  parseResumeWithGemini,
  computeSimilarity,
  analyzeCandidateMatch
};
