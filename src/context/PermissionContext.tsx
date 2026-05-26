import React, { createContext, useContext, useMemo } from 'react';
import { type AppModules, type UserAccount } from '../pages/Login';
import { type Company } from '../data/mockData';

interface PermissionContextType {
  canView: (module: AppModules) => boolean;
  canEdit: (module: AppModules) => boolean;
  hasBranchAccess: (companyId: string) => boolean;
  getInheritedBranches: (companyId: string) => string[];
}

const PermissionContext = createContext<PermissionContextType>({
  canView: () => true,
  canEdit: () => false,
  hasBranchAccess: () => false,
  getInheritedBranches: () => [],
});

export const usePermissions = () => useContext(PermissionContext);

interface PermissionProviderProps {
  children: React.ReactNode;
  authProfile: UserAccount | null;
  role: string;
  companies: Company[];
}

export const PermissionProvider: React.FC<PermissionProviderProps> = ({
  children,
  authProfile,
  role,
  companies,
}) => {
  const value = useMemo(() => {
    const isSuperAdmin = role === 'Super Admin';

    const getInheritedBranches = (companyId: string): string[] => {
      const parentCompany = companies.find(c => c.id === companyId);
      if (!parentCompany) return [];
      
      // If it's the main GCRI parent or marked as a parent, find its children
      // We assume c-gcri is the global parent for branches in this mock
      if (companyId === 'c-gcri' || parentCompany.isHeadOffice) {
        return companies
          .filter(c => c.parentCompanyId === companyId)
          .map(c => c.id);
      }
      return [];
    };

    const hasBranchAccess = (companyId: string): boolean => {
      if (isSuperAdmin) return true;
      if (!authProfile) return false;

      // Allow access to own company
      if (authProfile.companyId === companyId) return true;

      const accessibleIds = authProfile.accessibleCompanyIds || [authProfile.companyId];
      if (accessibleIds.includes(companyId)) return true;

      // Check inheritance: If user has access to a parent company, they get access to its branches
      for (const accId of accessibleIds) {
        if (!accId) continue;
        const inherited = getInheritedBranches(accId);
        if (inherited.includes(companyId)) return true;
      }

      return false;
    };

    const canView = (module: AppModules): boolean => {
      if (isSuperAdmin) return true;
      if (!authProfile) return false;

      // If moduleAccess is explicitly defined and set to false, they cannot view
      if (authProfile.moduleAccess && authProfile.moduleAccess[module] === false) {
        return false;
      }
      return true;
    };

    const canEdit = (module: AppModules): boolean => {
      if (isSuperAdmin) return true;
      if (!authProfile) return false;

      // If they can't even view, they can't edit
      if (!canView(module)) return false;

      // Check granular action permissions
      if (authProfile.permissions && authProfile.permissions[module]) {
        return authProfile.permissions[module].edit;
      }

      // Default to true for backward compatibility if permissions are not set, 
      // but in a strict system we'd default to false. Since the prompt states
      // "View/Edit permissions do not affect functionality... implement REAL permission",
      // we'll default to false unless they are 'Company Head' or similar, but
      // actually the prompt says "If user has ONLY 'View' permission... CANNOT edit".
      // If permissions matrix is undefined for this user, we can assume they have edit
      // if their role historically implies it, or just default to false. Let's default to false
      // for strictness, unless they are a role that implicitly should have it.
      // Wait, if we strict default false, employees can't edit settings or leaves.
      // Let's use role-based defaults if permissions matrix is completely missing.
      if (!authProfile.permissions) {
         if (role === 'Employee' && (module === 'settings' || module === 'leaves' || module === 'attendance')) return true;
         if (role === 'Company Head' || role === 'HR' || role === 'Finance') return true;
         return false;
      }
      
      return false; // if permissions object exists but this module isn't in it
    };

    return {
      canView,
      canEdit,
      hasBranchAccess,
      getInheritedBranches,
    };
  }, [authProfile, role, companies]);

  return (
    <PermissionContext.Provider value={value}>
      {children}
    </PermissionContext.Provider>
  );
};
