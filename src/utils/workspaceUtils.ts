export const getCompanyInitials = (name?: string): string => {
  if (!name) return '??';
  const parts = name.split(' ').filter(Boolean);
  if (parts.length === 1) return parts[0].substring(0, 1).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

export function getAccessibleWorkspaceIds(user: any, companies: any[]): string[] {
  if (!user) return [];
  
  // Filter only active companies
  const activeCompanies = companies.filter(c => 
    c.status !== 'Archived' && c.status !== 'Inactive' && c.accountStatus !== 'Suspended'
  );

  if (user.role === 'Super Admin') {
    return activeCompanies.map(c => c.id);
  }
  
  const directIds = [user.companyId, ...(user.accessibleCompanyIds || [])].filter(Boolean);
  const idSet = new Set<string>();
  
  // Only add ids if they are in the active companies list
  directIds.forEach(id => {
     if (activeCompanies.some(ac => ac.id === id)) {
        idSet.add(id);
     }
  });
  
  directIds.forEach(pid => {
    const parent = activeCompanies.find(c => c.id === pid);
    if (parent && (pid === 'c-gcri' || parent.isHeadOffice || !parent.parentCompanyId)) {
      activeCompanies.filter(c => c.parentCompanyId === pid).forEach(b => idSet.add(b.id));
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
