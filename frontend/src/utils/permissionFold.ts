import { type ModulePermissions } from '@/pages/Login';

// ===========================================================================
// Enterprise permission model — exactly THREE actions per module:
//   VIEW   — read / search / open / view reports (no editing)
//   EDIT   — edit / save / update / modify (auto-includes View)
//   EXPORT — PDF / Excel / CSV / Print / report export (auto-includes View)
//
// Older stored records (and older route guards) used create/delete/approve/
// import/manage/print. Those are FOLDED, never lost:
//   create / delete / approve / import / manage  → edit
//   print                                        → export
//   read                                         → view
// Folding happens at three layers: this helper (matrix load/save), the
// PermissionContext checks (runtime gating), and the backend rbacMiddleware.
// ===========================================================================

export const PERMISSION_ACTIONS = ['view', 'edit', 'export'] as const;
export type PermissionAction = typeof PERMISSION_ACTIONS[number];

/**
 * Collapse any permission row (legacy 7-action or new 3-action) into the
 * canonical { view, edit, export } shape so old grants are converted to the new
 * model WITHOUT losing access. Used when loading existing records into the
 * matrix and before saving them back.
 */
export const foldPermissions = (p: any = {}): ModulePermissions => {
  const edit = p?.edit === true || p?.create === true || p?.delete === true
    || p?.approve === true || p?.import === true || p?.manage === true;
  const exportable = p?.export === true || p?.print === true;
  // View is implied by any granted action (Edit/Export auto-include View).
  const view = p?.view === true || p?.read === true || edit || exportable;
  return { view, edit, export: exportable };
};

/**
 * Apply the dependency rules to a single row after one action was toggled:
 *   - enabling Edit or Export auto-enables View
 *   - disabling View disables Edit and Export
 * Returns a fresh, clean { view, edit, export } row.
 */
export const applyPermissionDependencies = (
  row: ModulePermissions,
  changed: PermissionAction,
  turnedOn: boolean,
): ModulePermissions => {
  const next: ModulePermissions = { view: !!row.view, edit: !!row.edit, export: !!row.export };
  next[changed] = turnedOn;
  if ((changed === 'edit' || changed === 'export') && turnedOn) next.view = true;
  if (changed === 'view' && !turnedOn) { next.edit = false; next.export = false; }
  return next;
};
