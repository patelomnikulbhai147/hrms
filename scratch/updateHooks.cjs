const fs = require('fs');

const filesToUpdate = [
  'src/pages/Employees.tsx',
  'src/pages/Payroll.tsx',
  'src/pages/Leaves.tsx',
  'src/pages/Users.tsx',
  'src/pages/Companies.tsx',
  'src/pages/Documents.tsx'
];

for (const file of filesToUpdate) {
  if (!fs.existsSync(file)) continue;
  let c = fs.readFileSync(file, 'utf8');

  // Update context hook
  c = c.replace(
    /const \{ canEdit: canEditModule \} = usePermissions\(\);/g,
    'const { canEdit: canEditModule, canCreate: canCreateModule, canDelete: canDeleteModule } = usePermissions();'
  );

  // Add the aliases
  c = c.replace(
    /const canEdit = canEditModule\('([^']+)'\);/g,
    "const canEdit = canEditModule('$1');\n  const canCreate = canCreateModule('$1');\n  const canDelete = canDeleteModule('$1');"
  );

  fs.writeFileSync(file, c);
  console.log('Updated ' + file);
}
