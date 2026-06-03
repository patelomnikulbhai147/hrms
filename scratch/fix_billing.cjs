const fs = require('fs');

const path = 'src/pages/Billing.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  /<div className="w-6 h-6 rounded bg-indigo-100 text-indigo-700 flex items-center justify-center text-\[10px\] font-bold">\s*\{comp\.logo\}\s*<\/div>/g,
  `<div className="w-6 h-6 rounded overflow-hidden bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-bold" style={!comp.logoImage ? { backgroundColor: comp.primaryColor || '#e0e7ff' } : {}}>
                          {comp.logoImage ? (
                            <img src={comp.logoImage} alt="Logo" className="w-full h-full object-contain" />
                          ) : comp.logo}
                        </div>`
);

fs.writeFileSync(path, content, 'utf8');
console.log('Fixed Billing.tsx');
