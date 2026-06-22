// ── Shared document-management config ────────────────────────────────────────
// Used by the Documents page, the bulk-upload modal and the employee document
// workspace so the required checklist, categories, validation and base64 reader
// stay in ONE place.

// Required document checklist (Standard 8) — drives Total Required / Uploaded /
// Missing and the auto compliance status. `type` is free-text, so each slot
// matches by keyword against the document's type or name (case-insensitive).
export const REQUIRED_DOCS = [
  { key: 'aadhaar',    label: 'Aadhaar',                category: 'Identity',   match: ['aadhaar', 'adhaar'] },
  { key: 'pan',        label: 'PAN',                    category: 'Identity',   match: ['pan'] },
  { key: 'resume',     label: 'Resume',                 category: 'Employment', match: ['resume', 'cv', 'curriculum', 'biodata'] },
  { key: 'offer',      label: 'Offer Letter',           category: 'Employment', match: ['offer'] },
  { key: 'joining',    label: 'Joining Letter',         category: 'Employment', match: ['joining', 'appointment'] },
  { key: 'bank',       label: 'Bank Passbook',          category: 'Financial',  match: ['passbook', 'bank', 'cheque'] },
  { key: 'degree',     label: 'Degree Certificate',     category: 'Education',  match: ['degree', 'education', 'marksheet', 'qualification', 'diploma'] },
  { key: 'experience', label: 'Experience Certificate', category: 'Education',  match: ['experience', 'relieving', 'service'] },
];
export const TOTAL_REQUIRED = REQUIRED_DOCS.length;

// Workspace category grouping (Issue 4).
export const DOC_CATEGORY_ORDER = ['Identity', 'Employment', 'Education', 'Financial', 'Compliance', 'Other'] as const;
export type DocCategory = typeof DOC_CATEGORY_ORDER[number];

// Keyword → category, for arbitrary (non-required) document types.
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  Identity: ['aadhaar', 'adhaar', 'pan', 'passport', 'voter', 'driving', 'licen', 'photo'],
  Employment: ['offer', 'joining', 'appointment', 'resume', 'cv', 'relieving', 'contract', 'agreement'],
  Education: ['degree', 'education', 'marksheet', 'qualification', 'diploma', 'certificate'],
  Financial: ['bank', 'passbook', 'cheque', 'salary', 'pf', 'esic', 'esi'],
  Compliance: ['medical', 'police', 'verification', 'compliance', 'undertaking', 'declaration'],
};

export const categoryOf = (doc: { type?: string; name?: string }): DocCategory => {
  const hay = `${doc.type || ''} ${doc.name || ''}`.toLowerCase();
  for (const cat of DOC_CATEGORY_ORDER) {
    if (CATEGORY_KEYWORDS[cat]?.some(k => hay.includes(k))) return cat;
  }
  return 'Other';
};

// Which required slot (if any) a document satisfies.
export const matchRequiredKey = (doc: { type?: string; name?: string }): string | null => {
  const hay = `${doc.type || ''} ${doc.name || ''}`.toLowerCase();
  const found = REQUIRED_DOCS.find(r => r.match.some(m => hay.includes(m)));
  return found ? found.key : null;
};

// Best-guess document type for an uploaded file, from its name.
export const guessTypeFromName = (fileName: string): string => {
  const slot = REQUIRED_DOCS.find(r => r.match.some(m => fileName.toLowerCase().includes(m)));
  return slot ? slot.label : 'Custom Document';
};

export type ComplianceStatus = 'Verified' | 'Partially Verified' | 'Pending' | 'Action Required';
export const complianceBadgeVariant = (s: ComplianceStatus) =>
  s === 'Verified' ? 'green' : s === 'Action Required' ? 'red' : s === 'Partially Verified' ? 'indigo' : 'amber';

// ── File upload rules (base64-in-DB, so keep sizes reasonable) ──
export const ALLOWED_DOC_EXT = ['jpg', 'jpeg', 'png', 'pdf', 'doc', 'docx'];
export const DOC_ACCEPT = '.jpg,.jpeg,.png,.pdf,.doc,.docx';
export const MAX_DOC_BYTES = 5 * 1024 * 1024; // 5 MB

export const formatBytes = (b: number): string => {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
};

export type UploadedFile = { dataUrl: string; mimeType: string; size: string; fileName: string };

// Read a File into a base64 data-URL, validating type and size.
export const readFileAsBase64 = (file: File): Promise<UploadedFile> => new Promise((resolve, reject) => {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!ALLOWED_DOC_EXT.includes(ext)) {
    reject(new Error(`Unsupported file type ".${ext}". Allowed: JPG, JPEG, PNG, PDF, DOC, DOCX.`));
    return;
  }
  if (file.size > MAX_DOC_BYTES) {
    reject(new Error(`File is too large (${formatBytes(file.size)}). Maximum is ${formatBytes(MAX_DOC_BYTES)}.`));
    return;
  }
  const reader = new FileReader();
  reader.onload = () => resolve({
    dataUrl: String(reader.result),
    mimeType: file.type || `application/${ext}`,
    size: formatBytes(file.size),
    fileName: file.name,
  });
  reader.onerror = () => reject(new Error('Could not read the selected file.'));
  reader.readAsDataURL(file);
});
