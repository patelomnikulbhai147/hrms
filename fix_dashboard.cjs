const fs = require('fs');
const p = 'c:/Users/HP/OneDrive/Desktop/enterprise-hrms-crm-application - Copy(d1)/src/pages/Dashboard.tsx';
let txt = fs.readFileSync(p, 'utf8');

txt = txt.replace(
  "import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';",
  "import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';\nimport { api } from '../api/apiClient';"
);

txt = txt.replace(
  "onUpdateNotifications(prev => [newNotif, ...prev]);",
  "api.notifications.create(newNotif).then((saved) => onUpdateNotifications(prev => [saved, ...prev])).catch(() => alert('Failed to broadcast to DB'));"
);

fs.writeFileSync(p, txt);
console.log('done');
