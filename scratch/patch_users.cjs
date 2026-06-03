const fs = require('fs');

let content = fs.readFileSync('src/pages/Users.tsx', 'utf8');

// Replace imports
content = content.replace(
  "import { ShieldCheck, Search, Filter, ShieldAlert, Key, Edit, Trash2, CheckCircle2, XCircle, Power, User, Building2 } from 'lucide-react';",
  "import { ShieldCheck, Search, Filter, ShieldAlert, Key, Edit, Trash2, CheckCircle2, XCircle, Power, User, Building2, Plus, Mail, Lock } from 'lucide-react';"
);

// Add CRUD state
content = content.replace(
  "  const [selectedUser, setSelectedUser] = useState<UserAccount | null>(null);",
  `  const [selectedUser, setSelectedUser] = useState<UserAccount | null>(null);
  
  // CRUD Modals
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [userForm, setUserForm] = useState<Partial<UserAccount>>({
    name: '', email: '', username: '', passwordStr: '', role: 'Employee', companyId: '', status: 'Active'
  });

  const handleOpenAdd = () => {
    setUserForm({ name: '', email: '', username: '', passwordStr: '', role: 'Employee', companyId: companies[0]?.id || '', status: 'Active' });
    setIsAddOpen(true);
  };

  const handleOpenEdit = (user: UserAccount) => {
    setSelectedUser(user);
    setUserForm({ ...user });
    setIsEditOpen(true);
  };

  const handleOpenDelete = (user: UserAccount) => {
    setSelectedUser(user);
    setIsDeleteOpen(true);
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const newUser = await api.users.create({ ...userForm, password: userForm.passwordStr });
      onUpdateAccounts(prev => [newUser, ...prev]);
      setIsAddOpen(false);
    } catch (err: any) {
      alert(err.message || "Failed to create user");
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    try {
      const updatedUser = await api.users.update(selectedUser.id, userForm);
      onUpdateAccounts(prev => prev.map(u => u.id === selectedUser.id ? updatedUser : u));
      setIsEditOpen(false);
      setSelectedUser(null);
    } catch (err: any) {
      alert(err.message || "Failed to update user");
    }
  };

  const handleDeleteConfirm = async () => {
    if (!selectedUser) return;
    try {
      await api.users.delete(selectedUser.id);
      onUpdateAccounts(prev => prev.filter(u => u.id !== selectedUser.id));
      setIsDeleteOpen(false);
      setSelectedUser(null);
    } catch (err: any) {
      alert(err.message || "Failed to delete user");
    }
  };`
);

// Add Add User button
content = content.replace(
  `            <p className="text-sm text-slate-400 mt-1 font-medium">Enterprise Role-Based Access Control and Global User Governance</p>
          </div>
        </div>`,
  `            <p className="text-sm text-slate-400 mt-1 font-medium">Enterprise Role-Based Access Control and Global User Governance</p>
          </div>
          {canEdit && (
            <button
              onClick={handleOpenAdd}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-blue-500/20"
            >
              <Plus size={18} />
              Add User
            </button>
          )}
        </div>`
);

// Add Edit and Delete buttons to Table rows
content = content.replace(
  `                              <Power size={16} />
                            </button>
                          ) : (
                            <div className="p-2 flex items-center justify-center text-slate-500" title="Super Admin is protected">
                              <ShieldAlert size={16} />
                            </div>
                          )}
                          
                          <button
                            onClick={() => handleOpenPermissions(user)}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-all shadow shadow-blue-500/20 flex items-center gap-1.5"
                          >
                            <Key size={14} />
                            RBAC
                          </button>`,
  `                              <Power size={16} />
                            </button>
                          ) : (
                            <div className="p-2 flex items-center justify-center text-slate-500" title="Super Admin is protected">
                              <ShieldAlert size={16} />
                            </div>
                          )}
                          
                          {user.role !== 'Super Admin' && (
                            <>
                              <button onClick={() => handleOpenEdit(user)} className="p-2 text-slate-400 hover:text-blue-400 hover:bg-slate-800 rounded-lg transition-colors border border-transparent hover:border-slate-700">
                                <Edit size={16} />
                              </button>
                              <button onClick={() => handleOpenDelete(user)} className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors border border-transparent hover:border-slate-700">
                                <Trash2 size={16} />
                              </button>
                            </>
                          )}
                          
                          <button
                            onClick={() => handleOpenPermissions(user)}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-all shadow shadow-blue-500/20 flex items-center gap-1.5"
                          >
                            <Key size={14} />
                            RBAC
                          </button>`
);

// Add the Modals JSX before the final closing div
const modalsJsx = `
      {/* Create User Modal */}
      <AnimatePresence>
        {isAddOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setIsAddOpen(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center">
                <h3 className="text-lg font-bold text-white flex items-center gap-2"><User size={18} className="text-blue-400" /> Create System User</h3>
                <button onClick={() => setIsAddOpen(false)} className="text-slate-400 hover:text-white"><XCircle size={20} /></button>
              </div>
              <form onSubmit={handleAddSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">Full Name</label>
                  <input required type="text" value={userForm.name} onChange={e => setUserForm({...userForm, name: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">Email</label>
                  <input required type="email" value={userForm.email} onChange={e => setUserForm({...userForm, email: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">Username / Login ID</label>
                  <input required type="text" value={userForm.username} onChange={e => setUserForm({...userForm, username: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">Password</label>
                  <input required type="password" value={userForm.passwordStr} onChange={e => setUserForm({...userForm, passwordStr: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">System Role</label>
                  <select value={userForm.role} onChange={e => setUserForm({...userForm, role: e.target.value as any})} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 outline-none">
                    <option value="Employee">Employee</option>
                    <option value="HR">HR</option>
                    <option value="Finance">Finance</option>
                    <option value="Company Head">Company Head</option>
                    <option value="Super Admin">Super Admin</option>
                  </select>
                </div>
                {userForm.role !== 'Super Admin' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-1">Base Company / Branch</label>
                    <select required value={userForm.companyId} onChange={e => setUserForm({...userForm, companyId: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 outline-none">
                      {companies.map(c => <option key={c.id} value={c.id}>{c.name} {c.branchName ? \`(\${c.branchName})\` : ''}</option>)}
                    </select>
                  </div>
                )}
                <div className="pt-4 flex justify-end gap-3 border-t border-slate-800">
                  <button type="button" onClick={() => setIsAddOpen(false)} className="px-4 py-2 text-sm font-bold text-slate-300 hover:text-white">Cancel</button>
                  <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-bold shadow-md shadow-blue-500/20">Create User</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit User Modal */}
      <AnimatePresence>
        {isEditOpen && selectedUser && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setIsEditOpen(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center">
                <h3 className="text-lg font-bold text-white flex items-center gap-2"><Edit size={18} className="text-blue-400" /> Edit System User</h3>
                <button onClick={() => setIsEditOpen(false)} className="text-slate-400 hover:text-white"><XCircle size={20} /></button>
              </div>
              <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">Full Name</label>
                  <input required type="text" value={userForm.name} onChange={e => setUserForm({...userForm, name: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">System Role</label>
                  <select value={userForm.role} onChange={e => setUserForm({...userForm, role: e.target.value as any})} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 outline-none">
                    <option value="Employee">Employee</option>
                    <option value="HR">HR</option>
                    <option value="Finance">Finance</option>
                    <option value="Company Head">Company Head</option>
                    <option value="Super Admin">Super Admin</option>
                  </select>
                </div>
                {userForm.role !== 'Super Admin' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-1">Base Company / Branch</label>
                    <select required value={userForm.companyId} onChange={e => setUserForm({...userForm, companyId: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 outline-none">
                      {companies.map(c => <option key={c.id} value={c.id}>{c.name} {c.branchName ? \`(\${c.branchName})\` : ''}</option>)}
                    </select>
                  </div>
                )}
                <div className="pt-4 flex justify-end gap-3 border-t border-slate-800">
                  <button type="button" onClick={() => setIsEditOpen(false)} className="px-4 py-2 text-sm font-bold text-slate-300 hover:text-white">Cancel</button>
                  <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-bold shadow-md shadow-blue-500/20">Save Changes</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {isDeleteOpen && selectedUser && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setIsDeleteOpen(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-sm bg-slate-900 border border-rose-900/50 rounded-2xl shadow-2xl shadow-rose-900/20 overflow-hidden text-center p-6">
              <div className="w-16 h-16 bg-rose-500/20 border border-rose-500/30 rounded-full flex items-center justify-center mx-auto mb-4 text-rose-400">
                <Trash2 size={24} />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Delete User?</h3>
              <p className="text-sm text-slate-400 mb-6">Are you sure you want to permanently delete <strong className="text-white">{selectedUser.name}</strong>? This action cannot be undone.</p>
              
              <div className="flex items-center justify-center gap-3">
                <button onClick={() => setIsDeleteOpen(false)} className="px-4 py-2 text-sm font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors">Cancel</button>
                <button onClick={handleDeleteConfirm} className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-sm font-bold shadow-md shadow-rose-500/20 transition-all">Yes, Delete</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
`;

content = content.replace("    </div>\n  );\n};\n", modalsJsx + "\n    </div>\n  );\n};\n");

fs.writeFileSync('src/pages/Users.tsx', content);
