import React, { useState, useEffect } from 'react';
import { Folder, File, Upload, FolderPlus, MoreVertical, Search, HardDrive, Tag, Lock, Settings } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { SecureShareModal } from './SecureShareModal';

export const DocumentVault = () => {
  const [currentFolder, setCurrentFolder] = useState<number | null>(null);
  const [items, setItems] = useState<{folders: any[], documents: any[]}>({ folders: [], documents: [] });
  const [loading, setLoading] = useState(true);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<any>(null);

  useEffect(() => {
    fetchVaultItems();
  }, [currentFolder]);

  const fetchVaultItems = async () => {
    setLoading(true);
    try {
      const url = currentFolder ? `/api/vault?folderId=${currentFolder}` : '/api/vault';
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('hrms_token')}` }
      }).then(r => r.json());
      
      if (res.success) {
        setItems({ folders: res.folders, documents: res.documents });
      }
    } catch (error) {
      toast.error('Failed to load document vault');
    } finally {
      setLoading(false);
    }
  };

  const openShareModal = (doc: any) => {
    setSelectedDoc(doc);
    setShareModalOpen(true);
  };

  return (
    <div className="flex h-full bg-slate-50">
      {/* Sidebar / Storage Metrics */}
      <div className="w-64 bg-white border-r border-slate-200 flex flex-col hidden md:flex">
        <div className="p-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-800 flex items-center gap-2"><HardDrive size={20} className="text-brand-600"/> Vault</h2>
        </div>
        <div className="p-4 flex-1">
          <ul className="space-y-2 text-sm text-slate-600">
            <li className="font-semibold text-brand-700 bg-brand-50 p-2 rounded cursor-pointer">My Files</li>
            <li className="p-2 hover:bg-slate-50 rounded cursor-pointer">Shared with me</li>
            <li className="p-2 hover:bg-slate-50 rounded cursor-pointer">Recent</li>
            <li className="p-2 hover:bg-slate-50 rounded cursor-pointer">Archived</li>
          </ul>
          
          <div className="mt-8 pt-6 border-t border-slate-100">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
              <span>Storage Usage</span>
              <span>15%</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2 mb-2">
              <div className="bg-brand-500 h-2 rounded-full" style={{ width: '15%' }}></div>
            </div>
            <p className="text-xs text-slate-400">750 MB of 5 GB used</p>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="bg-white border-b border-slate-200 p-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-4 flex-1">
            <button className="text-slate-400 hover:text-slate-600 font-medium text-sm" onClick={() => setCurrentFolder(null)}>
              Root
            </button>
            {/* Breadcrumbs could go here */}
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input 
                type="text" 
                placeholder="Smart Search (OCR)..." 
                className="pl-9 pr-4 py-1.5 bg-slate-100 border-none rounded-lg text-sm focus:ring-2 focus:ring-brand-500 w-64"
              />
            </div>
            <button className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-sm font-medium transition">
              <FolderPlus size={16} /> New Folder
            </button>
            <button className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium shadow-sm transition">
              <Upload size={16} /> Upload
            </button>
          </div>
        </div>

        {/* File Explorer */}
        <div className="flex-1 p-6 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"></div></div>
          ) : (
            <div>
              {/* Folders */}
              {items.folders.length > 0 && (
                <div className="mb-8">
                  <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Folders</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {items.folders.map(folder => (
                      <div 
                        key={folder.id} 
                        onClick={() => setCurrentFolder(folder.id)}
                        className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm hover:shadow-md transition cursor-pointer flex items-center justify-between group"
                      >
                        <div className="flex items-center gap-3">
                          <Folder className="text-slate-400 group-hover:text-brand-500 transition" size={24} fill="currentColor" opacity={0.2} />
                          <span className="font-medium text-slate-700 truncate">{folder.name}</span>
                        </div>
                        <button className="text-slate-300 hover:text-slate-600 opacity-0 group-hover:opacity-100"><MoreVertical size={18}/></button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Documents */}
              <div>
                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Files</h3>
                {items.documents.length === 0 ? (
                  <div className="text-center py-20 bg-white border border-dashed border-slate-300 rounded-xl">
                    <File size={48} className="mx-auto text-slate-300 mb-3" />
                    <p className="text-slate-500 font-medium">This folder is empty</p>
                    <p className="text-sm text-slate-400 mt-1">Upload documents to get started</p>
                  </div>
                ) : (
                  <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-xs tracking-wider">
                        <tr>
                          <th className="p-4 font-semibold">Name</th>
                          <th className="p-4 font-semibold hidden md:table-cell">Smart Tags</th>
                          <th className="p-4 font-semibold">Date</th>
                          <th className="p-4 font-semibold">Size</th>
                          <th className="p-4 text-right font-semibold">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {items.documents.map(doc => (
                          <tr key={doc.id} className="hover:bg-slate-50 group transition">
                            <td className="p-4 flex items-center gap-3">
                              <File className="text-brand-500" size={20} />
                              <span className="font-medium text-slate-700">{doc.name}</span>
                            </td>
                            <td className="p-4 hidden md:table-cell">
                              <div className="flex gap-2">
                                {doc.tags?.map((t: string) => (
                                  <span key={t} className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-xs flex items-center gap-1">
                                    <Tag size={10} /> {t}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="p-4 text-slate-500">{new Date(doc.createdAt).toLocaleDateString()}</td>
                            <td className="p-4 text-slate-500">{(doc.size / 1024 / 1024).toFixed(2)} MB</td>
                            <td className="p-4 text-right">
                              <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition">
                                <button onClick={() => openShareModal(doc)} className="p-1.5 text-slate-500 hover:text-brand-600 hover:bg-brand-50 rounded" title="Secure Share">
                                  <Lock size={18} />
                                </button>
                                <button className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded">
                                  <MoreVertical size={18} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      
      {shareModalOpen && selectedDoc && (
        <SecureShareModal document={selectedDoc} onClose={() => setShareModalOpen(false)} />
      )}
    </div>
  );
};
