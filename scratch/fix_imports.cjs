const fs = require('fs');
const path = require('path');
const walkSync = (dir, filelist = []) => {
  fs.readdirSync(dir).forEach(file => {
    filelist = fs.statSync(path.join(dir, file)).isDirectory()
      ? walkSync(path.join(dir, file), filelist)
      : filelist.concat(path.join(dir, file));
  });
  return filelist;
};
const files = walkSync('src').filter(f => f.endsWith('.ts') || f.endsWith('.tsx'));
files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  let original = content;
  content = content.replace(/from\s+['"].*?\/data\/mockData['"]/g, "from '../types'");
  content = content.replace(/from\s+['"](\.\/|\.\.\/)data\/mockData['"]/g, "from '$1types'");
  content = content.replace(/import\s+\{([^}]+)\}\s+from\s+['"](\.\/|\.\.\/)data\/mockData['"]/g, "import { $1 } from '$2types'");
  
  // Clean up excelSeededData references
  content = content.replace(/import.*?excelSeededData.*?;\n/g, "");
  content = content.replace(/import.*?parseMasterExcel.*?;\n/g, "");

  if (content !== original) {
    fs.writeFileSync(f, content);
    console.log('Updated ' + f);
  }
});
