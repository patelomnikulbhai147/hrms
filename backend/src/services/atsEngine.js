/**
 * ATS Engine v2 — deterministic, explainable resume-vs-requirement matching.
 *
 * Pipeline: extract text (pdf-parse / mammoth / binary-strings fallback)
 *   → parse structured data (deterministic parser, optionally enriched by
 *     Gemini when GEMINI_API_KEY is set — Gemini only ever ADDS parsed facts,
 *     the scoring itself is always deterministic)
 *   → weighted scoring against the SPECIFIC requirement the candidate
 *     applied for.
 *
 * Weights (components that don't apply to a requirement are excluded and the
 * rest re-scaled to 100 — a job with no listed skills never gifts 40 points):
 *   Skills               40
 *   Relevant Experience  25
 *   Role/Project Fit     15
 *   Education            10
 *   Preferred Skills      5
 *   Other (JD coverage)   5
 *
 * Nothing is invented: a skill/experience/education signal that cannot be
 * located in the resume text is reported as "Not identified", never assumed.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PDFParse } = require('pdf-parse'); // v2 API: new PDFParse({ data }).getText()
const mammoth = require('mammoth');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

// ── Text extraction ──────────────────────────────────────────────────────────

/** Pulls printable character runs out of a binary buffer (legacy .doc fallback). */
function extractPrintableStrings(buffer) {
  const text = buffer.toString('latin1');
  const runs = text.match(/[\x20-\x7E\r\n\t]{4,}/g) || [];
  return runs
    .map(r => r.trim())
    .filter(r => /[a-zA-Z]{3,}/.test(r))
    .join('\n');
}

/**
 * Extracts raw text from a PDF, DOCX, or DOC file.
 * (v1 referenced undeclared `ext`/`text` vars, crashed on every call and fell
 * back to reading raw binary as UTF-8 — every score was computed on garbage.)
 */
async function extractTextFromFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`[ATS] File does not exist at ${filePath}`);
    return '';
  }

  const ext = path.extname(filePath).toLowerCase();
  let text = '';

  try {
    if (ext === '.pdf') {
      const dataBuffer = fs.readFileSync(filePath);
      const parser = new PDFParse({ data: new Uint8Array(dataBuffer) });
      try {
        const pdfData = await parser.getText();
        text = pdfData.text || '';
      } finally {
        await parser.destroy().catch(() => {});
      }
    } else if (ext === '.docx') {
      const result = await mammoth.extractRawText({ path: filePath });
      text = result.value || '';
    } else if (ext === '.doc') {
      // mammoth only reads OOXML; old binary .doc → strip to printable strings
      try {
        const result = await mammoth.extractRawText({ path: filePath });
        text = result.value || '';
      } catch (_) { /* fall through to binary-strings */ }
      if (!text.trim()) {
        text = extractPrintableStrings(fs.readFileSync(filePath));
      }
    } else {
      text = fs.readFileSync(filePath, 'utf8');
    }
  } catch (error) {
    console.warn(`[ATS] Extraction error for ${path.basename(filePath)}: ${error.message}`);
    // Last resort: printable strings, never raw binary-as-utf8
    try { text = extractPrintableStrings(fs.readFileSync(filePath)); } catch (_) { text = ''; }
  }

  return (text || '').replace(/[\u0000\u00a0]/g, ' ').trim();
}

/** Heuristic: is the extracted text actually readable prose (vs binary garbage)? */
function assessTextQuality(rawText) {
  const chars = rawText.length;
  if (chars < 120) return { chars, letterRatio: 0, readable: false };
  const letters = (rawText.match(/[a-zA-Z\s]/g) || []).length;
  const letterRatio = letters / chars;
  const common = ['the', 'and', 'in', 'of', 'to', 'with', 'for', 'experience', 'work', 'skills', 'university', 'project', 'developed', 'team'];
  const lower = rawText.toLowerCase();
  const commonHits = common.filter(w => new RegExp(`\\b${w}\\b`).test(lower)).length;
  return { chars, letterRatio: Math.round(letterRatio * 100) / 100, readable: letterRatio >= 0.45 && commonHits >= 3 };
}

// ── Skill dictionary ─────────────────────────────────────────────────────────
// canonical → aliases (all matched with hard word boundaries; matching "C"
// never fires inside arbitrary words). Keep aliases lowercase.
const SKILL_ALIASES = {
  'python': ['py'],
  'javascript': ['js', 'java script', 'ecmascript', 'es6'],
  'typescript': ['ts'],
  'java': [],
  'c++': ['cpp', 'c plus plus'],
  'c#': ['csharp', 'c sharp', '.net c#'],
  'c': ['c language', 'c programming'],
  'go': ['golang', 'go lang'],
  'rust': [],
  'php': [],
  'ruby': ['ruby on rails', 'rails', 'ror'],
  'kotlin': [],
  'swift': [],
  'scala': [],
  'r': ['r programming', 'r language'],
  'sql': ['structured query language'],
  'html': ['html5'],
  'css': ['css3', 'scss', 'sass', 'less'],
  'react': ['react.js', 'reactjs', 'react js'],
  'react native': ['react-native'],
  'angular': ['angularjs', 'angular.js', 'angular js'],
  'vue': ['vue.js', 'vuejs', 'vue js'],
  'next.js': ['nextjs', 'next js'],
  'node.js': ['node', 'nodejs', 'node js'],
  'express': ['express.js', 'expressjs', 'express js'],
  'django': [],
  'django rest framework': ['drf', 'django-rest-framework', 'django rest'],
  'flask': [],
  'fastapi': ['fast api'],
  'spring': ['spring boot', 'springboot', 'spring-boot'],
  'laravel': [],
  '.net': ['dotnet', 'asp.net', 'aspnet', '.net core', 'dot net'],
  'rest api': ['rest apis', 'restful', 'restful api', 'restful apis', 'rest services', 'restful services', 'rest', 'web api', 'web apis', 'http api', 'http apis', 'api development', 'backend api', 'backend apis'],
  'graphql': ['graph ql'],
  'grpc': [],
  'microservices': ['micro services', 'micro-services', 'microservice'],
  'postgresql': ['postgres', 'postgre sql', 'psql', 'pgsql'],
  'mysql': ['my sql', 'mariadb'],
  'mongodb': ['mongo', 'mongo db'],
  'redis': [],
  'elasticsearch': ['elastic search', 'elk'],
  'sqlite': [],
  'oracle': ['oracle db', 'pl/sql', 'plsql'],
  'sql server': ['mssql', 'ms sql', 'microsoft sql server', 't-sql', 'tsql'],
  'dynamodb': ['dynamo db'],
  'kafka': ['apache kafka'],
  'rabbitmq': ['rabbit mq'],
  'celery': [],
  'aws': ['amazon web services', 'ec2', 's3', 'aws lambda', 'cloudfront', 'route53', 'aws cloud', 'ecs', 'eks', 'rds'],
  'azure': ['microsoft azure', 'azure devops'],
  'gcp': ['google cloud', 'google cloud platform'],
  'docker': ['containerization', 'containerisation'],
  'kubernetes': ['k8s', 'kube'],
  'terraform': [],
  'jenkins': [],
  'ci/cd': ['cicd', 'ci cd', 'continuous integration', 'continuous deployment', 'continuous delivery', 'devops pipeline'],
  'git': ['github', 'gitlab', 'bitbucket', 'version control'],
  'linux': ['unix', 'ubuntu', 'centos', 'shell scripting', 'bash'],
  'nginx': [],
  'machine learning': ['ml', 'scikit-learn', 'sklearn', 'scikit learn'],
  'deep learning': ['neural networks', 'neural network'],
  'tensorflow': ['tensor flow'],
  'pytorch': ['py torch'],
  'nlp': ['natural language processing'],
  'data science': [],
  'data analysis': ['data analytics', 'data analyst'],
  'pandas': [],
  'numpy': [],
  'power bi': ['powerbi'],
  'tableau': [],
  'excel': ['ms excel', 'microsoft excel', 'advanced excel'],
  'selenium': [],
  'cypress': [],
  'jest': [],
  'pytest': [],
  'junit': [],
  'testing': ['unit testing', 'integration testing', 'qa', 'quality assurance', 'test automation', 'automation testing', 'manual testing'],
  'agile': ['scrum', 'kanban', 'sprint planning'],
  'jira': [],
  'figma': [],
  'photoshop': ['adobe photoshop'],
  'ui/ux': ['ui ux', 'ux design', 'ui design', 'user experience', 'user interface design'],
  'android': ['android development', 'android studio'],
  'ios': ['ios development'],
  'flutter': [],
  'firebase': [],
  'salesforce': [],
  'sap': [],
  'tally': ['tally erp'],
  'seo': ['search engine optimization', 'search engine optimisation'],
  'digital marketing': ['online marketing', 'social media marketing', 'smm', 'google ads', 'facebook ads', 'performance marketing'],
  'content writing': ['content creation', 'copywriting'],
  'accounting': ['bookkeeping', 'accounts payable', 'accounts receivable'],
  'gst': ['gst filing', 'gst returns'],
  'payroll': ['payroll processing', 'payroll management'],
  'recruitment': ['talent acquisition', 'hiring', 'sourcing'],
  'communication': ['communication skills', 'verbal communication', 'written communication'],
  'leadership': ['team leadership', 'team management', 'people management'],
  'project management': ['program management', 'pmp'],
  'customer service': ['customer support', 'client servicing', 'customer success'],
  'sales': ['business development', 'b2b sales', 'b2c sales', 'inside sales', 'field sales', 'lead generation'],
};

// resume skill X implies job-requirement skill Y (semantic bridge:
// "Developed services with Django REST Framework" ⇒ knows REST API + Django + Python)
const IMPLIES = {
  'django rest framework': ['rest api', 'django', 'python'],
  'django': ['python'],
  'flask': ['python', 'rest api'],
  'fastapi': ['python', 'rest api'],
  'express': ['node.js', 'javascript', 'rest api'],
  'next.js': ['react', 'javascript'],
  'react': ['javascript'],
  'react native': ['react', 'javascript'],
  'angular': ['typescript', 'javascript'],
  'vue': ['javascript'],
  'node.js': ['javascript'],
  'typescript': ['javascript'],
  'spring': ['java', 'rest api'],
  'laravel': ['php'],
  'ruby': [],
  'pandas': ['python'],
  'numpy': ['python'],
  'pytest': ['python', 'testing'],
  'jest': ['javascript', 'testing'],
  'junit': ['java', 'testing'],
  'selenium': ['testing'],
  'cypress': ['testing', 'javascript'],
  'tensorflow': ['machine learning', 'python'],
  'pytorch': ['machine learning', 'python'],
  'deep learning': ['machine learning'],
  'nlp': ['machine learning'],
  'kubernetes': ['docker'],
  'postgresql': ['sql'],
  'mysql': ['sql'],
  'sql server': ['sql'],
  'oracle': ['sql'],
  'graphql': ['rest api'],
  'terraform': ['ci/cd'],
  'jenkins': ['ci/cd'],
  'scrum': ['agile'],
};

const CANONICAL_SKILLS = Object.keys(SKILL_ALIASES);

// alias → canonical lookup
const ALIAS_TO_CANONICAL = {};
for (const [canon, aliases] of Object.entries(SKILL_ALIASES)) {
  ALIAS_TO_CANONICAL[canon] = canon;
  for (const a of aliases) ALIAS_TO_CANONICAL[a] = canon;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Word-boundary containment test that is safe for terms like "c++", "c#", ".net". */
function termInText(term, lowerText) {
  const t = term.toLowerCase().trim();
  if (!t) return false;
  const pattern = `(^|[^a-z0-9+#])${escapeRegex(t)}($|[^a-z0-9+#])`;
  try {
    return new RegExp(pattern, 'i').test(lowerText);
  } catch (_) {
    return lowerText.includes(t);
  }
}

/** Normalize a free-text skill label to a canonical dictionary name when known. */
function canonicalizeSkill(raw) {
  const s = String(raw || '').toLowerCase().trim().replace(/\s+/g, ' ');
  if (!s) return '';
  if (ALIAS_TO_CANONICAL[s]) return ALIAS_TO_CANONICAL[s];
  const stripped = s.replace(/\.(js|ts)$/, '').replace(/\s*(js|ts)$/, '');
  if (ALIAS_TO_CANONICAL[stripped]) return ALIAS_TO_CANONICAL[stripped];
  return s;
}

/** All match variants for a canonical/free skill name. */
function skillVariants(skill) {
  const canon = canonicalizeSkill(skill);
  const variants = new Set([String(skill).toLowerCase().trim(), canon]);
  if (SKILL_ALIASES[canon]) SKILL_ALIASES[canon].forEach(a => variants.add(a));
  return [...variants].filter(Boolean);
}

// ── Deterministic resume parsing ─────────────────────────────────────────────

const SECTION_HEADINGS = [
  { key: 'experience', re: /^(work\s+experience|professional\s+experience|employment(\s+history)?|experience|work\s+history|career\s+history)\b/i },
  { key: 'projects', re: /^(projects?|academic\s+projects?|personal\s+projects?|key\s+projects?)\b/i },
  { key: 'education', re: /^(education(al)?(\s+qualifications?|\s+background)?|academics?|qualifications?)\b/i },
  { key: 'certifications', re: /^(certifications?|certificates?|courses?\s*(&|and)?\s*certifications?|licenses?)\b/i },
  { key: 'skills', re: /^((technical|core|key)\s+skills?|skills?(\s+summary)?|technologies|tech\s+stack|competencies)\b/i },
  { key: 'summary', re: /^(summary|profile|objective|about\s+me|career\s+objective|professional\s+summary)\b/i },
];

function splitSections(rawText) {
  const sections = { _preamble: [] };
  let current = '_preamble';
  for (const line of rawText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length > 0 && trimmed.length <= 60) {
      const clean = trimmed.replace(/^[\s•\-–—*#|:]+|[\s:|]+$/g, '');
      const hit = SECTION_HEADINGS.find(h => h.re.test(clean));
      if (hit) { current = hit.key; if (!sections[current]) sections[current] = []; continue; }
    }
    if (!sections[current]) sections[current] = [];
    sections[current].push(line);
  }
  const out = {};
  for (const [k, lines] of Object.entries(sections)) out[k] = lines.join('\n').trim();
  return out;
}

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };

/** Parse employment date ranges ("Jan 2020 – Mar 2023", "2019 - present") → total years. */
function experienceFromDateRanges(text, nowDate) {
  const now = nowDate || new Date();
  const ranges = [];
  const re = /(?:(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[a-z]*[\s.,'-]*)?((?:19|20)\d{2})\s*(?:-|–|—|to|till|until)\s*(?:(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[a-z]*[\s.,'-]*)?((?:19|20)\d{2}|present|current|now|date|today)/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const startMonth = m[1] ? MONTHS[m[1].slice(0, 3).toLowerCase()] : 0;
    const startYear = parseInt(m[2], 10);
    let endYear, endMonth;
    if (/^(19|20)\d{2}$/.test(m[4])) {
      endYear = parseInt(m[4], 10);
      endMonth = m[3] ? MONTHS[m[3].slice(0, 3).toLowerCase()] : 11;
    } else {
      endYear = now.getFullYear();
      endMonth = now.getMonth();
    }
    const start = startYear * 12 + (startMonth || 0);
    const end = endYear * 12 + (endMonth != null ? endMonth : 11);
    if (end >= start && end - start <= 45 * 12) ranges.push([start, end]);
  }
  if (!ranges.length) return null;
  // merge overlaps, sum months
  ranges.sort((a, b) => a[0] - b[0]);
  let months = 0, [cs, ce] = ranges[0];
  for (let i = 1; i < ranges.length; i++) {
    const [s, e] = ranges[i];
    if (s <= ce + 1) ce = Math.max(ce, e);
    else { months += ce - cs + 1; [cs, ce] = [s, e]; }
  }
  months += ce - cs + 1;
  return Math.round((months / 12) * 10) / 10;
}

/** Explicitly stated experience: "4+ years of experience", "3 yrs exp". */
function statedExperienceYears(text) {
  const re = /(\d{1,2}(?:\.\d)?)\s*\+?\s*(?:years?|yrs?)/gi;
  let best = null, m;
  while ((m = re.exec(text)) !== null) {
    const val = parseFloat(m[1]);
    if (!(val > 0 && val <= 45)) continue;
    const context = text.slice(Math.max(0, m.index - 60), m.index + m[0].length + 40).toLowerCase();
    if (/experience|exp\b|working|worked|career/.test(context)) {
      if (best === null || val > best) best = val;
    }
  }
  return best;
}

const DEGREE_PATTERNS = [
  { level: 5, label: 'Doctorate', re: /\b(ph\.?\s?d|doctorate|doctoral)\b/i },
  { level: 4, label: 'Master', re: /\b(m\.?\s?tech|m\.?\s?e\b|m\.?\s?sc|m\.?\s?c\.?\s?a|mba|m\.?\s?com|m\.?\s?a\b|master(?:'s)?(\s+of|\s+degree|\s+in)?|post\s*graduat)/i },
  { level: 3, label: 'Bachelor', re: /\b(b\.?\s?tech|b\.?\s?e\b|b\.?\s?sc|b\.?\s?c\.?\s?a|bba|b\.?\s?com|b\.?\s?a\b|bachelor(?:'s)?(\s+of|\s+degree|\s+in)?|under\s*graduat|graduation|graduate)\b/i },
  { level: 2, label: 'Diploma', re: /\b(diploma|polytechnic)\b/i },
  { level: 1, label: 'Higher Secondary', re: /\b(12th|xii|hsc|higher\s+secondary|intermediate|senior\s+secondary)\b/i },
];

function detectDegrees(text) {
  const found = [];
  for (const d of DEGREE_PATTERNS) {
    const m = text.match(d.re);
    if (m) found.push({ level: d.level, label: d.label, matchedText: m[0].trim() });
  }
  return found;
}

const TITLE_WORDS = /\b(developer|engineer|programmer|architect|analyst|manager|consultant|designer|administrator|scientist|specialist|executive|officer|lead|intern|trainee|associate|accountant|recruiter|tester)\b/i;

function detectJobTitles(rawText, sections) {
  const source = [sections.experience, sections._preamble, sections.summary].filter(Boolean).join('\n');
  const titles = [];
  for (const line of source.split(/\r?\n/)) {
    const t = line.trim().replace(/^[•\-–—*\s]+/, '');
    if (t.length >= 4 && t.length <= 70 && TITLE_WORDS.test(t) && !/^(the|a|an)\s/i.test(t)) {
      // strip company/date tails: "Software Engineer at Foo (2020-2023)"
      const cleaned = t.split(/\s+(?:at|@|\||,|-{1,2}|–)\s+/i)[0].replace(/\(.*\)$/, '').trim();
      if (cleaned && TITLE_WORDS.test(cleaned) && !titles.some(x => x.toLowerCase() === cleaned.toLowerCase())) {
        titles.push(cleaned);
      }
    }
    if (titles.length >= 8) break;
  }
  return titles;
}

function detectSkillsInText(rawText) {
  const lower = rawText.toLowerCase();
  const found = [];
  for (const canon of CANONICAL_SKILLS) {
    if (skillVariants(canon).some(v => termInText(v, lower))) found.push(canon);
  }
  return found;
}

function detectCertifications(sections) {
  const src = sections.certifications || '';
  const items = src.split(/\r?\n|[•;]/).map(s => s.trim().replace(/^[-–—*\s]+/, '')).filter(s => s.length >= 4 && s.length <= 120);
  return items.slice(0, 10);
}

/**
 * Deterministic resume parser — no AI required, same input → same output.
 */
function parseResumeDeterministic(rawText) {
  const sections = splitSections(rawText);
  const expSource = sections.experience || '';

  const rangeYears = experienceFromDateRanges(expSource || rawText);
  const statedYears = statedExperienceYears(rawText);
  let years = null, experienceSource = 'none';
  if (rangeYears !== null && statedYears !== null) {
    years = Math.max(rangeYears, statedYears);
    experienceSource = 'date-ranges + stated';
  } else if (rangeYears !== null) { years = rangeYears; experienceSource = 'date-ranges'; }
  else if (statedYears !== null) { years = statedYears; experienceSource = 'stated'; }

  const degrees = detectDegrees((sections.education || '') + '\n' + rawText.slice(0, 3000));
  const emailMatch = rawText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const phoneMatch = rawText.match(/(?:\+?\d{1,3}[\s-]?)?\d{10}\b/);

  return {
    candidate_name: null,
    email: emailMatch ? emailMatch[0] : null,
    phone: phoneMatch ? phoneMatch[0] : null,
    skills: detectSkillsInText(rawText),
    years_of_experience: years,
    experience_source: experienceSource,
    education_levels: degrees.map(d => d.matchedText),
    degree_level: degrees.length ? Math.max(...degrees.map(d => d.level)) : 0,
    job_titles: detectJobTitles(rawText, sections),
    certifications: detectCertifications(sections),
    projects: (sections.projects || '').split(/\r?\n\s*\r?\n/).map(p => p.trim()).filter(Boolean).slice(0, 8),
    sections: {
      experience: sections.experience || '',
      projects: sections.projects || '',
      education: sections.education || '',
      skills: sections.skills || '',
      certifications: sections.certifications || '',
    },
    resume_summary: (sections.summary || rawText.slice(0, 800)).slice(0, 1200),
  };
}

/** Optional Gemini enrichment — only ADDS parsed facts; never used for scoring. */
async function parseResumeWithGemini(resumeText) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const prompt = `You are an expert HR ATS parser. Extract structured information from the resume text below.
Return ONLY a valid raw JSON object (no markdown fences):
{
  "candidate_name": "string or null",
  "email": "string or null",
  "phone": "string or null",
  "skills": ["skill1", "skill2"],
  "years_of_experience": 2.5,
  "education_levels": ["B.Tech", "MCA"],
  "job_titles": ["Software Engineer"],
  "certifications": ["AWS Certified Developer"],
  "projects": ["Project 1 summary"],
  "resume_summary": "Concise summary of experience and domain expertise"
}
Only report information explicitly present in the resume. Do NOT guess or invent.

Resume Text:
${resumeText.slice(0, 15000)}`;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
    const result = await model.generateContent(prompt);
    let content = (await result.response).text().trim();
    content = content.replace(/^```(?:json)?/, '').replace(/```$/, '').trim();
    return JSON.parse(content);
  } catch (err) {
    console.warn('[ATS] Gemini parse unavailable, using deterministic parser only:', err.message);
    return null;
  }
}

/** Merge Gemini parse into the deterministic parse (union facts, keep determinism of scoring). */
function mergeParsed(det, ai) {
  if (!ai) return det;
  const merged = { ...det };
  merged.candidate_name = ai.candidate_name || det.candidate_name;
  merged.email = det.email || ai.email;
  merged.phone = det.phone || ai.phone;
  const aiSkills = Array.isArray(ai.skills) ? ai.skills.map(canonicalizeSkill).filter(Boolean) : [];
  merged.skills = [...new Set([...det.skills, ...aiSkills])];
  const aiYears = parseFloat(ai.years_of_experience);
  if (Number.isFinite(aiYears) && aiYears > 0 && aiYears <= 45) {
    if (merged.years_of_experience === null || aiYears > merged.years_of_experience) {
      merged.years_of_experience = aiYears;
      merged.experience_source = (det.experience_source === 'none' ? 'ai-parsed' : det.experience_source + ' + ai');
    }
  }
  if (Array.isArray(ai.education_levels) && ai.education_levels.length) {
    merged.education_levels = [...new Set([...det.education_levels, ...ai.education_levels])];
    const aiDegrees = detectDegrees(ai.education_levels.join(' '));
    if (aiDegrees.length) merged.degree_level = Math.max(merged.degree_level, ...aiDegrees.map(d => d.level));
  }
  if (Array.isArray(ai.job_titles)) merged.job_titles = [...new Set([...det.job_titles, ...ai.job_titles])].slice(0, 10);
  if (Array.isArray(ai.certifications)) merged.certifications = [...new Set([...det.certifications, ...ai.certifications])].slice(0, 12);
  if (Array.isArray(ai.projects) && ai.projects.length) merged.projects = [...new Set([...det.projects, ...ai.projects])].slice(0, 10);
  if (ai.resume_summary) merged.resume_summary = String(ai.resume_summary).slice(0, 1200);
  return merged;
}

// ── Requirement parsing ──────────────────────────────────────────────────────

const PREFERRED_MARKER = /\(?\s*(preferred|nice\s+to\s+have|good\s+to\s+have|optional|bonus|plus|desirable)\s*\)?/i;

function parseRequirement(requirement) {
  const req = requirement || {};
  const rawSkills = String(req.requiredSkills || '')
    .split(/[,;\n|]/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && s.length <= 60);

  const required = [];
  const preferred = [];
  for (const item of rawSkills) {
    if (PREFERRED_MARKER.test(item)) {
      preferred.push(canonicalizeSkill(item.replace(PREFERRED_MARKER, '').replace(/[()]/g, '').trim()));
    } else {
      required.push(canonicalizeSkill(item));
    }
  }

  // Also pull a "Preferred / Nice to have" block out of the JD
  const jd = String(req.jobDescription || '');
  const prefBlock = jd.match(/(?:preferred|nice\s+to\s+have|good\s+to\s+have|bonus)[^\n]*:?\s*\n?((?:[^\n]*\n?){1,4})/i);
  if (prefBlock) {
    for (const canon of detectSkillsInText(prefBlock[1])) {
      if (!required.includes(canon) && !preferred.includes(canon)) preferred.push(canon);
    }
  }

  const expMatch = String(req.experience || '').match(/(\d{1,2}(?:\.\d)?)/);
  const requiredYears = expMatch ? parseFloat(expMatch[1]) : 0;

  return {
    requiredSkills: [...new Set(required)].filter(Boolean),
    preferredSkills: [...new Set(preferred)].filter(Boolean),
    requiredYears,
    experienceLabel: req.experience || '',
    qualification: String(req.qualification || '').trim(),
    jobTitle: String(req.jobTitle || '').trim(),
    jobDescription: jd,
    responsibilities: String(req.responsibilities || ''),
    location: String(req.location || ''),
    employmentType: String(req.employmentType || ''),
  };
}

// ── Matching helpers ─────────────────────────────────────────────────────────

/**
 * Where/how does the resume satisfy a required skill?
 * direct: skill/alias found with word boundaries in the resume text
 * implied: a detected resume skill semantically implies it (e.g. DRF ⇒ REST API)
 */
function matchSkill(reqSkill, resumeLower, parsedSkills) {
  const canon = canonicalizeSkill(reqSkill);
  for (const variant of skillVariants(canon)) {
    if (termInText(variant, resumeLower)) {
      return { matched: true, matchType: variant === canon ? 'direct' : 'alias', via: variant };
    }
  }
  for (const have of parsedSkills) {
    const implied = IMPLIES[canonicalizeSkill(have)] || [];
    if (implied.includes(canon)) {
      return { matched: true, matchType: 'implied', via: have };
    }
  }
  // multi-word requirement: accept if all significant words appear ("REST API Development")
  const words = canon.split(/\s+/).filter(w => w.length > 2 && !['and', 'the', 'with', 'development'].includes(w));
  if (words.length >= 2 && words.every(w => termInText(w, resumeLower))) {
    return { matched: true, matchType: 'partial-words', via: words.join(' + ') };
  }
  return { matched: false, matchType: null, via: null };
}

const STOPWORDS = new Set(['the', 'and', 'for', 'with', 'you', 'will', 'our', 'are', 'have', 'this', 'that', 'from', 'work', 'team', 'role', 'job', 'who', 'has', 'can', 'all', 'their', 'your', 'must', 'should', 'able', 'strong', 'good', 'skills', 'skill', 'experience', 'years', 'year', 'knowledge', 'ability', 'candidate', 'looking', 'required', 'requirements', 'responsibilities', 'including', 'well', 'plus', 'other', 'more', 'than', 'least', 'about', 'into', 'such', 'als', 'etc', 'per', 'within', 'across', 'using', 'used', 'use', 'also', 'preferred', 'develop', 'developing', 'development', 'developer', 'working', 'understanding', 'familiarity', 'proficiency', 'proficient', 'hands', 'building', 'build', 'design', 'maintain']);

function jdInformativeKeywords(jdText, excludeCanon) {
  const excludeWords = new Set();
  for (const c of excludeCanon) c.split(/\s+/).forEach(w => excludeWords.add(w));
  const freq = {};
  for (const w of (jdText.toLowerCase().match(/[a-z][a-z0-9+#.]{3,24}/g) || [])) {
    if (STOPWORDS.has(w) || excludeWords.has(w)) continue;
    freq[w] = (freq[w] || 0) + 1;
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 12)
    .map(([w]) => w);
}

const SENIORITY_WORDS = new Set(['senior', 'junior', 'sr', 'jr', 'lead', 'principal', 'staff', 'chief', 'head', 'i', 'ii', 'iii']);

function titleSimilarity(reqTitle, candTitles) {
  const reqTokens = reqTitle.toLowerCase().match(/[a-z+#.]{2,}/g) || [];
  const core = reqTokens.filter(t => !SENIORITY_WORDS.has(t));
  if (!core.length) return { fraction: 0, matchedTitles: [] };
  let bestFraction = 0;
  const matchedTitles = [];
  for (const title of candTitles) {
    const tl = title.toLowerCase();
    const hits = core.filter(t => termInText(t, tl)).length;
    const fraction = hits / core.length;
    if (fraction > 0) matchedTitles.push(title);
    if (fraction > bestFraction) bestFraction = fraction;
  }
  return { fraction: bestFraction, matchedTitles: matchedTitles.slice(0, 4) };
}

// ── Scoring ──────────────────────────────────────────────────────────────────

const WEIGHTS = { skills: 40, experience: 25, role: 15, education: 10, preferred: 5, other: 5 };

/**
 * Deterministic weighted scoring of a parsed resume against a parsed requirement.
 * Components a requirement doesn't define are excluded and the remaining
 * weights re-scaled to 100 (breakdown records both raw and scaled numbers).
 */
function scoreCandidate(parsed, requirement, rawText) {
  const spec = parseRequirement(requirement);
  const resumeLower = (rawText || '').toLowerCase();
  const components = [];
  const warnings = [];

  // 1. Skills — 40
  const requiredResults = spec.requiredSkills.map(skill => ({ skill, ...matchSkill(skill, resumeLower, parsed.skills) }));
  const matchedReq = requiredResults.filter(r => r.matched);
  let skillsComp;
  if (spec.requiredSkills.length) {
    const score = Math.round(WEIGHTS.skills * matchedReq.length / spec.requiredSkills.length);
    skillsComp = { key: 'skills', label: 'Skills Match', score, max: WEIGHTS.skills, na: false, detail: `${matchedReq.length} of ${spec.requiredSkills.length} required skills identified in resume` };
  } else {
    skillsComp = { key: 'skills', label: 'Skills Match', score: 0, max: WEIGHTS.skills, na: true, detail: 'No required skills defined on this requirement' };
  }
  components.push(skillsComp);

  // Role-relevance factor used to weight raw years into RELEVANT experience:
  // 3 years of marketing is not 3 years of Python. Derived from how much of
  // the required skill set and the job title the resume actually reflects.
  const { fraction: titleFraction, matchedTitles } = titleSimilarity(spec.jobTitle, parsed.job_titles);
  const skillFraction = spec.requiredSkills.length ? matchedReq.length / spec.requiredSkills.length : null;
  const relevanceFactor = skillFraction === null
    ? 1 // no skills defined on the job — cannot judge relevance, count years as-is
    : Math.min(1, 0.25 + 0.75 * Math.max(skillFraction, titleFraction));

  // 2. Experience — 25 (years found in resume × role relevance)
  const candYears = parsed.years_of_experience;
  let expComp;
  if (spec.requiredYears > 0) {
    let score = 0;
    let detail;
    const reqLabel = spec.experienceLabel || `${spec.requiredYears}+ years`;
    if (candYears === null) {
      warnings.push('Relevant experience could not be identified in the resume.');
      detail = `Required: ${reqLabel} — experience not identified in resume`;
    } else {
      score = Math.round(WEIGHTS.experience * Math.min(1, candYears / spec.requiredYears) * relevanceFactor);
      detail = `Required: ${reqLabel} · Resume analysis: ~${candYears} year(s) (${parsed.experience_source})`;
      if (relevanceFactor < 0.6) {
        detail += ' · scaled down: experience appears to be in an unrelated domain';
        warnings.push(`Resume shows ~${candYears} year(s) of experience, but its relevance to this role could not be established.`);
      } else if (candYears < spec.requiredYears) {
        warnings.push(`Resume shows ~${candYears} year(s) experience; requirement asks for ${reqLabel}.`);
      }
    }
    expComp = { key: 'experience', label: 'Relevant Experience', score, max: WEIGHTS.experience, na: false, detail };
  } else {
    expComp = { key: 'experience', label: 'Relevant Experience', score: 0, max: WEIGHTS.experience, na: true, detail: 'No experience requirement defined' };
  }
  components.push(expComp);

  // 3. Role / project relevance — 15
  const contextText = ((parsed.sections?.experience || '') + '\n' + (parsed.sections?.projects || '')).toLowerCase();
  let contextFraction = 0;
  let contextNote = '';
  if (matchedReq.length && contextText.trim().length > 40) {
    const inContext = matchedReq.filter(r => {
      const probe = r.matchType === 'implied' ? r.via : r.skill;
      return skillVariants(probe).some(v => termInText(v, contextText));
    }).length;
    contextFraction = inContext / matchedReq.length;
    contextNote = `${inContext}/${matchedReq.length} matched skills used in work/project context`;
  } else if (matchedReq.length) {
    contextFraction = 0.5;
    contextNote = 'Resume sections not clearly separated; partial credit for matched skills';
  } else {
    contextNote = 'No matched skills to evaluate in context';
  }
  const roleScore = Math.round(7 * titleFraction + 8 * contextFraction);
  components.push({
    key: 'role', label: 'Role & Project Relevance', score: Math.min(roleScore, WEIGHTS.role), max: WEIGHTS.role, na: false,
    detail: `Title similarity ${(titleFraction * 100).toFixed(0)}%${matchedTitles.length ? ` (${matchedTitles[0]})` : ''} · ${contextNote}`
  });

  // 4. Education — 10
  let eduComp;
  if (spec.qualification) {
    const reqDegrees = detectDegrees(spec.qualification);
    const anyGrad = /any\s+(graduate|degree)|graduate/i.test(spec.qualification);
    const reqLevel = reqDegrees.length ? Math.min(...reqDegrees.map(d => d.level)) : (anyGrad ? 3 : 3);
    let score, note;
    if (parsed.degree_level === 0 && !parsed.education_levels.length) {
      score = 0; note = 'Education not identified in resume';
      warnings.push('Education/qualification could not be identified in the resume.');
    } else if (parsed.degree_level >= reqLevel) {
      score = WEIGHTS.education; note = `Meets required level (${parsed.education_levels.slice(0, 2).join(', ') || 'degree detected'})`;
    } else if (parsed.degree_level === reqLevel - 1) {
      score = 5; note = 'One level below required qualification';
    } else {
      score = 3; note = 'Below required qualification level';
    }
    eduComp = { key: 'education', label: 'Education', score, max: WEIGHTS.education, na: false, detail: `Required: ${spec.qualification} · ${note}` };
  } else {
    eduComp = { key: 'education', label: 'Education', score: 0, max: WEIGHTS.education, na: true, detail: 'No qualification requirement defined' };
  }
  components.push(eduComp);

  // 5. Preferred skills — 5
  const preferredResults = spec.preferredSkills.map(skill => ({ skill, ...matchSkill(skill, resumeLower, parsed.skills) }));
  let prefComp;
  if (spec.preferredSkills.length) {
    const matchedPref = preferredResults.filter(r => r.matched);
    prefComp = {
      key: 'preferred', label: 'Preferred Requirements', score: Math.round(WEIGHTS.preferred * matchedPref.length / spec.preferredSkills.length),
      max: WEIGHTS.preferred, na: false,
      detail: `${matchedPref.length} of ${spec.preferredSkills.length} preferred skills identified`
    };
  } else {
    prefComp = { key: 'preferred', label: 'Preferred Requirements', score: 0, max: WEIGHTS.preferred, na: true, detail: 'No preferred skills defined' };
  }
  components.push(prefComp);

  // 6. Other job requirements — 5 (JD keyword coverage)
  let otherComp;
  const jdCorpus = (spec.jobDescription + '\n' + spec.responsibilities).trim();
  let jdKeywords = [];
  if (jdCorpus.length > 40) {
    const kws = jdInformativeKeywords(jdCorpus, [...spec.requiredSkills, ...spec.preferredSkills]);
    jdKeywords = kws.map(w => ({ word: w, found: termInText(w, resumeLower) }));
    const found = jdKeywords.filter(k => k.found).length;
    otherComp = {
      key: 'other', label: 'Other Job Requirements', score: kws.length ? Math.round(WEIGHTS.other * found / kws.length) : 0,
      max: WEIGHTS.other, na: !kws.length,
      detail: kws.length ? `${found} of ${kws.length} job-description keywords covered by resume` : 'Job description too generic to extract keywords'
    };
  } else {
    otherComp = { key: 'other', label: 'Other Job Requirements', score: 0, max: WEIGHTS.other, na: true, detail: 'No job description defined' };
  }
  components.push(otherComp);

  // Total with re-scaling over applicable weights
  const applicable = components.filter(c => !c.na);
  const applicableWeight = applicable.reduce((s, c) => s + c.max, 0);
  const rawScore = applicable.reduce((s, c) => s + c.score, 0);
  const total = applicableWeight > 0 ? Math.max(0, Math.min(100, Math.round(rawScore * 100 / applicableWeight))) : 0;

  // Warnings
  const missingReq = requiredResults.filter(r => !r.matched);
  if (spec.requiredSkills.length && missingReq.length > matchedReq.length) {
    warnings.push('Candidate is missing the majority of required core skills.');
  }

  // Summary — grounded in the actual analysis, nothing invented
  const topMatched = matchedReq.slice(0, 3).map(r => r.skill);
  const topMissing = missingReq.slice(0, 3).map(r => r.skill);
  const missingPref = preferredResults.filter(r => !r.matched).map(r => r.skill);
  let summary;
  if (total >= 75) summary = `Strong match for the ${spec.jobTitle || 'role'}.`;
  else if (total >= 50) summary = `Moderate match for the ${spec.jobTitle || 'role'}.`;
  else summary = `Weak match for the ${spec.jobTitle || 'role'}.`;
  if (topMatched.length) summary += ` Candidate shows ${topMatched.join(', ')} in the resume`;
  if (spec.requiredYears > 0) {
    if (candYears === null) summary += topMatched.length ? ', but relevant experience could not be identified.' : ' Relevant experience could not be identified.';
    else if (relevanceFactor < 0.6) summary += `${topMatched.length ? '.' : ''} The resume shows ~${candYears} year(s) of experience, but it appears to be in a different domain than this role.`;
    else if (candYears >= spec.requiredYears) summary += `${topMatched.length ? ' and' : ''} meets the ${spec.experienceLabel || spec.requiredYears + '+ years'} experience requirement.`;
    else summary += `${topMatched.length ? ', with' : ' Shows'} ~${candYears} year(s) experience against a ${spec.experienceLabel || spec.requiredYears + '+ years'} requirement.`;
  } else if (topMatched.length) summary += '.';
  if (topMissing.length) summary += ` ${topMissing.join(', ')} ${topMissing.length === 1 ? 'was' : 'were'} not identified in the resume.`;
  if (missingPref.length && total >= 50) summary += ` Preferred: ${missingPref.slice(0, 2).join(', ')} not identified.`;

  return {
    status: 'COMPLETED',
    ats_match_score: total,
    skills_score: skillsComp.na ? 0 : skillsComp.score,
    experience_score: expComp.na ? 0 : expComp.score,
    projects_score: components[2].score,             // role/project relevance (15)
    education_score: eduComp.na ? 0 : eduComp.score,
    job_description_score: (prefComp.na ? 0 : prefComp.score) + (otherComp.na ? 0 : otherComp.score),
    matched_skills: matchedReq.map(r => r.skill),
    missing_skills: missingReq.map(r => r.skill),
    warnings,
    ai_summary: summary,
    match_breakdown: {
      engineVersion: 2,
      total,
      applicableWeight,
      rawScore,
      components,
      skills: { required: requiredResults, preferred: preferredResults },
      experience: {
        requiredYears: spec.requiredYears,
        requiredLabel: spec.experienceLabel,
        candidateYears: candYears,
        source: parsed.experience_source,
      },
      education: {
        required: spec.qualification || null,
        detected: parsed.education_levels,
        detectedLevel: parsed.degree_level,
      },
      role: { titleFraction: Math.round(titleFraction * 100) / 100, matchedTitles },
      other: { jdKeywords },
      candidate: {
        detectedSkills: parsed.skills,
        jobTitles: parsed.job_titles,
        certifications: parsed.certifications,
      },
    },
  };
}

// ── Fingerprints (avoid reprocessing unchanged inputs) ───────────────────────

function computeResumeHash(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return crypto.createHash('sha256').update(`${stat.size}:${Math.round(stat.mtimeMs)}`).digest('hex').slice(0, 24);
  } catch (_) {
    return null;
  }
}

function computeRequirementHash(requirement) {
  const req = requirement || {};
  const key = JSON.stringify([req.jobTitle, req.requiredSkills, req.jobDescription, req.responsibilities, req.experience, req.qualification, req.location, req.employmentType]);
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 24);
}

function computeAnalysisHash(resumePath, requirement) {
  const rh = computeResumeHash(resumePath);
  return rh ? `${rh}:${computeRequirementHash(requirement)}` : null;
}

// ── Full pipeline ────────────────────────────────────────────────────────────

function failedResult(message) {
  return {
    status: 'FAILED',
    ats_match_score: 0,
    skills_score: 0, experience_score: 0, education_score: 0, projects_score: 0, job_description_score: 0,
    matched_skills: [], missing_skills: [],
    warnings: [message],
    ai_summary: message,
    match_breakdown: { engineVersion: 2, total: 0, components: [], failed: true, reason: message },
    parsed_data: null,
    analysis_hash: null,
  };
}

/**
 * Full ATS matching pipeline for a candidate resume against a job requirement.
 * opts.cachedParsedResume: previously stored parse — reused (extraction and AI
 * parsing skipped) when its _resumeHash still matches the file on disk.
 */
async function analyzeCandidateMatch(resumePath, requirement, opts = {}) {
  const resumeHash = computeResumeHash(resumePath);
  const analysisHash = resumeHash ? `${resumeHash}:${computeRequirementHash(requirement)}` : null;

  let parsed = null;
  let rawText = '';

  const cached = opts.cachedParsedResume;
  if (cached && cached._resumeHash && cached._resumeHash === resumeHash && cached._rawTextSample) {
    parsed = cached;
    rawText = cached._rawTextSample;
    console.log(`[ATS] Reusing cached resume parse (${resumeHash})`);
  } else {
    rawText = await extractTextFromFile(resumePath);
    const quality = assessTextQuality(rawText);
    if (!quality.readable) {
      console.warn(`[ATS] Unreadable resume text (${quality.chars} chars, letterRatio ${quality.letterRatio})`);
      return failedResult('Could not extract readable text from the uploaded resume. The file may be scanned images, corrupted, or an unsupported format — ATS scoring was not attempted to avoid a misleading percentage.');
    }

    parsed = parseResumeDeterministic(rawText);
    const aiParsed = await parseResumeWithGemini(rawText);
    parsed = mergeParsed(parsed, aiParsed);
    parsed._resumeHash = resumeHash;
    // keep a bounded text sample stored with the parse so requirement-only
    // changes can re-score without re-reading/re-parsing the file
    parsed._rawTextSample = rawText.slice(0, 30000);
  }

  const result = scoreCandidate(parsed, requirement, rawText || parsed._rawTextSample || '');
  result.parsed_data = parsed;
  result.analysis_hash = analysisHash;

  console.log(`[ATS] Score ${result.ats_match_score}% — skills ${result.skills_score}/40, exp ${result.experience_score}/25, role ${result.projects_score}/15, edu ${result.education_score}/10, pref+other ${result.job_description_score}/10`);
  return result;
}

module.exports = {
  extractTextFromFile,
  parseResumeDeterministic,
  parseResumeWithGemini,
  analyzeCandidateMatch,
  computeResumeHash,
  computeRequirementHash,
  computeAnalysisHash,
  scoreCandidate,
};
