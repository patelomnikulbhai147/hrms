const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'backend', 'src', 'routes');
const files = fs.readdirSync(dir);

files.forEach(file => {
  if (file.endsWith('.js')) {
    const filePath = path.join(dir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    if (content.includes("const { requireAuth } = require('../middleware/authMiddleware')")) {
      content = content.replace(/const \{ requireAuth \} = require\('\.\.\/middleware\/authMiddleware'\);/g, "const { protect } = require('../middleware/authMiddleware');");
      content = content.replace(/router\.use\(requireAuth\);/g, "router.use(protect);");
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`Updated ${file}`);
    }
  }
});
