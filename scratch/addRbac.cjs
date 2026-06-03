const fs = require('fs');
const path = require('path');

const routesDir = 'backend/src/routes';
const files = fs.readdirSync(routesDir);

for (const file of files) {
  if (!file.endsWith('Routes.js')) continue;
  
  const filePath = path.join(routesDir, file);
  let c = fs.readFileSync(filePath, 'utf8');
  
  // Only process if protect is imported but rbacMiddleware is not
  if (c.includes('protect') && !c.includes('rbacMiddleware')) {
    // Add import
    c = "const { requirePermission } = require('../middleware/rbacMiddleware');\n" + c;
    
    // Determine moduleName based on filename
    let moduleName = file.replace('Routes.js', '');
    if (moduleName === 'employee') moduleName = 'employees';
    else if (moduleName === 'company') moduleName = 'companies';
    else if (moduleName === 'user') moduleName = 'users';
    else if (moduleName === 'leave') moduleName = 'leaves';
    else if (moduleName === 'document') moduleName = 'documents';
    else if (moduleName === 'report') moduleName = 'reports';

    c = c.replace(/router\.post\(([^,]+),\s*protect,\s*/g, "router.post($1, protect, requirePermission('" + moduleName + "', 'create'), ");
    c = c.replace(/router\.put\(([^,]+),\s*protect,\s*/g, "router.put($1, protect, requirePermission('" + moduleName + "', 'edit'), ");
    c = c.replace(/router\.delete\(([^,]+),\s*protect,\s*/g, "router.delete($1, protect, requirePermission('" + moduleName + "', 'delete'), ");
    c = c.replace(/router\.get\(([^,]+),\s*protect,\s*/g, "router.get($1, protect, requirePermission('" + moduleName + "', 'view'), ");
    
    fs.writeFileSync(filePath, c);
    console.log("Updated " + file + " with RBAC middleware");
  }
}
