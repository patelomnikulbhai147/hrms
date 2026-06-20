import React, { createContext, useContext, useMemo } from 'react';
import { type AppModules, type UserAccount } from '../pages/Login';
import { type Company } from '../types';
import { isCompanyArchived } from '../utils/companyStatus';

// Role-based defaults for NEWLY ADDED modules that do not yet have per-user
// granular permission rows in the database (Task Manager, Tender Information).
// This is intentionally scoped to ONLY these modules: any module not listed here
// returns `false` from roleDefault(), so every EXISTING module keeps its current
// strict deny-by-default behaviour and no existing isolation is weakened.
const NEW_MODULE_ROLE_DEFAULTS: Partial<Record<AppModules, Partial<Record<string, string[]>>>> = {
  tasks: {
    view: ['Company Head', 'HR', 'Finance', 'Employee'],
    edit: ['Company Head', 'HR', 'Finance'],
    create: ['Company Head', 'HR', 'Finance'],
    delete: ['Company Head', 'HR'],
    export: ['Company Head', 'HR', 'Finance'],
    approve: ['Company Head', 'HR'],
    print: ['Company Head', 'HR', 'Finance'],
  },
  tenders: {
    view: ['Company Head', 'HR', 'Finance'],
    edit: ['Company Head', 'HR'],
    create: ['Company Head', 'HR'],
    delete: ['Company Head'],
    export: ['Company Head', 'HR'],
    approve: ['Company Head'],
    print: ['Company Head', 'HR'],
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

  // NOTE: the legacy "Access" (moduleAccess) kill-switch has been removed.
  // Visibility is driven purely by the granular `view` permission below.

  // Dashboard is the landing page and only ever renders the user's OWN scoped
  // workspace summary (no cross-tenant data), so it is viewable by any
  // authenticated user unless explicitly disabled by the kill-switch above.
  // This removes the false "Access Denied – dashboard" that hit users who were
  // enabled at the module level but never had a granular `view` row written,
  // and keeps the sidebar menu and the route guard (both call this function) in
  // lock-step. Other modules keep their stricter behaviour below.
  if (module === 'dashboard') {
    return true;
  }

  // Then check granular action permissions if they exist
  if (authProfile.permissions && authProfile.permissions[module] !== undefined) {
    return authProfile.permissions[module].view === true;
  }

  // Default fallback: deny-by-default for existing modules; role-default for the
  // newly added modules (Task Manager / Tender Information) only.
  return roleDefault(module, 'view', role);
};


export const checkCanCreate = (module: AppModules, authProfile: UserAccount | null, role: string): boolean => {
  if (role === 'Super Admin') return true;
  if (!authProfile) return false;
  if (!checkCanEdit(module, authProfile, role)) return false;
  if (authProfile.permissions && authProfile.permissions[module] !== undefined) {
    return authProfile.permissions[module].create === true;
  }
  return roleDefault(module, 'create', role);
};

export const checkCanDelete = (module: AppModules, authProfile: UserAccount | null, role: string): boolean => {
  if (role === 'Super Admin') return true;
  if (!authProfile) return false;
  if (!checkCanEdit(module, authProfile, role)) return false;
  if (authProfile.permissions && authProfile.permissions[module] !== undefined) {
    return authProfile.permissions[module].delete === true;
  }
  return roleDefault(module, 'delete', role);
};

export const checkCanEdit = (module: AppModules, authProfile: UserAccount | null, role: string): boolean => {
  if (role === 'Super Admin') return true;
  if (!authProfile) return false;

  // If they can't even view, they can't edit
  if (!checkCanView(module, authProfile, role)) return false;

  // Check granular action permissions
  if (authProfile.permissions && authProfile.permissions[module] !== undefined) {
    return authProfile.permissions[module].edit === true;
  }

  // Fallback defaults if permissions matrix is completely missing
  return roleDefault(module, 'edit', role);
};

export const checkCanExport = (module: AppModules, authProfile: UserAccount | null, role: string): boolean => {
  if (role === 'Super Admin') return true;
  if (!authProfile) return false;
  if (!checkCanView(module, authProfile, role)) return false;
  if (authProfile.permissions && authProfile.permissions[module] !== undefined) {
    return authProfile.permissions[module].export === true;
  }
  return roleDefault(module, 'export', role);
};

export const checkCanApprove = (module: AppModules, authProfile: UserAccount | null, role: string): boolean => {
  if (role === 'Super Admin') return true;
  if (!authProfile) return false;
  if (!checkCanView(module, authProfile, role)) return false;
  if (authProfile.permissions && authProfile.permissions[module] !== undefined) {
    return authProfile.permissions[module].approve === true;
  }
  return roleDefault(module, 'approve', role);
};

export const checkCanPrint = (module: AppModules, authProfile: UserAccount | null, role: string): boolean => {
  if (role === 'Super Admin') return true;
  if (!authProfile) return false;
  if (!checkCanView(module, authProfile, role)) return false;
  if (authProfile.permissions && authProfile.permissions[module] !== undefined) {
    return authProfile.permissions[module].print === true;
  }
  return roleDefault(module, 'print', role);
};

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

    return {
      canView,
      canEdit,
      canCreate,
      canDelete,
      canExport,
      canApprove,
      canPrint,
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
