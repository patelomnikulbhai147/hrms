const fs = require('fs');
let content = fs.readFileSync('src/pages/Companies.tsx', 'utf8');

const targetStr = "const [workspaceAssignUser, setWorkspaceAssignUser] = useState<UserAccount | null>(null);";
const replaceStr = targetStr + "\n  const [isSubmittingOfficer, setIsSubmittingOfficer] = useState(false);";

content = content.replace(targetStr, replaceStr);

fs.writeFileSync('src/pages/Companies.tsx', content);
console.log('Patched Companies.tsx');
