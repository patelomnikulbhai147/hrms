import { CanvasElement } from './invoiceTemplate';

const A4_W = 794;
const A4_H = 1123;
const GRID = 10;

function genId() { return Math.random().toString(36).substr(2, 9); }

type LayoutStyle = 'standard' | 'centered' | 'modern-split' | 'minimal' | 'banner';

function generateTemplateElements(style: LayoutStyle, colors: { bg: string; primary: string; secondary: string; text: string; tableHeaderBg: string }): CanvasElement[] {
  const els: CanvasElement[] = [];
  
  if (style === 'banner') {
    els.push({ id: genId(), type: 'rect', name: 'Header Banner', x: 0, y: 0, w: A4_W, h: 120, bg: colors.primary, opacity: 1, zIndex: 1, visible: true, locked: true, rotation: 0 });
    els.push({ id: genId(), type: 'logo', name: 'Company Logo', x: 40, y: 30, w: 180, h: 60, opacity: 1, zIndex: 2, visible: true, locked: false, rotation: 0 });
    els.push({ id: genId(), type: 'text', name: 'INVOICE Title', content: '<span style="font-size:24px; font-weight:bold; color:white;">INVOICE</span>', x: A4_W - 200, y: 40, w: 160, h: 40, color: '#fff', textAlign: 'right', opacity: 1, zIndex: 2, visible: true, locked: false, rotation: 0 });
    
    els.push({ id: genId(), type: 'companyDetails', name: 'Company Details', x: 40, y: 140, w: 250, h: 100, fontSize: 11, color: colors.text, opacity: 1, zIndex: 3, visible: true, locked: false, rotation: 0 });
    els.push({ id: genId(), type: 'customerDetails', name: 'Bill To', x: 40, y: 260, w: 250, h: 100, fontSize: 11, color: colors.text, opacity: 1, zIndex: 3, visible: true, locked: false, rotation: 0 });
    
    els.push({ id: genId(), type: 'itemTable', name: 'Item Table', x: 40, y: 380, w: A4_W - 80, h: 200, bg: '#fff', tableCols: [], zIndex: 4, opacity: 1, visible: true, locked: false, rotation: 0 });
    els.push({ id: genId(), type: 'totals', name: 'Totals', x: A4_W - 290, y: 600, w: 250, h: 120, zIndex: 5, opacity: 1, visible: true, locked: false, rotation: 0 });
    els.push({ id: genId(), type: 'bankDetails', name: 'Bank Details', x: 40, y: 600, w: 250, h: 80, fontSize: 10, color: colors.text, zIndex: 5, opacity: 1, visible: true, locked: false, rotation: 0 });
  } 
  else if (style === 'centered') {
    els.push({ id: genId(), type: 'logo', name: 'Company Logo', x: (A4_W - 180) / 2, y: 40, w: 180, h: 60, opacity: 1, zIndex: 2, visible: true, locked: false, rotation: 0 });
    els.push({ id: genId(), type: 'companyDetails', name: 'Company Details', x: (A4_W - 300) / 2, y: 110, w: 300, h: 80, textAlign: 'center', fontSize: 11, color: colors.text, opacity: 1, zIndex: 3, visible: true, locked: false, rotation: 0 });
    els.push({ id: genId(), type: 'line', name: 'Divider', x: 40, y: 200, w: A4_W - 80, h: 10, borderWidth: 2, borderColor: colors.secondary, borderStyle: 'solid', opacity: 1, zIndex: 2, visible: true, locked: false, rotation: 0 });
    
    els.push({ id: genId(), type: 'customerDetails', name: 'Bill To', x: 40, y: 220, w: 250, h: 100, fontSize: 11, color: colors.text, opacity: 1, zIndex: 3, visible: true, locked: false, rotation: 0 });
    els.push({ id: genId(), type: 'text', name: 'INVOICE Title', content: '<span style="font-size:20px; font-weight:bold; color:'+colors.primary+';">INVOICE</span><br/>#INV-0001', x: A4_W - 200, y: 220, w: 160, h: 60, textAlign: 'right', opacity: 1, zIndex: 2, visible: true, locked: false, rotation: 0 });
    
    els.push({ id: genId(), type: 'itemTable', name: 'Item Table', x: 40, y: 340, w: A4_W - 80, h: 200, bg: '#fff', tableCols: [], zIndex: 4, opacity: 1, visible: true, locked: false, rotation: 0 });
    els.push({ id: genId(), type: 'totals', name: 'Totals', x: A4_W - 290, y: 560, w: 250, h: 120, zIndex: 5, opacity: 1, visible: true, locked: false, rotation: 0 });
    
    els.push({ id: genId(), type: 'terms', name: 'Terms', x: 40, y: 700, w: 300, h: 60, fontSize: 9, color: '#666', opacity: 1, zIndex: 5, visible: true, locked: false, rotation: 0 });
    els.push({ id: genId(), type: 'signature', name: 'Signature', x: A4_W - 190, y: 700, w: 150, h: 80, opacity: 1, zIndex: 5, visible: true, locked: false, rotation: 0 });
  }
  else if (style === 'modern-split') {
    els.push({ id: genId(), type: 'rect', name: 'Left Sidebar BG', x: 0, y: 0, w: 220, h: A4_H, bg: colors.primary, opacity: 1, zIndex: 1, visible: true, locked: true, rotation: 0 });
    els.push({ id: genId(), type: 'logo', name: 'Logo', x: 20, y: 40, w: 180, h: 60, opacity: 1, zIndex: 2, visible: true, locked: false, rotation: 0 });
    els.push({ id: genId(), type: 'companyDetails', name: 'Company Details', x: 20, y: 120, w: 180, h: 120, fontSize: 10, color: '#ffffff', opacity: 1, zIndex: 3, visible: true, locked: false, rotation: 0 });
    els.push({ id: genId(), type: 'bankDetails', name: 'Bank Details', x: 20, y: 260, w: 180, h: 100, fontSize: 10, color: '#ffffff', opacity: 1, zIndex: 3, visible: true, locked: false, rotation: 0 });
    els.push({ id: genId(), type: 'qr', name: 'QR Code', x: 60, y: 380, w: 100, h: 100, opacity: 1, zIndex: 3, visible: true, locked: false, rotation: 0 });
    
    els.push({ id: genId(), type: 'text', name: 'Title', content: '<span style="font-size:28px; font-weight:300; letter-spacing:2px; color:'+colors.secondary+';">INVOICE</span>', x: 260, y: 40, w: 200, h: 40, textAlign: 'left', opacity: 1, zIndex: 2, visible: true, locked: false, rotation: 0 });
    els.push({ id: genId(), type: 'customerDetails', name: 'Bill To', x: 260, y: 100, w: 300, h: 100, fontSize: 11, color: colors.text, opacity: 1, zIndex: 3, visible: true, locked: false, rotation: 0 });
    
    els.push({ id: genId(), type: 'itemTable', name: 'Item Table', x: 260, y: 220, w: A4_W - 300, h: 300, bg: '#fff', tableCols: [], zIndex: 4, opacity: 1, visible: true, locked: false, rotation: 0 });
    els.push({ id: genId(), type: 'totals', name: 'Totals', x: A4_W - 290, y: 540, w: 250, h: 120, zIndex: 5, opacity: 1, visible: true, locked: false, rotation: 0 });
    els.push({ id: genId(), type: 'signature', name: 'Signature', x: 260, y: 540, w: 150, h: 80, opacity: 1, zIndex: 5, visible: true, locked: false, rotation: 0 });
  }
  else if (style === 'minimal') {
    els.push({ id: genId(), type: 'logo', name: 'Logo', x: 40, y: 40, w: 120, h: 40, opacity: 1, zIndex: 2, visible: true, locked: false, rotation: 0 });
    els.push({ id: genId(), type: 'text', name: 'Title', content: '<span style="font-size:16px; font-weight:bold; text-transform:uppercase;">Invoice</span><br/><span style="color:#666">INV-0001</span>', x: A4_W - 200, y: 40, w: 160, h: 40, textAlign: 'right', opacity: 1, zIndex: 2, visible: true, locked: false, rotation: 0 });
    
    els.push({ id: genId(), type: 'customerDetails', name: 'Bill To', x: 40, y: 120, w: 200, h: 80, fontSize: 10, color: colors.text, opacity: 1, zIndex: 3, visible: true, locked: false, rotation: 0 });
    els.push({ id: genId(), type: 'companyDetails', name: 'From', x: A4_W - 240, y: 120, w: 200, h: 80, textAlign: 'right', fontSize: 10, color: colors.text, opacity: 1, zIndex: 3, visible: true, locked: false, rotation: 0 });
    
    els.push({ id: genId(), type: 'itemTable', name: 'Item Table', x: 40, y: 220, w: A4_W - 80, h: 150, bg: 'transparent', tableCols: [], zIndex: 4, opacity: 1, visible: true, locked: false, rotation: 0 });
    
    els.push({ id: genId(), type: 'totals', name: 'Totals', x: A4_W - 290, y: 390, w: 250, h: 100, zIndex: 5, opacity: 1, visible: true, locked: false, rotation: 0 });
    els.push({ id: genId(), type: 'bankDetails', name: 'Bank Details', x: 40, y: 390, w: 250, h: 80, fontSize: 10, color: colors.text, zIndex: 5, opacity: 1, visible: true, locked: false, rotation: 0 });
    els.push({ id: genId(), type: 'terms', name: 'Terms', x: 40, y: 490, w: A4_W - 80, h: 40, fontSize: 8, color: '#999', opacity: 1, zIndex: 5, visible: true, locked: false, rotation: 0 });
  }
  else { // standard
    els.push({ id: genId(), type: 'logo', name: 'Logo', x: 40, y: 40, w: 180, h: 60, opacity: 1, zIndex: 2, visible: true, locked: false, rotation: 0 });
    els.push({ id: genId(), type: 'text', name: 'Title', content: '<span style="font-size:24px; font-weight:bold; color:'+colors.primary+';">TAX INVOICE</span>', x: A4_W - 240, y: 40, w: 200, h: 40, textAlign: 'right', opacity: 1, zIndex: 2, visible: true, locked: false, rotation: 0 });
    
    els.push({ id: genId(), type: 'companyDetails', name: 'Company Details', x: 40, y: 120, w: 250, h: 100, fontSize: 11, color: colors.text, opacity: 1, zIndex: 3, visible: true, locked: false, rotation: 0 });
    els.push({ id: genId(), type: 'customerDetails', name: 'Bill To', x: A4_W - 290, y: 120, w: 250, h: 100, textAlign: 'right', fontSize: 11, color: colors.text, opacity: 1, zIndex: 3, visible: true, locked: false, rotation: 0 });
    
    els.push({ id: genId(), type: 'itemTable', name: 'Item Table', x: 40, y: 240, w: A4_W - 80, h: 250, bg: '#fff', tableCols: [], zIndex: 4, opacity: 1, visible: true, locked: false, rotation: 0 });
    
    els.push({ id: genId(), type: 'totals', name: 'Totals', x: A4_W - 290, y: 510, w: 250, h: 120, zIndex: 5, opacity: 1, visible: true, locked: false, rotation: 0 });
    els.push({ id: genId(), type: 'bankDetails', name: 'Bank Details', x: 40, y: 510, w: 250, h: 80, fontSize: 10, color: colors.text, zIndex: 5, opacity: 1, visible: true, locked: false, rotation: 0 });
    
    els.push({ id: genId(), type: 'signature', name: 'Signature', x: A4_W - 190, y: 650, w: 150, h: 80, opacity: 1, zIndex: 5, visible: true, locked: false, rotation: 0 });
    els.push({ id: genId(), type: 'terms', name: 'Terms', x: 40, y: 650, w: 300, h: 60, fontSize: 9, color: '#666', opacity: 1, zIndex: 5, visible: true, locked: false, rotation: 0 });
  }
  
  return els;
}

export const CANVAS_TEMPLATES = [
  // Business / Corporate
  { id: 'tpl_bus_1', name: 'Business Classic', category: 'Business', style: 'standard', bg: '#ffffff', colors: { bg: '#fff', primary: '#1e3a8a', secondary: '#6c3cf0', text: '#333', tableHeaderBg: '#f1f5f9' } },
  { id: 'tpl_bus_2', name: 'Corporate Professional', category: 'Business', style: 'banner', bg: '#ffffff', colors: { bg: '#fff', primary: '#111827', secondary: '#6b7280', text: '#333', tableHeaderBg: '#f1f5f9' } },
  { id: 'tpl_bus_3', name: 'Modern Business', category: 'Business', style: 'modern-split', bg: '#ffffff', colors: { bg: '#fff', primary: '#2563eb', secondary: '#1e40af', text: '#333', tableHeaderBg: '#f1f5f9' } },
  { id: 'tpl_bus_4', name: 'Executive', category: 'Business', style: 'centered', bg: '#ffffff', colors: { bg: '#fff', primary: '#334155', secondary: '#9ca3af', text: '#333', tableHeaderBg: '#f8fafc' } },
  
  // Minimal / Clean
  { id: 'tpl_min_1', name: 'Minimal Mono', category: 'Minimal', style: 'minimal', bg: '#ffffff', colors: { bg: '#fff', primary: '#000000', secondary: '#666666', text: '#333', tableHeaderBg: '#fafafa' } },
  { id: 'tpl_min_2', name: 'Clean Professional', category: 'Minimal', style: 'minimal', bg: '#ffffff', colors: { bg: '#fff', primary: '#475569', secondary: '#9ca3af', text: '#475569', tableHeaderBg: '#f8fafc' } },
  
  // Retail / GST
  { id: 'tpl_ret_1', name: 'Retail POS', category: 'Retail', style: 'centered', bg: '#ffffff', colors: { bg: '#fff', primary: '#0ea5e9', secondary: '#7dd3fc', text: '#333', tableHeaderBg: '#f0f9ff' } },
  { id: 'tpl_ret_2', name: 'GST Retail', category: 'Retail', style: 'standard', bg: '#ffffff', colors: { bg: '#fff', primary: '#dc2626', secondary: '#fca5a5', text: '#333', tableHeaderBg: '#fef2f2' } },
  { id: 'tpl_ret_3', name: 'Wholesale Invoice', category: 'Retail', style: 'banner', bg: '#ffffff', colors: { bg: '#fff', primary: '#059669', secondary: '#6ee7b7', text: '#333', tableHeaderBg: '#ecfdf5' } },
  
  // Service / Freelancer
  { id: 'tpl_srv_1', name: 'Service Default', category: 'Service', style: 'standard', bg: '#ffffff', colors: { bg: '#fff', primary: '#8b5cf6', secondary: '#c4b5fd', text: '#333', tableHeaderBg: '#f5f3ff' } },
  { id: 'tpl_srv_2', name: 'Freelancer', category: 'Service', style: 'minimal', bg: '#ffffff', colors: { bg: '#fff', primary: '#db2777', secondary: '#f9a8d4', text: '#333', tableHeaderBg: '#fdf2f8' } },
  { id: 'tpl_srv_3', name: 'IT Company', category: 'Service', style: 'modern-split', bg: '#ffffff', colors: { bg: '#fff', primary: '#14b8a6', secondary: '#5eead4', text: '#333', tableHeaderBg: '#f0fdfa' } },
  { id: 'tpl_srv_4', name: 'Software Consulting', category: 'Service', style: 'banner', bg: '#ffffff', colors: { bg: '#fff', primary: '#5b2de6', secondary: '#a5b4fc', text: '#333', tableHeaderBg: '#eef2ff' } },
  { id: 'tpl_srv_5', name: 'AMC Contract', category: 'Service', style: 'standard', bg: '#ffffff', colors: { bg: '#fff', primary: '#ea580c', secondary: '#fdba74', text: '#333', tableHeaderBg: '#fff7ed' } },
  
  // Manufacturing / Industrial
  { id: 'tpl_mfg_1', name: 'Factory Invoice', category: 'Manufacturing', style: 'banner', bg: '#ffffff', colors: { bg: '#fff', primary: '#57534e', secondary: '#a8a29e', text: '#333', tableHeaderBg: '#fafaf9' } },
  { id: 'tpl_mfg_2', name: 'Industrial', category: 'Manufacturing', style: 'standard', bg: '#ffffff', colors: { bg: '#fff', primary: '#b45309', secondary: '#fcd34d', text: '#333', tableHeaderBg: '#fffbeb' } },
  { id: 'tpl_mfg_3', name: 'Export', category: 'Manufacturing', style: 'centered', bg: '#ffffff', colors: { bg: '#fff', primary: '#4c1fd4', secondary: '#93c5fd', text: '#333', tableHeaderBg: '#f3f0ff' } },
  { id: 'tpl_mfg_4', name: 'Packing List', category: 'Manufacturing', style: 'standard', bg: '#ffffff', colors: { bg: '#fff', primary: '#4338ca', secondary: '#a5b4fc', text: '#333', tableHeaderBg: '#eef2ff' } },
  { id: 'tpl_mfg_5', name: 'Delivery Challan', category: 'Manufacturing', style: 'minimal', bg: '#ffffff', colors: { bg: '#fff', primary: '#0f766e', secondary: '#5eead4', text: '#333', tableHeaderBg: '#f0fdfa' } },
  
  // Healthcare
  { id: 'tpl_hlt_1', name: 'Hospital', category: 'Healthcare', style: 'banner', bg: '#ffffff', colors: { bg: '#fff', primary: '#0369a1', secondary: '#7dd3fc', text: '#333', tableHeaderBg: '#e0f2fe' } },
  { id: 'tpl_hlt_2', name: 'Clinic', category: 'Healthcare', style: 'modern-split', bg: '#ffffff', colors: { bg: '#fff', primary: '#0d9488', secondary: '#5eead4', text: '#333', tableHeaderBg: '#ccfbf1' } },
  { id: 'tpl_hlt_3', name: 'Medical Store', category: 'Healthcare', style: 'centered', bg: '#ffffff', colors: { bg: '#fff', primary: '#be123c', secondary: '#fda4af', text: '#333', tableHeaderBg: '#ffe4e6' } },
  
  // Logistics
  { id: 'tpl_log_1', name: 'Courier', category: 'Logistics', style: 'standard', bg: '#ffffff', colors: { bg: '#fff', primary: '#f59e0b', secondary: '#fde68a', text: '#333', tableHeaderBg: '#fef3c7' } },
  { id: 'tpl_log_2', name: 'Transport / Cargo', category: 'Logistics', style: 'banner', bg: '#ffffff', colors: { bg: '#fff', primary: '#1e3a8a', secondary: '#bfdbfe', text: '#333', tableHeaderBg: '#e6e0fe' } },
  { id: 'tpl_log_3', name: 'Shipping', category: 'Logistics', style: 'modern-split', bg: '#ffffff', colors: { bg: '#fff', primary: '#047857', secondary: '#6ee7b7', text: '#333', tableHeaderBg: '#d1fae5' } },
  
  // Food & Hospitality
  { id: 'tpl_foo_1', name: 'Restaurant', category: 'Hospitality', style: 'centered', bg: '#ffffff', colors: { bg: '#fff', primary: '#e11d48', secondary: '#fda4af', text: '#333', tableHeaderBg: '#ffe4e6' } },
  { id: 'tpl_foo_2', name: 'Cafe', category: 'Hospitality', style: 'minimal', bg: '#ffffff', colors: { bg: '#fff', primary: '#9a3412', secondary: '#fdba74', text: '#333', tableHeaderBg: '#ffedd5' } },
  { id: 'tpl_foo_3', name: 'Hotel', category: 'Hospitality', style: 'banner', bg: '#ffffff', colors: { bg: '#fff', primary: '#b45309', secondary: '#fde68a', text: '#333', tableHeaderBg: '#fef3c7' } },
  
  // Construction
  { id: 'tpl_con_1', name: 'Contractor', category: 'Construction', style: 'standard', bg: '#ffffff', colors: { bg: '#fff', primary: '#ca8a04', secondary: '#fef08a', text: '#333', tableHeaderBg: '#fefce8' } },
  { id: 'tpl_con_2', name: 'Architecture', category: 'Construction', style: 'minimal', bg: '#ffffff', colors: { bg: '#fff', primary: '#334155', secondary: '#d1d5db', text: '#333', tableHeaderBg: '#f8fafc' } },
].map(t => ({
  ...t,
  elements: generateTemplateElements(t.style as LayoutStyle, t.colors)
}));
