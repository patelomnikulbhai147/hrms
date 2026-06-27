import React, { createContext, useContext, useMemo } from 'react';
import { type AppModules, type UserAccount } from '@/pages/Login';
import { type Company } from '@/types';
import { isCompanyArchived } from '@/utils/companyStatus';

// Role-based defaults for NEWLY ADDED modules that do not yet have per-user
// granular permission rows in the database (Task Manager, Tender Information).
// This is intentionally scoped to ONLY these modules: any module not listed here
// returns `false` from roleDefault(), so every EXISTING module keeps its current
// strict deny-by-default behaviour and no existing isolation is weakened.
// Permission model is consolidated to exactly four actions: VIEW, CREATE, EDIT,
// EXPORT. delete/approve fold into EDIT and print folds into EXPORT (see the
// can* helpers below), so only these four are configured anywhere.
const NEW_MODULE_ROLE_DEFAULTS: Partial<Record<AppModules, Partial<Record<string, string[]>>>> = {
  tasks: {
    view: ['Company Head', 'HR', 'Finance', 'Employee'],
    create: ['Company Head', 'HR', 'Finance'],
    edit: ['Company Head', 'HR', 'Finance'],
    export: ['Company Head', 'HR', 'Finance'],
  },
  // Tender Management = business opportunities. HR may VIEW only — they cannot
  // touch tender value / commercial terms (enforced role-side too).
  tenders: {
    view: ['Company Head', 'HR', 'Finance'],
    create: ['Company Head'],
    edit: ['Company Head'],
    export: ['Company Head', 'HR'],
  },
  // Contract Management = operational execution. HR manages deployment/assignment
  // (so they need view), but commercial create/edit stays with Company Head.
  contracts: {
    view: ['Company Head', 'HR', 'Finance'],
    create: ['Company Head'],
    edit: ['Company Head'],
    export: ['Company Head', 'HR'],
  },
  // Company Profile = master repository of company data. COMPANY HEAD ONLY —
  // HR/Manager/Employee have no access. Super Admin reaches it via masquerade.
  // Mirrors the hard role gate in companyProfileRoutes (backend) and the
  // LEADERSHIP route guard in App.tsx (frontend).
  'company-profile': {
    view: ['Company Head'],
    create: ['Company Head'],
    edit: ['Company Head'],
    export: ['Company Head'],
  },
  // Communication Center = company-internal HR module. Company Head has full
  // access; HR may VIEW by default and can be granted create/edit/export via the
  // permission matrix. Super Admin is intentionally absent — it is NOT a platform
  // feature (blocked in the sidebar, route guard and backend). Employees: none.
  communication: {
    view: ['Company Head', 'HR'],
    create: ['Company Head'],
    edit: ['Company Head'],
    export: ['Company Head', 'HR'],
  },
};
const roleDefault = (module: AppModules, action: string, role: string): boolean =>
  NEW_MODULE_ROLE_DEFAULTS[module]?.[action]?.includes(role) ?? false;

interface PermissionContextType {
  canView: (module: AppModules) => boolean;
  canEdit: (module: AppModules) => boolean;
  canCreate: (module: AppModules) => boolean;
  canDelete: (module: AppModules) => boolean;
  canExport: (module: AppModules) => boolean;
  canApprove: (module: AppModules) => boolean;
  canPrint: (module: AppModules) => boolean;
  canImport: (module: AppModules) => boolean;
  hasBranchAccess: (companyId: string) => boolean;
  getInheritedBranches: (companyId: string) => string[];
  /** True when the active company is archived and the user is not a Super Admin. */
  companyReadOnly: boolean;
}

const PermissionContext = createContext<PermissionContextType>({
  canView: () => true,
  canEdit: () => false,
  canCreate: () => false,
  canDelete: () => false,
  canExport: () => false,
  canApprove: () => false,
  canPrint: () => false,
  canImport: () => false,
  hasBranchAccess: () => false,
  getInheritedBranches: () => [],
  companyReadOnly: false,
});

export const usePermissions = () => useContext(PermissionContext);

interface PermissionProviderProps {
  children: React.ReactNode;
  authProfile: UserAccount | null;
  role: string;
  companies: Company[];
  activeCompanyId?: string;
}

export const checkCanView = (module: AppModules, authProfile: UserAccount | null, role: string): boolean => {
  if (role === 'Super Admin') return true;
  if (!authProfile) return false;

  // Dashboard is the landing page and only ever renders the user's OWN scoped
  // workspace summary (no cross-tenant data), so it is viewable by any
  // authenticated user.
  if (module === 'dashboard') {
    return true;
  }

  // Then check granular action permissions if they exist.
  // A user can view a module if they have explicit view, OR if they have any other action permission (like edit, create, delete...)
  if (authProfile.permissions && authProfile.permissions[module] !== undefined) {
    const row = authProfile.permissions[module];
    return (
      row.view === true ||
      row.create === true ||
      row.edit === true ||
      row.delete === true ||
      row.approve === true ||
      row.import === true ||
      row.export === true
    );
  }

  // Default fallback: deny-by-default for existing modules; role-default for the
  // newly added modules (Task Manager / Tender Information) only.
  return roleDefault(module, 'view', role);
};


export const checkCanEdit = (module: AppModules, authProfile: UserAccount | null, role: string): boolean => {
  if (role === 'Super Admin') return true;
  if (!authProfile) return false;

  // If they can't even view, they can't edit
  if (!checkCanView(module, authProfile, role)) return false;

  // Check granular action permissions. EDIT is the single "write" action: legacy
  // create / delete / approve / import / manage grants all FOLD into it so older
  // records keep working without a data migration.
  if (authProfile.permissions && authProfile.permissions[module] !== undefined) {
    const row = authProfile.permissions[module] as any;
    return row.edit === true || row.create === true || row.delete === true
      || row.approve === true || row.import === true || row.manage === true;
  }

  // Fallback defaults if permissions matrix is completely missing
  return roleDefault(module, 'edit', role);
};

export const checkCanExport = (module: AppModules, authProfile: UserAccount | null, role: string): boolean => {
  if (role === 'Super Admin') return true;
  if (!authProfile) return false;
  if (!checkCanView(module, authProfile, role)) return false;
  if (authProfile.permissions && authProfile.permissions[module] !== undefined) {
    const row = authProfile.permissions[module] as any;
    return row.export === true || row.print === true; // print folds into export
  }
  return roleDefault(module, 'export', role);
};

// ── Legacy action helpers — all fold into the 3-action model ────────────────
// create / delete / approve / import → EDIT, print → EXPORT. Kept so existing
// call sites (canCreate/canDelete/canApprove/canImport/canPrint) keep working.
export const checkCanCreate = checkCanEdit;
export const checkCanDelete = checkCanEdit;
export const checkCanApprove = checkCanEdit;
export const checkCanImport = checkCanEdit;
export const checkCanPrint = checkCanExport;

export const PermissionProvider: React.FC<PermissionProviderProps> = ({
  children,
  authProfile,
  role,
  companies,
  activeCompanyId,
}) => {
  const value = useMemo(() => {
    const isSuperAdmin = role === 'Super Admin';

    // ── Archived-company global read-only lock ───────────────────────────────
    // When the active company is archived, every WRITE permission is denied for
    // company users (view / export / print stay allowed so historical data
    // remains accessible). Super Admin is exempt — they manage/reactivate it.
    const activeCompany = companies.find(c => String(c.id) === String(activeCompanyId));
    const companyReadOnly = !isSuperAdmin && isCompanyArchived(activeCompany as any);

    // Ids may be number or string (branch ids are numeric, legacy company ids
    // like "c-gcri" are strings); compare as strings throughout to avoid
    // number-vs-string mismatches that would silently deny valid access.
    const eq = (a: any, b: any) => String(a) === String(b);

    const getInheritedBranches = (companyId: string): string[] => {
      const parentCompany = companies.find(c => eq(c.id, companyId));
      if (!parentCompany) return [];

      if (String(companyId) === 'c-gcri' || parentCompany.isHeadOffice || !parentCompany.parentCompanyId) {
        return companies
          .filter(c => eq(c.parentCompanyId, companyId))
          .map(c => String(c.id));
      }
      return [];
    };

    const hasBranchAccess = (companyId: string): boolean => {
      if (isSuperAdmin) return true;
      if (!authProfile) return false;

      if (eq(authProfile.companyId, companyId)) return true;

      const accessibleIds = (authProfile.accessibleCompanyIds || [authProfile.companyId]).map(String);
      if (accessibleIds.includes(String(companyId))) return true;

      for (const accId of accessibleIds) {
        if (!accId) continue;
        const inherited = getInheritedBranches(accId);
        if (inherited.map(String).includes(String(companyId))) return true;
      }

      return false;
    };

    // View / export / print remain available on an archived company (history is
    // always readable). All write actions are blocked while companyReadOnly.
    const canView = (module: AppModules): boolean => checkCanView(module, authProfile, role);
    const canEdit = (module: AppModules): boolean => !companyReadOnly && checkCanEdit(module, authProfile, role);
    const canCreate = (module: AppModules): boolean => !companyReadOnly && checkCanCreate(module, authProfile, role);
    const canDelete = (module: AppModules): boolean => !companyReadOnly && checkCanDelete(module, authProfile, role);
    const canExport = (module: AppModules): boolean => checkCanExport(module, authProfile, role);
    const canApprove = (module: AppModules): boolean => !companyReadOnly && checkCanApprove(module, authProfile, role);
    const canPrint = (module: AppModules): boolean => checkCanPrint(module, authProfile, role);
    const canImport = (module: AppModules): boolean => !companyReadOnly && checkCanImport(module, authProfile, role);

    return {
      canView,
      canEdit,
      canCreate,
      canDelete,
      canExport,
      canApprove,
      canPrint,
      canImport,
      hasBranchAccess,
      getInheritedBranches,
      companyReadOnly,
    };
  }, [authProfile, role, companies, activeCompanyId]);

  return (
    <PermissionContext.Provider value={value}>
      {children}
    </PermissionContext.Provider>
  );
};
