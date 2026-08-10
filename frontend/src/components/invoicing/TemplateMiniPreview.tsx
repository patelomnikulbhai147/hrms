import React, { useEffect, useState, useRef } from 'react';
import { renderInvoiceHtml } from './invoiceRender';
import { qrDataUrl } from '@/utils/cardCodes';

interface TemplateMiniPreviewProps {
  content: string;
}

// A robust client-side mini Handlebars engine just for the gallery preview
// It safely replaces all standard {{variable}} tags with sample data,
// and specifically handles the {{#each items}} block.
const renderClientSidePreview = (html: string): string => {
  const sampleData: any = {
    'company.logo': 'https://placehold.co/200x80/6366f1/ffffff?text=VISHV+ENTERPRISE',
    'company.name': 'Vishv Enterprise',
    'company.address': '123 Business Avenue, Tech Park, City - 400001',
    'company.gstin': '27AADCB2230M1Z2',
    'company.contactEmail': 'billing@vishventerprise.com',
    'company.contactNumber': '+91 98765 43210',
    'invoice.invoiceNumber': 'INV-2026-001',
    'date invoice.invoiceDate': '08 Aug 2026',
    'date invoice.dueDate': '15 Aug 2026',
    'invoice.billToName': 'Sample Customer Ltd',
    'invoice.billToAddress': '456 Client Road, Suite 100',
    'invoice.billToGstin': '29ABCDE1234F1Z5',
    'money invoice.subtotal': '₹1,000.00',
    'money invoice.discountTotal': '₹0.00',
    'money invoice.cgst': '₹90.00',
    'money invoice.sgst': '₹90.00',
    'money invoice.igst': '₹0.00',
    'money invoice.grandTotal': '₹1,180.00',
    'invoice.bankDetails': 'Bank: HDFC Bank\\nAccount: 1234567890\\nIFSC: HDFC0001234',
    'invoice.notes': 'Thank you for your business!'
  };

  const sampleItems = [
    { name: 'Professional Service', description: 'Consulting fees for August', quantity: '2', rate: '₹500.00', amount: '₹1,000.00' }
  ];

  let rendered = html || '';

  // 1. Process {{#each items}} ... {{/each}}
  const eachRegex = /\{\{#each items\}\}([\s\S]*?)\{\{\/each\}\}/g;
  rendered = rendered.replace(eachRegex, (match, blockContent) => {
    return sampleItems.map(item => {
      let itemBlock = blockContent;
      itemBlock = itemBlock.replace(/\{\{this\.name\}\}/g, item.name);
      itemBlock = itemBlock.replace(/\{\{#if this\.description\}\}([\s\S]*?)\{\{\/if\}\}/g, (m: any, content: string) => {
        return content.replace(/\{\{this\.description\}\}/g, item.description);
      });
      itemBlock = itemBlock.replace(/\{\{this\.description\}\}/g, item.description);
      itemBlock = itemBlock.replace(/\{\{this\.quantity\}\}/g, item.quantity);
      itemBlock = itemBlock.replace(/\{\{money this\.rate\}\}/g, item.rate);
      itemBlock = itemBlock.replace(/\{\{money this\.amount\}\}/g, item.amount);
      return itemBlock;
    }).join('');
  });

  // 2. Process all {{#if ...}} ... {{/if}}
  const ifRegex = /\{\{#if ([^}]+)\}\}([\s\S]*?)\{\{\/if\}\}/g;
  rendered = rendered.replace(ifRegex, (match, condition, blockContent) => {
    // We assume everything in sampleData exists and is truthy for the preview.
    // If we want to hide it, we could check sampleData[condition.trim()], but for preview we show everything.
    return blockContent;
  });

  // 3. Process all basic {{variable}} replacements
  const varRegex = /\{\{([^}]+)\}\}/g;
  rendered = rendered.replace(varRegex, (match, variable) => {
    const key = variable.trim();
    if (key === 'else') return ''; // Clean up stray {{else}} from conditionals
    return sampleData[key] !== undefined ? sampleData[key] : '';
  });

  // 4. Ensure we don't have broken image links if logo is removed, fallback to text
  rendered = rendered.replace(/<img src=""[^>]*>/g, '<div style="font-size: 24px; font-weight: bold; color: #6366f1;">INVOICE</div>');

  return rendered;
};

export const TemplateMiniPreview: React.FC<TemplateMiniPreviewProps> = ({ content }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.35); // Fallback scale
  const [html, setHtml] = useState('');

  // Calculate dynamic scale based on container width to maintain 800px aspect ratio
  useEffect(() => {
    if (!containerRef.current) return;
    
    const observer = new ResizeObserver((entries) => {
      const { width } = entries[0].contentRect;
      // If the container is 300px wide, and our target is 800px: 300 / 800 = 0.375
      if (width > 0) {
        setScale(width / 800);
      }
    });
    
    observer.observe(containerRef.current);
    
    // Initial scale calculation
    const width = containerRef.current.clientWidth;
    if (width > 0) {
      setScale(width / 800);
    }
    
    return () => observer.disconnect();
  }, []);

  // Client-side render on content change
  useEffect(() => {
    // Quick microtask delay just to avoid blocking the main thread heavily on 8 simultaneous renders
    const timer = setTimeout(() => {
      let renderedHtml = '';
      try {
        const parsed = JSON.parse(content);
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
            discountTotal: 0.00,
            cgst: 90.00,
            sgst: 90.00,
            igst: 0.00,
            grandTotal: 1180.00,
            bankDetails: 'Bank: HDFC Bank\nAccount: 1234567890\nIFSC: HDFC0001234',
            notes: 'Thank you for your business!',
            items: [
              { description: 'Professional Service', quantity: 2, rate: 500.00, amount: 1000.00 }
            ]
          };

          renderedHtml = renderInvoiceHtml(
            sampleInvoice, 
            sampleCompany, 
            undefined, // no legacy design
            { blocks }, // layout
            { print: false, qrDataUrl: qrDataUrl(sampleInvoice.invoiceNumber, 200) }
          );
        } else {
          // Fallback to old HTML rendering if needed
          renderedHtml = renderClientSidePreview(content);
        }
      } catch (e) {
        // Not JSON, so it's HTML
        renderedHtml = renderClientSidePreview(content);
      }
      setHtml(renderedHtml);
    }, 10);
    return () => clearTimeout(timer);
  }, [content]);

  if (!html) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 bg-gray-100">
        <div className="w-6 h-6 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin mb-2"></div>
        <span className="text-xs font-medium">Loading Preview</span>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden bg-white">
      {/* 
        We want the iframe to look like a mini A4 page. 
        A4 aspect ratio is ~1:1.414 (e.g. 210mm x 297mm).
        We make the iframe exactly 800px x 1130px, and scale it down to exactly fit the parent container's width.
      */}
      <div 
        className="absolute top-0 left-0 origin-top-left pointer-events-none" 
        style={{ 
          width: '800px', 
          height: '1130px', 
          transform: "scale(" + scale + ")" 
        }}
      >
        <iframe 
          srcDoc={html} 
          className="w-full h-full border-none pointer-events-none" 
          tabIndex={-1}
          title="Mini Preview"
        />
      </div>
    </div>
  );
};
