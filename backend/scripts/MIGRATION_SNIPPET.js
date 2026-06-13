/*
  🔥 FULL ENTERPRISE MIGRATION SNIPPET 🔥
  
  Instructions:
  1. Make sure your Express backend is running (npm run dev).
  2. Open your React Frontend in Chrome/Edge.
  3. Press F12 to open the Developer Tools, and go to the "Console" tab.
  4. Copy and paste the entire script below into the Console and hit Enter.
*/

(async function migrateToMySQL() {
  console.log("📦 Packaging local enterprise data...");
  
  const parseStorage = (key) => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  };

  const payload = {
    users: parseStorage('hrms_accounts'),
    companies: parseStorage('hrms_companies'),
    branches: parseStorage('hrms_branches'), // if you have them separate
    employees: parseStorage('hrms_employees')
  };

  console.log(`📊 Found:
  - Users: ${payload.users.length}
  - Companies: ${payload.companies.length}
  - Employees: ${payload.employees.length}`);

  if (payload.employees.length === 0 && payload.companies.length === 0) {
    console.error("❌ No data found in localStorage! Are you on the right domain?");
    return;
  }

  console.log("🚀 Firing data to MySQL backend...");
  
  try {
    const response = await fetch('http://localhost:5000/api/migrate/system', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    
    if (response.ok) {
      console.log("✅ SUCCESS! Migration Complete!");
      console.log("Stats:", result.stats);
    } else {
      console.error("❌ Migration Failed on Server:", result);
    }
  } catch (error) {
    console.error("❌ Network Error connecting to Backend:", error.message);
  }
})();
