const fs = require('fs');
const content = fs.readFileSync('backend/prisma/schema.prisma', 'utf8');
const lines = content.split('\n');
const models = {};
lines.forEach((line, index) => {
  if (line.trim().startsWith('model ')) {
    const modelName = line.trim().split(' ')[1];
    if (models[modelName]) {
      console.log(`Duplicate model: ${modelName} at line ${index + 1} (First seen at line ${models[modelName]})`);
    } else {
      models[modelName] = index + 1;
    }
  }
});
