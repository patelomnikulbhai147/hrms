const fs = require('fs');

const path = 'src/pages/Companies.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Add API import if not present
if (!content.includes('import { api } from')) {
  content = content.replace("import React, { useState } from 'react';", "import React, { useState } from 'react';\nimport { api } from '../api/apiClient';");
}

// 2. Add state variables for Reset Password near `manageAccountsModal`
if (!content.includes('resetPasswordTargetId')) {
  const insertState = `
  const [resetPasswordTargetId, setResetPasswordTargetId] = useState<string | null>(null);
  const [resetPasswordForm, setResetPasswordForm] = useState({ newPass: '', confirmPass: '' });
  const [resetPasswordError, setResetPasswordError] = useState('');
  const [isResetting, setIsResetting] = useState(false);
`;
  content = content.replace('const [manageAccountsModal, setManageAccountsModal] = useState<Company | null>(null);', 'const [manageAccountsModal, setManageAccountsModal] = useState<Company | null>(null);' + insertState);
}

// 3. Update `handleResetUserPassword` and add `submitResetPassword`
const oldHandleReset = /const handleResetUserPassword = \(userId: string\) => \{[\s\S]*?alert\('Password updated successfully\.'\);\n  \};/g;
const newHandleReset = `
  const handleResetUserPassword = (userId: string) => {
    setResetPasswordTargetId(userId);
    setResetPasswordForm({ newPass: '', confirmPass: '' });
    setResetPasswordError('');
  };

  const submitResetPassword = async () => {
    if (!resetPasswordTargetId) return;
    if (resetPasswordForm.newPass.length < 8) {
      setResetPasswordError('Password must be at least 8 characters');
      return;
    }
    if (resetPasswordForm.newPass !== resetPasswordForm.confirmPass) {
      setResetPasswordError('Passwords do not match');
      return;
    }

    setIsResetting(true);
    setResetPasswordError('');
    try {
      await api.users.resetPassword(resetPasswordTargetId, resetPasswordForm.newPass);
      const updated = userAccounts.map(u => {
        if (u.id === resetPasswordTargetId) {
          return { ...u, passwordStr: resetPasswordForm.newPass };
        }
        return u;
      });
      onUpdateAccounts(updated);
      setResetPasswordTargetId(null);
      alert('Password reset successfully over API');
    } catch (err: any) {
      setResetPasswordError(err.message || 'Failed to reset password');
    } finally {
      setIsResetting(false);
    }
  };
`;
content = content.replace(oldHandleReset, newHandleReset);

// 4. Add Modal UI at the end of the file, just before `</div>\n    </div>\n  );\n};`
const modalUI = `
      {resetPasswordTargetId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden relative">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-indigo-500" />
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-xl font-bold text-white tracking-tight">Reset Password</h3>
                  <p className="text-xs text-slate-400 mt-1">Set a new access password for the user.</p>
                </div>
                <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center">
                  <Lock className="text-blue-500" size={20} />
                </div>
              </div>

              {resetPasswordError && (
                <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-400 font-semibold">
                  {resetPasswordError}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">New Password</label>
                  <input
                    type="password"
                    value={resetPasswordForm.newPass}
                    onChange={e => setResetPasswordForm({ ...resetPasswordForm, newPass: e.target.value })}
                    className="w-full bg-slate-950/50 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50"
                    placeholder="Min 8 characters"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Confirm Password</label>
                  <input
                    type="password"
                    value={resetPasswordForm.confirmPass}
                    onChange={e => setResetPasswordForm({ ...resetPasswordForm, confirmPass: e.target.value })}
                    className="w-full bg-slate-950/50 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50"
                    placeholder="Re-type new password"
                  />
                </div>
              </div>

              <div className="mt-8 flex justify-end gap-3">
                <button
                  onClick={() => setResetPasswordTargetId(null)}
                  className="px-5 py-2.5 rounded-xl font-bold text-xs text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={submitResetPassword}
                  disabled={isResetting}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl font-bold text-xs transition-all shadow-lg shadow-blue-500/25 flex items-center gap-2"
                >
                  {isResetting ? 'Resetting...' : 'Update Password'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
`;

if (!content.includes('Reset Password') && !content.includes('resetPasswordTargetId &&')) {
  // Try to insert before the last `</div>`
  const lastIndex = content.lastIndexOf('</div>');
  const secondLastIndex = content.lastIndexOf('</div>', lastIndex - 1);
  if (secondLastIndex !== -1) {
    content = content.slice(0, secondLastIndex) + modalUI + content.slice(secondLastIndex);
  }
}

fs.writeFileSync(path, content, 'utf8');
console.log('Companies.tsx patched with Reset Password UI');
