const fs = require('fs');

let content = fs.readFileSync('backend/src/controllers/migrationController.js', 'utf-8');

const companyMigrationRegex = /if \(companies && Array\.isArray\(companies\)\) \{[\s\S]*?\}\s*\}/;

const newCompanyMigration = `if (companies && Array.isArray(companies)) {
      for (const comp of companies) {
        try {
          if (comp.isHeadOffice === false || comp.parentCompanyId) {
            // It's a branch!
            await prisma.branch.upsert({
              where: { id: comp.id },
              update: {
                branchName: comp.branchName || comp.name,
                status: comp.status || 'Active',
                employeeCount: comp.employeeCount || 0,
              },
              create: {
                id: comp.id,
                branchName: comp.branchName || comp.name,
                companyId: comp.parentCompanyId || 'c-gcri', // fallback if missing
                status: comp.status || 'Active',
                employeeCount: comp.employeeCount || 0,
                domain: comp.domain || '',
                plan: comp.plan || 'Starter',
                parentCompanyId: comp.parentCompanyId,
                isHeadOffice: false
              }
            });
            stats.branches++;
          } else {
            // It's a Head Office
            await prisma.company.upsert({
              where: { id: comp.id },
              update: {
                name: comp.name,
                status: comp.status || 'Active',
                employeeCount: comp.employeeCount || 0,
              },
              create: {
                id: comp.id,
                name: comp.name,
                status: comp.status || 'Active',
                employeeCount: comp.employeeCount || 0,
                domain: comp.domain || '',
                plan: comp.plan || 'Starter',
                isHeadOffice: true
              }
            });
            stats.companies++;
          }
        } catch (err) {
          stats.errors.push(\`Company/Branch \${comp.id}: \${err.message}\`);
        }
      }
    }`;

content = content.replace(companyMigrationRegex, newCompanyMigration);

fs.writeFileSync('backend/src/controllers/migrationController.js', content);
console.log('migrationController.js patched!');
