// ─────────────────────────────────────────────────────────────────────────────
// INVOICE ISSUER IDENTITY — the single resolver for "who is billing".
//
// An invoice is issued by a LEGAL ENTITY (the parent company), never by a branch.
// A branch is only the operating location and must appear as a subtitle:
//
//     PULPIT MANPOWER PRIVATE LIMITED     ← parent company (legal name)
//     Ahmedabad Branch                    ← operating branch (or "Head Office")
//
// WHY THIS EXISTS. App state merges TWO different kinds of "company" into one
// `companies` array (App.tsx): real Company rows, and Branch-table rows mapped to
// `{ ...branch, name: branchName, parentCompanyId: companyId }`. Invoice code used
// to read `.name` straight off whichever entity was active, so billing from a
// branch workspace printed the BRANCH name as the legal company — legally wrong.
//
// Both call sites (InvoiceManagement, ServiceInvoiceEditor) previously carried
// their own copy of a half-correct lookup that only understood Company-row
// branches. That duplication is now one function, and it understands both kinds.
//
// The resolved object is the PARENT company row (so every profile field — GSTIN,
// PAN, CIN, bank, logo — keeps coming from Company Profile exactly as before)
// plus a `branchLabel` the renderers print under the company name. Nothing is
// stored: identity is derived at render time, so no invoice data is rewritten.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { api } from '@/api/apiClient';

export interface IssuerIdentity {
  /** The legal entity to bill under — a real Company row whenever one is found. */
  company: any;
  /** Parent company legal name (never a branch name). */
  legalName: string;
  /** "Head Office" | "<Branch> Branch" — the operating location subtitle. */
  branchLabel: string;
  /** True when the active workspace is a branch rather than the head office. */
  isBranch: boolean;
}

const txt = (v: any) => String(v ?? '').trim();

/**
 * "Ahmedabad" → "Ahmedabad Branch"; "Rajkot Branch" → "Rajkot Branch" (no
 * doubling); anything already naming an office is left exactly as entered.
 */
export function branchLabelFor(name: any): string {
  const n = txt(name);
  if (!n) return '';
  return /\b(branch|office|ho|unit|division|depot)\b/i.test(n) ? n : `${n} Branch`;
}

/**
 * Derive the issuer identity from the active workspace entity and the company
 * rows the API returned. Pure — every async concern lives in useIssuerCompany.
 *
 * `workspace` is whatever App handed down (a Company row OR a mapped Branch row).
 */
export function resolveIssuerIdentity(workspace: any, rows: any[] = []): IssuerIdentity {
  const ws = workspace || {};
  const list = Array.isArray(rows) ? rows : [];
  const byId = (id: any) => (txt(id) ? list.find((r: any) => String(r.id) === String(id)) : undefined);

  // The workspace as the API knows it. A Branch-table id is NOT in this list
  // (GET /companies returns Company rows only), which is exactly the case the
  // old lookup got wrong — it fell through to the branch object itself.
  const self = byId(ws.id);
  const parentId = self?.parentCompanyId ?? ws.parentCompanyId ?? null;

  // A branch is anything with a parent, or anything App explicitly flagged as
  // not the head office. Head-office companies resolve to themselves.
  const isBranch = !!parentId || (self ? !!self.parentCompanyId : ws.isHeadOffice === false);

  const parent = parentId ? byId(parentId) : undefined;
  // Prefer, in order: the parent Company row · the workspace's own row (head
  // office) · the parent name App copied onto branch entries · the raw prop.
  const company = parent || (isBranch ? null : self) || null;

  const legalName =
    txt(company?.name) ||
    txt(company?.companyName) ||
    txt(ws.parentCompanyName) ||       // App.tsx copies this onto mapped branches
    (isBranch ? '' : txt(ws.name)) ||  // head office: its own name IS the legal name
    txt(ws.name);

  const branchName = txt(ws.branchName) || (isBranch ? txt(ws.name) : '');
  const branchLabel = isBranch ? (branchLabelFor(branchName) || 'Branch') : 'Head Office';

  return {
    // Merge order matters: parent fields win, but a branch workspace keeps no
    // identity fields of its own — only the label. When the parent row could not
    // be fetched we still force the legal name so the header is never a branch.
    company: { ...(company || ws), name: legalName || txt(ws.name), branchLabel },
    legalName: legalName || txt(ws.name),
    branchLabel,
    isBranch,
  };
}

/**
 * Live issuer company for the active workspace.
 *
 * Company Profile stays the branding source and is re-read whenever the
 * workspace changes, so a logo / GSTIN / bank edit shows on the very next
 * invoice. The passed-in workspace is only the fallback while the fetch is in
 * flight (or if it fails) — and even then the identity rules above still apply,
 * so a branch never leaks into the company-name slot.
 */
export function useIssuerCompany(workspace: any): any {
  const [identity, setIdentity] = useState<IssuerIdentity>(() => resolveIssuerIdentity(workspace, []));
  const wsKey = String(workspace?.id ?? '');

  useEffect(() => {
    let alive = true;
    setIdentity(resolveIssuerIdentity(workspace, []));   // immediate, prop-only
    (async () => {
      try {
        const rows = await api.companies.getAll();
        if (!alive || !Array.isArray(rows)) return;
        setIdentity(resolveIssuerIdentity(workspace, rows));
      } catch { /* keep the prop-only identity */ }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsKey]);

  return identity.company;
}
