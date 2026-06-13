// ===========================================================================
// Workspace hierarchy — the CANONICAL Company -> Branch grouping used by every
// workspace switcher (the SelectWorkspace page and the Topbar dropdown).
//
// Business rule: the PARENT level is always a Company; the CHILD level is always
// a Branch. A branch must NEVER become its own top-level group, and a company
// record must NEVER be rendered as a child card. Grouping is keyed by the
// company id (resolved from the branch's parentCompanyId/companyId) — not by
// fuzzy name matching with a fallback to the item's own name (the old bug).
// ===========================================================================

export interface WorkspaceGroup {
  companyId: string;
  companyName: string;
  cards: any[];          // selectable workspaces under this company (its branches)
  isCompanyOnly: boolean; // true when a company has no branches and is itself the card
}

export interface WorkspaceAudit {
  databaseCount: number;   // assigned ids that resolve to a loaded workspace
  permissionCount: number; // distinct ids in the user's permissions
  apiCount: number;        // selectable workspaces returned by the API
  renderedCount: number;   // cards actually rendered
  ok: boolean;
  message: string;
}

// A top-level Company: an explicit head office, or any record with no parent.
export function isCompanyRecord(item: any): boolean {
  if (!item) return false;
  return item.isHeadOffice === true || (!item.parentCompanyId && !item.companyId);
}

// A Branch: anything that is not a top-level company.
export function isBranchRecord(item: any): boolean {
  return !isCompanyRecord(item);
}

/**
 * Build the Company -> Branches hierarchy from a flat list of accessible
 * workspaces (companies and branches merged, as the app stores them).
 */
export function buildWorkspaceHierarchy(items: any[]): WorkspaceGroup[] {
  type Acc = { companyId: string; companyName: string; companyRecord: any | null; branches: any[] };
  const groups = new Map<string, Acc>();

  const ensure = (id: string, name?: string): Acc => {
    if (!groups.has(id)) groups.set(id, { companyId: id, companyName: name || id, companyRecord: null, branches: [] });
    const g = groups.get(id)!;
    // Prefer a real company name over a bare id placeholder.
    if (name && (!g.companyName || g.companyName === g.companyId)) g.companyName = name;
    return g;
  };

  // Pass 1 — seed groups from company (parent) records.
  for (const it of items || []) {
    if (isCompanyRecord(it)) {
      const g = ensure(it.id, it.name);
      g.companyRecord = it;
    }
  }

  // Pass 2 — attach every branch to its parent company.
  for (const it of items || []) {
    if (isCompanyRecord(it)) continue;
    const parentId = it.parentCompanyId || it.companyId || 'unknown-company';
    const parentName =
      it.parentCompanyName && it.parentCompanyName !== 'Unknown Company'
        ? it.parentCompanyName
        : undefined;
    ensure(parentId, parentName).branches.push(it);
  }

  // Build the render groups: branches are the cards; a company with no branches
  // becomes its own single card so access is never lost.
  const result: WorkspaceGroup[] = [];
  for (const g of groups.values()) {
    if (g.branches.length > 0) {
      result.push({ companyId: g.companyId, companyName: g.companyName, cards: g.branches, isCompanyOnly: false });
    } else if (g.companyRecord) {
      result.push({ companyId: g.companyId, companyName: g.companyName, cards: [g.companyRecord], isCompanyOnly: true });
    }
  }

  result.sort((a, b) => a.companyName.localeCompare(b.companyName));
  return result;
}

/**
 * Validate that every accessible workspace the API returned is actually
 * rendered. Returns a structured report; never throws.
 */
export function auditWorkspaceCounts(user: any, items: any[], hierarchy: WorkspaceGroup[]): WorkspaceAudit {
  const directIds = [user?.companyId, ...((user?.accessibleCompanyIds as string[]) || [])].filter(Boolean);
  const permissionCount = new Set(directIds).size;

  const loadedIds = new Set((items || []).map((i) => i.id));
  const databaseCount = Array.from(new Set(directIds)).filter((id) => loadedIds.has(id)).length;

  const apiCount =
    (items || []).filter(isBranchRecord).length + hierarchy.filter((g) => g.isCompanyOnly).length;
  const renderedCount = hierarchy.reduce((n, g) => n + g.cards.length, 0);

  const ok = apiCount === renderedCount;
  const message = ok
    ? 'Workspace counts consistent (every accessible workspace is rendered).'
    : `Workspace count MISMATCH: API returned ${apiCount} selectable workspaces but ${renderedCount} were rendered.`;

  return { databaseCount, permissionCount, apiCount, renderedCount, ok, message };
}

/**
 * Emit the mandated audit logs (Loaded Companies / Branches / Permissions /
 * Rendered Groups + the four counts). Throws when the rendered count does not
 * match the API count so callers can refuse to show a broken hierarchy.
 */
export function logWorkspaceAudit(user: any, items: any[], hierarchy: WorkspaceGroup[]): WorkspaceAudit {
  const companies = (items || []).filter(isCompanyRecord);
  const branches = (items || []).filter(isBranchRecord);
  const audit = auditWorkspaceCounts(user, items, hierarchy);

  console.groupCollapsed?.('%c[Workspace Hierarchy Audit]', 'color:#4F7CFF;font-weight:bold');
  console.log('Loaded Companies:', companies.map((c) => `${c.name} [${c.id}]`));
  console.log('Loaded Branches:', branches.map((b) => `${b.branchName || b.name} [${b.id}] -> parent ${b.parentCompanyId || b.companyId}`));
  console.log('User Permissions:', { companyId: user?.companyId, accessibleCompanyIds: user?.accessibleCompanyIds });
  console.log('Rendered Groups:', hierarchy.map((g) => `${g.companyName} (${g.cards.length}) -> [${g.cards.map((c) => c.branchName || c.name).join(', ')}]`));
  console.log('Database Count :', audit.databaseCount);
  console.log('Permission Count:', audit.permissionCount);
  console.log('API Count      :', audit.apiCount);
  console.log('Rendered Count :', audit.renderedCount);
  console.log(audit.ok ? '✅ ' + audit.message : '❌ ' + audit.message);
  console.groupEnd?.();

  if (!audit.ok) {
    throw new Error(audit.message);
  }
  return audit;
}

// ===========================================================================
// Company -> Branch ACCESS groups — used by the Workspace Access matrix where a
// company header is itself a selectable/tri-state node that owns its branches.
// Unlike buildWorkspaceHierarchy (which collapses a childless company INTO a
// card), this keeps the parent company record AND its branch children separate
// so the header checkbox can drive auto-select / auto-deselect / partial state.
// Grouping is keyed strictly on parentCompanyId — never on name matching — so a
// branch can never land under the wrong company.
// ===========================================================================
export interface CompanyBranchGroup {
  companyId: string;
  companyName: string;
  company: any | null;   // the parent company record (null for an orphan group)
  branches: any[];       // branch records whose parentCompanyId === companyId
}

export function buildCompanyBranchGroups(items: any[]): CompanyBranchGroup[] {
  const list = items || [];
  const isBranch = (it: any) => !!it.parentCompanyId;

  const groups = new Map<string, CompanyBranchGroup>();
  const ensure = (id: string, name: string): CompanyBranchGroup => {
    if (!groups.has(id)) groups.set(id, { companyId: id, companyName: name || id, company: null, branches: [] });
    return groups.get(id)!;
  };

  // Pass 1 — seed a group for every parent company.
  for (const it of list) {
    if (!isBranch(it)) {
      const g = ensure(it.id, it.name);
      g.company = it;
      g.companyName = it.name || g.companyName;
    }
  }

  // Pass 2 — attach each branch to its parent (creating a placeholder header if
  // the parent company itself was not loaded, e.g. a scoped admin who only sees
  // the branch). The branch's parentCompanyName is used for that header label.
  for (const it of list) {
    if (!isBranch(it)) continue;
    const parentId = it.parentCompanyId;
    const g = ensure(parentId, it.parentCompanyName || '');
    if (!g.company && it.parentCompanyName && (g.companyName === parentId || !g.companyName)) {
      g.companyName = it.parentCompanyName;
    }
    g.branches.push(it);
  }

  // Sort branches alphabetically; sort groups alphabetically by company name.
  const result = Array.from(groups.values());
  for (const g of result) {
    g.branches.sort((a, b) =>
      ((a.branchName || a.name || '') as string).localeCompare(b.branchName || b.name || ''));
  }
  result.sort((a, b) => a.companyName.localeCompare(b.companyName));
  return result;
}

export const getCompanyInitials = (name?: string): string => {
  if (!name) return '??';
  const parts = name.split(' ').filter(Boolean);
  if (parts.length === 1) return parts[0].substring(0, 1).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

export function getAccessibleWorkspaceIds(user: any, companies: any[]): string[] {
  if (!user) return [];
  
  if (user.role === 'Super Admin') {
    return companies.map(c => c.id);
  }
  
  const directIds = [user.companyId, ...(user.accessibleCompanyIds || [])].filter(Boolean);
  const idSet = new Set<string>();
  
  // Only add ids if they are in the companies list
  directIds.forEach(id => {
     if (companies.some(c => c.id === id)) {
        idSet.add(id);
     }
  });
  
  directIds.forEach(pid => {
    const parent = companies.find(c => c.id === pid);
    if (parent && (pid === 'c-gcri' || parent.isHeadOffice || !parent.parentCompanyId)) {
      companies.filter(c => c.parentCompanyId === pid).forEach(b => idSet.add(b.id));
    }
  });
  
  return Array.from(idSet);
}

export function isWorkspaceInherited(companyId: string, user: any, companies: any[]): boolean {
  if (!user) return false;
  const directIds = [user.companyId, ...(user.accessibleCompanyIds || [])].filter(Boolean);
  
  // If explicitly assigned, it is not "inherited" in the context of the UI flags
  if (directIds.includes(companyId)) return false;

  for (const pid of directIds) {
    if (!pid) continue;
    const parent = companies.find(c => c.id === pid);
    if (parent && (pid === 'c-gcri' || parent.isHeadOffice || !parent.parentCompanyId)) {
      const child = companies.find(c => c.id === companyId);
      if (child && child.parentCompanyId === pid) return true;
    }
  }
  
  return false;
}
