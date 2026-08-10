import { CANVAS_TEMPLATES } from './canvasTemplates';

export interface GalleryTemplate {
  id: string;
  name: string;
  description: string;
  thumbnail: string;
  content: string; // Will store the JSON stringified canvas layout
}

// We select a subset of the canvas templates to serve as the 8 gallery templates
// mapping them to the expected names the user sees.
export const GALLERY_TEMPLATES: GalleryTemplate[] = [
  {
    id: 'modern-professional',
    name: 'Modern Professional',
    description: 'A clean, modern corporate design with a distinctive header layout.',
    thumbnail: 'modern-professional.png',
    content: JSON.stringify(CANVAS_TEMPLATES.find(t => t.id === 'tpl_bus_3'))
  },
  {
    id: 'classic-corporate',
    name: 'Classic Corporate',
    description: 'Traditional, highly structured invoice with clear borders and professional typography.',
    thumbnail: 'classic-corporate.png',
    content: JSON.stringify(CANVAS_TEMPLATES.find(t => t.id === 'tpl_bus_1'))
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Stripped back design focusing on whitespace, clarity, and elegant typography.',
    thumbnail: 'minimal.png',
    content: JSON.stringify(CANVAS_TEMPLATES.find(t => t.id === 'tpl_min_1'))
  },
  {
    id: 'elegant',
    name: 'Elegant',
    description: 'Sophisticated layout perfect for premium brands and consulting services.',
    thumbnail: 'elegant.png',
    content: JSON.stringify(CANVAS_TEMPLATES.find(t => t.id === 'tpl_bus_4'))
  },
  {
    id: 'gst-business',
    name: 'GST Business',
    description: 'Comprehensive tax invoice template meeting all Indian GST compliance requirements.',
    thumbnail: 'gst-business.png',
    content: JSON.stringify(CANVAS_TEMPLATES.find(t => t.id === 'tpl_ret_2'))
  },
  {
    id: 'retail-pos',
    name: 'Retail & POS',
    description: 'Compact, product-focused layout ideal for retail, wholesale, and direct sales.',
    thumbnail: 'retail-pos.png',
    content: JSON.stringify(CANVAS_TEMPLATES.find(t => t.id === 'tpl_ret_1'))
  },
  {
    id: 'service-business',
    name: 'Service Business',
    description: 'Designed for freelancers and agencies, highlighting descriptions and terms.',
    thumbnail: 'service-business.png',
    content: JSON.stringify(CANVAS_TEMPLATES.find(t => t.id === 'tpl_srv_1'))
  },
  {
    id: 'premium-dark',
    name: 'Premium Dark',
    description: 'A striking dark-themed header for modern tech companies and creative agencies.',
    thumbnail: 'premium-dark.png',
    content: JSON.stringify(CANVAS_TEMPLATES.find(t => t.id === 'tpl_bus_2'))
  }
];
