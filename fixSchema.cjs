const fs = require('fs');
const content = fs.readFileSync('backend/prisma/schema.prisma', 'utf8');
const lines = content.split('\n');

const seenModels = new Set();
let keepLine = Array(lines.length).fill(true);
let inDuplicateBlock = false;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  if (line.startsWith('model ')) {
    const modelName = line.split(/\s+/)[1];
    if (seenModels.has(modelName)) {
      console.log('Found duplicate model:', modelName, 'at line', i + 1);
      inDuplicateBlock = true;
    } else {
      seenModels.add(modelName);
      inDuplicateBlock = false;
    }
  } else if (line.startsWith('enum ')) {
    const enumName = line.split(/\s+/)[1];
    if (seenModels.has(enumName)) {
      console.log('Found duplicate enum:', enumName, 'at line', i + 1);
      inDuplicateBlock = true;
    } else {
      seenModels.add(enumName);
      inDuplicateBlock = false;
    }
  }

  if (inDuplicateBlock) {
    keepLine[i] = false;
  }
}

const newContent = lines.filter((_, i) => keepLine[i]).join('\n');
fs.writeFileSync('backend/prisma/schema.prisma', newContent, 'utf8');
console.log('Fixed duplicates.');
