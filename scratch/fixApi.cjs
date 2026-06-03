const fs = require('fs');
const file = 'src/api/apiClient.ts';
let content = fs.readFileSync(file, 'utf8');

const helper = `
async function apiFetch(url: string, options?: RequestInit) {
  try {
    const res = await fetch(url, options);
    if (!res.ok) {
      let msg = 'API request failed';
      try {
        const errorData = await res.json();
        msg = errorData.error || errorData.message || msg;
      } catch (e) {
        msg = res.statusText || msg;
      }
      throw new Error(msg);
    }
    return await res.json();
  } catch (err: any) {
    console.error('API Client Error:', err);
    throw new Error(err.message || 'Network or Server Error');
  }
}
`;

if (!content.includes('apiFetch(')) {
  content = content.replace('export const api = {', helper + '\nexport const api = {');

  // Regex to replace boilerplate
  content = content.replace(/const res = await fetch\(([^,]+)(?:,\s*(\{[\s\S]*?\}))?\);\s*if \(!res\.ok\) throw new Error\([^)]+\);\s*return res\.json\(\);/g, 'return await apiFetch($1, $2);');
  
  // Fix cases where options were passed as just an object without a variable
  content = content.replace(/const res = await fetch\(([^,]+),\s*(\{[\s\S]*?\})\);\s*if \(!res\.ok\) throw new Error\([^)]+\);\s*return res\.json\(\);/g, 'return await apiFetch($1, $2);');
  
  fs.writeFileSync(file, content);
}
