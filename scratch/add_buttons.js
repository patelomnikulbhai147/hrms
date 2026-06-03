const fs = require('fs');

let content = fs.readFileSync('src/pages/Users.tsx', 'utf8');

const target1 = `Global User Governance</p>
          </div>
        </div>`;
const target1CrLf = `Global User Governance</p>\r\n          </div>\r\n        </div>`;

const replace1 = `Global User Governance</p>
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
        </div>`;

if (content.includes(target1)) content = content.replace(target1, replace1);
else if (content.includes(target1CrLf)) content = content.replace(target1CrLf, replace1);

const target2 = `{user.role !== 'Super Admin' ? (
                            <button
                              onClick={() => handleToggleStatus(user.id)}
                              className={cn(
                                "p-2 rounded-lg transition-colors shadow-sm border",`;
const target2CrLf = `{user.role !== 'Super Admin' ? (\r\n                            <button\r\n                              onClick={() => handleToggleStatus(user.id)}\r\n                              className={cn(\r\n                                "p-2 rounded-lg transition-colors shadow-sm border",`;

const replace2 = `{user.role !== 'Super Admin' ? (
                            <>
                              <button onClick={() => handleOpenEdit(user)} className="p-2 text-slate-400 hover:text-blue-400 hover:bg-slate-800/50 rounded-lg transition-colors border border-transparent hover:border-slate-700/50" title="Edit User">
                                <Edit size={16} />
                              </button>
                              <button onClick={() => handleOpenDelete(user)} className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800/50 rounded-lg transition-colors border border-transparent hover:border-slate-700/50" title="Delete User">
                                <Trash2 size={16} />
                              </button>
                              <button
                                onClick={() => handleToggleStatus(user.id)}
                                className={cn(
                                  "p-2 rounded-lg transition-colors shadow-sm border",`;

if (content.includes(target2)) content = content.replace(target2, replace2);
else if (content.includes(target2CrLf)) content = content.replace(target2CrLf, replace2);

// Finally, add the closing `</>` after the Power button for non-super admins.
const target3 = `                              <Power size={16} />
                            </button>
                          ) : (`;
const target3CrLf = `                              <Power size={16} />\r\n                            </button>\r\n                          ) : (`;

const replace3 = `                              <Power size={16} />
                            </button>
                            </>
                          ) : (`;
if (content.includes(target3)) content = content.replace(target3, replace3);
else if (content.includes(target3CrLf)) content = content.replace(target3CrLf, replace3);

fs.writeFileSync('src/pages/Users.tsx', content);
console.log('Buttons injected');
