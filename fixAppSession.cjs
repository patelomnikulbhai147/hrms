const fs = require('fs');

let lines = fs.readFileSync('src/App.tsx', 'utf8').split('\n');

const useEffectStart = lines.findIndex(l => l.includes('useEffect(() => {') && lines[l+1] && lines[l+1].includes('if (isAuthenticated) {'));

if (useEffectStart === -1) {
  console.log('Could not find hydrateAll useEffect');
  process.exit(1);
}

const replacementLines = `  useEffect(() => {
    const initSession = async () => {
      const token = localStorage.getItem('hrms_jwt_token');
      if (token) {
        try {
          const user = await api.auth.getMe();
          if (user) {
            setAuthProfile(user);
            setIsAuthenticated(true);
            localStorage.setItem('hrms_auth', 'true');
            localStorage.setItem('hrms_profile', JSON.stringify(user));
            hydrateAll();
          } else {
            handleLogout();
          }
        } catch (err) {
          console.error('Session validation failed:', err);
          handleLogout();
        }
      } else if (isAuthenticated) {
        // Legacy fallback or just hydrate if token auth isn't fully enforced yet
        hydrateAll();
      }
    };
    initSession();
  }, [isAuthenticated]);`.split('\n');

lines.splice(useEffectStart, 5, ...replacementLines);

fs.writeFileSync('src/App.tsx', lines.join('\n'));
console.log('App.tsx updated');
