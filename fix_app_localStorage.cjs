const fs = require('fs');
const p = 'c:/Users/HP/OneDrive/Desktop/enterprise-hrms-crm-application - Copy(d1)/src/App.tsx';
let txt = fs.readFileSync(p, 'utf8');

// Replace UserAccounts initialization
txt = txt.replace(
  `  const [userAccounts, setUserAccounts] = useState<UserAccount[]>(() => {
    const raw = localStorage.getItem('hrms_accounts');
    if (raw) return JSON.parse(raw);
    localStorage.setItem('hrms_accounts', JSON.stringify(defaultUsers));
    return defaultUsers;
  });`,
  `  const [userAccounts, setUserAccounts] = useState<UserAccount[]>([]);`
);

txt = txt.replace(
  `  const handleUpdateUserAccounts = (updater: UserAccount[] | ((prev: UserAccount[]) => UserAccount[])) => {
    const next = typeof updater === 'function' ? updater(userAccounts) : updater;
    setUserAccounts(next);
    localStorage.setItem('hrms_accounts', JSON.stringify(next));
  };`,
  `  const handleUpdateUserAccounts = (updater: UserAccount[] | ((prev: UserAccount[]) => UserAccount[])) => {
    const next = typeof updater === 'function' ? updater(userAccounts) : updater;
    setUserAccounts(next);
  };`
);

// Replace Companies initialization
txt = txt.replace(
  `  const [companies, setCompanies] = useState<Company[]>(() => {
    const raw = localStorage.getItem('hrms_companies');
    if (raw) {
      try {
        const parsed: Company[] = JSON.parse(raw);
        // sanitize renewalDate fields and pre-seed monthly/yearly pricing
        const sanitized = parsed.map(c => {
          const planObj = defaultPlans.find(p => p.name === c.plan);
          const basePriceMonthly = planObj ? planObj.priceMonthly : (c.plan === 'Enterprise' ? 12999 : (c.plan === 'Professional' ? 4999 : 1999));
          const basePriceYearly = planObj ? planObj.priceYearly : (c.plan === 'Enterprise' ? 129999 : (c.plan === 'Professional' ? 49999 : 19999));

          const nextCompany = {
            ...c,
            priceMonthly: c.priceMonthly || basePriceMonthly,
            priceYearly: c.priceYearly || basePriceYearly
          };

          if (!c.renewalDate) return nextCompany;
          const d = new Date(c.renewalDate);
          if (isNaN(d.getTime())) {
            return { ...nextCompany, renewalDate: '' };
          }
          return nextCompany;
        });
        // validate and recalculate billing for the parent company
        const billingResult = calculateBranchBilling(sanitized, 'c-gcri', defaultPlans);
        localStorage.setItem('hrms_companies', JSON.stringify(billingResult.updatedCompanies));
        return billingResult.updatedCompanies;
      } catch (e) {
        const preCalculated = defaultCompanies.map(c => {
          const planObj = defaultPlans.find(p => p.name === c.plan);
          return {
            ...c,
            priceMonthly: planObj ? planObj.priceMonthly : 12999,
            priceYearly: planObj ? planObj.priceYearly : 129999
          };
        });
        const billingResult = calculateBranchBilling(preCalculated, 'c-gcri', defaultPlans);
        localStorage.setItem('hrms_companies', JSON.stringify(billingResult.updatedCompanies));
        return billingResult.updatedCompanies;
      }
    }
    const preCalculated = defaultCompanies.map(c => {
      const planObj = defaultPlans.find(p => p.name === c.plan);
      return {
        ...c,
        priceMonthly: planObj ? planObj.priceMonthly : 12999,
        priceYearly: planObj ? planObj.priceYearly : 129999
      };
    });
    const billingResult = calculateBranchBilling(preCalculated, 'c-gcri', defaultPlans);
    localStorage.setItem('hrms_companies', JSON.stringify(billingResult.updatedCompanies));
    return billingResult.updatedCompanies;
  });`,
  `  const [companies, setCompanies] = useState<Company[]>([]);`
);

txt = txt.replace(
  `  const handleUpdateCompanies = (updater: Company[] | ((prev: Company[]) => Company[])) => {
    const next = typeof updater === 'function' ? updater(companies) : updater;
    setCompanies(next);
    localStorage.setItem('hrms_companies', JSON.stringify(next));
  };`,
  `  const handleUpdateCompanies = (updater: Company[] | ((prev: Company[]) => Company[])) => {
    const next = typeof updater === 'function' ? updater(companies) : updater;
    setCompanies(next);
  };`
);

// Fix hydrateAll companies condition
txt = txt.replace(
  `      if (fetchedCompanies && fetchedCompanies.length > 0) {
        let combined = [...fetchedCompanies];
        if (fetchedBranches && fetchedBranches.length > 0) {
          const mappedBranches = fetchedBranches.map((b: any) => ({
            id: b.id,
            name: b.branchName,
            parentCompanyId: b.companyId,
            isHeadOffice: false,
            branchName: b.branchName,
            status: b.status || 'Active',
            accountStatus: 'Active',
            paymentStatus: 'Paid',
            plan: 'Starter',
            employeeCount: b.headcount || 0,
            location: b.location
          }));
          combined = [...combined, ...mappedBranches];
        }
        setCompanies(combined);
      }`,
  `      if (fetchedCompanies) {
        let combined = [...fetchedCompanies];
        if (fetchedBranches) {
          const mappedBranches = fetchedBranches.map((b: any) => ({
            id: b.id,
            name: b.branchName,
            parentCompanyId: b.companyId,
            isHeadOffice: false,
            branchName: b.branchName,
            status: b.status || 'Active',
            accountStatus: 'Active',
            paymentStatus: 'Paid',
            plan: 'Starter',
            employeeCount: b.headcount || 0,
            location: b.location
          }));
          combined = [...combined, ...mappedBranches];
        }
        setCompanies(combined);
      }`
);

fs.writeFileSync(p, txt);
console.log('done');
