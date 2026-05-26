const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      results.push(file);
    }
  });
  return results;
}

const files = walk('./src');
files.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const matches = content.match(/import\s+.*?\s+from\s+['"](.*?)['"]/g);
  if (matches) {
    matches.forEach(match => {
      const importPath = match.match(/['"](.*?)['"]/)[1];
      if (importPath.startsWith('.')) {
        const absoluteImportPath = path.resolve(path.dirname(file), importPath);
        const dirname = path.dirname(absoluteImportPath);
        const basename = path.basename(absoluteImportPath);
        if (fs.existsSync(dirname)) {
          const filesInDir = fs.readdirSync(dirname);
          const exactMatch = filesInDir.find(f => f === basename || f.startsWith(basename + '.'));
          if (!exactMatch) {
            console.log('Mismatch in ' + file + ': ' + importPath + ' (looking for ' + basename + ' in ' + dirname + ')');
          }
        } else {
            console.log('Directory not found in ' + file + ': ' + importPath);
        }
      }
    });
  }
});
