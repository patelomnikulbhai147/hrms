const fs = require('fs');
const p = 'c:/Users/HP/OneDrive/Desktop/enterprise-hrms-crm-application - Copy(d1)/src/components/layout/Topbar.tsx';
let txt = fs.readFileSync(p, 'utf8');

txt = txt.replace(
  "import { motion, AnimatePresence } from 'framer-motion';",
  "import { motion, AnimatePresence } from 'framer-motion';\nimport { api } from '../../api/apiClient';"
);

txt = txt.replace(
  "onUpdateNotifications(prev => prev.filter(item => item.id !== n.id));",
  "api.notifications.delete(n.id).then(() => onUpdateNotifications(prev => prev.filter(item => item.id !== n.id))).catch(() => alert('Failed to delete notification from DB'));"
);

fs.writeFileSync(p, txt);
console.log('done');
