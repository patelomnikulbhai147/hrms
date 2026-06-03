const fs = require('fs');
let c = fs.readFileSync('src/pages/Users.tsx', 'utf8');

c = c.replace(
  "(['view', 'edit'] as Array<keyof ModulePermissions>).map(action =>",
  "(['view', 'create', 'edit', 'delete'] as Array<keyof ModulePermissions>).map(action =>"
);

// We need to fix the width and styling for 4 buttons instead of 2. 
// "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl border text-[11px] font-extrabold uppercase tracking-widest transition-all",

c = c.replace(
  /className=\{cn\([\s\n]*"flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl border text-\[11px\] font-extrabold uppercase tracking-widest transition-all",/g,
  'className={cn("flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg border text-[10px] font-bold uppercase tracking-wider transition-all",'
);

fs.writeFileSync('src/pages/Users.tsx', c);
