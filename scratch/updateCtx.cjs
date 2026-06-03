const fs = require('fs');
let c = fs.readFileSync('src/context/PermissionContext.tsx', 'utf8');

const newFunctions = `
export const checkCanCreate = (module: AppModules, authProfile: UserAccount | null, role: string): boolean => {
  if (role === 'Super Admin') return true;
  if (!authProfile) return false;
  if (!checkCanEdit(module, authProfile, role)) return false;
  if (authProfile.permissions && authProfile.permissions[module] !== undefined) {
    return authProfile.permissions[module].create;
  }
  if (!authProfile.permissions) {
    if (role === 'Company Head' || role === 'HR') return true;
    return false;
  }
  return false;
};

export const checkCanDelete = (module: AppModules, authProfile: UserAccount | null, role: string): boolean => {
  if (role === 'Super Admin') return true;
  if (!authProfile) return false;
  if (!checkCanEdit(module, authProfile, role)) return false;
  if (authProfile.permissions && authProfile.permissions[module] !== undefined) {
    return authProfile.permissions[module].delete;
  }
  if (!authProfile.permissions) {
    if (role === 'Company Head') return true;
    return false;
  }
  return false;
};

export const checkCanEdit =`;

c = c.replace('export const checkCanEdit =', newFunctions);
c = c.replace(
  'const canEdit = (module: AppModules): boolean => checkCanEdit(module, authProfile, role);',
  `const canEdit = (module: AppModules): boolean => checkCanEdit(module, authProfile, role);
    const canCreate = (module: AppModules): boolean => checkCanCreate(module, authProfile, role);
    const canDelete = (module: AppModules): boolean => checkCanDelete(module, authProfile, role);`
);

c = c.replace(
  'canEdit,\n      hasBranchAccess',
  `canEdit,\n      canCreate,\n      canDelete,\n      hasBranchAccess`
);

fs.writeFileSync('src/context/PermissionContext.tsx', c);
console.log("Updated PermissionContext.tsx");
