import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowLeft, Save, Eye, FileText, Settings, Database, Code, Layout, 
  History, Download, Copy, Share2, Palette, Sparkles, Plus, Trash2, ChevronUp, ChevronDown, Image as ImageIcon, Table, GripVertical, ScanLine
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { AiAssistantModal } from './components/AiAssistantModal';

const VARIABLE_GROUPS = [
  {
    name: 'Employee',
    variables: [
      { key: '{{employee_name}}', label: 'Employee Name' },
      { key: '{{employee_id}}', label: 'Employee ID' },
      { key: '{{department}}', label: 'Department' },
      { key: '{{designation}}', label: 'Designation' },
    ]
  },
  {
    name: 'Company',
    variables: [
      { key: '{{company_name}}', label: 'Company Name' },
      { key: '{{company_logo}}', label: 'Logo URL' },
      { key: '{{company_address}}', label: 'Address' },
      { key: '{{gst_number}}', label: 'GST Number' },
    ]
  },
  {
    name: 'Dynamic Data',
    variables: [
      { key: '{{#each items}}', label: 'Start Loop' },
      { key: '{{this.name}}', label: 'Item Name' },
      { key: '{{/each}}', label: 'End Loop' },
      { key: '{{qr_code}}', label: 'Verification QR' },
    ]
  }
];

type BlockType = 'html' | 'text' | 'image' | 'table' | 'qr';

interface Block {
  id: string;
  type: BlockType;
  content: string;
}

export const TemplateBuilder = ({ templateId, onBack }: { templateId?: number, onBack: () => void }) => {
  const [activeTab, setActiveTab] = useState<'visual' | 'html' | 'preview'>('visual');
  const [blocks, setBlocks] = useState<Block[]>([
    { id: '1', type: 'html', content: '<h1>{{company_name}}</h1>\n<p>Dear {{employee_name}},</p>' }
  ]);
  const [rawHtml, setRawHtml] = useState('');
  const [name, setName] = useState('New Template');
  const [type, setType] = useState('Offer Letter');
  const [status, setStatus] = useState('Draft');
  const [workflowStatus, setWorkflowStatus] = useState('Draft');
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  
  const editorRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (templateId) {
      fetchTemplate();
    } else {
      updateRawHtml(blocks);
    }
  }, [templateId]);

  const fetchTemplate = async () => {
    try {
      const res = await fetch(`/api/templates/${templateId}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('hrms_token')}` }
      }).then(r => r.json());
      
      if (res.success && res.template) {
        setName(res.template.name);
        setType(res.template.type);
        setStatus(res.template.status);
        setWorkflowStatus(res.template.workflowStatus || 'Draft');
        setRawHtml(res.template.content || '');
        // For backward compatibility, dump everything into one HTML block
        setBlocks([{ id: Date.now().toString(), type: 'html', content: res.template.content || '' }]);
      }
    } catch (err) {
      toast.error('Failed to load template');
    }
  };

  const updateRawHtml = (currentBlocks: Block[]) => {
    const html = currentBlocks.map(b => {
      if (b.type === 'image') return `<img src="${b.content}" alt="Image" style="max-width:100%;" />`;
      if (b.type === 'qr') return `<div style="text-align:center;"><img src="{{qr_code}}" alt="QR Code" width="100" /></div>`;
      if (b.type === 'table') return `<table border="1" cellpadding="5" style="width:100%; border-collapse:collapse;">\n  <tr><th>Header</th></tr>\n  {{#each items}}\n  <tr><td>{{this}}</td></tr>\n  {{/each}}\n</table>`;
      return b.content; // html or text
    }).join('\n\n');
    setRawHtml(html);
  };

  const handleBlocksChange = (newBlocks: Block[]) => {
    setBlocks(newBlocks);
    updateRawHtml(newBlocks);
  };

  const handleSave = async () => {
    try {
      const activeCompanyId = localStorage.getItem('hrms_active_company_id');
      const payload = {
        name,
        type,
        status,
        workflowStatus,
        content: rawHtml,
        companyId: activeCompanyId,
        designType: 'HTML'
      };

      const url = templateId ? `/api/templates/${templateId}` : `/api/templates`;
      const method = templateId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('hrms_token')}`
        },
        body: JSON.stringify(payload)
      }).then(r => r.json());

      if (res.success) {
        toast.success('Template saved successfully!');
        if (!templateId) onBack();
      } else {
        toast.error('Failed to save template');
      }
    } catch (err) {
      toast.error('Error saving template');
    }
  };

  const insertVariable = (variableKey: string) => {
    if (activeTab === 'html' && editorRef.current) {
      const start = editorRef.current.selectionStart;
      const end = editorRef.current.selectionEnd;
      const newContent = rawHtml.substring(0, start) + variableKey + rawHtml.substring(end);
      setRawHtml(newContent);
      setBlocks([{ id: Date.now().toString(), type: 'html', content: newContent }]);
      setTimeout(() => {
        if (editorRef.current) {
          editorRef.current.focus();
          editorRef.current.setSelectionRange(start + variableKey.length, start + variableKey.length);
        }
      }, 0);
    } else {
      toast('Switch to HTML tab or select a text block to insert variables', { icon: 'ℹ️' });
    }
  };

  const addBlock = (blockType: BlockType) => {
    const newBlock: Block = { id: Date.now().toString(), type: blockType, content: '' };
    if (blockType === 'html') newBlock.content = '<p>New Text</p>';
    if (blockType === 'image') newBlock.content = 'https://via.placeholder.com/150';
    
    handleBlocksChange([...blocks, newBlock]);
  };

  const updateBlock = (id: string, content: string) => {
    handleBlocksChange(blocks.map(b => b.id === id ? { ...b, content } : b));
  };

  const removeBlock = (id: string) => {
    handleBlocksChange(blocks.filter(b => b.id !== id));
  };

  const moveBlock = (index: number, direction: -1 | 1) => {
    const newBlocks = [...blocks];
    if (index + direction >= 0 && index + direction < newBlocks.length) {
      const temp = newBlocks[index];
      newBlocks[index] = newBlocks[index + direction];
      newBlocks[index + direction] = temp;
      handleBlocksChange(newBlocks);
    }
  };

  // Preview interpolation
  const renderPreview = () => {
    let previewHtml = rawHtml;
    const dummyData: Record<string, string> = {
      '{{company_name}}': 'Acme Enterprise',
      '{{employee_name}}': 'John Doe',
      '{{designation}}': 'Software Engineer',
      '{{qr_code}}': 'https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=Verify'
    };

    Object.keys(dummyData).forEach(key => {
      previewHtml = previewHtml.split(key).join(dummyData[key]);
    });

    previewHtml = previewHtml.replace(/\{\{#each items\}\}([\s\S]*?)\{\{\/each\}\}/g, '$1$1'); // duplicate loop contents twice
    previewHtml = previewHtml.replace(/\{\{.*?\}\}/g, '<span class="bg-amber-100 text-amber-800 px-1 rounded text-xs">[Var]</span>');

    return (
      <div 
        className="w-full h-full p-8 bg-white border border-slate-200 shadow-sm rounded-lg overflow-y-auto"
        dangerouslySetInnerHTML={{ __html: previewHtml }}
      />
    );
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      <AiAssistantModal 
        isOpen={isAiModalOpen} 
        onClose={() => setIsAiModalOpen(false)} 
        type={type}
        onGenerate={(html) => {
          setRawHtml(html);
          setBlocks([{ id: Date.now().toString(), type: 'html', content: html }]);
          setActiveTab('preview');
        }}
      />

      {/* Topbar */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <input 
              type="text" 
              value={name} 
              onChange={(e) => setName(e.target.value)}
              className="text-lg font-bold text-slate-800 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-brand-500 rounded px-2 py-1 w-64"
            />
            <div className="flex items-center gap-2 mt-1 px-2">
              <span className="text-xs text-slate-500 font-medium">Type:</span>
              <select 
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="text-xs border-none bg-slate-100 text-slate-700 rounded p-1 focus:ring-0"
              >
                <option value="Invoice">Invoice</option>
                <option value="Offer Letter">Offer Letter</option>
                <option value="Payslip">Payslip</option>
                <option value="Certificate">Certificate</option>
                <option value="Custom">Custom</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsAiModalOpen(true)}
            className="flex items-center gap-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-3 py-1.5 rounded-lg text-sm font-medium transition mr-4 border border-indigo-200"
          >
            <Sparkles size={16} />
            AI Assistant
          </button>

          <select 
            value={workflowStatus}
            onChange={(e) => setWorkflowStatus(e.target.value)}
            className={`text-sm font-medium rounded-lg px-3 py-2 border ${
              workflowStatus === 'Approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 
              workflowStatus === 'Draft' ? 'bg-amber-50 text-amber-700 border-amber-200' : 
              'bg-slate-50 text-slate-600 border-slate-200'
            }`}
          >
            <option value="Draft">Workflow: Draft</option>
            <option value="Review">Workflow: Review</option>
            <option value="Approved">Workflow: Approved</option>
            <option value="Published">Workflow: Published</option>
          </select>
          
          <button 
            onClick={handleSave}
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition"
          >
            <Save size={18} />
            Save Template
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - Variable Manager & Tools */}
        <div className="w-64 bg-white border-r border-slate-200 flex flex-col overflow-hidden">
          {activeTab === 'visual' && (
            <div className="p-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800 text-sm uppercase tracking-wider mb-3">Add Blocks</h3>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => addBlock('html')} className="flex flex-col items-center justify-center p-3 border border-slate-200 rounded-lg hover:border-brand-500 hover:bg-brand-50 transition text-slate-600">
                  <FileText size={20} className="mb-1" />
                  <span className="text-xs font-medium">Text/HTML</span>
                </button>
                <button onClick={() => addBlock('image')} className="flex flex-col items-center justify-center p-3 border border-slate-200 rounded-lg hover:border-brand-500 hover:bg-brand-50 transition text-slate-600">
                  <ImageIcon size={20} className="mb-1" />
                  <span className="text-xs font-medium">Image</span>
                </button>
                <button onClick={() => addBlock('table')} className="flex flex-col items-center justify-center p-3 border border-slate-200 rounded-lg hover:border-brand-500 hover:bg-brand-50 transition text-slate-600">
                  <Table size={20} className="mb-1" />
                  <span className="text-xs font-medium">Data Table</span>
                </button>
                <button onClick={() => addBlock('qr')} className="flex flex-col items-center justify-center p-3 border border-slate-200 rounded-lg hover:border-brand-500 hover:bg-brand-50 transition text-slate-600">
                  <ScanLine size={20} className="mb-1" />
                  <span className="text-xs font-medium">QR Code</span>
                </button>
              </div>
            </div>
          )}

          <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
            <Database size={18} className="text-brand-600" />
            <h3 className="font-semibold text-slate-800 text-sm uppercase tracking-wider">Variables</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {VARIABLE_GROUPS.map((group, idx) => (
              <div key={idx}>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{group.name}</h4>
                <ul className="space-y-1">
                  {group.variables.map((v, i) => (
                    <li key={i}>
                      <button 
                        onClick={() => insertVariable(v.key)}
                        className="w-full text-left px-2 py-1.5 text-sm text-slate-700 hover:bg-brand-50 hover:text-brand-700 rounded transition flex items-center justify-between group"
                        title="Click to insert (HTML mode)"
                      >
                        <span className="truncate">{v.label}</span>
                        <code className="text-[10px] text-slate-400 group-hover:text-brand-500 bg-slate-100 group-hover:bg-brand-100 px-1 py-0.5 rounded">
                          {v.key}
                        </code>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Main Workspace */}
        <div className="flex-1 flex flex-col bg-slate-100 relative">
          
          {/* Editor/Preview Tabs */}
          <div className="absolute top-4 right-4 bg-white rounded-lg shadow-sm border border-slate-200 p-1 flex items-center gap-1 z-10">
            <button 
              onClick={() => setActiveTab('visual')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition ${activeTab === 'visual' ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
            >
              <Layout size={16} /> Builder
            </button>
            <button 
              onClick={() => setActiveTab('html')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition ${activeTab === 'html' ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
            >
              <Code size={16} /> Code
            </button>
            <button 
              onClick={() => setActiveTab('preview')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition ${activeTab === 'preview' ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
            >
              <Eye size={16} /> Live PDF Preview
            </button>
          </div>

          <div className="flex-1 p-4 pt-16 overflow-hidden">
            {activeTab === 'visual' && (
              <div className="max-w-4xl mx-auto h-full overflow-y-auto space-y-4 pb-12">
                {blocks.map((block, index) => (
                  <div key={block.id} className="bg-white border border-slate-200 rounded-lg shadow-sm group">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 bg-slate-50 rounded-t-lg">
                      <div className="flex items-center gap-2">
                        <GripVertical size={16} className="text-slate-400 cursor-move" />
                        <span className="text-xs font-semibold text-slate-600 uppercase">{block.type} BLOCK</span>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                        <button onClick={() => moveBlock(index, -1)} disabled={index === 0} className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30"><ChevronUp size={16}/></button>
                        <button onClick={() => moveBlock(index, 1)} disabled={index === blocks.length - 1} className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30"><ChevronDown size={16}/></button>
                        <div className="w-px h-4 bg-slate-200 mx-1"></div>
                        <button onClick={() => removeBlock(block.id)} className="p-1 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded"><Trash2 size={16}/></button>
                      </div>
                    </div>
                    <div className="p-4">
                      {block.type === 'html' && (
                        <textarea 
                          value={block.content}
                          onChange={(e) => updateBlock(block.id, e.target.value)}
                          className="w-full h-32 border-none focus:ring-0 resize-y outline-none text-sm font-mono text-slate-700 bg-slate-50 p-2 rounded"
                          placeholder="<p>Enter HTML or Text...</p>"
                        />
                      )}
                      {block.type === 'image' && (
                        <div className="flex gap-4 items-center">
                          <input 
                            type="text" 
                            value={block.content}
                            onChange={(e) => updateBlock(block.id, e.target.value)}
                            className="flex-1 p-2 border border-slate-200 rounded text-sm outline-none focus:border-brand-500"
                            placeholder="Image URL..."
                          />
                          {block.content && <img src={block.content} alt="preview" className="h-12 object-contain bg-slate-100 rounded" />}
                        </div>
                      )}
                      {block.type === 'table' && (
                        <div className="text-sm text-slate-500 bg-blue-50 p-3 rounded-lg flex items-start gap-3">
                          <Table size={20} className="text-blue-500 mt-0.5" />
                          <div>
                            <p className="font-semibold text-blue-700 mb-1">Dynamic Table Placeholder</p>
                            <p>This block will render a dynamic table in the final output using Handlebars <code>{`{{#each items}}`}</code>.</p>
                          </div>
                        </div>
                      )}
                      {block.type === 'qr' && (
                        <div className="text-sm text-slate-500 bg-slate-100 p-3 rounded-lg flex items-center justify-center h-24 border-2 border-dashed border-slate-300">
                          <div className="text-center">
                            <span className="block font-medium text-slate-700">QR Code Verification</span>
                            <span className="text-xs">Generated automatically upon sending</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {blocks.length === 0 && (
                  <div className="text-center py-12 text-slate-400 bg-white border-2 border-dashed border-slate-200 rounded-xl">
                    <Layout size={48} className="mx-auto mb-3 opacity-50" />
                    <p className="font-medium">No blocks yet.</p>
                    <p className="text-sm">Use the sidebar to add blocks to your template.</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'html' && (
              <div className="h-full w-full bg-[#1e1e1e] rounded-xl overflow-hidden shadow-sm flex flex-col max-w-5xl mx-auto">
                <div className="bg-[#2d2d2d] px-4 py-2 flex items-center border-b border-[#404040]">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-rose-500"></div>
                    <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                    <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                  </div>
                  <span className="ml-4 text-xs text-slate-400 font-mono">template.html (Handlebars)</span>
                </div>
                <textarea
                  ref={editorRef}
                  value={rawHtml}
                  onChange={(e) => {
                    setRawHtml(e.target.value);
                    setBlocks([{ id: Date.now().toString(), type: 'html', content: e.target.value }]);
                  }}
                  className="flex-1 w-full bg-transparent text-slate-300 font-mono p-4 focus:outline-none resize-none text-sm leading-relaxed"
                  spellCheck="false"
                />
              </div>
            )}

            {activeTab === 'preview' && (
              <div className="h-full w-full flex justify-center overflow-y-auto pb-8">
                <div className="w-[210mm] min-h-[297mm] shadow-lg bg-white relative print-preview-container">
                  {renderPreview()}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
