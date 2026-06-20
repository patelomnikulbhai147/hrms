// Employee Card PDF generation — renders the on-screen card templates to a
// canvas (html2canvas-pro, which understands Tailwind v4 oklch colors) and
// places them into a jsPDF document. Mirrors the proven payslip approach in
// Documents.tsx but is tuned for small ID/Info cards.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { EmployeeIdCard, EmployeeInfoCard } from '../components/cards/EmployeeCardTemplates';

async function capture(node: HTMLElement) {
  const { default: html2canvas } = await import('html2canvas-pro');
  return html2canvas(node, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false });
}

// Download a single, already-mounted card node as a tightly-cropped PDF.
export async function renderNodeToPdf(node: HTMLElement, fileName: string) {
  const { default: jsPDF } = await import('jspdf');
  const canvas = await capture(node);
  const wMm = 150;
  const hMm = (canvas.height * wMm) / canvas.width;
  const pdf = new jsPDF({ orientation: hMm > wMm ? 'portrait' : 'landscape', unit: 'mm', format: [wMm + 20, hMm + 20] });
  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 10, 10, wMm, hMm);
  pdf.save(fileName);
}

// Render a card template offscreen so it can be captured without being part of
// the visible page. Returns a cleanup fn.
async function mountOffscreen(employee: any, company: any, cardType: 'id' | 'info'): Promise<{ node: HTMLElement; cleanup: () => void }> {
  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-10000px';
  host.style.top = '0';
  host.style.background = '#ffffff';
  document.body.appendChild(host);
  const root = createRoot(host);
  await new Promise<void>(resolve => {
    root.render(
      React.createElement(
        'div',
        { style: { padding: 16, display: 'inline-block', background: '#fff' } },
        cardType === 'id'
          ? React.createElement(EmployeeIdCard, { employee, company })
          : React.createElement(EmployeeInfoCard, { employee, company })
      )
    );
    // Allow React to paint and images to begin loading before capture.
    setTimeout(resolve, 250);
  });
  return {
    node: host.firstElementChild as HTMLElement,
    cleanup: () => { try { root.unmount(); } catch { /* noop */ } host.remove(); },
  };
}

// Bulk: one card per page in a single PDF. `companyOrResolver` may be a single
// company object (legacy) OR a function (emp) => company, so each employee's
// card can carry its OWN company branding instead of one shared company.
export async function downloadCardsPdf(
  employees: any[],
  companyOrResolver: any | ((emp: any) => any),
  cardType: 'id' | 'info',
  fileName: string,
) {
  const resolve = typeof companyOrResolver === 'function' ? companyOrResolver : () => companyOrResolver;
  const { default: jsPDF } = await import('jspdf');
  let pdf: any = null;
  for (let i = 0; i < employees.length; i++) {
    const { node, cleanup } = await mountOffscreen(employees[i], resolve(employees[i]), cardType);
    try {
      const canvas = await capture(node);
      const wMm = 150;
      const hMm = (canvas.height * wMm) / canvas.width;
      const fmt: [number, number] = [wMm + 20, hMm + 20];
      const orient = hMm > wMm ? 'portrait' : 'landscape';
      if (!pdf) pdf = new jsPDF({ orientation: orient, unit: 'mm', format: fmt });
      else pdf.addPage(fmt, orient);
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 10, 10, wMm, hMm);
    } finally {
      cleanup();
    }
  }
  if (pdf) pdf.save(fileName);
}
