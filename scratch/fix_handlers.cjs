const fs = require('fs');
let app = fs.readFileSync('src/App.tsx', 'utf8');

const handlers = `
  const handleUpdateAccounts = (updater: UserAccount[] | ((prev: UserAccount[]) => UserAccount[])) => {
    setUserAccounts(typeof updater === 'function' ? updater(userAccounts) : updater);
  };

  const handleUpdatePlans = (updater: SubscriptionPlan[] | ((prev: SubscriptionPlan[]) => SubscriptionPlan[])) => {
    setPlans(typeof updater === 'function' ? updater(plans) : updater);
  };

  const handleUpdatePayments = (updater: PaymentRecord[] | ((prev: PaymentRecord[]) => PaymentRecord[])) => {
    setPayments(typeof updater === 'function' ? updater(payments) : updater);
  };
`;

// Insert the handlers right before hydrateAll
app = app.replace('  const hydrateAll = async () => {', handlers + '\\n  const hydrateAll = async () => {');

// Also, let's fix handleUpdateUserAccounts to handleUpdateAccounts in the JSX for the 'users' route
app = app.replace('onUpdateAccounts={handleUpdateUserAccounts}', 'onUpdateAccounts={handleUpdateAccounts}');

// And ensure App.tsx has no other undefined handlers
// handleUpdateCompanies is already handled? Wait, my rewrite script deleted ALL handlers between startMarker and endMarker!!!
// Let's check what was between startMarker and endMarker!
// I'll just check if handleUpdateCompanies, handleUpdateEmployees, handleUpdateLeaves, handleUpdateAttendance, handleUpdateDocuments, handleUpdatePayroll are missing!
