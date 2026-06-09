const fs = require('fs');
const path = require('path');

function replaceInFiles(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      replaceInFiles(fullPath);
    } else if (fullPath.endsWith('.js') || fullPath.endsWith('.cjs')) {
      if (fullPath.includes('config\\\\prisma.js') || fullPath.includes('config/prisma.js')) continue;

      let content = fs.readFileSync(fullPath, 'utf8');
      
      const regex1 = /const\s+\{\s*PrismaClient\s*\}\s*=\s*require\(['"]@prisma\/client['"]\);(?:[\r\n\s]*?)const\s+prisma\s*=\s*new\s+PrismaClient\(\);/g;
      
      if (regex1.test(content)) {
        let relativePath = path.relative(path.dirname(fullPath), path.join(__dirname, 'src', 'config', 'prisma.js'));
        relativePath = relativePath.replace(/\\/g, '/');
        if (!relativePath.startsWith('.')) relativePath = './' + relativePath;
        if (relativePath.endsWith('.js')) relativePath = relativePath.slice(0, -3);
        
        content = content.replace(regex1, `const prisma = require('${relativePath}');`);
        fs.writeFileSync(fullPath, content);
        console.log("Updated:", fullPath);
      }
    }
  }
}

replaceInFiles(path.join(__dirname, 'src'));
