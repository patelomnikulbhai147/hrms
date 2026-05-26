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

export const checkCanView = (module: AppModules, authProfile: UserAccount | null, role: string): boolean => {
  if (role === 'Super Admin') return true;
  if (!authProfile) return false;

  // Check granular action permissions first if they exist
  if (authProfile.permissions && authProfile.permissions[module] !== undefined) {
    return authProfile.permissions[module].view;
  }

  // If moduleAccess is explicitly defined and set to false, they cannot view
  if (authProfile.moduleAccess && authProfile.moduleAccess[module] === false) {
    return false;
  }
  
  // Default fallback if no permissions are set yet
  return true;
};

export const checkCanEdit = (module: AppModules, authProfile: UserAccount | null, role: string): boolean => {
  if (role === 'Super Admin') return true;
  if (!authProfile) return false;

  // If they can't even view, they can't edit
  if (!checkCanView(module, authProfile, role)) return false;

  // Check granular action permissions
  if (authProfile.permissions && authProfile.permissions[module] !== undefined) {
    return authProfile.permissions[module].edit;
  }

  // Fallback defaults if permissions matrix is completely missing
  if (!authProfile.permissions) {
     if (role === 'Employee' && (module === 'settings' || module === 'leaves' || module === 'attendance')) return true;
     if (role === 'Company Head' || role === 'HR' || role === 'Finance') return true;
     return false;
  }
  
  return false;
};

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

      if (authProfile.companyId === companyId) return true;

      const accessibleIds = authProfile.accessibleCompanyIds || [authProfile.companyId];
      if (accessibleIds.includes(companyId)) return true;

      for (const accId of accessibleIds) {
        if (!accId) continue;
        const inherited = getInheritedBranches(accId);
        if (inherited.includes(companyId)) return true;
      }

      return false;
    };

    const canView = (module: AppModules): boolean => checkCanView(module, authProfile, role);
    const canEdit = (module: AppModules): boolean => checkCanEdit(module, authProfile, role);

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
