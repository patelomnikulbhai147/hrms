import React, { useEffect, useState } from 'react';
import { api } from '@/api/apiClient';
import { renderInvoiceHtml } from './invoiceRender';
import { qrDataUrl } from '@/utils/cardCodes';
import { X, Check } from 'lucide-react';

interface TemplatePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  templateName: string;
  templateContent: string;
  onUseTemplate: () => void;
  onCustomize: () => void;
  isCustomizing?: boolean;
}

export const TemplatePreviewModal: React.FC<TemplatePreviewModalProps> = ({
  isOpen,
  onClose,
  templateName,
  templateContent,
  onUseTemplate,
  onCustomize,
  isCustomizing = false
}) => {
  const [previewHtml, setPreviewHtml] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!isOpen || !templateContent) return;

    const fetchPreview = async () => {
      setLoading(true);
      try {
        let parsed: any = null;
        try {
          parsed = JSON.parse(templateContent);
        } catch (e) {
          // If it fails to parse as JSON, maybe it is HTML. We'll handle it.
        }

        if (parsed && (parsed.elements || parsed.blocks || Array.isArray(parsed))) {
          // This is a JSON layout. We use renderInvoiceHtml.
          const blocks = parsed.elements || parsed.blocks || (Array.isArray(parsed) ? parsed : []);
          
          const sampleCompany = {
            name: 'Vishv Enterprise',
            address: '123 Business Avenue, Tech Park, City - 400001',
            gstNumber: '27AADCB2230M1Z2',
            contactEmail: 'billing@vishventerprise.com',
            contactNumber: '+91 98765 43210'
          };
          
          const sampleInvoice = {
            invoiceNumber: 'INV-2026-001',
            invoiceDate: '2026-08-08',
            dueDate: '2026-08-15',
            billToName: 'Sample Customer Ltd',
            billToAddress: '456 Client Road, Suite 100',
            billToGstin: '29ABCDE1234F1Z5',
            subtotal: 1000.00,
            discountTotal: 500.00,
            cgst: 855.00,
            sgst: 855.00,
            igst: 0.00,
            grandTotal: 11210.00,
            bankDetails: 'Bank: HDFC Bank\nAccount: 1234567890\nIFSC: HDFC0001234',
            notes: 'Thank you for your business!',
            items: [
              { description: 'Web Development Services', quantity: 1, rate: 5000.00, amount: 5000.00 },
              { description: 'Server Hosting', quantity: 12, rate: 416.67, amount: 5000.00 }
            ]
          };

          const html = renderInvoiceHtml(
            sampleInvoice, 
            sampleCompany, 
            undefined, // no legacy design
            { blocks }, // layout
            { print: false, qrDataUrl: qrDataUrl(sampleInvoice.invoiceNumber, 200) }
          );
          setPreviewHtml(html);
        } else {
          // Fallback to backend API preview for HTML
          const html = await api.invoiceTemplates.preview(templateContent);
          setPreviewHtml(html);
        }
      } catch (err) {
        console.error('[TemplatePreview]', err);
        setPreviewHtml('<div style="color:red; padding: 20px; font-family: sans-serif;">Unable to preview template.<br/><br/><button onclick="window.location.reload()">Retry</button></div>');
      } finally {
        setLoading(false);
      }
    };

    fetchPreview();
  }, [isOpen, templateContent]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-bold text-gray-800">{templateName}</h2>
            <p className="text-sm text-gray-500">Live Preview with Sample Data</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500 hover:text-gray-700">
            <X className="w-6 h-6" />
          </button>
        </div>
        
        <div className="flex-1 bg-gray-100 overflow-auto p-8 flex justify-center">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : (
            <div 
              className="bg-white shadow-lg w-[210mm] min-h-[297mm] overflow-hidden" 
              style={{ padding: '0' }}
            >
              <iframe 
                srcDoc={previewHtml} 
                className="w-full h-full border-none"
                title="Invoice Preview"
                style={{ width: '100%', height: '100%', display: 'block', minHeight: '297mm' }}
              />
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-between items-center">
          {!isCustomizing && (
            <button 
              onClick={onCustomize}
              className="px-6 py-2 border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 rounded-lg font-medium transition-colors"
            >
              Customize
            </button>
          )}
          
          <div className="flex gap-3 ml-auto">
            <button 
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 rounded-lg font-medium transition-colors"
            >
              Cancel
            </button>
            <button 
              onClick={onUseTemplate}
              className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              <Check className="w-5 h-5" />
              Use This Template
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
