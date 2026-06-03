const fs = require('fs');
const path = require('path');

const appTsxPath = path.join(__dirname, '../src/App.tsx');
let content = fs.readFileSync(appTsxPath, 'utf-8');

// 1. userAccounts
content = content.replace(
  `localStorage.setItem('hrms_accounts', JSON.stringify(defaultUsers));\n    return defaultUsers;`,
  `localStorage.setItem('hrms_accounts', JSON.stringify([]));\n    return [];`
);

// 2. companies
content = content.replace(
  `      } catch (e) {
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
    return billingResult.updatedCompanies;`,
  `      } catch (e) {
        localStorage.setItem('hrms_companies', JSON.stringify([]));
        return [];
      }
    }
    localStorage.setItem('hrms_companies', JSON.stringify([]));
    return [];`
);

// 3. attendance
content = content.replace(
  `localStorage.setItem('hrms_attendance', JSON.stringify(defaultAttendance));\n    return defaultAttendance;`,
  `localStorage.setItem('hrms_attendance', JSON.stringify([]));\n    return [];`
);

// 4. leaves
content = content.replace(
  `localStorage.setItem('hrms_leaves', JSON.stringify(defaultLeaves));\n    return defaultLeaves;`,
  `localStorage.setItem('hrms_leaves', JSON.stringify([]));\n    return [];`
);

// 5. payroll
content = content.replace(
  `localStorage.setItem('hrms_payroll', JSON.stringify(defaultPayroll));\n    return defaultPayroll;`,
  `localStorage.setItem('hrms_payroll', JSON.stringify([]));\n    return [];`
);

// 6. documents
content = content.replace(
  `localStorage.setItem('hrms_documents', JSON.stringify(defaultDocuments));\n    return defaultDocuments;`,
  `localStorage.setItem('hrms_documents', JSON.stringify([]));\n    return [];`
);

// 7. payments
content = content.replace(
  `localStorage.setItem('hrms_payments', JSON.stringify(defaultPayments));\n    return defaultPayments;`,
  `localStorage.setItem('hrms_payments', JSON.stringify([]));\n    return [];`
);

// 8. hydrateAll
content = content.replace(
  `  const handleUpdateDocuments = async (updater?: any) => { await hydrateAll(); };`,
  `  const handleUpdateDocuments = async (updater?: any) => { await hydrateAll(); };

  const hydrateAll = async () => {
    try {
      const [
        fetchedCompanies,
        fetchedEmployees,
        fetchedUsers,
        fetchedAttendance,
        fetchedLeaves,
        fetchedPayroll,
        fetchedDocuments,
        fetchedPayments,
        fetchedNotifications
      ] = await Promise.all([
        api.companies.getAll().catch(() => null),
        api.employees.getAll().catch(() => null),
        api.users.getAll().catch(() => null),
        api.attendance.getAll().catch(() => null),
        api.leaves.getAll().catch(() => null),
        api.payroll.getAll().catch(() => null),
        api.documents.getAll().catch(() => null),
        api.payments.getAll().catch(() => null),
        api.notifications.getAll().catch(() => null)
      ]);

      if (fetchedCompanies) setCompanies(fetchedCompanies);
      if (fetchedEmployees) setEmployees(fetchedEmployees);
      if (fetchedUsers) setUserAccounts(fetchedUsers);
      if (fetchedAttendance) setAttendance(fetchedAttendance);
      if (fetchedLeaves) setLeaves(fetchedLeaves);
      if (fetchedPayroll) setPayroll(fetchedPayroll);
      if (fetchedDocuments) setDocuments(fetchedDocuments);
      if (fetchedPayments) setPayments(fetchedPayments);
      if (fetchedNotifications) setNotifications(fetchedNotifications);
    } catch (err) {
      console.error('Failed to hydrate store from backend:', err);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      hydrateAll();
    }
  }, [isAuthenticated]);`
);

fs.writeFileSync(appTsxPath, content, 'utf-8');
console.log('App.tsx fixed cleanly!');
