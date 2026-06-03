const fs = require('fs');

const path = 'src/pages/Companies.tsx';
let content = fs.readFileSync(path, 'utf8');

// Replace table list view
content = content.replace(
  /<div className="w-8 h-8 rounded border text-white flex items-center justify-center font-bold text-xs" style=\{\{ backgroundColor: c\.primaryColor \|\| '#3b82f6', borderColor: `\$\{c\.primaryColor \|\| '#3b82f6'\}40` \}\}>\s*\{c\.logo\}\s*<\/div>/g,
  `<div className="w-8 h-8 rounded border overflow-hidden flex items-center justify-center font-bold text-xs shadow-sm" style={!c.logoImage ? { backgroundColor: c.primaryColor || '#3b82f6', borderColor: \`\${c.primaryColor || '#3b82f6'}40\` } : {}}>
                            {c.logoImage ? (
                              <img src={c.logoImage} alt="Logo" className="w-full h-full object-contain" />
                            ) : c.logo ? (
                              <span className="text-white text-xs">{c.logo}</span>
                            ) : (
                              <Building2 size={16} className="text-white" />
                            )}
                          </div>`
);

// Replace offboarding modal logic
content = content.replace(
  /<div className="h-12 w-12 rounded-full flex items-center justify-center font-bold text-lg text-white shadow-inner" style=\{\{ backgroundColor: offboardCompany\.primaryColor \|\| '#3b82f6' \}\}>\s*\{offboardCompany\.logo \|\| offboardCompany\.name\.slice\(0, 2\)\.toUpperCase\(\)\}\s*<\/div>/g,
  `<div className="h-12 w-12 rounded-full overflow-hidden flex items-center justify-center font-bold text-lg text-white shadow-inner" style={!offboardCompany.logoImage ? { backgroundColor: offboardCompany.primaryColor || '#3b82f6' } : {}}>
                {offboardCompany.logoImage ? (
                  <img src={offboardCompany.logoImage} alt="Logo" className="w-full h-full object-contain" />
                ) : offboardCompany.logo || offboardCompany.name.slice(0, 2).toUpperCase()}
              </div>`
);

fs.writeFileSync(path, content, 'utf8');
console.log('Fixed Companies.tsx');
