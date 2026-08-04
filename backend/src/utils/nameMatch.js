/**
 * nameMatch.js
 *
 * Compares the name HR entered against the account holder name the bank returned
 * and produces a score (0–100) plus a verdict the UI colours: EXACT_MATCH (green),
 * PARTIAL_MATCH (amber), MISMATCH (red).
 *
 * Used ONLY when the provider does not return its own name-match verdict. When
 * Cashfree returns `name_match_score` / `name_match_result`, that is authoritative
 * and this module is not consulted — the provider's opinion outranks ours.
 *
 * The comparison is deliberately generous about the things Indian bank records
 * differ on and strict about the thing that matters (the actual name tokens):
 *   - case, punctuation, and repeated whitespace are irrelevant
 *   - honorifics (MR/MRS/MS/DR/SHRI/SMT/KUM/M/S) are stripped
 *   - token ORDER is irrelevant: "RAHUL SHARMA" == "SHARMA RAHUL"
 *   - a single-letter token is treated as an initial and matches any token
 *     starting with that letter ("R K SHARMA" vs "RAJESH KUMAR SHARMA")
 */

const HONORIFICS = new Set([
  'MR', 'MRS', 'MS', 'MISS', 'DR', 'PROF', 'SHRI', 'SHRIMATI', 'SMT', 'SRI',
  'KUM', 'KUMARI', 'M/S', 'MS.', 'MESSRS', 'LATE',
]);

/** Uppercase, drop punctuation, collapse whitespace. */
function normalizeName(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalised name → meaningful tokens (honorifics removed). */
function tokenize(value) {
  return normalizeName(value)
    .split(' ')
    .filter((t) => t && !HONORIFICS.has(t));
}

/** Levenshtein distance — used for per-token similarity on typos/transliteration. */
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = curr;
  }
  return prev[b.length];
}

// Below this, two tokens are treated as different names rather than as a typo of
// one another. Without a floor, unrelated surnames of similar length ("SHARMA" vs
// "VERMA") score ~0.5 and drag a genuine mismatch up into partial-match territory.
const TOKEN_MATCH_FLOOR = 0.6;

/** Similarity of two tokens as 0..1, with initials matching by first letter. */
function tokenSimilarity(a, b) {
  if (a === b) return 1;
  // An initial stands in for any token beginning with the same letter, and counts
  // as a full match: "R K SHARMA" is how a bank routinely prints
  // "RAJESH KUMAR SHARMA", and flagging that amber forever would train HR to
  // ignore the warning that matters.
  if (a.length === 1 || b.length === 1) return a[0] === b[0] ? 1 : 0;

  const distance = levenshtein(a, b);
  const longest = Math.max(a.length, b.length);
  const similarity = longest === 0 ? 0 : Math.max(0, 1 - distance / longest);
  return similarity >= TOKEN_MATCH_FLOOR ? similarity : 0;
}

/**
 * Greedy best-pairing between the two token sets. Each entered token is matched
 * to its best unused counterpart, so word order never affects the score.
 *
 * The pairing total is then read in BOTH directions and averaged:
 *   precision = how much of what HR typed appears in the bank name
 *   recall    = how much of the bank name HR accounted for
 *
 * Averaging the two is what makes a contained name ("RAHUL" against the bank's
 * "RAHUL KUMAR SHARMA") land as a partial match rather than a mismatch, while a
 * genuinely different name still fails both directions at once.
 */
function compareTokens(enteredTokens, bankTokens) {
  if (!enteredTokens.length || !bankTokens.length) return 0;

  const used = new Set();
  let total = 0;

  for (const token of enteredTokens) {
    let best = 0;
    let bestIndex = -1;
    bankTokens.forEach((candidate, index) => {
      if (used.has(index)) return;
      const score = tokenSimilarity(token, candidate);
      if (score > best) {
        best = score;
        bestIndex = index;
      }
    });
    if (bestIndex >= 0 && best > 0) used.add(bestIndex);
    total += best;
  }

  const precision = total / enteredTokens.length;
  const recall = total / bankTokens.length;
  return (precision + recall) / 2;
}

/**
 * Compare an entered name with a bank-returned account holder name.
 * @returns {{score: number, result: 'EXACT_MATCH'|'PARTIAL_MATCH'|'MISMATCH'|'NOT_COMPARED', source: 'COMPUTED'}}
 */
function compareNames(enteredName, bankName) {
  const entered = tokenize(enteredName);
  const bank = tokenize(bankName);

  // Nothing to compare against is not a mismatch — saying "MISMATCH" when HR
  // simply left the name blank would flag a clean verification as a problem.
  if (!entered.length || !bank.length) {
    return { score: null, result: 'NOT_COMPARED', source: 'COMPUTED' };
  }

  const ratio = compareTokens(entered, bank);
  const score = Math.round(ratio * 100);

  // 60 is the partial floor because a first name matched against a full bank name
  // scores ~67 — that case must read as "check this", not "wrong person".
  let result = 'MISMATCH';
  if (score >= 95) result = 'EXACT_MATCH';
  else if (score >= 60) result = 'PARTIAL_MATCH';

  return { score, result, source: 'COMPUTED' };
}

/**
 * Fold a provider-supplied verdict into our vocabulary, falling back to a local
 * comparison when the provider says nothing useful.
 *
 * Cashfree returns name_match_result as one of DIRECT_MATCH / GOOD_PARTIAL_MATCH /
 * POOR_PARTIAL_MATCH / NO_MATCH (spellings vary by API version), and
 * name_match_score as a 0–1 fraction or 0–100 number depending on version — both
 * shapes are handled rather than assumed.
 */
function resolveNameMatch({ enteredName, bankName, providerResult, providerScore }) {
  const rawResult = String(providerResult || '').toUpperCase().trim();

  if (rawResult) {
    let result = 'MISMATCH';
    if (rawResult.includes('DIRECT') || rawResult === 'EXACT_MATCH' || rawResult === 'MATCH') {
      result = 'EXACT_MATCH';
    } else if (rawResult.includes('PARTIAL')) {
      result = 'PARTIAL_MATCH';
    } else if (rawResult.includes('NO_MATCH') || rawResult.includes('MISMATCH')) {
      result = 'MISMATCH';
    } else {
      // An unrecognised provider verdict is not silently mapped to a colour —
      // fall back to a comparison we can explain.
      const computed = compareNames(enteredName, bankName);
      return { ...computed, providerRaw: providerResult };
    }

    let score = null;
    const numeric = Number(providerScore);
    if (Number.isFinite(numeric)) {
      score = numeric <= 1 ? Math.round(numeric * 100) : Math.round(numeric);
    } else {
      score = compareNames(enteredName, bankName).score;
    }

    return { score, result, source: 'PROVIDER', providerRaw: providerResult };
  }

  return compareNames(enteredName, bankName);
}

module.exports = { normalizeName, tokenize, compareNames, resolveNameMatch };
