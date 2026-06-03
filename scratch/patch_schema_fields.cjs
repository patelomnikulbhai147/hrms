const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../backend/prisma/schema.prisma');
let content = fs.readFileSync(file, 'utf8');

// Add User fields
content = content.replace("  passwordHash         String\n  role", "  passwordHash         String\n  password             String?\n  userId               String?\n  role");

// Add Company fields
content = content.replace("  logoImage            String?\n  \n  // Hierarchy", "  logoImage            String?\n  pfRate               Float?\n  esicRate             Float?\n  basicPercent         Float?\n  overtimeRate         Float?\n  profTaxRate          Float?\n  primaryColor         String?\n  themeStyle           String?\n  \n  // Hierarchy");

fs.writeFileSync(file, content);
console.log('schema.prisma patched!');
