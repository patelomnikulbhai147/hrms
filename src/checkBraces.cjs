const fs = require('fs');
const content = fs.readFileSync('c:/Users/HP/OneDrive/Desktop/enterprise-hrms-crm-application - Copy(d1)/src/pages/Dashboard.tsx', 'utf8');

let stack = [];
let inString = false;
let stringChar = null;
let line = 1;

// very naive jsx parsing
for (let i = 0; i < content.length; i++) {
    const c = content[i];
    if (c === '\n') { line++; continue; }
    
    if (!inString && (c === '"' || c === "'" || c === "`")) {
        inString = true;
        stringChar = c;
        continue;
    }
    if (inString && c === stringChar && content[i-1] !== '\\') {
        inString = false;
        continue;
    }
    
    if (!inString) {
        // block comments
        if (c === '/' && content[i+1] === '*') {
            while(i < content.length && !(content[i] === '*' && content[i+1] === '/')) {
                if (content[i] === '\n') line++;
                i++;
            }
            i++; continue;
        }
        // line comments
        if (c === '/' && content[i+1] === '/') {
            while(i < content.length && content[i] !== '\n') { i++; }
            line++; continue;
        }
        
        if (c === '{') stack.push({char: c, line});
        if (c === '(') stack.push({char: c, line});
        if (c === '[') stack.push({char: c, line});
        
        if (c === '}') { let p = stack.pop(); if(p && p.char !== '{') console.log('Mismatch at ' + line); }
        if (c === ')') { let p = stack.pop(); if(p && p.char !== '(') console.log('Mismatch at ' + line); }
        if (c === ']') { let p = stack.pop(); if(p && p.char !== '[') console.log('Mismatch at ' + line); }
    }
}

console.log('Unclosed items:', stack.map(x => x.char + ' at line ' + x.line).join(', '));
