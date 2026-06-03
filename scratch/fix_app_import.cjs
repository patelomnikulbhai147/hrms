const fs = require('fs');
let c = fs.readFileSync('src/App.tsx', 'utf8');
c = c.replace(/from '\.\.\/types'/g, "from './types'");
fs.writeFileSync('src/App.tsx', c);
