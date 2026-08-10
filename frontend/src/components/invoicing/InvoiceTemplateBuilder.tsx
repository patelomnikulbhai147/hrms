import React, { useState, useEffect, useRef } from 'react';
import { api } from '@/api/apiClient';
import { InvoiceTemplate } from './InvoiceTemplateDashboard';
import toast from 'react-hot-toast';
import { ArrowLeft, Save, Sliders, Layout, Eye, Upload, Image as ImageIcon, Type, Palette, AlignLeft, CheckSquare } from 'lucide-react';

interface InvoiceTemplateBuilderProps {
  template: Partial<InvoiceTemplate> | null;
  onSave: (template: InvoiceTemplate) => void;
  onCancel: () => void;
}

const TOGGLE_FIELDS = [
  { id: 'nc-logo', label: 'Company Logo', variable: '{{company.logo}}' },
  { id: 'nc-company-name', label: 'Company Name', variable: '{{company.name}}' },
  { id: 'nc-company-address', label: 'Company Address', variable: '{{company.address}}' },
  { id: 'nc-company-gstin', label: 'Company GSTIN', variable: '{{company.gstin}}' },
  { id: 'nc-company-phone', label: 'Company Phone', variable: '{{company.contactNumber}}' },
  { id: 'nc-company-email', label: 'Company Email', variable: '{{company.contactEmail}}' },
  { id: 'nc-invoice-num', label: 'Invoice Number', variable: '{{invoice.invoiceNumber}}' },
  { id: 'nc-invoice-date', label: 'Invoice Date', variable: '{{date invoice.invoiceDate}}' },
  { id: 'nc-due-date', label: 'Due Date', variable: '{{date invoice.dueDate}}' },
  { id: 'nc-cust-name', label: 'Customer Name', variable: '{{invoice.billToName}}' },
  { id: 'nc-cust-address', label: 'Customer Address', variable: '{{invoice.billToAddress}}' },
  { id: 'nc-cust-gstin', label: 'Customer GSTIN', variable: '{{invoice.billToGstin}}' },
  { id: 'nc-discount', label: 'Discount Total', variable: '{{money invoice.discountTotal}}' },
  { id: 'nc-cgst', label: 'CGST', variable: '{{money invoice.cgst}}' },
  { id: 'nc-sgst', label: 'SGST', variable: '{{money invoice.sgst}}' },
  { id: 'nc-igst', label: 'IGST', variable: '{{money invoice.igst}}' },
  { id: 'nc-bank', label: 'Bank Details', variable: '{{invoice.bankDetails}}' },
  { id: 'nc-notes', label: 'Terms & Notes', variable: '{{invoice.notes}}' }
];

export const InvoiceTemplateBuilder: React.FC<InvoiceTemplateBuilderProps> = ({ template, onSave, onCancel }) => {
  const [name, setName] = useState(template?.name || '');
  const [description, setDescription] = useState(template?.description || '');
  
  // The base HTML content without our dynamic injected styles
  const [content, setContent] = useState('');
  
  const [previewHtml, setPreviewHtml] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  
  const [activeSection, setActiveSection] = useState<string>('branding');
  
  // No-Code Customization State
  const [primaryColor, setPrimaryColor] = useState('#6366f1');
  const [secondaryColor, setSecondaryColor] = useState('#4b5563');
  const [fontFamily, setFontFamily] = useState('Inter, sans-serif');
  const [fontSize, setFontSize] = useState('14px');
  const [footerText, setFooterText] = useState('Thank you for your business!');
  
  // Toggle states (true = show, false = hide)
  const [toggles, setToggles] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    TOGGLE_FIELDS.forEach(f => initial[f.id] = true);
    return initial;
  });

  // Extract CSS variables and config on mount
  useEffect(() => {
    if (template?.content) {
      let html = template.content;
      
      // Parse CSS Variables
      const pColorMatch = html.match(/--primary-color:\s*([^;]+);/);
      if (pColorMatch) setPrimaryColor(pColorMatch[1].trim());
      
      const sColorMatch = html.match(/--secondary-color:\s*([^;]+);/);
      if (sColorMatch) setSecondaryColor(sColorMatch[1].trim());
      
      const fontMatch = html.match(/--font-family:\s*([^;]+);/);
      if (fontMatch) setFontFamily(fontMatch[1].trim().replace(/['"]/g, ''));
      
      const sizeMatch = html.match(/--font-size:\s*([^;]+);/);
      if (sizeMatch) setFontSize(sizeMatch[1].trim());

      // Parse footer text from meta tag or specific footer class if possible
      const footerMatch = html.match(/<div class="footer-text-custom">([^<]*)<\/div>/);
      if (footerMatch) setFooterText(footerMatch[1].trim());

      // Parse toggles from injected CSS
      const newToggles = { ...toggles };
      TOGGLE_FIELDS.forEach(f => {
        // If we find `.nc-id { display: none !important; }`, it means it's hidden
        if (html.includes(`.${f.id} { display: none !important; }`)) {
          newToggles[f.id] = false;
        } else {
          newToggles[f.id] = true;
        }
      });
      setToggles(newToggles);

      // Remove the previously injected style block so we don't accumulate them
      html = html.replace(/<style id="injected-no-code">[\s\S]*?<\/style>/, '');

      // Ensure all Handlebars variables are wrapped in our tracking spans
      html = wrapVariables(html);
      
      setContent(html);
    } else {
      // New template, just start blank or boilerplate
      setContent('<!DOCTYPE html>\n<html>\n<head>\n</head>\n<body>\n</body>\n</html>');
    }
  }, [template]);

  // Generate preview whenever content or states change
  useEffect(() => {
    if (!content) return;
    const timer = setTimeout(() => {
      generatePreview();
    }, 500);
    return () => clearTimeout(timer);
  }, [content, primaryColor, secondaryColor, fontFamily, fontSize, footerText, toggles]);

  const wrapVariables = (html: string) => {
    let modified = html;
    TOGGLE_FIELDS.forEach(field => {
      // Escape variable for regex
      const escapedVar = field.variable.replace(/[.*+?^\${}()|[\\]\\]/g, '\\\\$&');
      // Look for the variable NOT preceded by our span wrapper.
      // Since negative lookbehind with arbitrary length is tricky, we'll do a simple replace
      // by finding the raw variable and wrapping it. We avoid double-wrapping by removing existing ones first.
      
      // Step 1: Unwrap if already wrapped (cleans it up)
      const unwrapRegex = new RegExp(`<span class="\${field.id}">\\s*(\${escapedVar})\\s*<\\/span>`, 'g');
      modified = modified.replace(unwrapRegex, '$1');
      
      // Step 2: Wrap it
      const wrapRegex = new RegExp(`(\${escapedVar})`, 'g');
      modified = modified.replace(wrapRegex, `<span class="\${field.id}">$1</span>`);
    });
    
    // Also wrap footer if we want to replace it dynamically, or we can just append it
    return modified;
  };

  const getInjectedHtml = () => {
    // Generate the CSS block for variables and hidden fields
    let hiddenCss = '';
    Object.entries(toggles).forEach(([id, isVisible]) => {
      if (!isVisible) {
        hiddenCss += `  .\${id} { display: none !important; }\\n`;
      }
    });

    const styleBlock = `
<style id="injected-no-code">
  :root {
    --primary-color: \${primaryColor} !important;
    --secondary-color: \${secondaryColor} !important;
    --font-family: '\${fontFamily}' !important;
    --font-size: \${fontSize} !important;
  }
\${hiddenCss}
</style>
`;

    let finalHtml = content;

    // Inject footer if custom class exists, otherwise we just try to update existing footer
    if (finalHtml.includes('class="footer-text-custom"')) {
      finalHtml = finalHtml.replace(/<div class="footer-text-custom">[^<]*<\/div>/, `<div class="footer-text-custom">\${footerText}</div>`);
    } else {
      // Add it before </body> if it doesn't exist
      if (finalHtml.includes('</body>')) {
        finalHtml = finalHtml.replace('</body>', `<div class="footer-text-custom" style="text-align:center; font-size: 0.9em; margin-top: 30px; color: var(--secondary-color);">\${footerText}</div>\\n</body>`);
      }
    }

    if (finalHtml.includes('</head>')) {
      finalHtml = finalHtml.replace('</head>', `\${styleBlock}</head>`);
    } else {
      finalHtml = styleBlock + finalHtml;
    }
    
    return finalHtml;
  };

  const generatePreview = async () => {
    try {
      setPreviewing(true);
      const injectedHtml = getInjectedHtml();
      const html = await api.invoiceTemplates.preview(injectedHtml);
      setPreviewHtml(html);
    } catch (e) {
      console.error(e);
      // We don't toast here to avoid spamming the user during typing
      setPreviewHtml('<div style="padding: 20px; color: red;">Error generating preview. Check console.</div>');
    } finally {
      setPreviewing(false);
    }
  };

  const handleSave = async (status: string) => {
    if (!name.trim()) return toast.error('Template name is required');
    if (!content.trim()) return toast.error('Template content cannot be empty');

    try {
      setLoading(true);
      const finalHtml = getInjectedHtml();
      
      const payload = {
        name,
        description,
        content: finalHtml,
        status,
        designType: 'HTML' // Always HTML internally
      };

      let res;
      if (template?.id) {
        res = await api.invoiceTemplates.update(template.id, payload);
        toast.success('Template updated successfully');
      } else {
        res = await api.invoiceTemplates.create(payload);
        toast.success('Template created successfully');
      }
      onSave(res);
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || 'Failed to save template');
    } finally {
      setLoading(false);
    }
  };

  const toggleField = (id: string) => {
    setToggles(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col h-screen overflow-hidden">
      {/* Top Navigation */}
      <div className="h-16 border-b border-gray-200 bg-gray-50 flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={onCancel} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex flex-col">
            <input 
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="text-lg font-bold bg-transparent border-none p-0 focus:ring-0 text-gray-800 placeholder-gray-400"
              placeholder="Untitled Template"
            />
            <input 
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="text-xs bg-transparent border-none p-0 focus:ring-0 text-gray-500 placeholder-gray-400 w-64"
              placeholder="Brief description..."
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => handleSave('Draft')}
            disabled={loading}
            className="px-4 py-2 border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 rounded-lg font-medium transition-colors"
          >
            Save Draft
          </button>
          <button 
            onClick={() => handleSave('Active')}
            disabled={loading}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            Save & Activate
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar (No-Code Designer) */}
        <div className="w-[380px] flex flex-col border-r border-gray-200 bg-white shrink-0 h-full">
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            <h2 className="font-bold text-gray-800 flex items-center gap-2">
              <Sliders className="w-4 h-4" /> Invoice Designer
            </h2>
            <p className="text-xs text-gray-500 mt-1">Customize the look and feel without writing code.</p>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Branding Section */}
            <div className="border-b border-gray-200">
              <button 
                onClick={() => setActiveSection('branding')}
                className="w-full p-4 flex justify-between items-center bg-white hover:bg-gray-50 transition-colors"
              >
                <span className="font-semibold text-gray-700 flex items-center gap-2"><Palette className="w-4 h-4" /> Colors & Typography</span>
              </button>
              {activeSection === 'branding' && (
                <div className="p-4 pt-0 space-y-4 bg-gray-50/50">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Primary Color</label>
                    <div className="flex items-center gap-3">
                      <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0 p-0" />
                      <input type="text" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="flex-1 text-sm border-gray-300 rounded focus:ring-indigo-500 focus:border-indigo-500" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Secondary Color</label>
                    <div className="flex items-center gap-3">
                      <input type="color" value={secondaryColor} onChange={e => setSecondaryColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0 p-0" />
                      <input type="text" value={secondaryColor} onChange={e => setSecondaryColor(e.target.value)} className="flex-1 text-sm border-gray-300 rounded focus:ring-indigo-500 focus:border-indigo-500" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Font Family</label>
                    <select value={fontFamily} onChange={e => setFontFamily(e.target.value)} className="w-full text-sm border-gray-300 rounded focus:ring-indigo-500 focus:border-indigo-500">
                      <option value="Inter, sans-serif">Inter (Modern Sans)</option>
                      <option value="Roboto, sans-serif">Roboto</option>
                      <option value="Arial, sans-serif">Arial</option>
                      <option value="Georgia, serif">Georgia (Elegant Serif)</option>
                      <option value="'Courier New', Courier, monospace">Courier New</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Font Size</label>
                    <select value={fontSize} onChange={e => setFontSize(e.target.value)} className="w-full text-sm border-gray-300 rounded focus:ring-indigo-500 focus:border-indigo-500">
                      <option value="12px">Small (12px)</option>
                      <option value="14px">Medium (14px)</option>
                      <option value="16px">Large (16px)</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Fields Section */}
            <div className="border-b border-gray-200">
              <button 
                onClick={() => setActiveSection('fields')}
                className="w-full p-4 flex justify-between items-center bg-white hover:bg-gray-50 transition-colors"
              >
                <span className="font-semibold text-gray-700 flex items-center gap-2"><CheckSquare className="w-4 h-4" /> Toggle Fields</span>
              </button>
              {activeSection === 'fields' && (
                <div className="p-4 pt-0 bg-gray-50/50 space-y-6">
                  {/* Company Info */}
                  <div>
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Company Info</h4>
                    <div className="space-y-2">
                      {TOGGLE_FIELDS.filter(f => f.id.startsWith('nc-company') || f.id === 'nc-logo').map(f => (
                        <label key={f.id} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={toggles[f.id]} 
                            onChange={() => toggleField(f.id)}
                            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          {f.label}
                        </label>
                      ))}
                    </div>
                  </div>
                  
                  {/* Invoice Details */}
                  <div>
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Invoice Details</h4>
                    <div className="space-y-2">
                      {TOGGLE_FIELDS.filter(f => f.id.startsWith('nc-invoice') || f.id === 'nc-due-date').map(f => (
                        <label key={f.id} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={toggles[f.id]} 
                            onChange={() => toggleField(f.id)}
                            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          {f.label}
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Customer Details */}
                  <div>
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Customer Details</h4>
                    <div className="space-y-2">
                      {TOGGLE_FIELDS.filter(f => f.id.startsWith('nc-cust')).map(f => (
                        <label key={f.id} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={toggles[f.id]} 
                            onChange={() => toggleField(f.id)}
                            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          {f.label}
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Totals & Taxes */}
                  <div>
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Taxes & Discounts</h4>
                    <div className="space-y-2">
                      {TOGGLE_FIELDS.filter(f => f.id === 'nc-discount' || f.id.includes('gst')).map(f => (
                        <label key={f.id} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={toggles[f.id]} 
                            onChange={() => toggleField(f.id)}
                            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          {f.label}
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Other */}
                  <div>
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Additional</h4>
                    <div className="space-y-2">
                      {TOGGLE_FIELDS.filter(f => f.id === 'nc-bank' || f.id === 'nc-notes').map(f => (
                        <label key={f.id} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={toggles[f.id]} 
                            onChange={() => toggleField(f.id)}
                            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          {f.label}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer Section */}
            <div className="border-b border-gray-200">
              <button 
                onClick={() => setActiveSection('footer')}
                className="w-full p-4 flex justify-between items-center bg-white hover:bg-gray-50 transition-colors"
              >
                <span className="font-semibold text-gray-700 flex items-center gap-2"><AlignLeft className="w-4 h-4" /> Footer Text</span>
              </button>
              {activeSection === 'footer' && (
                <div className="p-4 pt-0 bg-gray-50/50">
                  <textarea 
                    value={footerText}
                    onChange={e => setFooterText(e.target.value)}
                    className="w-full h-24 text-sm border-gray-300 rounded focus:ring-indigo-500 focus:border-indigo-500 p-2"
                    placeholder="Enter closing text..."
                  />
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Right Panel (Live Preview) */}
        <div className="flex-1 bg-gray-200 overflow-auto p-8 flex justify-center items-start relative">
          {previewing && (
            <div className="absolute top-4 right-4 bg-white/90 px-3 py-1.5 rounded-full shadow-md flex items-center gap-2 text-sm text-indigo-600 font-medium z-10 backdrop-blur">
              <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
              Updating preview...
            </div>
          )}
          
          <div className="bg-white shadow-2xl w-[210mm] min-h-[297mm] overflow-hidden transition-all duration-300 relative border border-gray-300 ring-1 ring-black/5">
            <iframe 
              srcDoc={previewHtml} 
              className="w-full h-full border-none absolute inset-0"
              title="Invoice Preview"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
