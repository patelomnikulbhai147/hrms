const fs = require('fs');
const p = 'c:/Users/HP/OneDrive/Desktop/enterprise-hrms-crm-application - Copy(d1)/src/pages/Billing.tsx';
let txt = fs.readFileSync(p, 'utf8');

if (!txt.includes(`import { api } from '../api/apiClient';`)) {
  txt = txt.replace(
    "import { Plus, Check, Search, Download, CreditCard, ExternalLink, CalendarDays, ShieldCheck, Mail, Building2, Zap, MoreVertical } from 'lucide-react';",
    "import { Plus, Check, Search, Download, CreditCard, ExternalLink, CalendarDays, ShieldCheck, Mail, Building2, Zap, MoreVertical } from 'lucide-react';\nimport { api } from '../api/apiClient';"
  );
}

txt = txt.replace(
  "onUpdatePayments(prevTx => [newRecord, ...prevTx]);",
  "api.payments.create(newRecord).then(saved => onUpdatePayments(prevTx => [saved, ...prevTx])).catch(() => alert('Failed to create payment record in DB'));"
);

txt = txt.replace(
  "onUpdatePlans(prev => prev.map(p => p.id === finalizedPlan.id ? finalizedPlan : p));",
  "api.plans.update(finalizedPlan.id, finalizedPlan).then(saved => onUpdatePlans(prev => prev.map(p => p.id === finalizedPlan.id ? saved : p))).catch(() => alert('Failed to update plan in DB'));"
);

fs.writeFileSync(p, txt);
console.log('done');
