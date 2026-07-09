import { CanvasElement } from '../invoiceTemplate';

const A4_W = 794;
const A4_H = 1123;

function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

export const CATEGORIES = [
  'Business', 'Corporate', 'Retail', 'Service', 'IT', 'Manufacturing', 
  'Logistics', 'Healthcare', 'Education', 'Restaurant', 'Construction', 'Finance'
];

export interface TemplateDef {
  id: string;
  name: string;
  category: string;
  thumbnailColor: string;
  elements: CanvasElement[];
}

function createTemplate(id: string, name: string, category: string, color: string, layout: 'split' | 'centered' | 'banner' | 'sidebar-left' | 'sidebar-right' | 'boxed'): TemplateDef {
  const elements: CanvasElement[] = [];
  const primaryColor = color;
  
  // Helper to add element
  const add = (el: Partial<CanvasElement>) => {
    elements.push({
      id: generateId(), type: 'text', name: 'Element',
      x: 0, y: 0, w: 100, h: 50, rotation: 0, opacity: 1, visible: true, locked: false, zIndex: elements.length + 1,
      ...el
    } as CanvasElement);
  };

  const margin = 40;
  let currentY = margin;

  if (layout === 'banner') {
    // Top banner
    add({ type: 'rect', x: 0, y: 0, w: A4_W, h: 140, bg: primaryColor, borderWidth: 0 });
    add({ type: 'logo', x: margin, y: 20, w: 150, h: 60, zIndex: 10 });
    add({ type: 'text', content: 'TAX INVOICE', x: A4_W - margin - 250, y: 30, w: 250, h: 40, fontSize: 32, color: '#ffffff', align: 'right', fontWeight: 'bold', zIndex: 10 });
    add({ type: 'companyDetails', x: margin, y: 90, w: 300, h: 40, color: '#ffffff', zIndex: 10 });
    currentY = 160;
    
    add({ type: 'customerDetails', x: margin, y: currentY, w: 300, h: 120 });
    add({ type: 'qr', x: A4_W - margin - 100, y: currentY, w: 100, h: 100 });
    currentY += 140;
  } 
  else if (layout === 'sidebar-left') {
    // Left sidebar
    const sbW = 220;
    add({ type: 'rect', x: 0, y: 0, w: sbW, h: A4_H, bg: primaryColor, borderWidth: 0 });
    add({ type: 'logo', x: 20, y: margin, w: sbW - 40, h: 80, zIndex: 10 });
    add({ type: 'companyDetails', x: 20, y: margin + 100, w: sbW - 40, h: 150, color: '#ffffff', zIndex: 10 });
    add({ type: 'bankDetails', x: 20, y: A4_H - 250, w: sbW - 40, h: 150, color: '#ffffff', zIndex: 10 });
    
    // Main content area
    add({ type: 'text', content: 'INVOICE', x: sbW + margin, y: margin, w: 300, h: 40, fontSize: 36, color: primaryColor, fontWeight: 'bold' });
    add({ type: 'customerDetails', x: sbW + margin, y: margin + 60, w: 300, h: 120 });
    add({ type: 'qr', x: A4_W - margin - 100, y: margin, w: 100, h: 100 });
    currentY = margin + 200;
  }
  else if (layout === 'sidebar-right') {
    // Right sidebar
    const sbW = 220;
    const sbX = A4_W - sbW;
    add({ type: 'rect', x: sbX, y: 0, w: sbW, h: A4_H, bg: primaryColor, borderWidth: 0 });
    add({ type: 'logo', x: sbX + 20, y: margin, w: sbW - 40, h: 80, zIndex: 10 });
    add({ type: 'companyDetails', x: sbX + 20, y: margin + 100, w: sbW - 40, h: 150, color: '#ffffff', zIndex: 10 });
    add({ type: 'bankDetails', x: sbX + 20, y: A4_H - 250, w: sbW - 40, h: 150, color: '#ffffff', zIndex: 10 });
    
    // Main content area
    add({ type: 'text', content: 'INVOICE', x: margin, y: margin, w: 300, h: 40, fontSize: 36, color: primaryColor, fontWeight: 'bold' });
    add({ type: 'customerDetails', x: margin, y: margin + 60, w: 300, h: 120 });
    currentY = margin + 200;
  }
  else if (layout === 'centered') {
    // Centered header
    add({ type: 'logo', x: (A4_W - 150) / 2, y: margin, w: 150, h: 80 });
    add({ type: 'text', content: 'INVOICE', x: (A4_W - 200) / 2, y: margin + 90, w: 200, h: 30, fontSize: 24, color: primaryColor, align: 'center', fontWeight: 'bold' });
    add({ type: 'companyDetails', x: (A4_W - 400) / 2, y: margin + 130, w: 400, h: 60, textAlign: 'center' });
    add({ type: 'line', x: margin, y: margin + 200, w: A4_W - (margin * 2), h: 2, bg: primaryColor });
    currentY = margin + 220;
    
    add({ type: 'customerDetails', x: margin, y: currentY, w: 300, h: 120 });
    add({ type: 'qr', x: A4_W - margin - 100, y: currentY, w: 100, h: 100 });
    currentY += 140;
  }
  else if (layout === 'boxed') {
    // Modern Boxed
    add({ type: 'rect', x: margin, y: margin, w: A4_W - (margin * 2), h: 140, bg: '#f8fafc', borderColor: primaryColor, borderWidth: 2, borderRadius: 12 });
    add({ type: 'logo', x: margin + 20, y: margin + 20, w: 150, h: 60 });
    add({ type: 'companyDetails', x: margin + 20, y: margin + 90, w: 300, h: 40 });
    add({ type: 'text', content: 'INVOICE', x: A4_W - margin - 220, y: margin + 20, w: 200, h: 40, fontSize: 32, color: primaryColor, align: 'right', fontWeight: 'bold' });
    currentY = margin + 160;
    
    add({ type: 'rect', x: margin, y: currentY, w: (A4_W - margin * 3) / 2, h: 140, bg: '#ffffff', borderColor: '#e5e7eb', borderWidth: 1, borderRadius: 8 });
    add({ type: 'text', content: 'BILL TO', x: margin + 15, y: currentY + 15, w: 100, h: 20, fontSize: 10, color: primaryColor, fontWeight: 'bold' });
    add({ type: 'customerDetails', x: margin + 15, y: currentY + 40, w: 300, h: 90 });
    
    add({ type: 'rect', x: margin * 2 + ((A4_W - margin * 3) / 2), y: currentY, w: (A4_W - margin * 3) / 2, h: 140, bg: '#ffffff', borderColor: '#e5e7eb', borderWidth: 1, borderRadius: 8 });
    add({ type: 'qr', x: A4_W - margin - 120, y: currentY + 20, w: 100, h: 100 });
    currentY += 160;
  }
  else {
    // Default split
    add({ type: 'logo', x: margin, y: margin, w: 180, h: 70 });
    add({ type: 'text', content: 'TAX INVOICE', x: A4_W - margin - 250, y: margin, w: 250, h: 40, fontSize: 36, color: primaryColor, align: 'right', fontWeight: 'bold' });
    add({ type: 'companyDetails', x: margin, y: margin + 80, w: 300, h: 100 });
    add({ type: 'customerDetails', x: A4_W - margin - 300, y: margin + 80, w: 300, h: 100, textAlign: 'right' });
    currentY = margin + 200;
  }

  // Common body elements
  const contentW = layout === 'sidebar-left' || layout === 'sidebar-right' ? A4_W - margin - 220 - margin : A4_W - (margin * 2);
  const contentX = layout === 'sidebar-left' ? 220 + margin : margin;

  add({ type: 'itemTable', x: contentX, y: currentY, w: contentW, h: 200 });
  currentY += 220;

  add({ type: 'totals', x: contentX + contentW - 250, y: currentY, w: 250, h: 140 });
  
  if (layout !== 'sidebar-left' && layout !== 'sidebar-right') {
    add({ type: 'bankDetails', x: contentX, y: currentY, w: 300, h: 100 });
    currentY += 160;
  } else {
    currentY += 160;
  }

  add({ type: 'terms', x: contentX, y: currentY, w: contentW - 200, h: 80 });
  add({ type: 'signature', x: contentX + contentW - 200, y: currentY, w: 200, h: 80 });
  
  add({ type: 'stamp', x: contentX + contentW - 250, y: currentY - 50, w: 100, h: 100, opacity: 0.5 });
  
  // Footer line
  if (layout !== 'sidebar-left' && layout !== 'sidebar-right' && layout !== 'banner') {
    add({ type: 'line', x: margin, y: A4_H - margin - 40, w: A4_W - (margin * 2), h: 2, bg: primaryColor });
  }

  return { id, name, category, thumbnailColor: primaryColor, elements };
}

const TEMPLATE_CONFIGS = [
  { id: 'corp-blue', name: 'Corporate Blue', cat: 'Corporate', color: '#1e3a8a', layout: 'split' },
  { id: 'modern-biz', name: 'Modern Business', cat: 'Business', color: '#111827', layout: 'banner' },
  { id: 'retail-gst', name: 'GST Retail', cat: 'Retail', color: '#16a34a', layout: 'boxed' },
  { id: 'tech-minimal', name: 'Tech Minimal', cat: 'IT', color: '#334155', layout: 'centered' },
  { id: 'service-pro', name: 'Service Professional', cat: 'Service', color: '#ea580c', layout: 'sidebar-left' },
  { id: 'factory-std', name: 'Factory Standard', cat: 'Manufacturing', color: '#b91c1c', layout: 'split' },
  { id: 'logistics-export', name: 'Export Invoice', cat: 'Logistics', color: '#0369a1', layout: 'banner' },
  { id: 'health-clinic', name: 'Clinic Invoice', cat: 'Healthcare', color: '#0d9488', layout: 'sidebar-right' },
  { id: 'edu-receipt', name: 'Institute Receipt', cat: 'Education', color: '#4338ca', layout: 'centered' },
  { id: 'resto-bill', name: 'Restaurant Bill', cat: 'Restaurant', color: '#be123c', layout: 'boxed' },
  { id: 'const-estimate', name: 'Construction Estimate', cat: 'Construction', color: '#ca8a04', layout: 'split' },
  { id: 'finance-tax', name: 'Tax Invoice', cat: 'Finance', color: '#0f766e', layout: 'sidebar-left' },
  
  { id: 'exec-dark', name: 'Executive Dark', cat: 'Corporate', color: '#111827', layout: 'banner' },
  { id: 'clean-white', name: 'Clean White', cat: 'Business', color: '#6b7280', layout: 'split' },
  { id: 'pos-receipt', name: 'POS Bill', cat: 'Retail', color: '#d97706', layout: 'centered' },
  { id: 'software-amc', name: 'Software AMC', cat: 'IT', color: '#6d28d9', layout: 'sidebar-right' },
  { id: 'consult-pro', name: 'Consulting Pro', cat: 'Service', color: '#0369a1', layout: 'boxed' },
  { id: 'warehouse-del', name: 'Delivery Challan', cat: 'Manufacturing', color: '#c2410c', layout: 'banner' },
  { id: 'cargo-manifest', name: 'Cargo Invoice', cat: 'Logistics', color: '#4c1fd4', layout: 'split' },
  { id: 'hospital-care', name: 'Hospital Care', cat: 'Healthcare', color: '#0f766e', layout: 'centered' },
  { id: 'school-fee', name: 'School Fee', cat: 'Education', color: '#b45309', layout: 'sidebar-left' },
  { id: 'cafe-receipt', name: 'Cafe Receipt', cat: 'Restaurant', color: '#b91c1c', layout: 'banner' },
  { id: 'builder-quote', name: 'Builder Quotation', cat: 'Construction', color: '#4d7c0f', layout: 'boxed' },
  { id: 'proforma-inv', name: 'Proforma', cat: 'Finance', color: '#6c3cf0', layout: 'split' },
  
  { id: 'agency-creative', name: 'Creative Agency', cat: 'Business', color: '#ec4899', layout: 'sidebar-left' },
  { id: 'freelance-min', name: 'Freelancer', cat: 'Service', color: '#14b8a6', layout: 'centered' },
  { id: 'wholesale-inv', name: 'Wholesale Invoice', cat: 'Retail', color: '#1e40af', layout: 'banner' },
  { id: 'oem-supply', name: 'OEM Supply', cat: 'Manufacturing', color: '#7f1d1d', layout: 'boxed' },
  { id: 'transport-bill', name: 'Transport Bill', cat: 'Logistics', color: '#854d0e', layout: 'sidebar-right' },
  { id: 'credit-note', name: 'Credit Note', cat: 'Finance', color: '#6b7280', layout: 'split' }
] as const;

export const MASTER_TEMPLATES: TemplateDef[] = TEMPLATE_CONFIGS.map(c => 
  createTemplate(c.id, c.name, c.cat, c.color, c.layout as any)
);
